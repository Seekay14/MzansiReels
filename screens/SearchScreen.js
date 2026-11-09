import React, { useState, useEffect, useMemo } from 'react';
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

  useEffect(() => {
    (async () => {
      try {
        const [v, u] = await Promise.all([
          databases.listDocuments(DATABASE_ID, COLLECTIONS.videos, [Query.orderDesc('$createdAt'), Query.limit(100)]),
          databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [Query.limit(100)]),
        ]);
        setAllVideos(v.documents);
        setAllUsers(u.documents);
      } catch (error) {
        console.log('Error loading search data:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const q = searchText.trim().toLowerCase();
  
  const videos = useMemo(
    () => (q ? allVideos.filter((v) => v.caption?.toLowerCase().includes(q) || v.userName?.toLowerCase().includes(q)) : allVideos),
    [q, allVideos]
  );
  
  const users = useMemo(() => (q ? allUsers.filter((u) => u.name?.toLowerCase().includes(q)) : allUsers), [q, allUsers]);

  const openUser = (userId, userName) => navigation.navigate('Home', { screen: 'UserProfile', params: { userId, userName } });

  return (
    <View style={styles.container}>
      <View style={[styles.searchContainer, { paddingTop: insets.top + 10 }]}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#888" style={{ marginRight: 10 }} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search users, hashtags..." 
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
              style={[styles.modeTab, mode === m && styles.modeTabActive]} 
              onPress={() => setMode(m)}
            >
              <Text style={[styles.modeText, mode === m && { color: '#000' }]}>
                {m === 'videos' ? 'Videos' : 'Users'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {searchText === '' && mode === 'videos' && (
        <View style={styles.trendingContainer}>
          <Text style={styles.trendingTitle}>Trending in SA</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {trendingTags.map((tag) => (
              <TouchableOpacity key={tag} style={styles.tagPill} onPress={() => setSearchText(tag)}>
                <Text style={styles.tagText}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.cyan} style={{ marginTop: 50 }} />
      ) : mode === 'videos' ? (
        <VideoGrid
          videos={videos}
          onPress={(video) => navigation.navigate('Home', { screen: 'Watch', params: { video: video, allVideos: videos } })}
          emptyText={q ? `No videos found for "${searchText}"` : 'No videos uploaded yet.'}
        />
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.$id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.userRow} onPress={() => openUser(item.userId, item.name)}>
              <Avatar uri={item.avatarUrl} name={item.name} size={46} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.userName}>@{item.name}</Text>
                <Text style={styles.userMeta}>{item.followers || 0} followers</Text>
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
  searchBar: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 10, alignItems: 'center', paddingHorizontal: 10, height: 45 },
  searchInput: { flex: 1, color: '#fff', fontSize: 16 },
  modeRow: { flexDirection: 'row', marginTop: 12 },
  modeTab: { paddingHorizontal: 18, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.card, marginRight: 10 },
  modeTabActive: { backgroundColor: COLORS.cyan },
  modeText: { color: '#fff', fontWeight: 'bold' },
  trendingContainer: { paddingHorizontal: 15, paddingBottom: 15 },
  trendingTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  tagPill: { backgroundColor: COLORS.card, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, marginRight: 10 },
  tagText: { color: COLORS.cyan, fontSize: 14, fontWeight: 'bold' },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  userName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  userMeta: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  emptyText: { color: COLORS.muted, textAlign: 'center', marginTop: 40 },
});