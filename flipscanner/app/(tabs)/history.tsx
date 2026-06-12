import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '../../src/contexts/AuthContext';
import { GradeBadge, RecommendationBadge, formatCurrency, formatRelativeDate } from '../../src/lib/scanDisplay';
import { supabase } from '../../src/lib/supabase';
import type { Database, Recommendation } from '../../src/types/database';

type ScanRow = Database['public']['Tables']['scans']['Row'];

type Filter = 'all' | Recommendation;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'buy', label: 'Buy' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'skip', label: 'Skip' },
];

const PAGE_SIZE = 30;

export default function History() {
  const { session } = useAuth();
  const router = useRouter();
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (currentFilter: Filter) => {
      if (!session) return;

      let query = supabase
        .from('scans')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (currentFilter !== 'all') {
        query = query.eq('recommendation', currentFilter);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setError(null);
      setScans(data ?? []);

      const paths = (data ?? []).map((scan) => scan.image_url).filter((path): path is string => !!path);

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
    },
    [session]
  );

  useEffect(() => {
    setLoading(true);
    load(filter).finally(() => setLoading(false));
  }, [filter, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(filter);
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
      <View style={styles.filterBar}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.value}
            style={[styles.filterChip, filter === f.value && styles.filterChipActive]}
            onPress={() => setFilter(f.value)}
          >
            <Text style={[styles.filterChipText, filter === f.value && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={scans}
        keyExtractor={(item) => item.id}
        contentContainerStyle={scans.length === 0 ? styles.emptyContent : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No scans yet</Text>
            <Text style={styles.emptySubtitle}>Scan an item to see it show up here.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/scan/${item.id}`)}>
            {item.image_url && imageUrls[item.image_url] ? (
              <Image source={{ uri: imageUrls[item.image_url] }} style={styles.thumbnail} />
            ) : (
              <View style={[styles.thumbnail, styles.thumbnailPlaceholder]} />
            )}

            <View style={styles.rowContent}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.identified_name ?? 'Unidentified item'}
              </Text>
              <Text style={styles.rowSubtitle} numberOfLines={1}>
                {item.identified_category ?? '—'}
              </Text>
              <View style={styles.rowMeta}>
                <RecommendationBadge recommendation={item.recommendation} />
                <Text style={styles.rowPrice}>{formatCurrency(item.est_sale_price)}</Text>
                <Text style={styles.rowDate}>{formatRelativeDate(item.created_at)}</Text>
              </View>
            </View>

            <GradeBadge grade={item.confidence_grade} />
          </Pressable>
        )}
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
  filterBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  filterChipActive: {
    backgroundColor: '#111',
  },
  filterChipText: {
    color: '#444',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  error: {
    color: '#d33',
    textAlign: 'center',
    marginBottom: 8,
  },
  listContent: {
    paddingHorizontal: 16,
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
  rowDate: {
    color: '#999',
    fontSize: 12,
    marginLeft: 'auto',
  },
});
