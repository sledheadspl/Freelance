import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { setDiscoveryShared, type DiscoveryRow } from '../../src/lib/discovery';
import { GradeBadge, formatCurrency } from '../../src/lib/scanDisplay';
import { supabase } from '../../src/lib/supabase';
import type { DiscoveryAttributes } from '../../src/types/database';

export default function DiscoveryResult() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [discovery, setDiscovery] = useState<DiscoveryRow | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharedUpdating, setSharedUpdating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('discoveries')
        .select('*')
        .eq('id', id)
        .single();

      if (cancelled) return;

      if (fetchError || !data) {
        setError(fetchError?.message ?? 'Find not found');
        setLoading(false);
        return;
      }

      setDiscovery(data);

      if (data.image_url) {
        const { data: signed } = await supabase.storage
          .from('scan-images')
          .createSignedUrl(data.image_url, 60 * 60 * 24 * 7);
        if (!cancelled && signed) {
          setImageUrl(signed.signedUrl);
        }
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function toggleShared(value: boolean) {
    if (!discovery) return;

    setSharedUpdating(true);
    try {
      await setDiscoveryShared(discovery.id, value);
      setDiscovery({ ...discovery, shared: value });
    } catch {
      Alert.alert('Error', 'Could not update sharing preference. Please try again.');
    } finally {
      setSharedUpdating(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !discovery) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Find not found'}</Text>
      </View>
    );
  }

  const attributes = (discovery.identified_attributes ?? {}) as DiscoveryAttributes;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} /> : null}

      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Text style={styles.name}>{discovery.identified_name ?? 'Unidentified'}</Text>
          <Text style={styles.category}>{discovery.identified_category ?? '—'}</Text>
        </View>
        <GradeBadge grade={discovery.confidence_grade} />
      </View>

      {discovery.description ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{discovery.description}</Text>
        </View>
      ) : null}

      {attributes.notable_features && attributes.notable_features.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notable Features</Text>
          {attributes.notable_features.map((feature, index) => (
            <Text key={index} style={styles.listItem}>
              • {feature}
            </Text>
          ))}
        </View>
      ) : null}

      {attributes.next_steps && attributes.next_steps.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Next Steps to Verify</Text>
          {attributes.next_steps.map((step, index) => (
            <Text key={index} style={styles.listItem}>
              • {step}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Resale Value</Text>
        {discovery.est_sale_price != null ? (
          <>
            <DetailRow label="Est. Sale Price" value={formatCurrency(discovery.est_sale_price)} />
            <DetailRow
              label="Price Range"
              value={`${formatCurrency(discovery.est_sale_low)} – ${formatCurrency(discovery.est_sale_high)}`}
            />
            <DetailRow label="Based on" value={`${discovery.comps_count ?? 0} sold comps`} />
          </>
        ) : (
          <Text style={styles.placeholder}>No resale market found for this item.</Text>
        )}
      </View>

      {attributes.similar_listings && attributes.similar_listings.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Similar eBay Listings</Text>
          <Text style={styles.placeholder}>
            These are titles of similarly-described eBay listings — a qualitative signal, not confirmation of
            what&rsquo;s in your photo.
          </Text>
          {attributes.similar_listings.map((title, index) => (
            <Text key={index} style={styles.listItem}>
              • {title}
            </Text>
          ))}
        </View>
      ) : null}

      {discovery.latitude != null && discovery.longitude != null ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location</Text>
          <DetailRow label="Coordinates" value={`${discovery.latitude.toFixed(5)}, ${discovery.longitude.toFixed(5)}`} />
          <DetailRow label="Captured" value={new Date(discovery.captured_at).toLocaleString()} />
        </View>
      ) : null}

      <View style={styles.section}>
        <View style={styles.sharedRow}>
          <View style={styles.sharedText}>
            <Text style={styles.sectionTitle}>Share to dataset</Text>
            <Text style={styles.placeholder}>
              Opt in to include this find in FlipScanner&rsquo;s shared dataset of identified finds.
            </Text>
          </View>
          <Switch value={discovery.shared} onValueChange={toggleShared} disabled={sharedUpdating} />
        </View>
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  error: {
    color: '#d33',
    textAlign: 'center',
  },
  image: {
    width: '100%',
    height: 240,
    borderRadius: 12,
    backgroundColor: '#eee',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleText: {
    flex: 1,
    marginRight: 12,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
  },
  category: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  section: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  description: {
    color: '#333',
    lineHeight: 20,
  },
  listItem: {
    color: '#444',
    marginBottom: 4,
  },
  placeholder: {
    color: '#666',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rowLabel: {
    color: '#666',
  },
  rowValue: {
    fontWeight: '600',
  },
  sharedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sharedText: {
    flex: 1,
    marginRight: 12,
  },
});
