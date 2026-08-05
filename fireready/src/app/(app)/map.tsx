import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Button, EmptyState } from '@/components/ui';
import { regionForPoints } from '@/lib/geo';
import { colors, spacing, statusMeta } from '@/lib/theme';
import { useFamilyStore } from '@/stores/familyStore';

/**
 * Family map: one pin per member at their last check-in location, colored by
 * status. Long-press anywhere to plan an evacuation route to that point.
 * Subscribes to Supabase realtime while focused so pins move as people check in.
 */
export default function MapScreen() {
  const router = useRouter();
  const { family, members, refresh, subscribeToCheckins } = useFamilyStore();

  useFocusEffect(
    useCallback(() => {
      refresh();
      const unsubscribe = subscribeToCheckins();
      return unsubscribe;
    }, [refresh, subscribeToCheckins]),
  );

  const located = useMemo(
    () => members.filter((m) => m.checkin?.lat != null && m.checkin?.lng != null),
    [members],
  );

  const initialRegion = useMemo(
    () =>
      regionForPoints(
        located.map((m) => ({ latitude: m.checkin!.lat!, longitude: m.checkin!.lng! })),
      ),
    // Only computed for the first render of the map; pins update live afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!family) {
    return (
      <View style={styles.centered}>
        <EmptyState
          icon="map-outline"
          title="No family group yet"
          body="The map shows your family members' latest check-in locations. Set up your family group first."
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation
        onLongPress={(e) => {
          const { latitude, longitude } = e.nativeEvent.coordinate;
          router.push({
            pathname: '/(app)/route',
            params: { destLat: String(latitude), destLng: String(longitude) },
          });
        }}
      >
        {located.map((m) => {
          const checkin = m.checkin!;
          const meta = statusMeta[checkin.status];
          return (
            <Marker
              key={m.user_id}
              coordinate={{ latitude: checkin.lat!, longitude: checkin.lng! }}
              pinColor={meta.color}
              title={`${m.profile.display_name || 'Member'} — ${meta.label}`}
              description={`${new Date(checkin.updated_at).toLocaleString()}${
                checkin.message ? ` · “${checkin.message}”` : ''
              }`}
            />
          );
        })}
      </MapView>

      <View style={styles.footer}>
        {located.length === 0 && (
          <Text style={styles.footerHint}>
            No located check-ins yet — pins appear once family members check in with location on.
          </Text>
        )}
        <Text style={styles.footerHint}>Long-press the map to plan a route to that point.</Text>
        <Button
          title="Evacuation Route Home"
          onPress={() => router.push('/(app)/route')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  footer: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  footerHint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
});
