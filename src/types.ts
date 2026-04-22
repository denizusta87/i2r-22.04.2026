/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PricingSettings {
  exchangeRate: number; // EUR/TRY
  premiumCoefficient: number;
  sgAvRatio: number; // % SG&AV
  plannedGm2: number;
}

export interface PricingResult {
  netPurchase: number;
  rawListPrice: number;
  finalListPrice: number;
  tns: number;
  gms: number;
}

export interface SourceData {
  id: string;
  name: string;
  headers: string[];
  searchColumn: string;
  priceColumn: string;
  displayColumns: string[]; // Additional columns to show
  data: any[];
  lastUpdated: number;
}

export interface SearchResult {
  value: number | string | null;
  fields: Record<string, any>;
  sourceName: string;
  sourceIndex: number;
  found: boolean;
}
