import type { EvacuationRoute, LatLng } from '@/types';

// Phase 1 uses the free public OSRM demo server: no API key, fine for
// development, but rate-limited and with no uptime guarantee. Before launch,
// point OSRM_BASE_URL at a paid/hosted router — Mapbox Directions
// (https://api.mapbox.com/directions/v5/mapbox/driving) speaks the same
// response shape and only needs `?access_token=` added below.
const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

interface OsrmResponse {
  code: string;
  routes: {
    distance: number; // meters
    duration: number; // seconds
    geometry: { coordinates: [number, number][] }; // [lng, lat] pairs (GeoJSON order)
  }[];
}

/** Fetches a driving route between two points. Throws with a readable message on failure. */
export async function getDrivingRoute(from: LatLng, to: LatLng): Promise<EvacuationRoute> {
  const coords = `${from.longitude},${from.latitude};${to.longitude},${to.latitude}`;
  const url = `${OSRM_BASE_URL}/${coords}?overview=full&geometries=geojson`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Routing service error (HTTP ${res.status}). Try again in a moment.`);
  }

  const data = (await res.json()) as OsrmResponse;
  if (data.code !== 'Ok' || data.routes.length === 0) {
    throw new Error('No route found between these points.');
  }

  const route = data.routes[0];
  return {
    coordinates: route.geometry.coordinates.map(([lng, lat]) => ({
      latitude: lat,
      longitude: lng,
    })),
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}
