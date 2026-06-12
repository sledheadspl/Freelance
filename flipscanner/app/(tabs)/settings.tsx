import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../src/contexts/AuthContext';
import { openBillingPortal, startProCheckout } from '../../src/lib/billing';
import { connectEbayAccount, getEbayConnected } from '../../src/lib/ebay';
import { supabase } from '../../src/lib/supabase';
import type { SubscriptionTier } from '../../src/types/database';

export default function Settings() {
  const { session, signOut } = useAuth();
  const [ebayConnected, setEbayConnected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);

  const refreshEbayStatus = useCallback(async () => {
    if (!session) return;
    try {
      setEbayConnected(await getEbayConnected(session.user.id));
    } catch {
      setEbayConnected(null);
    }
  }, [session]);

  const refreshSubscription = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', session.user.id)
      .single();
    if (!error && data) {
      setSubscriptionTier(data.subscription_tier);
    }
  }, [session]);

  useEffect(() => {
    refreshEbayStatus();
    refreshSubscription();
  }, [refreshEbayStatus, refreshSubscription]);

  async function handleConnectEbay() {
    setConnecting(true);
    try {
      await connectEbayAccount();
      await refreshEbayStatus();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to connect eBay account.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleUpgrade() {
    setBillingLoading(true);
    try {
      await startProCheckout();
      await refreshSubscription();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to start checkout.');
    } finally {
      setBillingLoading(false);
    }
  }

  async function handleManageBilling() {
    setBillingLoading(true);
    try {
      await openBillingPortal();
      await refreshSubscription();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to open billing portal.');
    } finally {
      setBillingLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>{session?.user.email}</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Subscription</Text>
        <Text style={styles.subscriptionStatus}>{subscriptionTier === 'pro' ? 'Pro' : 'Free'} plan</Text>
        {subscriptionTier === 'pro' ? (
          <Pressable
            style={[styles.button, styles.ebayButton]}
            onPress={handleManageBilling}
            disabled={billingLoading}
          >
            {billingLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Manage Subscription</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            style={[styles.button, styles.ebayButton]}
            onPress={handleUpgrade}
            disabled={billingLoading}
          >
            {billingLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Upgrade to Pro</Text>
            )}
          </Pressable>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>eBay account</Text>
        {ebayConnected ? (
          <Text style={styles.connected}>✓ Connected</Text>
        ) : (
          <Pressable
            style={[styles.button, styles.ebayButton]}
            onPress={handleConnectEbay}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Connect eBay</Text>
            )}
          </Pressable>
        )}
      </View>

      <Pressable style={[styles.button, styles.signOutButton]} onPress={signOut}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </Pressable>
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
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 8,
    color: '#666',
    marginBottom: 24,
  },
  section: {
    alignItems: 'center',
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  connected: {
    color: '#1a7f37',
    fontWeight: '600',
  },
  subscriptionStatus: {
    fontWeight: '600',
    marginBottom: 12,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minWidth: 160,
    alignItems: 'center',
  },
  ebayButton: {
    backgroundColor: '#111',
  },
  signOutButton: {
    backgroundColor: '#d33',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
