/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';
import SHA256 from 'crypto-js/sha256';
import { openDB, IDBPDatabase } from 'idb';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, writeBatch, query, where, limit, DocumentData, serverTimestamp, Bytes } from 'firebase/firestore';
import { db as firestore, auth } from './firebase';
import { SourceData, PricingSettings } from '../types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const DB_NAME = 'SparePartPricingDB';
const DB_VERSION = 2;
const SOURCES_STORE = 'sources';
const SETTINGS_STORE = 'settings';

export async function initDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SOURCES_STORE)) {
        db.createObjectStore(SOURCES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
    },
  });
}

// Local + Cloud Sync Logic
export async function saveSource(source: SourceData, syncToCloud = false) {
  const db = await initDB();
  await db.put(SOURCES_STORE, source);
}

export async function getSources(fromCloud = false): Promise<SourceData[]> {
  if (fromCloud) {
    const path = 'sources';
    try {
      const querySnapshot = await getDocs(collection(firestore, path));
      const sources: SourceData[] = [];
      
      for (const d of querySnapshot.docs) {
        const metadata = d.data() as Omit<SourceData, 'data'>;
        sources.push({ ...metadata, data: [] }); 
      }
      return sources;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  const db = await initDB();
  return db.getAll(SOURCES_STORE);
}

// Track the last synced data hash to prevent loops
let lastSyncedHash: string | null = null;

// --- HIGH SPEED BACKUP SYSTEM ---
export async function saveFullBackupToCloud(userId: string, settings: PricingSettings, sources: SourceData[]) {
  const fullState = { settings, sources, updatedAt: new Date().toISOString() };
  const jsonString = JSON.stringify(fullState);
  
  // Calculate hash to see if content actually changed
  const currentHash = SHA256(jsonString).toString();
  if (currentHash === lastSyncedHash) {
    console.log("Content unchanged (hash match), skipping cloud sync.");
    return;
  }

  // Compress data to save quota and space
  const compressed = gzipSync(strToU8(jsonString));
  
  // Split into chunks of 700KB (Firestore limit is 1MB raw data per doc)
  // Reduced to 700KB for extra safety margin
  const chunkSize = 700 * 1024;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < compressed.length; i += chunkSize) {
    chunks.push(compressed.slice(i, i + chunkSize));
  }

  console.log(`Backing up ${chunks.length} compressed chunks. Original size: ${Math.round(jsonString.length/1024)}KB, Compressed: ${Math.round(compressed.length/1024)}KB`);

  // 1. Write metadata
  const metadataPath = `backups/${userId}`;
  try {
    await setDoc(doc(firestore, metadataPath), {
      chunkCount: chunks.length,
      updatedAt: serverTimestamp(),
      hash: currentHash
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, metadataPath);
  }

  // Save chunks sequentially with careful timing
  for (let i = 0; i < chunks.length; i++) {
    const chunkPath = `backups/${userId}/chunks/${i}`;
    try {
      const chunkRef = doc(firestore, chunkPath);
      // Explicitly wrap Uint8Array in Bytes for Firestore storage
      await setDoc(chunkRef, { content: Bytes.fromUint8Array(chunks[i]) });
      await new Promise(resolve => setTimeout(resolve, 200)); // Safer delay to respect write streams
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, chunkPath);
    }
  }
  
  lastSyncedHash = currentHash;
}

export async function loadFullBackupFromCloud(userId: string): Promise<{ settings: PricingSettings, sources: SourceData[] } | null> {
  const backupPath = `backups/${userId}`;
  try {
    const backupRef = doc(firestore, backupPath);
    const backupSnap = await getDoc(backupRef);
    
    if (!backupSnap.exists()) return null;
    
    const { chunkCount, hash } = backupSnap.data();
    let compressedParts: Uint8Array[] = [];
    
    // Download all chunks
    for (let i = 0; i < chunkCount; i++) {
      const chunkPath = `backups/${userId}/chunks/${i}`;
      const chunkRef = doc(firestore, chunkPath);
      const chunkSnap = await getDoc(chunkRef);
      if (chunkSnap.exists()) {
        const data = chunkSnap.data().content;
        
        if (data instanceof Bytes) {
          compressedParts.push(data.toUint8Array());
        } else if (data instanceof Uint8Array) {
          compressedParts.push(data);
        } else if (typeof data === 'string') {
          // Fallback for legacy base64
          const binary = atob(data);
          const bytes = new Uint8Array(binary.length);
          for (let j = 0; j < binary.length; j++) {
              bytes[j] = binary.charCodeAt(j);
          }
          compressedParts.push(bytes);
        }
      }
    }

    if (compressedParts.length === 0) return null;

    // Combine chunks
    const totalLength = compressedParts.reduce((acc, part) => acc + part.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of compressedParts) {
      combined.set(part, offset);
      offset += part.length;
    }

    // Decompress
    const decompressed = gunzipSync(combined);
    const jsonString = strFromU8(decompressed);
    const state = JSON.parse(jsonString);
    
    lastSyncedHash = hash || SHA256(jsonString).toString();
    return state;
  } catch (error) {
    if (error instanceof Error && error.message.includes('authInfo')) {
      throw error; // Re-throw structured error
    }
    console.error('Failed to parse backup', error);
    return null;
  }
}

export async function searchInCloud(sourceId: string, searchColumn: string, materialNo: string): Promise<any | null> {
  const path = `sources/${sourceId}/rows`;
  const q = query(
    collection(firestore, path),
    where('materialNo', '==', materialNo.toUpperCase()),
    limit(1)
  );
  try {
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      return snapshot.docs[0].data().data;
    }
  } catch (error) {
     if (error instanceof Error && (error.message.includes('insufficient permissions') || error.message.includes('Quota exceeded'))) {
       handleFirestoreError(error, OperationType.LIST, path);
     }
     console.error('Cloud search failed:', error);
  }
  return null;
}

export async function deleteSource(id: string, fromCloud = false) {
  const db = await initDB();
  await db.delete(SOURCES_STORE, id);
  if (fromCloud) {
    const path = `sources/${id}`;
    try {
      await deleteDoc(doc(firestore, path));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}

export async function saveSettings(settings: PricingSettings, syncToCloud = false) {
  const db = await initDB();
  await db.put(SETTINGS_STORE, settings, 'current');
}

export async function getSettings(fromCloud = false): Promise<PricingSettings | undefined> {
  if (fromCloud) {
    const path = 'configs/main';
    try {
      const docSnap = await getDoc(doc(firestore, path));
      if (docSnap.exists()) {
        return docSnap.data() as PricingSettings;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }
  const db = await initDB();
  return db.get(SETTINGS_STORE, 'current');
}
