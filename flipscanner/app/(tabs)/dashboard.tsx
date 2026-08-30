import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../src/contexts/AuthContext';
import { FREE_TIER_MONTHLY_SCANS, getDashboardStats, type DashboardStats } from '../../src/lib/dashboard';
import { formatCurrency } from '../../src/lib/scanDisplay';

export default function Dashboard() {
  const { session } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;

    try {
      setStats(await getDashboardStats(session.user.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    }
  }, [session]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!stats && !error ? (
        <Text style={styles.emptyText}>No data yet — start by scanning an item.</Text>
      ) : null}

      {stats ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>This month</Text>
            <View style={styles.row}>
              <StatCard
                label="Scans used"
                value={
                  stats.subscriptionTier === 'pro'
                    ? `${stats.scansThisMonth}`
                    : `${stats.scansThisMonth} / ${FREE_TIER_MONTHLY_SCANS}`
                }
              />
              <StatCard label="Plan" value={stats.subscriptionTier === 'pro' ? 'Pro' : 'Free'} />
            </View>
            {stats.subscriptionTier === 'free' &&
            stats.scansThisMonth >= FREE_TIER_MONTHLY_SCANS - 2 ? (
              <Pressable style={styles.upgradeBanner} onPress={() => router.push('/(tabs)/settings')}>
                <Text style={styles.upgradeBannerText}>
                  {stats.scansThisMonth >= FREE_TIER_MONTHLY_SCANS
                    ? 'Scan limit reached. Upgrade to Pro for unlimited scans.'
                    : `${FREE_TIER_MONTHLY_SCANS - stats.scansThisMonth} scan${FREE_TIER_MONTHLY_SCANS - stats.scansThisMonth === 1 ? '' : 's'} remaining this month. Upgrade to Pro →`}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Inventory pipeline</Text>
            <View style={styles.row}>
              <StatCard label="Unlisted" value={`${stats.unlistedCount}`} />
              <StatCard label="Listed" value={`${stats.listedCount}`} />
            </View>
            <View style={styles.row}>
              <StatCard label="Sold" value={`${stats.soldCount}`} />
              <StatCard label="Shipped" value={`${stats.shippedCount}`} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Orders</Text>
            <View style={styles.row}>
              <StatCard label="Awaiting shipment" value={`${stats.ordersAwaitingShipment}`} />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Profit</Text>
            <View style={styles.row}>
              <StatCard label="Invested" value={formatCurrency(stats.totalSpent)} />
              <StatCard label="Revenue" value={formatCurrency(stats.totalRevenue)} />
            </View>
            <View style={styles.row}>
              <StatCard
                label="Net profit (sold items)"
                value={formatCurrency(stats.totalProfit)}
                valueColor={stats.totalProfit >= 0 ? '#1a7f37' : '#cf222e'}
              />
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function StatCard({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.card}>
      <Text style={[styles.cardValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#d33',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    marginTop: 40,
  },
  upgradeBanner: {
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
  },
  upgradeBannerText: {
    color: '#856404',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: '#f6f6f6',
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  cardValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  cardLabel: {
    fontSize: 13,
    color: '#666',
  },
});
