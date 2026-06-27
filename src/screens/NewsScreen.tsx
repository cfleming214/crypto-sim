import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, FlatList, Image, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Text } from '../components/ui/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { Newspaper } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { fetchCryptoNews, timeAgo, type NewsArticle } from '../services/newsService';
import { NativeAdCard } from '../components/NativeAdCard';

// A native ad slot is interleaved into the feed after every Nth article.
const ADS_EVERY = 7;
type FeedItem = { kind: 'article'; article: NewsArticle } | { kind: 'ad'; id: string };

function NewsCard({ article, onPress }: { article: NewsArticle; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      testID={`news-card-${article.id}`}
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        gap: 12,
        backgroundColor: colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.hairline,
        padding: 12,
      }}
    >
      {article.imageUrl ? (
        <Image
          source={{ uri: article.imageUrl }}
          style={{ width: 92, height: 92, borderRadius: 12, backgroundColor: colors.surface2 }}
        />
      ) : (
        <View style={{ width: 92, height: 92, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Newspaper color={colors.ink4} size={28} strokeWidth={1.5} />
        </View>
      )}
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <View style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.brand }} numberOfLines={1}>
              {article.source}
            </Text>
            <Text style={{ fontSize: 11, color: colors.ink4 }}>· {timeAgo(article.publishedAt)}</Text>
          </View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.ink, lineHeight: 19 }} numberOfLines={3}>
            {article.title}
          </Text>
        </View>
        {!!article.summary && (
          <Text style={{ fontSize: 12, color: colors.ink3, lineHeight: 16 }} numberOfLines={2}>
            {article.summary}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export function NewsScreen() {
  const { colors, isDark } = useTheme();
  const nav = useNavigation<any>();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async (force: boolean) => {
    try {
      const list = await fetchCryptoNews(force);
      setArticles(list);
      setError(list.length === 0);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await load(false);
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await load(true); } finally { setRefreshing(false); }
  }, [load]);

  // Interleave a native-ad slot after every ADS_EVERY articles.
  const feed = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];
    articles.forEach((a, i) => {
      out.push({ kind: 'article', article: a });
      if ((i + 1) % ADS_EVERY === 0) out.push({ kind: 'ad', id: `native-ad-${i + 1}` });
    });
    return out;
  }, [articles]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', letterSpacing: 0.44, color: colors.ink3, marginBottom: 2 }}>
          CRYPTO
        </Text>
        <Text style={{ fontSize: 22, fontWeight: '700', letterSpacing: -0.44, color: colors.ink }}>
          News
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <FlatList
          data={feed}
          keyExtractor={item => (item.kind === 'ad' ? item.id : item.article.id)}
          renderItem={({ item }) => (
            item.kind === 'ad'
              ? <NativeAdCard />
              : <NewsCard article={item.article} onPress={() => nav.navigate('NewsDetail', { article: item.article })} />
          )}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 12 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} />
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 80, gap: 8 }}>
              <Newspaper color={colors.ink4} size={36} strokeWidth={1.5} />
              <Text style={{ color: colors.ink3, fontSize: 14, textAlign: 'center' }}>
                {error ? "Couldn't load news right now." : 'No articles yet.'}
              </Text>
              <Text style={{ color: colors.ink4, fontSize: 12 }}>Pull down to refresh.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
