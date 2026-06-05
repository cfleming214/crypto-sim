import React from 'react';
import { View, Text, Image, TouchableOpacity, Linking, Alert } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { ExternalLink, Newspaper } from 'lucide-react-native';
import { ScreenShell } from '../components/ui/ScreenShell';
import { useTheme } from '../theme/ThemeContext';
import { timeAgo, type NewsArticle } from '../services/newsService';

export function NewsDetailScreen() {
  const { colors } = useTheme();
  const route = useRoute<any>();
  const article = route.params?.article as NewsArticle | undefined;

  if (!article) {
    return (
      <ScreenShell eyebrow="Crypto" title="Article">
        <Text style={{ color: colors.ink3 }}>This article is no longer available.</Text>
      </ScreenShell>
    );
  }

  const openArticle = async () => {
    try {
      const ok = await Linking.canOpenURL(article.url);
      if (ok) await Linking.openURL(article.url);
      else Alert.alert('Cannot open link', article.url);
    } catch {
      Alert.alert('Cannot open link', article.url);
    }
  };

  const date = new Date(article.publishedAt).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <ScreenShell eyebrow={article.source} title="Article">
      {article.imageUrl ? (
        <Image
          source={{ uri: article.imageUrl }}
          style={{ width: '100%', height: 200, borderRadius: 16, backgroundColor: colors.surface2 }}
          resizeMode="cover"
        />
      ) : (
        <View style={{ width: '100%', height: 160, borderRadius: 16, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Newspaper color={colors.ink4} size={40} strokeWidth={1.5} />
        </View>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: colors.brand }}>{article.source}</Text>
        <Text style={{ fontSize: 12, color: colors.ink4 }}>· {timeAgo(article.publishedAt)} · {date}</Text>
        {!!article.category && (
          <View style={{ backgroundColor: colors.surface2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ fontSize: 11, color: colors.ink3 }}>{article.category}</Text>
          </View>
        )}
      </View>

      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink, lineHeight: 29, letterSpacing: -0.4 }}>
        {article.title}
      </Text>

      {!!article.author && (
        <Text style={{ fontSize: 13, color: colors.ink3 }}>By {article.author}</Text>
      )}

      {!!article.summary && (
        <Text style={{ fontSize: 15, color: colors.ink2, lineHeight: 23 }}>
          {article.summary}
        </Text>
      )}

      <TouchableOpacity
        testID="news-open-article-btn"
        activeOpacity={0.85}
        onPress={openArticle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          backgroundColor: colors.brand,
          borderRadius: 14,
          paddingVertical: 15,
          marginTop: 4,
        }}
      >
        <Text style={{ color: colors.brandOn, fontWeight: '700', fontSize: 15 }}>Read full article</Text>
        <ExternalLink color={colors.brandOn} size={18} strokeWidth={2} />
      </TouchableOpacity>

      <TouchableOpacity onPress={openArticle} activeOpacity={0.6}>
        <Text style={{ fontSize: 12, color: colors.ink4, textAlign: 'center' }} numberOfLines={1}>
          {article.url.replace(/^https?:\/\//, '').split('?')[0]}
        </Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 11, color: colors.ink4, textAlign: 'center', marginTop: 2, lineHeight: 16 }}>
        Opens the original article on {article.source}.
      </Text>
    </ScreenShell>
  );
}
