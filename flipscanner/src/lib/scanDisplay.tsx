import { StyleSheet, Text, View } from 'react-native';

import type { ConfidenceGrade, Recommendation } from '../types/database';

export const GRADE_COLORS: Record<ConfidenceGrade, string> = {
  A: '#1a7f37',
  B: '#2f6feb',
  C: '#9a6700',
  D: '#999',
};

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  buy: 'BUY',
  maybe: 'MAYBE',
  skip: 'SKIP',
};

export const RECOMMENDATION_COLORS: Record<Recommendation, string> = {
  buy: '#1a7f37',
  maybe: '#9a6700',
  skip: '#cf222e',
};

export const CONDITION_LABELS: Record<string, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
  parts_only: 'Parts Only',
};

const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCurrency(value: number | null): string {
  if (value == null) return '—';
  return usdFormatter.format(value);
}

export function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (60 * 1000));

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

const GRADE_LABELS: Record<ConfidenceGrade, string> = {
  A: 'High confidence',
  B: 'Good confidence',
  C: 'Low confidence',
  D: 'Very low confidence',
};

export function GradeBadge({ grade }: { grade: ConfidenceGrade | null }) {
  const value = grade ?? 'D';
  return (
    <View
      style={[styles.gradeBadge, { backgroundColor: GRADE_COLORS[value] }]}
      accessibilityLabel={`Confidence grade: ${GRADE_LABELS[value]}`}
    >
      <Text style={styles.gradeBadgeText}>{value}</Text>
    </View>
  );
}

export function RecommendationBadge({ recommendation }: { recommendation: Recommendation | null }) {
  if (!recommendation) return null;
  return (
    <View
      style={[styles.recommendationBadge, { backgroundColor: RECOMMENDATION_COLORS[recommendation] }]}
      accessibilityLabel={`Recommendation: ${RECOMMENDATION_LABELS[recommendation]}`}
    >
      <Text style={styles.recommendationText}>{RECOMMENDATION_LABELS[recommendation]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gradeBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeBadgeText: {
    color: '#fff',
    fontWeight: '700',
  },
  recommendationBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  recommendationText: {
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 1,
  },
});
