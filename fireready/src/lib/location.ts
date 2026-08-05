import * as Location from 'expo-location';

import type { LatLng } from '@/types';

export interface CapturedLocation extends LatLng {
  accuracy: number | null;
}

/**
 * Asks for foreground location permission (if needed) and returns the current
 * position. Returns null if the user declines — check-ins still work without
 * a location, they just won't appear on the map.
 */
export async function captureCurrentLocation(): Promise<CapturedLocation | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return null;

  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };
  } catch {
    // GPS can fail indoors / in airplane mode; treat it like a declined permission.
    return null;
  }
}

/** Turns a street address into coordinates using the device geocoder. */
export async function geocodeAddress(address: string): Promise<LatLng | null> {
  try {
    const results = await Location.geocodeAsync(address);
    if (results.length === 0) return null;
    return { latitude: results[0].latitude, longitude: results[0].longitude };
  } catch {
    return null;
  }
}
