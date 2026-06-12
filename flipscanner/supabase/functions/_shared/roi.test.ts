import { describe, expect, it } from 'vitest';

import {
  type CompInput,
  coefficientOfVariation,
  computeRoi,
  estimateShippingCost,
  filterByCondition,
  filterOutliersIQR,
  median,
  percentile,
  stddev,
} from './roi';

function comp(sold_price: number, daysAgo: number, condition = 'used'): CompInput {
  const sold_date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  return { title: 'Test item', sold_price, sold_date, condition };
}

describe('median', () => {
  it('returns 0 for empty input', () => {
    expect(median([])).toBe(0);
  });

  it('returns the middle value for odd-length arrays', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middle values for even-length arrays', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('percentile', () => {
  it('returns the single value for a one-element array', () => {
    expect(percentile([42], 0.9)).toBe(42);
  });

  it('interpolates between values', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
  });
});

describe('stddev / coefficientOfVariation', () => {
  it('is 0 for identical values', () => {
    expect(stddev([10, 10, 10])).toBe(0);
    expect(coefficientOfVariation([10, 10, 10])).toBe(0);
  });

  it('is Infinity for an empty array', () => {
    expect(coefficientOfVariation([])).toBe(Infinity);
  });

  it('computes a sensible spread ratio', () => {
    // mean = 100, population stddev = ~8.16
    const cv = coefficientOfVariation([90, 100, 110]);
    expect(cv).toBeGreaterThan(0.07);
    expect(cv).toBeLessThan(0.09);
  });
});

describe('filterOutliersIQR', () => {
  it('leaves small samples untouched', () => {
    expect(filterOutliersIQR([1, 2, 1000])).toEqual([1, 2, 1000]);
  });

  it('removes extreme outliers from larger samples', () => {
    const values = [10, 11, 12, 13, 14, 15, 1000];
    const filtered = filterOutliersIQR(values);
    expect(filtered).not.toContain(1000);
    expect(filtered).toEqual([10, 11, 12, 13, 14, 15]);
  });
});

describe('filterByCondition', () => {
  const comps: CompInput[] = [
    comp(50, 1, 'New'),
    comp(40, 1, 'Used - Good'),
    comp(30, 1, 'Used - Fair'),
    comp(45, 1, 'New with tags'),
  ];

  it('keeps only comps matching the condition class when enough remain', () => {
    const filtered = filterByCondition(comps, 'new');
    expect(filtered.map((c) => c.sold_price)).toEqual(expect.arrayContaining([50, 45]));
  });

  it('falls back to all comps when too few match', () => {
    const filtered = filterByCondition(comps, 'parts_only');
    expect(filtered).toHaveLength(comps.length);
  });

  it('returns all comps when no condition estimate is given', () => {
    expect(filterByCondition(comps, null)).toEqual(comps);
  });
});

describe('estimateShippingCost', () => {
  it('matches auto parts to the heavy shipping bucket', () => {
    expect(estimateShippingCost('Auto Parts > Engines')).toBe(30);
  });

  it('matches media to the cheap shipping bucket', () => {
    expect(estimateShippingCost('Books & Media')).toBe(4);
  });

  it('falls back to a default for unknown categories', () => {
    expect(estimateShippingCost('Mystery Category')).toBe(8);
  });
});

describe('computeRoi', () => {
  it('returns grade D with nulls when there are no comps', () => {
    const result = computeRoi({ comps: [], category: 'Electronics', purchasePrice: 20 });
    expect(result.confidenceGrade).toBe('D');
    expect(result.estSalePrice).toBeNull();
    expect(result.recommendation).toBeNull();
    expect(result.maxBuyPrice).toBeNull();
  });

  it('recommends BUY for a high-ROI, well-supported comp set', () => {
    // 12 comps, tight spread around $100, all sold within 30 days, plenty of demand.
    const comps: CompInput[] = Array.from({ length: 12 }, (_, i) => comp(95 + (i % 5), 5));

    const result = computeRoi({
      comps,
      category: 'Electronics',
      conditionEstimate: 'good',
      activeListingCount: 10, // sellThrough = 12/10 > 0.5
      purchasePrice: 20,
    });

    expect(result.compsCount).toBe(12);
    expect(result.confidenceGrade).toBe('A');
    expect(result.estSalePrice).toBeGreaterThan(90);
    expect(result.recommendation).toBe('buy');
    expect(result.roiPct).toBeGreaterThanOrEqual(100);
    expect(result.maxBuyPrice).toBeGreaterThan(20);
  });

  it('recommends SKIP for a low-ROI purchase even with good comps', () => {
    const comps: CompInput[] = Array.from({ length: 12 }, (_, i) => comp(95 + (i % 5), 5));

    const result = computeRoi({
      comps,
      category: 'Electronics',
      conditionEstimate: 'good',
      activeListingCount: 10,
      purchasePrice: 90, // ROI well under 100%
    });

    expect(result.confidenceGrade).toBe('A');
    expect(result.recommendation).toBe('skip');
  });

  it('returns MAYBE for grade C (sparse comps)', () => {
    const comps: CompInput[] = [comp(50, 5), comp(55, 10), comp(45, 15)];

    const result = computeRoi({
      comps,
      category: 'Housewares',
      purchasePrice: 5,
    });

    expect(result.compsCount).toBe(3);
    expect(result.confidenceGrade).toBe('C');
    expect(result.recommendation).toBe('maybe');
  });

  it('computes maxBuyPrice independent of purchasePrice', () => {
    const comps: CompInput[] = Array.from({ length: 5 }, () => comp(100, 5));

    const withoutPrice = computeRoi({ comps, category: 'Electronics' });
    const withPrice = computeRoi({ comps, category: 'Electronics', purchasePrice: 999 });

    expect(withoutPrice.maxBuyPrice).toBe(withPrice.maxBuyPrice);
    expect(withoutPrice.recommendation).toBeNull();
    expect(withPrice.maxBuyPrice).not.toBeNull();
  });
});
