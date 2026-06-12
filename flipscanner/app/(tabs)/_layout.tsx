import { Redirect, Tabs } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '../../src/contexts/AuthContext';
import { registerForPushNotifications } from '../../src/lib/notifications';

export default function TabsLayout() {
  const { session, loading } = useAuth();

  useEffect(() => {
    if (session) {
      registerForPushNotifications(session.user.id);
    }
  }, [session]);

  if (!loading && !session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Tabs>
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="index" options={{ title: 'Scan' }} />
      <Tabs.Screen name="history" options={{ title: 'History' }} />
      <Tabs.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
