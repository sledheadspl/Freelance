import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../src/contexts/AuthContext';
import { listOrders, syncOrders, type OrderWithItem } from '../../src/lib/orders';
import { formatCurrency } from '../../src/lib/scanDisplay';
import { supabase } from '../../src/lib/supabase';
import type { OrderStatus } from '../../src/types/database';

const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_shipment: 'Awaiting Shipment',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export default function Orders() {
  const { session } = useAuth();
  const [orders, setOrders] = useState<OrderWithItem[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;

    try {
      const data = await listOrders(session.user.id);
      setError(null);
      setOrders(data);

      const paths = data
        .map((order) => order.inventory?.scans?.image_url)
        .filter((path): path is string => !!path);

      if (paths.length > 0) {
        const { data: signed } = await supabase.storage.from('scan-images').createSignedUrls(paths, 60 * 60);
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
      setError(err instanceof Error ? err.message : 'Failed to load orders.');
    }
  }, [session]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await syncOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync orders.');
    }
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
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={orders.length === 0 ? styles.emptyContent : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No orders yet</Text>
            <Text style={styles.emptySubtitle}>
              Pull to refresh to check eBay for new sales of your listed items.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const imagePath = item.inventory?.scans?.image_url;
          return (
            <View style={styles.row}>
              {imagePath && imageUrls[imagePath] ? (
                <Image source={{ uri: imageUrls[imagePath] }} style={styles.thumbnail} />
              ) : (
                <View style={[styles.thumbnail, styles.thumbnailPlaceholder]} />
              )}

              <View style={styles.rowContent}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.inventory?.scans?.identified_name ?? 'Unidentified item'}
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {item.buyer_username ? `Buyer: ${item.buyer_username}` : '—'}
                </Text>
                <View style={styles.rowMeta}>
                  {item.inventory?.sold_price != null ? (
                    <Text style={styles.rowPrice}>Sold {formatCurrency(item.inventory.sold_price)}</Text>
                  ) : null}
                  {item.ship_by ? <Text style={styles.rowDate}>Ship by {item.ship_by}</Text> : null}
                </View>
              </View>

              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>{STATUS_LABELS[item.status]}</Text>
              </View>
            </View>
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
    gap: 12,
    marginTop: 6,
  },
  rowPrice: {
    fontWeight: '600',
  },
  rowDate: {
    color: '#999',
    fontSize: 12,
  },
  statusBadge: {
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444',
  },
});
