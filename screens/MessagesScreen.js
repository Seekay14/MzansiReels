import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import { timeAgo } from '../config/helpers';
import { getOrCreateChat } from '../config/chatService';
import Avatar from '../components/Avatar';
import StoriesRow, { groupStories } from '../components/StoriesRow';
import StoryViewer from '../components/StoryViewer';
import StoryUploadModal from '../components/StoryUploadModal';
import { useAuth } from '../context/AuthContext';

const mutedChatsKey = (userId) => `muted_chats_${userId}`;

function ConversationRow({ item, muted, onMute, onDelete, onOpen, onOpenProfile }) {
  const renderRightActions = () => (
    <View style={styles.swipeActions}>
      <TouchableOpacity
        style={[styles.swipeAction, styles.muteAction]}
        onPress={() => onMute(item.chatId)}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Unmute conversation' : 'Mute conversation'}
      >
        <Ionicons name={muted ? 'notifications-outline' : 'notifications-off-outline'} size={18} color="#fff" />
        <Text style={styles.swipeActionText}>{muted ? 'Unmute' : 'Mute'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, styles.deleteAction]}
        onPress={() => onDelete(item)}
        accessibilityRole="button"
        accessibilityLabel="Delete conversation"
      >
        <Ionicons name="trash-outline" size={18} color="#fff" />
        <Text style={styles.swipeActionText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  const preview = item.text.startsWith('http') ? 'Photo' : item.text;

  return (
    <ReanimatedSwipeable renderRightActions={renderRightActions} overshootRight={false}>
      <View style={styles.row}>
        <View style={styles.avatarContainer}>
          <TouchableOpacity
            onPress={() => onOpenProfile(item)}
            disabled={!item.userId}
            accessibilityRole="button"
            accessibilityLabel={`View ${item.name}'s profile`}
          >
            <Avatar uri={item.avatarUrl} userId={item.userId} name={item.name} size={54} />
          </TouchableOpacity>
          {item.isOnline ? <View style={styles.onlineDot} /> : null}
        </View>
        <View style={styles.conversationDetails}>
          <View style={styles.conversationTopLine}>
            <TouchableOpacity
              style={styles.nameAndBadge}
              onPress={() => onOpenProfile(item)}
              disabled={!item.userId}
              accessibilityRole="button"
              accessibilityLabel={`View ${item.name}'s profile`}
            >
              <Text style={[styles.name, item.unreadCount > 0 && styles.unreadText]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.isVerified ? <Ionicons name="checkmark-circle" size={14} color={COLORS.cyan} /> : null}
            </TouchableOpacity>
            <Text style={styles.time}>{timeAgo(item.at)}</Text>
          </View>
          <TouchableOpacity style={styles.previewLine} onPress={() => onOpen(item)} activeOpacity={0.75}>
            {item.text.startsWith('http') ? (
              <Ionicons
                name="image-outline"
                size={14}
                color={item.unreadCount > 0 ? '#F3F6F8' : COLORS.muted}
                style={styles.previewIcon}
              />
            ) : null}
            <Text style={[styles.preview, item.unreadCount > 0 && styles.unreadText]} numberOfLines={1}>
              {preview}
            </Text>
            {muted ? <Ionicons name="notifications-off-outline" size={13} color="#717B86" style={styles.mutedIcon} /> : null}
          </TouchableOpacity>
        </View>
        {item.unreadCount > 0 ? (
          <TouchableOpacity style={styles.unreadBadge} onPress={() => onOpen(item)} accessibilityRole="button">
            <Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </ReanimatedSwipeable>
  );
}

export default function MessagesScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [loadError, setLoadError] = useState('');
  const [newMessageVisible, setNewMessageVisible] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [mutedChatIds, setMutedChatIds] = useState([]);
  const [stories, setStories] = useState([]);
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [storyUploadVisible, setStoryUploadVisible] = useState(false);
  const [activeStoryGroup, setActiveStoryGroup] = useState(0);
  const storyGroups = useMemo(() => groupStories(stories, user?.$id), [stories, user?.$id]);

  const load = useCallback(async () => {
    if (!user?.$id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
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

      const uniqueChatsByPair = new Map();
      const uniqueChatsById = new Set();
      chats.forEach((chat) => {
        if (!chat.$id || uniqueChatsById.has(chat.$id)) return;
        uniqueChatsById.add(chat.$id);
        const participants = Array.isArray(chat.participants) ? chat.participants : [];
        const otherId = participants.find((participantId) => participantId !== user.$id);
        if (!otherId) return;
        const pairKey = [user.$id, otherId].sort().join(':');
        if (!uniqueChatsByPair.has(pairKey)) uniqueChatsByPair.set(pairKey, chat);
      });
      const uniqueChats = [...uniqueChatsByPair.values()];

      const ids = [...new Set(uniqueChats.flatMap((chat) => (
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

      const conversationsWithUnread = uniqueChats.map((chat) => {
        const otherId = chat.participants?.find((participantId) => participantId !== user.$id);
        const person = people.find((profile) => profile.userId === otherId);
        return {
          chatId: chat.$id,
          userId: otherId,
          name: person?.name || person?.username || 'Mzansi User',
          username: person?.username || '',
          avatarUrl: person?.avatarUrl || '',
          isOnline: Boolean(person?.isOnline),
          isVerified: person?.isVerified === true,
          text: chat.lastMessage || 'Chat started',
          at: chat.updatedAt || chat.$createdAt,
          unreadCount: unreadCounts.get(otherId) || 0,
        };
      });

      setConversations(conversationsWithUnread);
    } catch (error) {
      console.error('Error loading inbox:', error);
      setLoadError('Your inbox could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.$id]);

  const loadStories = useCallback(async () => {
    try {
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.stories, [
        Query.greaterThan('createdAt', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        Query.orderDesc('createdAt'),
        Query.limit(100),
      ]);
      setStories(result.documents);
    } catch (error) {
      console.error('Could not load active stories in inbox:', error);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    const loadMutedChats = async () => {
      try {
        const stored = await AsyncStorage.getItem(mutedChatsKey(user?.$id));
        const parsed = stored ? JSON.parse(stored) : [];
        if (active) setMutedChatIds(Array.isArray(parsed) ? parsed : []);
      } catch (error) {
        console.error('Could not load muted conversations:', error);
      }
    };
    load();
    loadStories();
    loadMutedChats();
    return () => {
      active = false;
    };
  }, [load, loadStories, user?.$id]));

  const filteredConversations = useMemo(() => conversations.filter((conversation) =>
    conversation.name.toLowerCase().includes(searchText.toLowerCase())
  ), [conversations, searchText]);

  const openNewMessage = async () => {
    setNewMessageVisible(true);
    setUserSearch('');
    if (users.length || usersLoading || !user?.$id) return;
    setUsersLoading(true);
    try {
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
        Query.notEqual('userId', user.$id),
        Query.limit(100),
      ]);
      setUsers(result.documents);
    } catch (error) {
      console.error('Could not load users for new messages:', error);
      Alert.alert('Users unavailable', 'Could not load people to message. Please try again.');
    } finally {
      setUsersLoading(false);
    }
  };

  const filteredUsers = useMemo(() => users.filter((person) => {
    const query = userSearch.trim().toLowerCase();
    return !query
      || person.name?.toLowerCase().includes(query)
      || person.username?.toLowerCase().includes(query);
  }), [users, userSearch]);

  const startChat = async (targetUser) => {
    try {
      const chat = await getOrCreateChat(user.$id, targetUser.userId);
      setNewMessageVisible(false);
      navigation.navigate('Chat', {
        chatId: chat.$id,
        otherUserId: targetUser.userId,
        otherUserName: targetUser.name || targetUser.username || 'User',
        otherUserAvatar: targetUser.avatarUrl || null,
      });
    } catch (error) {
      console.error('Could not start chat:', error);
      Alert.alert('Chat unavailable', error.message || 'Could not start this chat. Please try again.');
    }
  };

  const toggleMute = async (chatId) => {
    const nextMutedChatIds = mutedChatIds.includes(chatId)
      ? mutedChatIds.filter((id) => id !== chatId)
      : [...mutedChatIds, chatId];
    try {
      await AsyncStorage.setItem(mutedChatsKey(user.$id), JSON.stringify(nextMutedChatIds));
      setMutedChatIds(nextMutedChatIds);
    } catch (error) {
      console.error('Could not update muted conversations:', error);
      Alert.alert('Mute unavailable', 'Could not save this preference on this device.');
    }
  };

  const deleteConversation = (conversation) => {
    Alert.alert('Delete conversation?', 'This removes the chat from your inbox.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await databases.deleteDocument(DATABASE_ID, COLLECTIONS.chats, conversation.chatId);
            setConversations((current) => current.filter((item) => item.chatId !== conversation.chatId));
            const nextMutedChatIds = mutedChatIds.filter((id) => id !== conversation.chatId);
            setMutedChatIds(nextMutedChatIds);
            await AsyncStorage.setItem(mutedChatsKey(user.$id), JSON.stringify(nextMutedChatIds));
          } catch (error) {
            console.error('Could not delete conversation:', error);
            Alert.alert('Delete failed', error.message || 'Could not delete this conversation.');
          }
        },
      },
    ]);
  };

  const renderConversation = ({ item }) => (
    <ConversationRow
      item={item}
      muted={mutedChatIds.includes(item.chatId)}
      onMute={toggleMute}
      onDelete={deleteConversation}
      onOpenProfile={(conversation) => navigation.navigate('UserProfile', {
        userId: conversation.userId,
        userName: conversation.username || conversation.name || 'User',
      })}
      onOpen={(conversation) => navigation.navigate('Chat', {
        chatId: conversation.chatId,
        otherUserId: conversation.userId,
        otherUserName: conversation.name || 'User',
        otherUserAvatar: conversation.avatarUrl || null,
      })}
    />
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.headerTitle}>Inbox</Text>
        <TouchableOpacity
          style={styles.newMessageBtn}
          onPress={openNewMessage}
          accessibilityRole="button"
          accessibilityLabel="New message"
        >
          <Ionicons name="create-outline" size={25} color={COLORS.cyan} />
        </TouchableOpacity>
      </View>

      <StoriesRow
        stories={stories}
        user={user}
        onAddStory={() => setStoryUploadVisible(true)}
        onOpenStory={(index) => {
          setActiveStoryGroup(index);
          setStoryViewerVisible(true);
        }}
      />

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#888" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search messages..."
            placeholderTextColor="#888"
            value={searchText}
            onChangeText={setSearchText}
            accessibilityLabel="Search messages"
          />
          {searchText ? (
            <TouchableOpacity onPress={() => setSearchText('')} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color="#78818C" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.cyan} style={styles.loader} />
      ) : loadError ? (
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles-outline" size={37} color={COLORS.cyan} />
          </View>
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptyText}>Start a conversation!</Text>
          <TouchableOpacity style={styles.startButton} onPress={openNewMessage}>
            <Text style={styles.startButtonText}>New message</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(conversation) => conversation.chatId}
          renderItem={renderConversation}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={COLORS.cyan}
            />
          )}
          ListEmptyComponent={<Text style={styles.noResults}>No conversations match your search.</Text>}
          keyboardShouldPersistTaps="handled"
        />
      )}

      <StoryViewer
        visible={storyViewerVisible}
        storyGroups={storyGroups}
        initialGroupIndex={activeStoryGroup}
        userId={user?.$id}
        onClose={() => setStoryViewerVisible(false)}
      />
      <StoryUploadModal
        visible={storyUploadVisible}
        user={user}
        onClose={() => setStoryUploadVisible(false)}
        onUploaded={(story) => setStories((current) => [story, ...current])}
      />

      <Modal
        visible={newMessageVisible}
        animationType="slide"
        onRequestClose={() => setNewMessageVisible(false)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + 8 }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setNewMessageVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Close new message"
            >
              <Ionicons name="close" size={25} color="#F1F4F7" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Message</Text>
            <View style={styles.modalClose} />
          </View>
          <View style={styles.searchContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color="#888" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search people..."
                placeholderTextColor="#888"
                value={userSearch}
                onChangeText={setUserSearch}
                autoFocus
                accessibilityLabel="Search people"
              />
            </View>
          </View>
          {usersLoading ? (
            <ActivityIndicator size="large" color={COLORS.cyan} style={styles.loader} />
          ) : (
            <FlatList
              data={filteredUsers}
              keyExtractor={(person) => person.$id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.userRow} onPress={() => startChat(item)}>
                  <Avatar uri={item.avatarUrl} userId={item.userId} name={item.name || item.username} size={48} />
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{item.name || item.username || 'Mzansi User'}</Text>
                    <Text style={styles.userHandle}>@{item.username || 'user'}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={19} color="#626C78" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.noResults}>No users found.</Text>}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 13 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '900' },
  newMessageBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: '#171A21' },
  searchContainer: { paddingHorizontal: 16, marginBottom: 10 },
  searchBar: { flexDirection: 'row', backgroundColor: '#1F1F1F', borderRadius: 12, alignItems: 'center', paddingHorizontal: 13, height: 44, borderWidth: 1, borderColor: '#292E37' },
  searchIcon: { marginRight: 8, alignSelf: 'center' },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 },
  loader: { marginTop: 50 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 78, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)', backgroundColor: COLORS.bg },
  avatarContainer: { width: 56, height: 56, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  onlineDot: { position: 'absolute', right: 0, bottom: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: '#00FF00', borderWidth: 2, borderColor: COLORS.bg },
  conversationDetails: { flex: 1, flexDirection: 'column', marginLeft: 12, minHeight: 45, justifyContent: 'center' },
  conversationTopLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  nameAndBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
  time: { color: '#7D8691', fontSize: 10, marginLeft: 8 },
  previewLine: { flexDirection: 'row', alignItems: 'center' },
  preview: { color: '#919AA5', fontSize: 13, flex: 1, marginRight: 8 },
  previewIcon: { marginRight: 5 },
  mutedIcon: { marginLeft: 4, marginRight: 6 },
  unreadText: { color: '#F3F6F8', fontWeight: '800' },
  unreadBadge: { minWidth: 21, height: 21, borderRadius: 11, backgroundColor: COLORS.cyan, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, marginLeft: 8 },
  unreadBadgeText: { color: '#071014', fontSize: 10, fontWeight: '900' },
  swipeActions: { flexDirection: 'row', alignItems: 'stretch' },
  swipeAction: { width: 74, alignItems: 'center', justifyContent: 'center' },
  muteAction: { backgroundColor: '#59616B' },
  deleteAction: { backgroundColor: '#E33B4B' },
  swipeActionText: { color: '#fff', fontSize: 11, fontWeight: '700', marginTop: 4 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 45 },
  emptyIcon: { width: 82, height: 82, alignItems: 'center', justifyContent: 'center', borderRadius: 41, backgroundColor: 'rgba(0,229,255,0.1)' },
  emptyTitle: { color: '#F3F5F7', fontSize: 18, fontWeight: '800', marginTop: 17 },
  emptyText: { color: '#9099A4', fontSize: 14, marginTop: 7 },
  startButton: { marginTop: 20, paddingHorizontal: 19, paddingVertical: 11, borderRadius: 22, backgroundColor: COLORS.cyan },
  startButtonText: { color: '#061116', fontSize: 13, fontWeight: '800' },
  noResults: { color: COLORS.muted, textAlign: 'center', marginTop: 38, paddingHorizontal: 20, fontSize: 13 },
  errorState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  errorText: { color: COLORS.muted, textAlign: 'center', lineHeight: 21 },
  retryButton: { backgroundColor: COLORS.cyan, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 10, marginTop: 16 },
  retryText: { color: '#000', fontWeight: '700' },
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: '#F3F5F7', fontSize: 17, fontWeight: '800' },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  userInfo: { flex: 1, marginLeft: 13 },
  userName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  userHandle: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
});
