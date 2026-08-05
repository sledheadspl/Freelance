export * from './database';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface EvacuationRoute {
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
}

export type AlertSeverity = 'advisory' | 'watch' | 'warning';

/** A wildfire-related alert. Shaped so a real feed (e.g. NWS/CalFire) can map into it later. */
export interface FireAlert {
  id: string;
  title: string;
  severity: AlertSeverity;
  description: string;
  issuedAt: string; // ISO timestamp
  expiresAt: string | null;
  source: string;
  /** Center of the affected area, used to filter by distance from the user's home. */
  center: LatLng;
  /** Approximate radius of the affected area in km. */
  radiusKm: number;
}
