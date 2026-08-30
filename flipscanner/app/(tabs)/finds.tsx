import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../src/contexts/AuthContext';
import { listDiscoveries, type DiscoveryRow } from '../../src/lib/discovery';
import { GradeBadge, formatCurrency, formatRelativeDate } from '../../src/lib/scanDisplay';
import { supabase } from '../../src/lib/supabase';

const PAGE_SIZE = 30;

export default function Finds() {
  const { session } = useAuth();
  const router = useRouter();
  const [discoveries, setDiscoveries] = useState<DiscoveryRow[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;

    try {
      const data = (await listDiscoveries(session.user.id)).slice(0, PAGE_SIZE);
      setError(null);
      setDiscoveries(data);

      const paths = data.map((d) => d.image_url).filter((path): path is string => !!path);

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
      setError(err instanceof Error ? err.message : 'Failed to load finds.');
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
        data={discoveries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={discoveries.length === 0 ? styles.emptyContent : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No finds yet</Text>
            <Text style={styles.emptySubtitle}>
              Use the Discover tab to identify rocks, wood, plants, and more.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/discovery/${item.id}`)}>
            {item.image_url && imageUrls[item.image_url] ? (
              <Image source={{ uri: imageUrls[item.image_url] }} style={styles.thumbnail} />
            ) : (
              <View style={[styles.thumbnail, styles.thumbnailPlaceholder]} />
            )}

            <View style={styles.rowContent}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.identified_name ?? 'Unidentified'}
              </Text>
              <Text style={styles.rowSubtitle} numberOfLines={1}>
                {item.identified_category ?? '—'}
              </Text>
              <View style={styles.rowMeta}>
                {item.est_sale_price != null ? (
                  <Text style={styles.rowPrice}>~{formatCurrency(item.est_sale_price)} on eBay</Text>
                ) : (
                  <Text style={styles.rowNoValue}>No resale market found</Text>
                )}
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
    color: '#1a7f37',
  },
  rowNoValue: {
    color: '#999',
    fontSize: 13,
  },
  rowDate: {
    color: '#999',
    fontSize: 12,
    marginLeft: 'auto',
  },
});
