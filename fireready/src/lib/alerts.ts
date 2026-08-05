import { distanceKm } from '@/lib/geo';
import type { FireAlert, LatLng } from '@/types';

/**
 * Anything that can supply alerts implements this. The app only talks to the
 * interface, so swapping mock data for a real feed (e.g. the NWS API at
 * https://api.weather.gov/alerts/active?point=lat,lng) means writing one new
 * provider and changing the `activeAlertProvider` export at the bottom.
 */
export interface AlertProvider {
  /** Alerts relevant to a location; `near: null` returns everything (no saved home address). */
  getActiveAlerts(near: LatLng | null): Promise<FireAlert[]>;
}

const MOCK_ALERTS: FireAlert[] = [
  {
    id: 'mock-1',
    title: 'Red Flag Warning',
    severity: 'warning',
    description:
      'Critical fire weather conditions: sustained winds 25–35 mph with gusts to 50 mph and relative humidity below 10%. Any fires that develop will spread rapidly. Avoid outdoor burning.',
    issuedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    expiresAt: new Date(Date.now() + 22 * 3600_000).toISOString(),
    source: 'National Weather Service (mock)',
    center: { latitude: 34.0522, longitude: -118.2437 },
    radiusKm: 120,
  },
  {
    id: 'mock-2',
    title: 'Fire Weather Watch',
    severity: 'watch',
    description:
      'Gusty offshore winds and low humidity are possible Thursday into Friday. Review your family checklist and keep go-bags accessible.',
    issuedAt: new Date(Date.now() - 8 * 3600_000).toISOString(),
    expiresAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
    source: 'National Weather Service (mock)',
    center: { latitude: 34.0522, longitude: -118.2437 },
    radiusKm: 200,
  },
  {
    id: 'mock-3',
    title: 'Air Quality Advisory',
    severity: 'advisory',
    description:
      'Smoke from regional wildfires is degrading air quality. Sensitive groups should limit prolonged outdoor exertion and keep windows closed.',
    issuedAt: new Date(Date.now() - 24 * 3600_000).toISOString(),
    expiresAt: null,
    source: 'Air Quality District (mock)',
    center: { latitude: 34.0522, longitude: -118.2437 },
    radiusKm: 300,
  },
];

const mockAlertProvider: AlertProvider = {
  async getActiveAlerts(near) {
    // Small artificial delay so the loading state is visible during development.
    await new Promise((r) => setTimeout(r, 300));
    if (!near) return MOCK_ALERTS;
    return MOCK_ALERTS.filter((a) => distanceKm(near, a.center) <= a.radiusKm);
  },
};

/** The provider the app uses. Swap this when a real feed is wired up. */
export const activeAlertProvider: AlertProvider = mockAlertProvider;
