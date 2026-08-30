import * as Clipboard from 'expo-clipboard';
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
  View,
} from 'react-native';

import { type OrderWithItem } from '../../src/lib/orders';
import { formatCurrency } from '../../src/lib/scanDisplay';
import { supabase } from '../../src/lib/supabase';
import type { OrderStatus } from '../../src/types/database';

const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_shipment: 'Awaiting Shipment',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<OrderStatus, { bg: string; text: string }> = {
  awaiting_shipment: { bg: '#fff3cd', text: '#856404' },
  shipped: { bg: '#cfe2ff', text: '#084298' },
  delivered: { bg: '#d1e7dd', text: '#0f5132' },
  cancelled: { bg: '#f8d7da', text: '#842029' },
};

function formatShipByDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<OrderWithItem | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('*, inventory(*, scans(*))')
        .eq('id', id)
        .single();

      if (cancelled) return;

      if (fetchError || !data) {
        setError(fetchError?.message ?? 'Order not found');
        setLoading(false);
        return;
      }

      const row = data as OrderWithItem;
      setOrder(row);

      const imagePath = row.inventory?.scans?.image_url;
      if (imagePath) {
        const { data: signed } = await supabase.storage
          .from('scan-images')
          .createSignedUrl(imagePath, 60 * 60 * 24 * 7);
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

  if (error || !order) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Order not found'}</Text>
      </View>
    );
  }

  const status = order.status as OrderStatus;
  const profit =
    order.inventory?.sold_price != null && order.inventory?.purchase_price != null
      ? order.inventory.sold_price - order.inventory.purchase_price
      : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.image} /> : null}

      <Text style={styles.name}>
        {order.inventory?.scans?.identified_name ?? 'Unidentified item'}
      </Text>
      <Text style={styles.category}>
        {order.inventory?.scans?.identified_category ?? '—'}
      </Text>

      <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[status].bg }]}>
        <Text style={[styles.statusText, { color: STATUS_COLORS[status].text }]}>
          {STATUS_LABELS[status]}
        </Text>
      </View>

      <View style={styles.section}>
        {order.inventory?.sold_price != null ? (
          <DetailRow label="Sale price" value={formatCurrency(order.inventory.sold_price)} />
        ) : null}
        {order.inventory?.purchase_price != null ? (
          <DetailRow label="Bought for" value={formatCurrency(order.inventory.purchase_price)} />
        ) : null}
        {profit != null ? (
          <DetailRow
            label="Profit"
            value={formatCurrency(profit)}
            valueColor={profit >= 0 ? '#1a7f37' : '#cf222e'}
          />
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Buyer & Shipping</Text>
        {order.buyer_username ? (
          <DetailRow label="Buyer" value={order.buyer_username} />
        ) : null}
        {order.ship_by ? (
          <DetailRow label="Ship by" value={formatShipByDate(order.ship_by)} />
        ) : null}
        {order.ebay_order_id ? (
          <DetailRow label="eBay Order ID" value={order.ebay_order_id} />
        ) : null}
        {order.tracking_number ? (
          <View style={styles.trackingRow}>
            <View style={styles.trackingText}>
              <Text style={styles.rowLabel}>Tracking number</Text>
              <Text style={styles.rowValue}>{order.tracking_number}</Text>
            </View>
            <Pressable
              style={styles.copyButton}
              onPress={async () => {
                await Clipboard.setStringAsync(order.tracking_number!);
                Alert.alert('Copied', 'Tracking number copied to clipboard.');
              }}
            >
              <Text style={styles.copyButtonText}>Copy</Text>
            </Pressable>
          </View>
        ) : (
          <DetailRow label="Tracking number" value="Not yet available" />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Timeline</Text>
        <DetailRow label="Order created" value={new Date(order.created_at).toLocaleString()} />
        {order.inventory?.sold_at ? (
          <DetailRow label="Sold" value={new Date(order.inventory.sold_at).toLocaleString()} />
        ) : null}
        {order.inventory?.shipped_at ? (
          <DetailRow label="Shipped" value={new Date(order.inventory.shipped_at).toLocaleString()} />
        ) : null}
      </View>
    </ScrollView>
  );
}

function DetailRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
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
    height: 220,
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
    marginBottom: 12,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
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
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  trackingText: {
    flex: 1,
  },
  copyButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginLeft: 8,
  },
  copyButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#444',
  },
});
