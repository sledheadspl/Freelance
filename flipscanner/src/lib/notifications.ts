import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Requests notification permission, registers for an Expo push token, and
 * saves it on the user's profile so order-sold alerts can be sent
 * (Build Order step 10). No-ops on web and in environments without a
 * configured push project (e.g. local dev without EAS).
 */
export async function registerForPushNotifications(userId: string): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) {
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let status = existingStatus;
  if (status !== 'granted') {
    const { status: requestedStatus } = await Notifications.requestPermissionsAsync();
    status = requestedStatus;
  }
  if (status !== 'granted') {
    return;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    const { data: profile } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', userId)
      .single();

    if (profile?.push_token !== token) {
      await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
    }
  } catch (error) {
    console.warn('Failed to register for push notifications', error);
  }
}
