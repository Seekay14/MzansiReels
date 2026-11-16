import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
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
import { getUserDocs } from '../config/helpers';
import Avatar from '../components/Avatar';
import BrandTitle from '../components/BrandTitle';
import StatusList from '../components/StatusList';
import { groupStories } from '../components/StoriesRow';
import StoryViewer from '../components/StoryViewer';
import StoryUploadModal from '../components/StoryUploadModal';
import { useAuth } from '../context/AuthContext';
import { fetchActiveStories } from '../config/storyService';
import { useResponsiveLayout } from '../config/responsive';

const mutedChatsKey = (userId) => `muted_chats_${userId}`;
const pinnedChatsKey = (userId) => `pinned_chats_${userId}`;
const archivedChatsKey = (userId) => `archived_chats_${userId}`;
const viewedStatusesKey = (userId) => `viewed_statuses_${userId}`;
const localClearKey = (userId, chatId) => `chat_local_clear_${userId}_${chatId}`;

function formatChatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const elapsed = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Helper to split the string "user1,user2" and find the other person
function getOtherUserId(participantsString, currentUserId) {
  if (!participantsString || typeof participantsString !== 'string') return null;
  const ids = participantsString.split(',');
  return ids.find(id => id !== currentUserId) || null;
}

function ConversationRow({ item, muted, pinned, onPin, onMute, onArchive, onDelete, onOpen, onOpenProfile }) {
  const renderRightActions = () => (
    <View style={styles.swipeActions}>
      <TouchableOpacity
        style={[styles.swipeAction, styles.pinAction]}
        onPress={() => onPin(item.chatId)}
        accessibilityRole="button"
        accessibilityLabel={pinned ? 'Unpin conversation' : 'Pin conversation'}
      >
        <Ionicons name={pinned ? 'pin' : 'pin-outline'} size={19} color={COLORS.text} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, styles.archiveAction]}
        onPress={() => onArchive(item.chatId)}
        accessibilityRole="button"
        accessibilityLabel="Archive conversation"
      >
        <Ionicons name="archive-outline" size={19} color={COLORS.text} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, styles.deleteAction]}
        onPress={() => onDelete(item)}
        accessibilityRole="button"
        accessibilityLabel="Delete conversation"
      >
        <Ionicons name="trash-outline" size={19} color={COLORS.text} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, styles.muteAction]}
        onPress={() => onMute(item.chatId)}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Unmute conversation' : 'Mute conversation'}
      >
        <Ionicons name={muted ? 'notifications-outline' : 'notifications-off-outline'} size={19} color={COLORS.text} />
      </TouchableOpacity>
    </View>
  );

  const messageText = item.text || 'Chat started';
  const preview = messageText.startsWith('http') ? 'Photo' : messageText;
  const hasUnread = item.unreadCount > 0 || item.showUnreadDot;
  const isOutgoing = item.lastSenderId === item.currentUserId && item.lastReceiverId === item.userId;

  const handleRowLongPress = () => {
    Alert.alert(
      'Quick actions',
      undefined,
      [
        { text: pinned ? 'Unpin Chat' : 'Pin Chat', onPress: () => onPin(item.chatId) },
        { text: muted ? 'Unmute Chat' : 'Mute Chat', onPress: () => onMute(item.chatId) },
        { text: 'Mark as Read', onPress: () => onOpen(item) },
        { text: 'Delete Chat', style: 'destructive', onPress: () => onDelete(item) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  return (
    <ReanimatedSwipeable
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={1.8}
      rightThreshold={42}
    >
      <View style={[styles.row, { backgroundColor: COLORS.card }]}>
        <TouchableOpacity
          onPress={() => onOpenProfile(item)}
          disabled={!item.userId}
          accessibilityRole="button"
          accessibilityLabel={`View ${item.name}'s profile`}
          onLongPress={handleRowLongPress}
        >
          <View style={styles.avatarWrapper}>
            <Avatar uri={item.avatarUrl} userId={item.userId} name={item.name} size={50} />
            {item.isOnline ? <View style={styles.onlineDot} /> : null}
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.conversationContent} onPress={() => onOpen(item)} activeOpacity={0.75} onLongPress={handleRowLongPress}>
          <View style={styles.topRow}>
            <View style={styles.nameAndBadge}>
              <Text style={[styles.name, { fontWeight: 'bold', color: COLORS.text }]} numberOfLines={1}>
                {item.name || 'Unknown User'}
              </Text>
              {item.isVerified ? <Ionicons name="checkmark-circle" size={14} color={COLORS.cyan} style={styles.badge} /> : null}
            </View>
            <View style={styles.rightRow}>
              {item.isOnline ? (
                <Text style={[styles.time, { color: COLORS.cyan, fontWeight: '700' }]}>Online</Text>
              ) : (
                <Text style={styles.time}>{formatChatTime(item.at)}</Text>
              )}
              {item.showUnreadDot ? <View style={styles.unreadDot} /> : null}
              {item.unreadCount > 1 || (hasUnread && !item.showUnreadDot) ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.previewContainer}>
            <View style={styles.previewRow}>
              {isOutgoing ? (
                <Ionicons
                  name={item.lastIsRead ? 'checkmark-done' : 'checkmark'}
                  size={14}
                  color={item.lastIsRead ? COLORS.cyan : COLORS.muted}
                  style={styles.readReceipt}
                />
              ) : null}
              <Text style={[
                styles.preview,
                { color: COLORS.muted },
              ]} numberOfLines={1}>
                {preview}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </ReanimatedSwipeable>
  );
}

export default function MessagesScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { horizontalGutter } = useResponsiveLayout();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [inboxMenuVisible, setInboxMenuVisible] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [newMessageVisible, setNewMessageVisible] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userSearchError, setUserSearchError] = useState('');
  const [mutedChatIds, setMutedChatIds] = useState([]);
  const [pinnedChatIds, setPinnedChatIds] = useState([]);
  const [archivedChatIds, setArchivedChatIds] = useState([]);
  const [viewedStatusIds, setViewedStatusIds] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [activeSection, setActiveSection] = useState('chats');
  const [stories, setStories] = useState([]);
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [storyUploadVisible, setStoryUploadVisible] = useState(false);
  const [activeStoryGroup, setActiveStoryGroup] = useState(0);
  const loadInFlightRef = useRef(false);
  const storyGroups = useMemo(() => groupStories(stories, user?.$id), [stories, user?.$id]);

  const updateStoryAfterView = useCallback((updatedStory, viewedStoryId) => {
    if (updatedStory?.$id) {
      setStories((current) => current.map((story) => (
        story.$id === updatedStory.$id ? updatedStory : story
      )));
    }
    if (user?.$id && viewedStoryId) {
      setViewedStatusIds((current) => {
        if (current.includes(viewedStoryId)) return current;
        const next = [...current, viewedStoryId];
        AsyncStorage.setItem(viewedStatusesKey(user.$id), JSON.stringify(next)).catch((error) => {
          console.error('Could not save viewed status:', error);
        });
        return next;
      });
    }
  }, [user?.$id]);

  const load = useCallback(async () => {
    if (!user?.$id) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoadError('');
    try {
      // 1. Fetch chats using the simple string search
      const chatsResult = await databases.listDocuments(DATABASE_ID, COLLECTIONS.chats, [
        Query.search('participants', user.$id), // Searches the "user1,user2" string
        Query.orderDesc('updatedAt'),
        Query.limit(100),
      ]);

      // 2. Fetch unread counts
      const unreadCounts = new Map();
      try {
        const unreadResult = await databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
          Query.equal('receiverId', user.$id),
          Query.equal('isRead', false),
          Query.limit(100),
        ]);
        unreadResult.documents.forEach((message) => {
          unreadCounts.set(message.chatId, (unreadCounts.get(message.chatId) || 0) + 1);
        });
      } catch (error) {
        console.error('Could not load unread counts:', error);
      }

      // 3. Process each chat
      const conversationsWithUnread = await Promise.all(chatsResult.documents.map(async (chat) => {
        // Find the other user ID from the string
        const otherUserId = getOtherUserId(chat.participants, user.$id);
        if (!otherUserId) return null;

        // Fetch the other user's profile
        let person = null;
        try {
          const userRes = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
            Query.equal('userId', otherUserId),
            Query.limit(1),
          ]);
          person = userRes.documents[0];
        } catch (error) {
          console.error('Could not load user profile:', error);
        }

        // Fetch latest message
        let latestMessage = null;
        try {
          const msgRes = await databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
            Query.equal('chatId', chat.$id),
            Query.orderDesc('$createdAt'),
            Query.limit(1),
          ]);
          latestMessage = msgRes.documents[0];
        } catch (error) {
          console.error('Could not load latest message:', error);
        }

        return {
          chatId: chat.$id,
          userId: otherUserId,
          name: person?.name || person?.username || 'Mzansi User',
          username: person?.username || '',
          avatarUrl: person?.avatarUrl || '',
          isOnline: Boolean(person?.isOnline),
          isVerified: person?.isVerified === true,
          text: latestMessage?.text || chat.lastMessage || 'Chat started',
          lastSenderId: latestMessage?.senderId || '',
          lastReceiverId: latestMessage?.receiverId || '',
          lastIsRead: latestMessage?.isRead === true,
          showUnreadDot: latestMessage?.receiverId === user.$id
            && latestMessage?.senderId === otherUserId
            && latestMessage?.isRead === false,
          currentUserId: user.$id,
          at: latestMessage?.$createdAt || chat.updatedAt || chat.$createdAt,
          unreadCount: unreadCounts.get(chat.$id) || 0,
        };
      }));

      setConversations(conversationsWithUnread.filter(Boolean));
    } catch (error) {
      console.error('Error:', error);
      setLoadError(error.message || 'Your inbox could not be loaded. Check your connection and try again.');
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.$id]);

  const loadStories = useCallback(async () => {
    try {
      setStories(await fetchActiveStories());
    } catch (error) {
      console.error('Could not load active stories in inbox:', error);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    let active = true;
    const loadInboxPreferences = async () => {
      try {
        const [muted, pinned, archived, viewed] = await Promise.all([
          AsyncStorage.getItem(mutedChatsKey(user?.$id)),
          AsyncStorage.getItem(pinnedChatsKey(user?.$id)),
          AsyncStorage.getItem(archivedChatsKey(user?.$id)),
          AsyncStorage.getItem(viewedStatusesKey(user?.$id)),
        ]);
        if (active) {
          setMutedChatIds(muted ? JSON.parse(muted) : []);
          setPinnedChatIds(pinned ? JSON.parse(pinned) : []);
          setArchivedChatIds(archived ? JSON.parse(archived) : []);
          setViewedStatusIds(viewed ? JSON.parse(viewed) : []);
        }
      } catch (error) {
        console.error('Could not load inbox preferences:', error);
      }
    };
    load();
    loadStories();
    loadInboxPreferences();
    return () => { active = false; };
  }, [load, loadStories, user?.$id]));

  // Search users for new chat
  useEffect(() => {
    let active = true;
    const queryText = userSearch.trim().replace(/^@/, '');
    setUsers([]);
    setUserSearchError('');

    if (!newMessageVisible || !user?.$id || queryText.length < 2) {
      setUsersLoading(false);
      return () => { active = false; };
    }

    setUsersLoading(true);
    const fetchUsers = async () => {
      try {
        const searchResults = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.users,
          [
            Query.or([
              Query.startsWith('name', queryText),
              Query.startsWith('username', queryText),
            ]),
            Query.limit(25),
          ],
        );
        if (active) {
          const uniqueUsers = new Map();
          searchResults.documents.forEach((profile) => {
            if (profile.userId && profile.userId !== user.$id && profile.isDeactivated !== true) {
              uniqueUsers.set(profile.userId, profile);
            }
          });
          setUsers([...uniqueUsers.values()]);
        }
      } catch (error) {
        if (__DEV__) console.error('Could not search users for new messages:', error);
        if (active) setUserSearchError(error.message || 'Could not search users. Please try again.');
      } finally {
        if (active) setUsersLoading(false);
      }
    };
    const timer = queryText.length >= 2 ? setTimeout(fetchUsers, 300) : null;

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [newMessageVisible, user?.$id, userSearch]);

  const filteredConversations = useMemo(() => conversations
    .filter((conversation) => archivedChatIds.includes(conversation.chatId) === showArchived)
    .filter((conversation) => conversation.name.toLowerCase().includes(searchText.toLowerCase())
      || conversation.username.toLowerCase().includes(searchText.toLowerCase())
      || conversation.text.toLowerCase().includes(searchText.toLowerCase()))
    .sort((a, b) => (
      Number(pinnedChatIds.includes(b.chatId)) - Number(pinnedChatIds.includes(a.chatId))
      || new Date(b.at).getTime() - new Date(a.at).getTime()
    )), [archivedChatIds, conversations, pinnedChatIds, searchText, showArchived]);

  const openNewMessage = () => {
    setNewMessageVisible(true);
    setUserSearch('');
    setUsers([]);
    setUserSearchError('');
  };

  const startChat = async (targetUser) => {
    if (!targetUser?.userId) return;
    setNewMessageVisible(false);
    navigation.navigate('Chat', {
      otherUserId: targetUser.userId,
      otherUserName: targetUser.name || targetUser.username || 'User',
      otherUserAvatar: targetUser.avatarUrl || null,
      otherUserIsVerified: targetUser.isVerified === true,
    });
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
    }
  };

  const updateChatList = async (preferenceKey, values, updateState, chatId) => {
    const next = values.includes(chatId)
      ? values.filter((id) => id !== chatId)
      : [...values, chatId];
    try {
      await AsyncStorage.setItem(preferenceKey(user.$id), JSON.stringify(next));
      updateState(next);
    } catch (error) {
      console.error('Could not update conversation preference:', error);
    }
  };

  const openStatus = (index) => {
    const group = storyGroups[index];
    if (!group) return;
    setActiveStoryGroup(index);
    setStoryViewerVisible(true);
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
          } catch (error) {
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
      pinned={pinnedChatIds.includes(item.chatId)}
      onPin={(chatId) => updateChatList(pinnedChatsKey, pinnedChatIds, setPinnedChatIds, chatId)}
      onMute={toggleMute}
      onArchive={(chatId) => updateChatList(archivedChatsKey, archivedChatIds, setArchivedChatIds, chatId)}
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
        otherUserIsVerified: conversation.isVerified === true,
      })}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: COLORS.bg }]}>
      <View style={[styles.header, { borderBottomColor: COLORS.border, paddingHorizontal: horizontalGutter }]}>
        <BrandTitle />
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.newMessageBtn}
            onPress={() => {
              setSearchVisible((visible) => !visible);
              if (searchVisible) setSearchText('');
            }}
          >
            <Ionicons name={searchVisible ? 'close' : 'search'} size={22} color={COLORS.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.newMessageBtn} onPress={openNewMessage}>
            <Ionicons name="create-outline" size={23} color={COLORS.cyan} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.newMessageBtn} onPress={() => setInboxMenuVisible(true)}>
            <Ionicons name="ellipsis-vertical" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.sectionTabs, { paddingHorizontal: horizontalGutter }]}>
        {[
          { key: 'chats', label: 'CHATS', icon: 'chatbubbles-outline' },
          { key: 'status', label: 'STATUS', icon: 'radio-button-on-outline' },
          { key: 'calls', label: 'CALLS', icon: 'call-outline' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.sectionTab, activeSection === tab.key && styles.sectionTabActive]}
            onPress={() => setActiveSection(tab.key)}
          >
            <Ionicons name={tab.icon} size={17} color={activeSection === tab.key ? COLORS.cyan : COLORS.muted} />
            <Text style={[styles.sectionTabText, activeSection === tab.key && styles.sectionTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeSection === 'chats' && searchVisible ? (
        <View style={[styles.searchContainer, { paddingHorizontal: horizontalGutter }]}>
          <View style={[styles.searchBar, { backgroundColor: COLORS.card, borderColor: COLORS.border }]}>
            <Ionicons name="search" size={18} color="#888" style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: COLORS.text }]}
              placeholder="Search chats..."
              placeholderTextColor="#888"
              value={searchText}
              onChangeText={setSearchText}
              autoFocus
            />
            {searchText ? (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Ionicons name="close-circle" size={18} color={COLORS.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {activeSection === 'calls' ? (
        <View style={styles.callsContent}>
          <Text style={{ color: COLORS.muted }}>Calls coming soon.</Text>
        </View>
      ) : activeSection === 'status' ? (
        <ScrollView contentContainerStyle={styles.statusList}>
          <StatusList
            storyGroups={storyGroups}
            user={user}
            viewedStatusIds={viewedStatusIds}
            onAddStatus={() => setStoryUploadVisible(true)}
            onOpenStatus={openStatus}
          />
        </ScrollView>
      ) : (
        <FlatList
          data={loading || loadError ? [] : filteredConversations}
          keyExtractor={(conversation) => conversation.chatId}
          renderItem={renderConversation}
          ListHeaderComponent={(
            <TouchableOpacity style={styles.archiveToggle} onPress={() => setShowArchived((current) => !current)}>
              <Ionicons name="archive-outline" size={18} color={COLORS.cyan} />
              <Text style={[styles.archiveToggleText, { color: COLORS.text }]}>{showArchived ? 'Back to chats' : 'Archived chats'}</Text>
              <Ionicons name="chevron-forward" size={16} color="#717B86" />
            </TouchableOpacity>
          )}
          refreshControl={(
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={COLORS.cyan} />
          )}
          ListEmptyComponent={loading ? (
            <ActivityIndicator size="large" color={COLORS.cyan} style={styles.loader} />
          ) : loadError ? (
            <View style={styles.errorState}>
              <Text style={styles.errorText}>{loadError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={load}>
                <Text style={[styles.retryText, { color: COLORS.bg }]}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={{ color: COLORS.muted }}>No messages yet.</Text>
            </View>
          )}
        />
      )}

      <StoryViewer
        visible={storyViewerVisible}
        storyGroups={storyGroups}
        initialGroupIndex={activeStoryGroup}
        userId={user?.$id}
        currentUser={user}
        onClose={() => setStoryViewerVisible(false)}
        onViewRecorded={updateStoryAfterView}
      />
      <StoryUploadModal
        visible={storyUploadVisible}
        user={user}
        mode="status"
        onClose={() => setStoryUploadVisible(false)}
        onUploaded={(story) => setStories((current) => [story, ...current])}
      />

      <Modal visible={newMessageVisible} animationType="slide" onRequestClose={() => setNewMessageVisible(false)}>
        <View style={[styles.modalContainer, { paddingTop: insets.top + 8 }]}>
          <View style={[styles.modalHeader, { paddingHorizontal: horizontalGutter }]}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setNewMessageVisible(false)}>
              <Ionicons name="close" size={25} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: COLORS.text }]}>New Chat</Text>
            <View style={styles.modalClose} />
          </View>
          <View style={[styles.searchContainer, { paddingHorizontal: horizontalGutter }]}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color="#888" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for a user by name or @username..."
                placeholderTextColor="#888"
                value={userSearch}
                onChangeText={setUserSearch}
                autoFocus
              />
            </View>
          </View>
          {userSearch.trim().length < 2 ? (
            <View style={styles.directoryEmpty}><Text style={{ color: COLORS.muted }}>Type to search.</Text></View>
          ) : usersLoading ? (
            <ActivityIndicator size="large" color={COLORS.cyan} style={styles.loader} />
          ) : (
            <FlatList
              data={users}
              keyExtractor={(person) => person.$id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.userRow} onPress={() => startChat(item)}>
                  <Avatar uri={item.avatarUrl} userId={item.userId} name={item.name || item.username} size={48} />
                  <View style={styles.userInfo}>
                    <Text style={[styles.userName, { color: COLORS.text }]}>{item.name || item.username}</Text>
                    <Text style={styles.userHandle}>@{item.username}</Text>
                  </View>
                  <Ionicons name="chatbubble-outline" size={18} color={COLORS.cyan} />
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      <Modal visible={inboxMenuVisible} animationType="slide" transparent onRequestClose={() => setInboxMenuVisible(false)}>
        <TouchableOpacity style={[styles.sheetBackdrop, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={() => setInboxMenuVisible(false)} activeOpacity={1} />
        <TouchableOpacity style={[styles.sheetPanel, { backgroundColor: COLORS.card }]} onPress={(e) => e.stopPropagation()} activeOpacity={1}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.sheetTitle, { color: COLORS.text }]}>Inbox</Text>
          <View style={styles.sheetClose} onPress={() => setInboxMenuVisible(false)}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </View>
          <TouchableOpacity style={styles.sheetItem} onPress={() => { setInboxMenuVisible(false); Alert.alert('New Group', 'Coming soon.'); }}>
            <Ionicons name="people-outline" size={22} color={COLORS.text} style={styles.sheetIcon} />
            <Text style={[styles.sheetItemText, { color: COLORS.text }]}>New Group</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetItem} onPress={() => { setInboxMenuVisible(false); Alert.alert('Starred Messages', 'Coming soon.'); }}>
            <Ionicons name="star-outline" size={22} color={COLORS.text} style={styles.sheetIcon} />
            <Text style={[styles.sheetItemText, { color: COLORS.text }]}>Starred Messages</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetItem} onPress={() => { setInboxMenuVisible(false); navigation.navigate('Settings'); }}>
            <Ionicons name="settings-outline" size={22} color={COLORS.text} style={styles.sheetIcon} />
            <Text style={[styles.sheetItemText, { color: COLORS.text }]}>Settings</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { height: 54, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 17, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  newMessageBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: COLORS.card },
  sectionTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#252A35' },
  sectionTab: { flex: 1, minWidth: 0, height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 19 },
  sectionTabActive: { backgroundColor: 'rgba(0,229,255,0.12)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.35)' },
  sectionTabText: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  sectionTabTextActive: { color: COLORS.cyan },
  searchContainer: { paddingHorizontal: 16, marginBottom: 10 },
  searchBar: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 12, alignItems: 'center', paddingHorizontal: 13, height: 44, borderWidth: 1, borderColor: COLORS.border },
  searchIcon: { marginRight: 8, alignSelf: 'center' },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 },
  loader: { marginTop: 50 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 78, paddingHorizontal: 12, paddingVertical: 12, marginHorizontal: 12, marginBottom: 8, borderRadius: 16, backgroundColor: COLORS.card },
  avatarContainer: { width: 50, height: 50, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  avatarWrapper: { width: 50, height: 50, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  onlineDot: { position: 'absolute', right: 0, bottom: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: '#00FF00', borderWidth: 2, borderColor: '#151820' },
  conversationDetails: { flex: 1, flexDirection: 'column', marginLeft: 12, minHeight: 46, justifyContent: 'center' },
  conversationContent: { flex: 1, justifyContent: 'center', marginLeft: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  badge: { marginLeft: 4 },
  nameAndBadge: { flex: 1, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flex: 1, fontSize: 15 },
  readName: { color: COLORS.muted, fontWeight: '500' },
  unreadName: { color: '#FFFFFF', fontWeight: '700' },
  username: { color: COLORS.muted, fontSize: 10, marginTop: -3, marginBottom: 3 },
  time: { color: COLORS.muted, fontSize: 11 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.cyan },
  previewRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  preview: { flex: 1, fontSize: 13 },
  readPreview: { color: COLORS.muted, fontWeight: '400' },
  unreadPreview: { color: '#FFFFFF', fontWeight: '600' },
  readReceipt: { marginRight: 5 },
  rowMeta: { minHeight: 48, alignItems: 'flex-end', justifyContent: 'space-between', marginLeft: 8, paddingVertical: 3 },
  unreadBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.cyan, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { color: '#071014', fontSize: 9, fontWeight: '800' },
  swipeActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginBottom: 8, backgroundColor: COLORS.bg },
  swipeAction: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  pinAction: { backgroundColor: '#167E91' },
  archiveAction: { backgroundColor: '#46505F' },
  muteAction: { backgroundColor: '#59616B' },
  deleteAction: { backgroundColor: '#D93A55' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 45 },
  errorState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  errorText: { color: COLORS.muted, textAlign: 'center', lineHeight: 21 },
  retryButton: { backgroundColor: COLORS.cyan, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 10, marginTop: 16 },
  retryText: { color: '#000', fontWeight: '700' },
  archiveToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#252A35' },
  archiveToggleText: { flex: 1, color: '#E7EBF0', fontSize: 13, fontWeight: '700' },
  statusList: { flexGrow: 1, paddingBottom: 20 },
  callsContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 45 },
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: '#F3F5F7', fontSize: 17, fontWeight: '800' },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  userInfo: { flex: 1, marginLeft: 13 },
  userName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  userHandle: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  directoryEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetPanel: { width: '100%', height: '55%', backgroundColor: COLORS.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden', justifyContent: 'flex-end' },
  sheetHandle: { width: 40, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: COLORS.muted, marginVertical: 10 },
  sheetTitle: { flex: 1, color: COLORS.text, fontSize: 17, fontWeight: '800', textAlign: 'center', paddingTop: 10 },
  sheetClose: { position: 'absolute', right: 18, top: 12 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetIcon: { marginRight: 14 },
  sheetItemText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
});