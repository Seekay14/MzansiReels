import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import VideoGrid from '../components/VideoGrid';
import Avatar from '../components/Avatar';

const trendingTags = ['#southafrica', '#soweto', '#coding', '#dance', '#comedy', '#johannesburg'];

export default function SearchScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [searchText, setSearchText] = useState('');
  const [mode, setMode] = useState('videos'); 
  const [allVideos, setAllVideos] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchAttempt, setSearchAttempt] = useState(0);
  const searchRequest = React.useRef(0);

  const loadDiscover = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [videoResult, userResult] = await Promise.all([
        databases.listDocuments(DATABASE_ID, COLLECTIONS.videos, [Query.orderDesc('$createdAt'), Query.limit(100)]),
        databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [Query.limit(100)]),
      ]);
      setAllVideos(videoResult.documents);
      setAllUsers(userResult.documents);
    } catch (error) {
      console.error('Error loading discovery data:', error);
      setLoadError('Discovery could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDiscover(); }, [loadDiscover]);

  const q = searchText.trim().toLowerCase();

  useEffect(() => {
    const request = ++searchRequest.current;
    const searchTerm = searchText.trim().replace(/^#/, '');
    if (!searchTerm || mode !== 'videos') {
      setSearchResults(null);
      setSearchLoading(false);
      setSearchError('');
      return undefined;
    }

    setSearchLoading(true);
    setSearchError('');
    const timeout = setTimeout(async () => {
      try {
        const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.videos, [
          Query.or([
            Query.search('caption', searchTerm),
            Query.search('category', searchTerm),
          ]),
          Query.orderDesc('likes'),
          Query.orderDesc('views'),
          Query.limit(100),
        ]);
        if (request === searchRequest.current) setSearchResults(result.documents);
      } catch (error) {
        console.error('Error searching videos:', error);
        if (request === searchRequest.current) {
          setSearchError('Video search failed. Check your connection and try again.');
          setSearchResults([]);
        }
      } finally {
        if (request === searchRequest.current) setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [mode, searchAttempt, searchText]);

  const videos = useMemo(() => (
    q ? (searchResults || []) : allVideos
  ), [q, searchResults, allVideos]);
  
  const users = useMemo(() => (q ? allUsers.filter((u) => (
    u.userId && (
      u.name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q)
    )
  )) : allUsers), [q, allUsers]);
  const popularVideos = useMemo(() => [...videos].sort(
    (a, b) => ((Number(b.likes) || 0) + (Number(b.views) || 0))
      - ((Number(a.likes) || 0) + (Number(a.views) || 0)),
  ), [videos]);

  const openUser = (userId, userName) => navigation.navigate('Home', { screen: 'UserProfile', params: { userId, userName } });

  return (
    <View style={styles.container}>
      <View style={[styles.searchContainer, { paddingTop: insets.top + 10 }]}>
        <View style={styles.discoverHeading}>
          <View>
            <Text style={styles.discoverTitle}>Discover</Text>
            <Text style={styles.discoverSubtitle}>Find your next favourite creator</Text>
          </View>
          <Ionicons name="sparkles-outline" size={25} color={COLORS.cyan} />
        </View>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#888" style={{ marginRight: 10 }} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search videos, people, hashtags"
            placeholderTextColor="#888" 
            value={searchText} 
            onChangeText={setSearchText} 
            autoCapitalize="none" 
          />
          {searchText !== '' && (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <Ionicons name="close-circle" size={20} color="#888" />
            </TouchableOpacity>
          )}
        </View>
        
        <View style={styles.modeRow}>
          {['videos', 'users'].map((m) => (
            <TouchableOpacity 
              key={m}
              style={styles.modeTab}
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>
                {m === 'videos' ? 'Videos' : 'Users'}
              </Text>
              {mode === m ? <View style={styles.modeUnderline} /> : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {searchText === '' && mode === 'videos' && (
        <View style={styles.trendingContainer}>
          <Text style={styles.trendingTitle}>Trending across Mzansi</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalContent}
          >
            {trendingTags.map((tag) => (
              <TouchableOpacity key={tag} style={styles.tagPill} onPress={() => setSearchText(tag)}>
                <Text style={styles.tagText}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {searchText === '' && mode === 'videos' && allUsers.length > 0 && (
        <View style={styles.suggestedContainer}>
          <Text style={styles.trendingTitle}>Creators to explore</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalContent}
          >
            {allUsers.filter((creator) => creator.userId).slice(0, 12).map((creator) => (
              <TouchableOpacity
                key={creator.$id}
                style={styles.suggestedCreator}
                onPress={() => openUser(creator.userId, creator.username || creator.name)}
              >
                <Avatar uri={creator.avatarUrl} userId={creator.userId} name={creator.username || creator.name} size={64} bordered />
                <Text style={styles.suggestedName} numberOfLines={1}>
                  @{creator.username || creator.name || 'creator'}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {loading || (mode === 'videos' && searchLoading) ? (
        <ActivityIndicator size="large" color={COLORS.cyan} style={{ marginTop: 50 }} />
      ) : loadError || (mode === 'videos' && searchError) ? (
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{searchError || loadError}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={searchError ? () => setSearchAttempt((attempt) => attempt + 1) : loadDiscover}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : mode === 'videos' ? (
        <VideoGrid
          videos={popularVideos}
          onPress={(video) => navigation.navigate('Home', { screen: 'Watch', params: { video: video, allVideos: videos } })}
          emptyText={q ? `No videos found for "${searchText}"` : 'Popular videos will appear here as creators share.'}
        />
      ) : (
        <FlatList
          data={users.filter((item) => item.userId)}
          keyExtractor={(u) => u.$id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.userRow} onPress={() => openUser(item.userId, item.username || item.name)}>
              <Avatar uri={item.avatarUrl} userId={item.userId} name={item.username || item.name} size={46} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.userName}>{item.name || item.username || 'Mzansi User'}</Text>
                <Text style={styles.userMeta}>@{item.username || 'user'} · {item.followers || 0} followers</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#555" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>{q ? `No users found for "${searchText}"` : 'No users yet.'}</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  searchContainer: { paddingHorizontal: 15, paddingBottom: 10 },
  discoverHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  discoverTitle: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  discoverSubtitle: { color: COLORS.muted, fontSize: 13, marginTop: 3 },
  searchBar: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 14, alignItems: 'center', paddingHorizontal: 12, height: 48, borderWidth: 1, borderColor: COLORS.border },
  searchInput: { flex: 1, color: '#fff', fontSize: 16 },
  modeRow: { flexDirection: 'row', marginTop: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modeTab: { flex: 1, alignItems: 'center', paddingHorizontal: 18, paddingTop: 9, paddingBottom: 10, position: 'relative' },
  modeText: { color: COLORS.muted, fontWeight: '700', fontSize: 15 },
  modeTextActive: { color: COLORS.cyan },
  modeUnderline: { position: 'absolute', bottom: -1, width: '62%', height: 3, borderRadius: 2, backgroundColor: COLORS.cyan },
  trendingContainer: { paddingHorizontal: 15, paddingBottom: 15 },
  trendingTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  tagPill: { backgroundColor: COLORS.card, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginRight: 10 },
  tagText: { color: COLORS.cyan, fontSize: 14, fontWeight: 'bold' },
  suggestedContainer: { paddingHorizontal: 15, paddingBottom: 14 },
  horizontalContent: { paddingRight: 20 },
  suggestedCreator: { width: 82, alignItems: 'center', marginRight: 12 },
  suggestedName: { color: '#fff', fontSize: 11, marginTop: 6, maxWidth: 82 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  userName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  userMeta: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  emptyText: { color: COLORS.muted, textAlign: 'center', marginTop: 40 },
  errorState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  errorText: { color: COLORS.muted, textAlign: 'center', lineHeight: 21 },
  retryButton: { backgroundColor: COLORS.cyan, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 10, marginTop: 16 },
  retryText: { color: '#000', fontWeight: '700' },
});