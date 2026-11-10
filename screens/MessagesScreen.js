import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import { timeAgo } from '../config/helpers';
import Avatar from '../components/Avatar';
import { useAuth } from '../context/AuthContext';

export default function MessagesScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setLoadError('');
    try {
      const chats = [];
      let chatOffset = 0;
      while (true) {
        const page = await databases.listDocuments(DATABASE_ID, COLLECTIONS.chats, [
          Query.contains('participants', user.$id),
          Query.orderDesc('updatedAt'),
          Query.limit(100),
          Query.offset(chatOffset),
        ]);
        chats.push(...page.documents);
        chatOffset += page.documents.length;
        if (page.documents.length === 0 || chatOffset >= page.total) break;
      }

      const unreadCounts = new Map();
      let messageOffset = 0;
      let unreadTotal = 0;
      while (true) {
        const page = await databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
          Query.equal('receiverId', user.$id),
          Query.equal('isRead', false),
          Query.limit(100),
          Query.offset(messageOffset),
        ]);
        page.documents.forEach((message) => {
          unreadCounts.set(message.senderId, (unreadCounts.get(message.senderId) || 0) + 1);
        });
        unreadTotal = page.total;
        messageOffset += page.documents.length;
        if (page.documents.length === 0 || messageOffset >= unreadTotal) break;
      }

      const ids = [...new Set(chats.flatMap((chat) => (
        Array.isArray(chat.participants)
          ? chat.participants.filter((participantId) => participantId !== user.$id)
          : []
      )))];
      let people = [];
      if (ids.length) {
        const found = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
          Query.equal('userId', ids),
          Query.limit(100),
        ]);
        people = found.documents;
      }

      const conversationsWithUnread = chats.map((chat) => {
        const otherId = chat.participants?.find((participantId) => participantId !== user.$id);
        const person = people.find((profile) => profile.userId === otherId);
        return {
          chatId: chat.$id,
          userId: otherId,
          name: person?.name || 'Mzansi User',
          avatarUrl: person?.avatarUrl,
          text: chat.lastMessage || 'Chat started',
          at: chat.updatedAt || chat.$createdAt,
          unreadCount: unreadCounts.get(otherId) || 0,
        };
      });

      setConversations(conversationsWithUnread);
    } catch (error) {
      console.error('Error loading inbox:', error);
      setLoadError('Your inbox could not be loaded. Check your connection and try again.');
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filteredConversations = conversations.filter((conversation) =>
    conversation.name.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <View style={styles.container}>
      
      {/* HEADER */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>Inbox</Text>
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

      {/* CHAT LIST */}
      {loading ? <ActivityIndicator size="large" color={COLORS.cyan} style={{ marginTop: 50 }} /> : loadError ? (
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(c) => c.chatId}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.cyan} />}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('Chat', {
              chatId: item.chatId,
              userId: item.userId,
              userName: item.name,
            })}>
              
              <Avatar uri={item.avatarUrl} name={item.name} size={56} />
              <View style={{ flex: 1, marginLeft: 15 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={[styles.name, item.unreadCount > 0 && styles.unreadText]}>{item.name}</Text>
                  <Text style={styles.time}>{timeAgo(item.at)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.preview, item.unreadCount > 0 && styles.unreadText]} numberOfLines={1}>
                    {item.text.startsWith('http') ? '📷 Image' : item.text}
                  </Text>
                  {item.unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
                    </View>
                  )}
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

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  name: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  time: { color: COLORS.muted, fontSize: 12 },
  preview: { color: COLORS.muted, fontSize: 14, flex: 1, marginRight: 10 },
  unreadText: { color: '#fff', fontWeight: '800' },
  unreadBadge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: '#FF4057', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  empty: { color: COLORS.muted, textAlign: 'center', marginTop: 50 },
  errorState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  errorText: { color: COLORS.muted, textAlign: 'center', lineHeight: 21 },
  retryButton: { backgroundColor: COLORS.cyan, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 10, marginTop: 16 },
  retryText: { color: '#000', fontWeight: '700' },
});