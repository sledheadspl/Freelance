import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Show notifications as banners even while the app is foregrounded —
// a family member's status change should never be silently swallowed.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Gets this device's Expo push token and stores it on the user's profile so
 * family members' devices can address it. Call after sign-in.
 *
 * Note: remote push requires a physical device, and on Android a development
 * build (Expo Go can't receive remote pushes there). Fails soft — the app
 * works fine without push.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('checkins', {
      name: 'Family check-ins',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await supabase.from('profiles').update({ expo_push_token: token }).eq('id', userId);
    return token;
  } catch {
    return null; // e.g. missing EAS project id in plain Expo Go — not fatal
  }
}

/**
 * Sends a push to a set of Expo push tokens via Expo's push API.
 *
 * Phase 1 keeps this client-side for simplicity: the sender's device notifies
 * the family directly after a check-in. If the sender is offline the write
 * still succeeds and only the push is skipped. A later phase should move this
 * into a Supabase Edge Function triggered by a database webhook so delivery
 * doesn't depend on the sender's connectivity.
 */
export async function sendPushToTokens(
  tokens: string[],
  title: string,
  body: string,
): Promise<void> {
  const valid = tokens.filter((t) => t.startsWith('ExponentPushToken'));
  if (valid.length === 0) return;

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        valid.map((to) => ({ to, title, body, sound: 'default', channelId: 'checkins' })),
      ),
    });
  } catch {
    // Push is best-effort; the check-in itself already saved.
  }
}
