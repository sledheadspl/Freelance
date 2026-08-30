import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

/**
 * Web-only route. After Stripe Checkout or the Billing Portal the user lands
 * here. We give brief feedback then navigate back to Settings where the
 * subscription status will refresh.
 */
export default function BillingCallback() {
  const router = useRouter();
  const { status } = useLocalSearchParams<{ status?: string }>();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace('/(tabs)/settings');
    }, 1500);
    return () => clearTimeout(timer);
  }, [router]);

  const succeeded = status !== 'cancel';

  return (
    <View style={styles.container}>
      {succeeded ? (
        <Text style={styles.success}>Payment complete!</Text>
      ) : (
        <Text style={styles.cancelled}>Checkout cancelled.</Text>
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
  cancelled: {
    fontSize: 16,
    color: '#666',
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
