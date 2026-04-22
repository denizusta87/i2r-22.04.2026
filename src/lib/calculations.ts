/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PricingResult, PricingSettings } from "../types";

export const DEFAULT_SETTINGS: PricingSettings = {
  exchangeRate: 35.50,
  premiumCoefficient: 1.25,
  sgAvRatio: 0.15,
  plannedGm2: 0.25,
};

export function calculatePricing(
  grossPriceEur: number,
  settings: PricingSettings
): PricingResult {
  const { exchangeRate, premiumCoefficient, sgAvRatio, plannedGm2 } = settings;

  const netPurchase = grossPriceEur * exchangeRate;
  const rawListPrice = (netPurchase / (1 - plannedGm2)) / 0.7;
  let finalListPrice = Math.round(rawListPrice / 5) * 5;
  
  // Enforce minimum price of 150 TRY
  if (finalListPrice < 150 && grossPriceEur > 0) {
    finalListPrice = 150;
  }

  const tns = finalListPrice * premiumCoefficient;
  const gms = tns > 0 ? ((tns - netPurchase) / tns) - sgAvRatio : 0;

  return {
    netPurchase,
    rawListPrice,
    finalListPrice,
    tns,
    gms,
  };
}

export function reverseCalculateFromGms(
  targetGms: number,
  grossPriceEur: number,
  settings: PricingSettings
): Partial<PricingResult> {
  const { exchangeRate, premiumCoefficient, sgAvRatio } = settings;
  const netPurchase = grossPriceEur * exchangeRate;

  // GMS = ((TNS - NetPurchase) / TNS) - SG&AV
  // GMS + SG&AV = 1 - (NetPurchase / TNS)
  // NetPurchase / TNS = 1 - (GMS + SG&AV)
  // TNS = NetPurchase / (1 - (GMS + SG&AV))
  
  const targetTns = netPurchase / (1 - (targetGms + sgAvRatio));
  const suggestedFinalListPrice = targetTns / premiumCoefficient;
  const roundedFinalListPrice = Math.round(suggestedFinalListPrice / 5) * 5;
  
  // Re-calculate TNS based on rounded price
  const finalTns = roundedFinalListPrice * premiumCoefficient;
  const finalGms = finalTns > 0 ? ((finalTns - netPurchase) / finalTns) - sgAvRatio : 0;

  return {
    finalListPrice: roundedFinalListPrice,
    tns: finalTns,
    gms: finalGms,
  };
}

export const formatCurrency = (value: number, currency: string = "TRY") => {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatPercent = (value: number) => {
  return new Intl.NumberFormat("tr-TR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

export const formatNumber = (value: number) => {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
