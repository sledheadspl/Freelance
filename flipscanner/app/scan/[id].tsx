import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../../src/lib/supabase';
import type { Database, IdentifiedAttributes } from '../../src/types/database';

type ScanRow = Database['public']['Tables']['scans']['Row'];

const CONDITION_LABELS: Record<string, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
  parts_only: 'Parts Only',
};

export default function ScanResult() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [scan, setScan] = useState<ScanRow | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('scans')
        .select('*')
        .eq('id', id)
        .single();

      if (cancelled) return;

      if (fetchError || !data) {
        setError(fetchError?.message ?? 'Scan not found');
        setLoading(false);
        return;
      }

      setScan(data);

      if (data.image_url) {
        const { data: signed } = await supabase.storage
          .from('scan-images')
          .createSignedUrl(data.image_url, 60 * 60);
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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !scan) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Scan not found'}</Text>
      </View>
    );
  }

  const attributes = (scan.identified_attributes ?? {}) as IdentifiedAttributes;
  const confidencePct = attributes.id_confidence != null ? Math.round(attributes.id_confidence * 100) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} /> : null}

      <Text style={styles.name}>{scan.identified_name ?? 'Unidentified item'}</Text>
      <Text style={styles.category}>{scan.identified_category}</Text>

      {confidencePct != null && confidencePct < 60 ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Low confidence ({confidencePct}%). Try a closer photo, especially of any labels or part numbers.
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        {attributes.brand ? <DetailRow label="Brand" value={attributes.brand} /> : null}
        {attributes.model ? <DetailRow label="Model" value={attributes.model} /> : null}
        {attributes.part_number ? <DetailRow label="Part Number" value={attributes.part_number} /> : null}
        {attributes.condition_estimate ? (
          <DetailRow
            label="Condition"
            value={CONDITION_LABELS[attributes.condition_estimate] ?? attributes.condition_estimate}
          />
        ) : null}
        {confidencePct != null ? <DetailRow label="ID Confidence" value={`${confidencePct}%`} /> : null}
      </View>

      {attributes.notable_flaws && attributes.notable_flaws.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notable Flaws</Text>
          {attributes.notable_flaws.map((flaw, index) => (
            <Text key={index} style={styles.flaw}>
              • {flaw}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pricing & ROI</Text>
        <Text style={styles.placeholder}>
          eBay comps and a buy/skip recommendation are coming in the next build step.
        </Text>
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
  name: {
    fontSize: 22,
    fontWeight: '700',
  },
  category: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    marginBottom: 16,
  },
  banner: {
    backgroundColor: '#fff4e5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  bannerText: {
    color: '#8a5a00',
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
  flaw: {
    color: '#444',
    marginBottom: 4,
  },
  placeholder: {
    color: '#666',
  },
});
