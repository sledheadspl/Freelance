import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

/**
 * Web-only route. After the eBay OAuth flow the edge function redirects here
 * with ?status=success|error. We close the auth session so the opener resolves,
 * then navigate the user back to Settings.
 */
export default function EbayCallback() {
  const router = useRouter();
  const { status } = useLocalSearchParams<{ status?: string }>();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/(tabs)/settings');
    }, 1500);
    return () => clearTimeout(timer);
  }, [router]);

  const succeeded = status === 'success';

  return (
    <View style={styles.container}>
      {succeeded ? (
        <Text style={styles.success}>eBay account connected!</Text>
      ) : (
        <Text style={styles.error}>eBay connection failed. Please try again from Settings.</Text>
      )}
      <ActivityIndicator style={styles.spinner} />
      <Text style={styles.hint}>Returning to FlipScanner…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  success: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a7f37',
    marginBottom: 16,
  },
  error: {
    fontSize: 16,
    color: '#d33',
    textAlign: 'center',
    marginBottom: 16,
  },
  spinner: {
    marginBottom: 12,
  },
  hint: {
    color: '#999',
    fontSize: 13,
  },
});
