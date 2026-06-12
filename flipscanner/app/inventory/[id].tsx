import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { generateListing, updateListingDraft } from '../../src/lib/listing';
import { formatCurrency } from '../../src/lib/scanDisplay';
import { supabase } from '../../src/lib/supabase';
import type { Database } from '../../src/types/database';

type InventoryRow = Database['public']['Tables']['inventory']['Row'];
type ScanRow = Database['public']['Tables']['scans']['Row'];
type InventoryWithScan = InventoryRow & { scans: ScanRow | null };

export default function ListingDraft() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<InventoryWithScan | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('inventory')
      .select('*, scans(*)')
      .eq('id', id)
      .single();

    if (fetchError || !data) {
      setError(fetchError?.message ?? 'Inventory item not found');
      return;
    }

    const row = data as InventoryWithScan;
    setItem(row);
    setTitle(row.listing_title ?? '');
    setDescription(row.listing_description ?? '');
    setPriceInput(
      row.listed_price != null ? String(row.listed_price) : row.scans?.est_sale_price != null ? String(row.scans.est_sale_price) : ''
    );

    if (row.scans?.image_url) {
      const { data: signed } = await supabase.storage
        .from('scan-images')
        .createSignedUrl(row.scans.image_url, 60 * 60);
      if (signed) {
        setImageUrl(signed.signedUrl);
      }
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [load]);

  async function handleGenerate() {
    if (!item) return;
    setGenerating(true);
    try {
      const updated = await generateListing(item.id);
      setTitle(updated.listing_title ?? '');
      setDescription(updated.listing_description ?? '');
      setItem({ ...item, ...updated });
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to generate listing draft.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!item) return;

    const trimmedTitle = title.trim();
    if (trimmedTitle.length > 80) {
      Alert.alert('Title too long', 'eBay titles must be 80 characters or fewer.');
      return;
    }

    let listedPrice: number | null = null;
    if (priceInput.trim()) {
      const parsed = parseFloat(priceInput);
      if (Number.isNaN(parsed) || parsed < 0) {
        Alert.alert('Invalid price', 'Enter a valid listing price.');
        return;
      }
      listedPrice = parsed;
    }

    setSaving(true);
    try {
      const updated = await updateListingDraft(item.id, {
        listing_title: trimmedTitle,
        listing_description: description.trim(),
        listed_price: listedPrice,
      });
      setItem({ ...item, ...updated });
      Alert.alert('Saved', 'Listing draft saved.');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save listing draft.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !item) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Inventory item not found'}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} /> : null}

        <Text style={styles.name}>{item.scans?.identified_name ?? 'Unidentified item'}</Text>
        <Text style={styles.category}>{item.scans?.identified_category}</Text>
        <Text style={styles.meta}>Purchased for {formatCurrency(item.purchase_price)}</Text>
        {item.scans?.est_sale_price != null ? (
          <Text style={styles.meta}>Est. sale price {formatCurrency(item.scans.est_sale_price)}</Text>
        ) : null}

        <Pressable
          style={[styles.button, styles.generateButton]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {item.listing_title ? 'Regenerate Draft with AI' : 'Generate Draft with AI'}
            </Text>
          )}
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="eBay listing title (80 chars max)"
            maxLength={80}
          />
          <Text style={styles.charCount}>{title.length}/80</Text>

          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Listing description"
            multiline
            numberOfLines={6}
          />

          <Text style={styles.label}>Listing price</Text>
          <TextInput
            style={styles.input}
            value={priceInput}
            onChangeText={setPriceInput}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
        </View>

        <Pressable style={[styles.button, styles.saveButton]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Draft</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
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
    height: 200,
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
  },
  meta: {
    fontSize: 14,
    color: '#444',
    marginTop: 4,
  },
  section: {
    marginTop: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 4,
  },
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  generateButton: {
    backgroundColor: '#111',
  },
  saveButton: {
    backgroundColor: '#1a7f37',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
