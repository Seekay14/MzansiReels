import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, Query, account } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import { timeAgo } from '../config/helpers';
import Avatar from '../components/Avatar';

// Fake "Active Now" users for the top strip
const ACTIVE_USERS = [
  { id: '1', name: 'Sipho', img: 'https://i.pravatar.cc/150?img=11' },
  { id: '2', name: 'Lerato', img: 'https://i.pravatar.cc/150?img=47' },
  { id: '3', name: 'Thabo', img: 'https://i.pravatar.cc/150?img=33' },
  { id: '4', name: 'Zanele', img: 'https://i.pravatar.cc/150?img=68' },
  { id: '5', name: 'Kabelo', img: 'https://i.pravatar.cc/150?img=12' },
];

export default function MessagesScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    const getCurrentUser = async () => {
      try {
        const currentUser = await account.get();
        setUser(currentUser);
      } catch (error) {}
    };
    getCurrentUser();
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
        Query.or([Query.equal('senderId', user.$id), Query.equal('receiverId', user.$id)]),
        Query.orderDesc('$createdAt'),
        Query.limit(100),
      ]);

      const latest = new Map();
      res.documents.forEach((m) => {
        const otherId = m.senderId === user.$id ? m.receiverId : m.senderId;
        if (!latest.has(otherId)) latest.set(otherId, m);
      });

      const ids = [...latest.keys()];
      let people = [];
      if (ids.length) {
        const found = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [Query.equal('userId', ids), Query.limit(100)]);
        people = found.documents;
      }

      setConversations(ids.map((id) => {
        const m = latest.get(id);
        const p = people.find((u) => u.userId === id);
        return { userId: id, name: p?.name || 'Mzansi User', avatarUrl: p?.avatarUrl, text: m.text, at: m.$createdAt, mine: m.senderId === user.$id };
      }));
    } catch (error) { console.log('Error loading inbox:', error); } 
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filteredConversations = conversations.filter(c => 
    c.name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <View style={styles.container}>
      
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>Messages</Text>
        {/* 👈 ADDED ONPRESS HERE */}
        <TouchableOpacity style={styles.newMessageBtn} onPress={() => navigation.navigate('NewMessage')}>
          <Ionicons name="create-outline" size={24} color={COLORS.cyan} />
        </TouchableOpacity>
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#888" style={{ marginRight: 8 }} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search messages..." 
            placeholderTextColor="#888"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      </View>

      {/* ACTIVE NOW STRIP */}
      <View style={styles.activeSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeScroll}>
          {/* "Your Story" button */}
          <TouchableOpacity style={styles.activeUser}>
            <View style={styles.storyBorder}>
              <Image source={{ uri: user?.avatarUrl || 'https://i.pravatar.cc/150?img=12' }} style={styles.activeAvatar} />
              <View style={styles.addIcon}><Ionicons name="add" size={12} color="#fff" /></View>
            </View>
            <Text style={styles.activeName}>You</Text>
          </TouchableOpacity>

          {ACTIVE_USERS.map((u) => (
            <TouchableOpacity key={u.id} style={styles.activeUser} onPress={() => navigation.navigate('Chat', { userId: u.id, userName: u.name })}>
              <View style={styles.storyBorder}>
                <Image source={{ uri: u.img }} style={styles.activeAvatar} />
                <View style={styles.onlineIndicator} />
              </View>
              <Text style={styles.activeName} numberOfLines={1}>{u.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* MESSAGE REQUESTS (Premium Feature) */}
      {searchText === '' && (
        <TouchableOpacity style={styles.requestRow}>
          <View style={styles.requestIcon}>
            <Ionicons name="mail-unread-outline" size={20} color={COLORS.cyan} />
          </View>
          <Text style={styles.requestText}>Message Requests</Text>
          <View style={styles.badge}><Text style={styles.badgeText}>3</Text></View>
          <Ionicons name="chevron-forward" size={18} color="#555" />
        </TouchableOpacity>
      )}

      {/* CHAT LIST */}
      {loading ? <ActivityIndicator size="large" color={COLORS.cyan} style={{ marginTop: 50 }} /> : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(c) => c.userId}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.cyan} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Chat', { userId: item.userId, userName: item.name })}>
              
              {/* Avatar with Online Dot */}
              <View style={styles.avatarContainer}>
                <Avatar uri={item.avatarUrl} name={item.name} size={56} />
                <View style={styles.onlineDot} />
              </View>

              {/* Name and Preview */}
              <View style={{ flex: 1, marginLeft: 15 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={[styles.name, !item.mine && { fontWeight: '900', color: '#fff' }]}>{item.name}</Text>
                  <Text style={styles.time}>{timeAgo(item.at)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.preview, !item.mine && { fontWeight: 'bold', color: '#fff' }]} numberOfLines={1}>
                    {item.mine ? 'You: ' : ''}{item.text.startsWith('http') ? '📷 Image' : item.text}
                  </Text>
                  {/* Unread Badge (Fake logic for demo) */}
                  {!item.mine && <View style={styles.unreadBadge}><Text style={styles.unreadText}>1</Text></View>}
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No messages found.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15 },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  newMessageBtn: { padding: 5 },
  
  searchContainer: { paddingHorizontal: 15, marginBottom: 15 },
  searchBar: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 10, alignItems: 'center', paddingHorizontal: 12, height: 40 },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },

  activeSection: { marginBottom: 15 },
  activeScroll: { paddingHorizontal: 15, gap: 15 },
  activeUser: { alignItems: 'center', width: 65 },
  storyBorder: { width: 62, height: 62, borderRadius: 31, borderWidth: 2, borderColor: '#2A2A35', justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
  activeAvatar: { width: 54, height: 54, borderRadius: 27 },
  addIcon: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.cyan, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.bg },
  onlineIndicator: { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, backgroundColor: '#00FF7F', borderWidth: 2, borderColor: COLORS.bg },
  activeName: { color: '#fff', fontSize: 12, textAlign: 'center' },

  requestRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  requestIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0, 229, 255, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  requestText: { flex: 1, color: '#fff', fontSize: 16, fontWeight: 'bold' },
  badge: { backgroundColor: COLORS.pink, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginRight: 10 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  avatarContainer: { position: 'relative' },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#00FF7F', borderWidth: 2, borderColor: COLORS.bg },
  name: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  time: { color: COLORS.muted, fontSize: 12 },
  preview: { color: COLORS.muted, fontSize: 14, flex: 1, marginRight: 10 },
  unreadBadge: { backgroundColor: COLORS.cyan, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  unreadText: { color: '#000', fontSize: 12, fontWeight: 'bold' },
  empty: { color: COLORS.muted, textAlign: 'center', marginTop: 50 }
});