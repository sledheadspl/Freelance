import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../src/contexts/AuthContext';

export default function AuthLayout() {
  const { session, loading } = useAuth();

  if (!loading && session) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}
