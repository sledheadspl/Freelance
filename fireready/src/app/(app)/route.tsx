import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { Button, EmptyState } from '@/components/ui';
import { formatDistance, formatDuration, regionForPoints } from '@/lib/geo';
import { captureCurrentLocation } from '@/lib/location';
import { getDrivingRoute } from '@/lib/routing';
import { colors, spacing } from '@/lib/theme';
import { useAuthStore } from '@/stores/authStore';
import type { EvacuationRoute, LatLng } from '@/types';

/**
 * Basic evacuation route: current location → destination, drawn on the map
 * with distance and drive time. Destination comes from route params (map
 * long-press) or falls back to the user's saved home address.
 *
 * Phase 1 is plain fastest-route driving directions. Routing around active
 * fire perimeters is a later phase.
 */
export default function RouteScreen() {
  const params = useLocalSearchParams<{ destLat?: string; destLng?: string }>();
  const profile = useAuthStore((s) => s.profile);

  const [route, setRoute] = useState<EvacuationRoute | null>(null);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [destination, setDestination] = useState<LatLng | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRoute(null);
    try {
      const dest: LatLng | null =
        params.destLat && params.destLng
          ? { latitude: Number(params.destLat), longitude: Number(params.destLng) }
          : profile?.home_lat != null && profile?.home_lng != null
            ? { latitude: profile.home_lat, longitude: profile.home_lng }
            : null;

      if (!dest) {
        setError(
          'No destination. Long-press a point on the Map tab, or save your home address in Profile to route home by default.',
        );
        return;
      }

      const from = await captureCurrentLocation();
      if (!from) {
        setError('Location permission is required to plan a route from your current position.');
        return;
      }

      setOrigin(from);
      setDestination(dest);
      setRoute(await getDrivingRoute(from, dest));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load a route.');
    } finally {
      setLoading(false);
    }
  }, [params.destLat, params.destLng, profile]);

  // Re-plan on each visit so the route starts from a fresh GPS fix.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Planning route…</Text>
      </View>
    );
  }

  if (error || !route || !origin || !destination) {
    return (
      <View style={styles.centered}>
        <EmptyState icon="navigate-outline" title="No route" body={error ?? 'Try again.'} />
        <Button title="Retry" onPress={load} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <MapView style={StyleSheet.absoluteFill} initialRegion={regionForPoints([origin, destination])}>
        <Marker coordinate={origin} title="You are here" pinColor={colors.safe} />
        <Marker coordinate={destination} title="Destination" pinColor={colors.primary} />
        <Polyline coordinates={route.coordinates} strokeColor={colors.primary} strokeWidth={4} />
      </MapView>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {formatDistance(route.distanceMeters)} · about {formatDuration(route.durationSeconds)} by
          car
        </Text>
        <Text style={styles.summaryHint}>
          Standard fastest route — always follow official evacuation orders over app directions.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  loadingText: { textAlign: 'center', color: colors.textSecondary },
  summary: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.lg,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  summaryText: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  summaryHint: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
});
