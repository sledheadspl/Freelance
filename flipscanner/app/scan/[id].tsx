import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '../../src/contexts/AuthContext';
import { addToInventory, getInventoryForScan, type InventoryRow } from '../../src/lib/inventory';
import { CONDITION_LABELS, GradeBadge, RecommendationBadge, formatCurrency } from '../../src/lib/scanDisplay';
import { supabase } from '../../src/lib/supabase';
import type { Database, IdentifiedAttributes } from '../../src/types/database';

type ScanRow = Database['public']['Tables']['scans']['Row'];

export default function ScanResult() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [scan, setScan] = useState<ScanRow | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [inventoryItem, setInventoryItem] = useState<InventoryRow | null>(null);
  const [showBuyForm, setShowBuyForm] = useState(false);
  const [purchasePriceInput, setPurchasePriceInput] = useState('');
  const [addingToInventory, setAddingToInventory] = useState(false);

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

      try {
        const existing = await getInventoryForScan(data.id);
        if (!cancelled) {
          setInventoryItem(existing);
          if (!existing && data.max_buy_price != null) {
            setPurchasePriceInput(String(data.max_buy_price));
          }
        }
      } catch {
        // Inventory lookup failure shouldn't block showing the scan result.
      }

      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleAddToInventory() {
    if (!scan || !session) return;

    const price = parseFloat(purchasePriceInput);
    if (Number.isNaN(price) || price < 0) {
      Alert.alert('Invalid price', 'Enter a valid purchase price.');
      return;
    }

    setAddingToInventory(true);
    try {
      const created = await addToInventory(session.user.id, scan.id, price);
      setInventoryItem(created);
      setShowBuyForm(false);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add to inventory.');
    } finally {
      setAddingToInventory(false);
    }
  }

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
        <View style={styles.pricingHeader}>
          <Text style={styles.sectionTitle}>Pricing & ROI</Text>
          <GradeBadge grade={scan.confidence_grade} />
        </View>

        <View style={styles.recommendationWrapper}>
          <RecommendationBadge recommendation={scan.recommendation} />
        </View>

        {scan.comps_count === 0 ? (
          <Text style={styles.placeholder}>
            Not enough eBay sold comps found yet for &ldquo;{attributes.search_query ?? scan.identified_name}
            &rdquo;. Try a closer photo of any brand, model, or part number labels.
          </Text>
        ) : (
          <>
            <DetailRow label="Est. Sale Price" value={formatCurrency(scan.est_sale_price)} />
            <DetailRow
              label="Price Range"
              value={`${formatCurrency(scan.est_sale_low)} – ${formatCurrency(scan.est_sale_high)}`}
            />
            <DetailRow label="Based on" value={`${scan.comps_count} sold comps`} />
            <DetailRow label="Buy if under" value={formatCurrency(scan.max_buy_price)} />
          </>
        )}
      </View>

      <View style={styles.section}>
        {inventoryItem ? (
          <Text style={styles.inInventory}>✓ In Inventory — bought for {formatCurrency(inventoryItem.purchase_price)}</Text>
        ) : showBuyForm ? (
          <View>
            <Text style={styles.sectionTitle}>Purchase price</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={purchasePriceInput}
              onChangeText={setPurchasePriceInput}
              placeholder="0.00"
            />
            <View style={styles.buyFormActions}>
              <Pressable
                style={[styles.button, styles.secondaryButton]}
                onPress={() => setShowBuyForm(false)}
                disabled={addingToInventory}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.button, styles.primaryButton]}
                onPress={handleAddToInventory}
                disabled={addingToInventory}
              >
                <Text style={styles.primaryButtonText}>
                  {addingToInventory ? 'Adding...' : 'Add to Inventory'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={[styles.button, styles.primaryButton]} onPress={() => setShowBuyForm(true)}>
            <Text style={styles.primaryButtonText}>I Bought It</Text>
          </Pressable>
        )}
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
  pricingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  recommendationWrapper: {
    marginBottom: 12,
  },
  inInventory: {
    color: '#1a7f37',
    fontWeight: '600',
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  buyFormActions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#111',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
  },
  secondaryButtonText: {
    color: '#444',
    fontWeight: '600',
  },
});
