// Sends push notifications via the Expo push API (Build Order step 10).

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function sendPushNotification(pushToken: string, title: string, body: string): Promise<void> {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to: pushToken, title, body, sound: 'default' }),
    });

    if (!response.ok) {
      console.error(`Expo push send failed: ${response.status} ${await response.text()}`);
    }
  } catch (error) {
    console.error('sendPushNotification error', error);
  }
}
