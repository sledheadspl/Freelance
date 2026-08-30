import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../src/contexts/AuthContext';
import { listInventory, type InventoryWithScan } from '../../src/lib/inventory';
import { formatCurrency } from '../../src/lib/scanDisplay';
import { supabase } from '../../src/lib/supabase';
import type { InventoryStatus } from '../../src/types/database';

const STATUS_LABELS: Record<InventoryStatus, string> = {
  unlisted: 'Unlisted',
  listed: 'Listed',
  sold: 'Sold',
  shipped: 'Shipped',
};

const STATUS_COLORS: Record<InventoryStatus, { bg: string; text: string }> = {
  unlisted: { bg: '#f0f0f0', text: '#444' },
  listed: { bg: '#cfe2ff', text: '#084298' },
  sold: { bg: '#d1e7dd', text: '#0f5132' },
  shipped: { bg: '#d1e7dd', text: '#0a3622' },
};

export default function Inventory() {
  const { session } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<InventoryWithScan[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;

    try {
      const data = await listInventory(session.user.id);
      setError(null);
      setItems(data);

      const paths = data
        .map((item) => item.scans?.image_url)
        .filter((path): path is string => !!path);

      if (paths.length > 0) {
        const { data: signed } = await supabase.storage.from('scan-images').createSignedUrls(paths, 60 * 60 * 24 * 7);
        if (signed) {
          const urlMap: Record<string, string> = {};
          signed.forEach((entry) => {
            if (entry.signedUrl && entry.path) {
              urlMap[entry.path] = entry.signedUrl;
            }
          });
          setImageUrls(urlMap);
        }
      } else {
        setImageUrls({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory.');
    }
  }, [session]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={items.length === 0 ? styles.emptyContent : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No inventory yet</Text>
            <Text style={styles.emptySubtitle}>{`Tap “I Bought It” on a scan to add it here.`}</Text>
          </View>
        }
        renderItem={({ item }) => {
          const imagePath = item.scans?.image_url;
          return (
            <Pressable style={styles.row} onPress={() => router.push(`/inventory/${item.id}`)}>
              {imagePath && imageUrls[imagePath] ? (
                <Image source={{ uri: imageUrls[imagePath] }} style={styles.thumbnail} />
              ) : (
                <View style={[styles.thumbnail, styles.thumbnailPlaceholder]} />
              )}

              <View style={styles.rowContent}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.scans?.identified_name ?? 'Unidentified item'}
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {item.scans?.identified_category ?? '—'}
                </Text>
                <View style={styles.rowMeta}>
                  <Text style={styles.rowPrice}>Paid {formatCurrency(item.purchase_price)}</Text>
                  {item.listing_title ? <Text style={styles.rowDraft}>Draft ready</Text> : null}
                </View>
              </View>

              <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[item.status as InventoryStatus] ?? STATUS_COLORS.unlisted).bg }]}>
                <Text style={[styles.statusBadgeText, { color: (STATUS_COLORS[item.status as InventoryStatus] ?? STATUS_COLORS.unlisted).text }]}>
                  {STATUS_LABELS[item.status as InventoryStatus]}
                </Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    color: '#d33',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  emptyContent: {
    flexGrow: 1,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  thumbnailPlaceholder: {
    backgroundColor: '#eee',
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowSubtitle: {
    color: '#666',
    fontSize: 13,
    marginTop: 2,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  rowPrice: {
    fontWeight: '600',
  },
  rowDraft: {
    fontSize: 12,
    color: '#1a7f37',
    fontWeight: '600',
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
