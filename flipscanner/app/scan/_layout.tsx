import { Redirect, Stack } from 'expo-router';

import { useAuth } from '../../src/contexts/AuthContext';

export default function ScanStackLayout() {
  const { session, loading } = useAuth();

  if (!loading && !session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Stack>
      <Stack.Screen name="[id]" options={{ title: 'Scan Result' }} />
    </Stack>
  );
}
