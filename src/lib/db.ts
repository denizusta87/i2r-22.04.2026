/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { openDB, IDBPDatabase } from 'idb';
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc, writeBatch, query, where, limit, DocumentData } from 'firebase/firestore';
import { db as firestore } from './firebase';
import { SourceData, PricingSettings } from '../types';

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

  if (syncToCloud) {
    // 1. Save Metadata (without the large data array)
    const { data, ...metadata } = source;
    await setDoc(doc(firestore, 'sources', source.id), metadata);

    // 2. Save Rows to subcollection (chunked for efficiency)
    const batchSize = 500;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = writeBatch(firestore);
      const chunk = data.slice(i, i + batchSize);
      chunk.forEach((row, index) => {
        const materialNo = String(row[source.searchColumn] || '').toUpperCase();
        if (materialNo) {
          const rowRef = doc(firestore, `sources/${source.id}/rows`, `${i + index}`);
          batch.set(rowRef, { materialNo, data: row });
        }
      });
      await batch.commit();
    }
  }
}

export async function getSources(fromCloud = false): Promise<SourceData[]> {
  if (fromCloud) {
    const querySnapshot = await getDocs(collection(firestore, 'sources'));
    const sources: SourceData[] = [];
    
    for (const d of querySnapshot.docs) {
      const metadata = d.data() as Omit<SourceData, 'data'>;
      // We don't fetch all rows here to avoid heavy transfers. 
      // Rows will be searched on-demand in searchMaterial.
      sources.push({ ...metadata, data: [] }); 
    }
    return sources;
  }

  const db = await initDB();
  return db.getAll(SOURCES_STORE);
}

export async function searchInCloud(sourceId: string, searchColumn: string, materialNo: string): Promise<any | null> {
  const q = query(
    collection(firestore, `sources/${sourceId}/rows`),
    where('materialNo', '==', materialNo.toUpperCase()),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    return snapshot.docs[0].data().data;
  }
  return null;
}

export async function deleteSource(id: string, fromCloud = false) {
  const db = await initDB();
  await db.delete(SOURCES_STORE, id);
  if (fromCloud) {
    await deleteDoc(doc(firestore, 'sources', id));
    // Note: Recursive subcollection deletion is complex in rules/client. 
    // Ideally use a Cloud Function or manually delete rows if metadata is gone.
  }
}

export async function saveSettings(settings: PricingSettings, syncToCloud = false) {
  const db = await initDB();
  await db.put(SETTINGS_STORE, settings, 'current');
  if (syncToCloud) {
    await setDoc(doc(firestore, 'configs', 'main'), settings);
  }
}

export async function getSettings(fromCloud = false): Promise<PricingSettings | undefined> {
  if (fromCloud) {
    const docSnap = await getDoc(doc(firestore, 'configs', 'main'));
    if (docSnap.exists()) {
      return docSnap.data() as PricingSettings;
    }
  }
  const db = await initDB();
  return db.get(SETTINGS_STORE, 'current');
}
