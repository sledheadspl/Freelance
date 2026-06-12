/**
 * ROI / pricing math for FlipScanner (spec section 6).
 * Pure functions, no external dependencies — safe to run in Deno edge
 * functions and to unit test directly with Vitest.
 */

export interface CompInput {
  title: string;
  sold_price: number;
  sold_date: string; // ISO date string
  condition: string;
}

export type ConfidenceGrade = 'A' | 'B' | 'C' | 'D';
export type Recommendation = 'buy' | 'maybe' | 'skip';

export interface RoiInput {
  comps: CompInput[];
  category: string;
  conditionEstimate?: string | null;
  /** Active listing count for the same search (Browse API), used for sell-through. */
  activeListingCount?: number | null;
  /** What the user paid (or expects to pay). Optional — recommendation needs it. */
  purchasePrice?: number | null;
  /** "now" injection point for testability. */
  now?: Date;
}

export interface RoiResult {
  estSalePrice: number | null;
  estSaleLow: number | null;
  estSaleHigh: number | null;
  compsCount: number;
  sellThroughRate: number | null;
  sellThroughDays: number | null;
  confidenceGrade: ConfidenceGrade;
  recommendation: Recommendation | null;
  maxBuyPrice: number | null;
  roiPct: number | null;
  net: number | null;
  fees: number | null;
  shippingCost: number;
}

export const EBAY_FEE_RATE = 0.1325;
export const EBAY_FEE_FIXED = 0.3;

/** Category-based shipping cost estimates (spec section 6, step 4). */
const SHIPPING_ESTIMATES: Array<{ keywords: string[]; cost: number }> = [
  { keywords: ['auto part', 'auto-part', 'car part', 'truck part', 'engine', 'transmission', 'bumper', 'fender'], cost: 30 },
  { keywords: ['electronics', 'laptop', 'tv', 'monitor', 'console', 'camera'], cost: 12 },
  { keywords: ['media', 'book', 'dvd', 'blu-ray', 'cd', 'game'], cost: 4 },
  { keywords: ['clothing', 'apparel', 'shoes'], cost: 6 },
  { keywords: ['housewares', 'kitchen', 'home', 'decor', 'furniture'], cost: 12 },
];
const DEFAULT_SHIPPING_COST = 8;

export function estimateShippingCost(category: string): number {
  const normalized = category.toLowerCase();
  for (const { keywords, cost } of SHIPPING_ESTIMATES) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return cost;
    }
  }
  return DEFAULT_SHIPPING_COST;
}

/** Maps a `condition_estimate` value to the set of comp condition strings it matches. */
const CONDITION_CLASSES: Record<string, string[]> = {
  new: ['new', 'new with tags', 'new with box', 'new without tags', 'new without box'],
  like_new: ['new', 'like new', 'open box', 'excellent', 'mint'],
  good: ['used', 'good', 'very good', 'pre-owned'],
  fair: ['used', 'fair', 'acceptable', 'good'],
  parts_only: ['for parts', 'for parts or not working', 'parts only', 'not working', 'salvage'],
};

/**
 * Filters comps to the same condition class as the scanned item. Falls back
 * to all comps if filtering would leave fewer than 3 (better to have a
 * lower-confidence estimate than none).
 */
export function filterByCondition(comps: CompInput[], conditionEstimate?: string | null): CompInput[] {
  if (!conditionEstimate) return comps;

  const allowed = CONDITION_CLASSES[conditionEstimate];
  if (!allowed) return comps;

  const filtered = comps.filter((comp) => {
    const condition = comp.condition.toLowerCase();
    return allowed.some((keyword) => condition.includes(keyword));
  });

  return filtered.length >= 3 ? filtered : comps;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Linear-interpolation percentile, p in [0, 1]. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];

  const index = p * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];

  const fraction = index - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * fraction;
}

export function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return Infinity;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean === 0) return Infinity;
  return stddev(values) / mean;
}

/** Removes outliers using a 1.5x IQR fence (spec section 6, step 1). */
export function filterOutliersIQR(values: number[]): number[] {
  if (values.length < 4) return values;

  const q1 = percentile(values, 0.25);
  const q3 = percentile(values, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  return values.filter((v) => v >= lowerFence && v <= upperFence);
}

function gradeFor(compsCount: number, cv: number, sellThroughRate: number | null): ConfidenceGrade {
  const sellThrough = sellThroughRate ?? 0;

  if (compsCount >= 10 && cv < 0.25 && sellThrough > 0.5) return 'A';
  if (compsCount >= 5 && cv < 0.4 && sellThrough > 0.3) return 'B';
  if (compsCount >= 3 || cv >= 0.4) return 'C';
  return 'D';
}

function recommendationFor(
  grade: ConfidenceGrade,
  roiPct: number | null,
  net: number | null
): Recommendation | null {
  if (roiPct == null || net == null) return null;

  if (roiPct >= 100 && net >= 15 && (grade === 'A' || grade === 'B')) return 'buy';
  if (roiPct >= 50 || grade === 'C') return 'maybe';
  return 'skip';
}

/** Computes pricing + ROI metrics from sold comps (spec section 6). */
export function computeRoi(input: RoiInput): RoiResult {
  const shippingCost = estimateShippingCost(input.category);
  const now = input.now ?? new Date();

  const conditionFiltered = filterByCondition(input.comps, input.conditionEstimate);
  const prices = filterOutliersIQR(conditionFiltered.map((comp) => comp.sold_price));

  const compsCount = prices.length;

  if (compsCount === 0) {
    return {
      estSalePrice: null,
      estSaleLow: null,
      estSaleHigh: null,
      compsCount: 0,
      sellThroughRate: null,
      sellThroughDays: null,
      confidenceGrade: 'D',
      recommendation: null,
      maxBuyPrice: null,
      roiPct: null,
      net: null,
      fees: null,
      shippingCost,
    };
  }

  const estSalePrice = median(prices);
  const estSaleLow = percentile(prices, 0.1);
  const estSaleHigh = percentile(prices, 0.9);
  const cv = coefficientOfVariation(prices);

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const soldLast30d = conditionFiltered.filter((comp) => new Date(comp.sold_date) >= thirtyDaysAgo).length;
  const sellThroughRate =
    input.activeListingCount != null && input.activeListingCount > 0
      ? soldLast30d / input.activeListingCount
      : null;

  const confidenceGrade = gradeFor(compsCount, cv, sellThroughRate);

  const fees = estSalePrice * EBAY_FEE_RATE + EBAY_FEE_FIXED;
  const maxBuyPriceRaw = (estSalePrice * (1 - EBAY_FEE_RATE) - EBAY_FEE_FIXED - shippingCost) / 2;
  const maxBuyPrice = Math.max(0, maxBuyPriceRaw);

  let roiPct: number | null = null;
  let net: number | null = null;
  if (input.purchasePrice != null && input.purchasePrice > 0) {
    net = estSalePrice - fees - shippingCost - input.purchasePrice;
    roiPct = (net / input.purchasePrice) * 100;
  }

  const recommendation = recommendationFor(confidenceGrade, roiPct, net);

  return {
    estSalePrice,
    estSaleLow,
    estSaleHigh,
    compsCount,
    sellThroughRate,
    sellThroughDays: null,
    confidenceGrade,
    recommendation,
    maxBuyPrice,
    roiPct,
    net,
    fees,
    shippingCost,
  };
}
