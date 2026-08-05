import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState } from '@/components/ui';
import { activeAlertProvider } from '@/lib/alerts';
import { colors, radius, spacing, severityMeta } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';
import type { FireAlert } from '@/types';

/**
 * Alerts near the user's saved home address. Data comes from the provider in
 * lib/alerts.ts — currently mock data; swap the provider there to go live.
 */
export default function AlertsScreen() {
  const profile = useAuthStore((s) => s.profile);
  const [alerts, setAlerts] = useState<FireAlert[]>([]);
  const [loading, setLoading] = useState(false);

  const hasHome = profile?.home_lat != null && profile?.home_lng != null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const near = hasHome
        ? { latitude: profile!.home_lat!, longitude: profile!.home_lng! }
        : null;
      setAlerts(await activeAlertProvider.getActiveAlerts(near));
    } finally {
      setLoading(false);
    }
  }, [hasHome, profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View style={styles.noticeBox}>
        <Text style={styles.noticeText}>
          {hasHome
            ? `Showing alerts near ${profile?.home_address ?? 'your saved home address'}.`
            : 'Showing all sample alerts. Save your home address in '}
          {!hasHome && (
            <Link href="/(app)/profile" style={styles.link}>
              Profile
            </Link>
          )}
          {!hasHome && ' to filter alerts to your area.'}
        </Text>
        <Text style={styles.mockTag}>Sample data — live feed coming in a later phase</Text>
      </View>

      {alerts.length === 0 && !loading ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title="No active alerts near you"
          body="Nothing is currently affecting your saved area. Pull down to refresh."
        />
      ) : (
        alerts.map((alert) => {
          const meta = severityMeta[alert.severity];
          return (
            <Card key={alert.id} style={{ borderLeftWidth: 4, borderLeftColor: meta.color }}>
              <View style={styles.alertHeader}>
                <Text style={[styles.severity, { color: meta.color }]}>{meta.label}</Text>
                <Text style={styles.timestamp}>
                  {new Date(alert.issuedAt).toLocaleString()}
                </Text>
              </View>
              <Text style={styles.alertTitle}>{alert.title}</Text>
              <Text style={styles.alertBody}>{alert.description}</Text>
              <Text style={styles.source}>
                {alert.source}
                {alert.expiresAt
                  ? ` · until ${new Date(alert.expiresAt).toLocaleString()}`
                  : ''}
              </Text>
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md },
  noticeBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.xs,
  },
  noticeText: { fontSize: 13, color: colors.text, lineHeight: 18 },
  mockTag: { fontSize: 11, color: colors.textSecondary, fontStyle: 'italic' },
  link: { color: colors.primary, fontWeight: '600' },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  severity: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  timestamp: { fontSize: 12, color: colors.textSecondary },
  alertTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  alertBody: { fontSize: 14, color: colors.text, lineHeight: 20 },
  source: { fontSize: 12, color: colors.textSecondary },
});
