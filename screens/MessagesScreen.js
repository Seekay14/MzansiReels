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
import { client, databases, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import { getUserDocs } from '../config/helpers';
import Avatar from '../components/Avatar';
import BrandTitle from '../components/BrandTitle';
import StatusList from '../components/StatusList';
import { groupStories } from '../components/StoriesRow';
import StoryViewer from '../components/StoryViewer';
import StoryUploadModal from '../components/StoryUploadModal';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { fetchActiveStories } from '../config/storyService';
import {
  getChatParticipantIds,
  getMessagingErrorMessage,
  logMessagingError,
  verifyMessagingUser,
} from '../config/chatService';

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

function ConversationRow({ item, muted, pinned, onPin, onMute, onArchive, onDelete, onOpen, onOpenProfile }) {
  const { colors } = useTheme();
  const renderRightActions = () => (
    <View style={styles.swipeActions}>
      <TouchableOpacity
        style={[styles.swipeAction, styles.pinAction]}
        onPress={() => onPin(item.chatId)}
        accessibilityRole="button"
        accessibilityLabel={pinned ? 'Unpin conversation' : 'Pin conversation'}
      >
        <Ionicons name={pinned ? 'pin' : 'pin-outline'} size={19} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, styles.archiveAction]}
        onPress={() => onArchive(item.chatId)}
        accessibilityRole="button"
        accessibilityLabel="Archive conversation"
      >
        <Ionicons name="archive-outline" size={19} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, styles.deleteAction]}
        onPress={() => onDelete(item)}
        accessibilityRole="button"
        accessibilityLabel="Delete conversation"
      >
        <Ionicons name="trash-outline" size={19} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.swipeAction, styles.muteAction]}
        onPress={() => onMute(item.chatId)}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Unmute conversation' : 'Mute conversation'}
      >
        <Ionicons name={muted ? 'notifications-outline' : 'notifications-off-outline'} size={19} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const messageText = item.text || 'Chat started';
  const preview = messageText.startsWith('http') ? 'Photo' : messageText;
  const hasUnread = item.unreadCount > 0 || item.showUnreadDot;
  const isOutgoing = item.lastSenderId === item.currentUserId
    && item.lastReceiverId === item.userId;

  return (
    <ReanimatedSwipeable
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={1.8}
      rightThreshold={42}
    >
      <View style={[styles.row, { backgroundColor: colors.card }]}>
        <View style={styles.avatarContainer}>
          <TouchableOpacity
            onPress={() => onOpenProfile(item)}
            disabled={!item.userId}
            accessibilityRole="button"
            accessibilityLabel={`View ${item.name}'s profile`}
          >
            <Avatar uri={item.avatarUrl} userId={item.userId} name={item.name} size={50} />
          </TouchableOpacity>
          {item.isOnline ? <View style={styles.onlineDot} /> : null}
        </View>
        <View style={styles.conversationDetails}>
          <TouchableOpacity style={styles.conversationContent} onPress={() => onOpen(item)} activeOpacity={0.75}>
            <View style={styles.conversationTopLine}>
              <View style={styles.nameAndBadge}>
                <Text style={[
                  styles.name,
                  hasUnread ? styles.unreadName : styles.readName,
                  { color: hasUnread ? colors.text : colors.muted },
                ]} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.isVerified ? <Ionicons name="checkmark-circle" size={14} color={COLORS.cyan} /> : null}
              </View>
              {pinned ? <Ionicons name="pin" size={13} color={COLORS.cyan} /> : null}
            </View>
            {item.username ? <Text style={styles.username} numberOfLines={1}>@{item.username}</Text> : null}
            {item.isTyping ? (
              <Text style={[styles.preview, styles.typingText]} numberOfLines={1}>Typing…</Text>
            ) : (
              <View style={styles.previewRow}>
                {isOutgoing ? (
                  <Ionicons
                    name="checkmark-done"
                    size={16}
                    color={item.lastIsRead ? COLORS.cyan : '#8B95A7'}
                    style={styles.readReceipt}
                    accessibilityLabel={item.lastIsRead ? 'Read' : 'Sent'}
                  />
                ) : null}
                <Text style={[
                  styles.preview,
                  hasUnread ? styles.unreadPreview : styles.readPreview,
                  { color: hasUnread ? colors.text : colors.muted },
                ]} numberOfLines={1}>
                  {preview}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.rowMeta}>
          <View style={styles.timeRow}>
            <Text style={styles.time}>{formatChatTime(item.at)}</Text>
            {item.showUnreadDot ? <View style={styles.unreadDot} /> : null}
            {item.unreadCount > 1 || (hasUnread && !item.showUnreadDot) ? (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
              </View>
            ) : null}
          </View>
          {muted ? <Ionicons name="notifications-off-outline" size={13} color="#717B86" /> : null}
        </View>
      </View>
    </ReanimatedSwipeable>
  );
}

export default function MessagesScreen({ navigation }) {
  const { colors } = useTheme();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
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
      await verifyMessagingUser(user.$id);
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

      const chatsById = new Map(chats.map((chat) => [chat.$id, chat]));
      const unreadCounts = new Map();
      let messageOffset = 0;
      let unreadTotal = 0;
      try {
        while (true) {
          const page = await databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
            Query.equal('receiverId', user.$id),
            Query.equal('isRead', false),
            Query.limit(100),
            Query.offset(messageOffset),
          ]);
          page.documents.forEach((message) => {
            const chat = chatsById.get(message.chatId);
            const participants = getChatParticipantIds(chat?.participants);
            if (
              chat
              && message.receiverId === user.$id
              && message.senderId !== user.$id
              && participants.includes(message.senderId)
            ) {
              unreadCounts.set(message.chatId, (unreadCounts.get(message.chatId) || 0) + 1);
            }
          });
          unreadTotal = page.total;
          messageOffset += page.documents.length;
          if (page.documents.length === 0 || messageOffset >= unreadTotal) break;
        }
      } catch (error) {
        if (__DEV__) {
          console.error('Could not load inbox unread counts:', {
            collectionId: COLLECTIONS.messages,
            code: error.code,
            type: error.type,
            message: error.message || String(error),
          });
        }
        unreadCounts.clear();
      }

      let typingChatIds = new Set();
      try {
        const typing = await databases.listDocuments(DATABASE_ID, COLLECTIONS.typingStatus, [
          Query.equal('isTyping', true),
          Query.notEqual('userId', user.$id),
          Query.limit(100),
        ]);
        typingChatIds = new Set(typing.documents.map((status) => status.chatId));
      } catch (error) {
        if (__DEV__) console.error('Could not load active chat typing indicators:', error);
      }

      const uniqueChatsByPair = new Map();
      const uniqueChatsById = new Set();
      chats.forEach((chat) => {
        if (!chat.$id || uniqueChatsById.has(chat.$id)) return;
        uniqueChatsById.add(chat.$id);
        const participants = getChatParticipantIds(chat.participants);
        const otherId = participants.find((participantId) => participantId !== user.$id);
        if (!otherId) return;
        const pairKey = [user.$id, otherId].sort().join(':');
        if (!uniqueChatsByPair.has(pairKey)) uniqueChatsByPair.set(pairKey, chat);
      });
      const uniqueChats = [...uniqueChatsByPair.values()];
      const recentMessages = await Promise.all(uniqueChats.map(async (chat) => {
        try {
          const otherId = getChatParticipantIds(chat.participants)
            .find((participantId) => participantId !== user.$id);
          const [result, clearAtValue] = await Promise.all([
            databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
              Query.equal('chatId', chat.$id),
              Query.orderDesc('$createdAt'),
              Query.limit(1),
            ]),
            AsyncStorage.getItem(localClearKey(user.$id, chat.$id)),
          ]);
          const latest = result.documents.find((message) => (
            (message.senderId === user.$id && message.receiverId === otherId)
            || (message.senderId === otherId && message.receiverId === user.$id)
          )) || null;
          const clearAt = clearAtValue ? Number(clearAtValue) : null;
          const latestVisible = latest && (!clearAt || new Date(latest.$createdAt).getTime() > clearAt)
            ? latest
            : null;
          return [chat.$id, {
            message: latestVisible,
            cleared: Boolean(clearAt && latest && !latestVisible),
          }];
        } catch (error) {
          if (__DEV__) console.error(`Could not load the latest message for chat ${chat.$id}:`, error);
          return [chat.$id, { message: null, cleared: false }];
        }
      }));
      const recentMessagesByChat = new Map(recentMessages);

      const ids = [...new Set(uniqueChats.flatMap((chat) => (
        getChatParticipantIds(chat.participants)
          .filter((participantId) => participantId !== user.$id)
      )))];
      let people = [];
      if (ids.length) {
        people = await getUserDocs(ids);
      }

      const conversationsWithUnread = uniqueChats.map((chat) => {
        const otherId = getChatParticipantIds(chat.participants)
          .find((participantId) => participantId !== user.$id);
        const person = people.find((profile) => profile.userId === otherId);
        const latestMessageState = recentMessagesByChat.get(chat.$id);
        const latestMessage = latestMessageState?.message;
        const latestType = latestMessage?.attachmentType || latestMessage?.messageType;
        const latestText = latestMessageState?.cleared
          ? 'History cleared on this device'
          : latestType === 'image'
          ? 'Photo'
          : latestType === 'video'
            ? 'Video'
            : latestType === 'audio'
              ? 'Voice message'
            : latestType === 'sticker'
              ? 'Sticker'
              : latestMessage?.text || chat.lastMessage || 'Chat started';
        return {
          chatId: chat.$id,
          userId: otherId,
          name: person?.name || person?.username || 'Mzansi User',
          username: person?.username || '',
          avatarUrl: person?.avatarUrl || '',
          isOnline: Boolean(person?.isOnline),
          isVerified: person?.isVerified === true,
          text: latestText,
          lastSenderId: latestMessage?.senderId || '',
          lastReceiverId: latestMessage?.receiverId || '',
          lastIsRead: latestMessage?.isRead === true,
          showUnreadDot: latestMessage?.receiverId === user.$id
            && latestMessage?.senderId === otherId
            && latestMessage?.isRead === false,
          currentUserId: user.$id,
          at: latestMessage?.$createdAt || chat.updatedAt || chat.$createdAt,
          unreadCount: unreadCounts.get(chat.$id) || 0,
          isTyping: typingChatIds.has(chat.$id),
        };
      });

      setConversations(conversationsWithUnread);
    } catch (error) {
      logMessagingError('Could not load the inbox:', error);
      if (error?.kind === 'authentication') await logout();
      setLoadError(getMessagingErrorMessage(
        error,
        'Your inbox could not be loaded. Check your connection and try again.',
      ));
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [logout, user?.$id]);

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
        const [muted, muteExpiries, pinned, archived, viewed] = await Promise.all([
          AsyncStorage.getItem(mutedChatsKey(user?.$id)),
          AsyncStorage.getItem(`muted_chat_expiry_${user?.$id}`),
          AsyncStorage.getItem(pinnedChatsKey(user?.$id)),
          AsyncStorage.getItem(archivedChatsKey(user?.$id)),
          AsyncStorage.getItem(viewedStatusesKey(user?.$id)),
        ]);
        if (active) {
          const storedMuted = muted ? JSON.parse(muted) : [];
          const muteSettings = muteExpiries ? JSON.parse(muteExpiries) : {};
          const activeMuted = storedMuted.filter((chatId) => (
            !muteSettings[chatId]
            || Number(muteSettings[chatId]) === -1
            || Number(muteSettings[chatId]) > Date.now()
          ));
          Object.keys(muteSettings).forEach((chatId) => {
            if (Number(muteSettings[chatId]) !== -1 && Number(muteSettings[chatId]) <= Date.now()) {
              delete muteSettings[chatId];
            }
          });
          setMutedChatIds(activeMuted);
          await AsyncStorage.setItem(mutedChatsKey(user?.$id), JSON.stringify(activeMuted));
          await AsyncStorage.setItem(`muted_chat_expiry_${user?.$id}`, JSON.stringify(muteSettings));
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
    return () => {
      active = false;
    };
  }, [load, loadStories, user?.$id]));

  useFocusEffect(useCallback(() => {
    if (!user?.$id) return undefined;
    let active = true;
    const refreshInbox = () => {
      if (active) load();
    };
    const unsubscribeMessages = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.messages}.documents`,
      refreshInbox,
    );
    const unsubscribeTyping = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.typingStatus}.documents`,
      refreshInbox,
    );
    const unsubscribeStories = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.stories}.documents`,
      (event) => {
        if (
          active
          && event.events?.some((name) => name.endsWith('.create') || name.endsWith('.delete'))
        ) {
          loadStories();
        }
      },
    );
    const refreshTimer = setInterval(refreshInbox, 30000);
    return () => {
      active = false;
      clearInterval(refreshTimer);
      unsubscribeMessages();
      unsubscribeTyping();
      unsubscribeStories();
    };
  }, [load, loadStories, user?.$id]));

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
        if (active) setUserSearchError(getMessagingErrorMessage(error, 'Could not search users. Please try again.'));
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
    });
  };

  const toggleMute = async (chatId) => {
    const nextMutedChatIds = mutedChatIds.includes(chatId)
      ? mutedChatIds.filter((id) => id !== chatId)
      : [...mutedChatIds, chatId];
    try {
      const settingsKey = `muted_chat_expiry_${user.$id}`;
      const settings = JSON.parse((await AsyncStorage.getItem(settingsKey)) || '{}');
      if (mutedChatIds.includes(chatId)) delete settings[chatId];
      else settings[chatId] = -1;
      await AsyncStorage.setItem(mutedChatsKey(user.$id), JSON.stringify(nextMutedChatIds));
      await AsyncStorage.setItem(settingsKey, JSON.stringify(settings));
      setMutedChatIds(nextMutedChatIds);
    } catch (error) {
      console.error('Could not update muted conversations:', error);
      Alert.alert('Mute unavailable', 'Could not save this preference on this device.');
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
      Alert.alert('Update unavailable', 'Could not save this conversation preference.');
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
            const nextMutedChatIds = mutedChatIds.filter((id) => id !== conversation.chatId);
            setMutedChatIds(nextMutedChatIds);
            await AsyncStorage.setItem(mutedChatsKey(user.$id), JSON.stringify(nextMutedChatIds));
          } catch (error) {
            if (__DEV__) console.error('Could not delete conversation:', error);
            Alert.alert('Delete failed', getMessagingErrorMessage(error, 'Could not delete this conversation.'));
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
      })}
    />
  );

  const statusList = (
    <StatusList
      storyGroups={storyGroups}
      user={user}
      viewedStatusIds={viewedStatusIds}
      onAddStatus={() => setStoryUploadVisible(true)}
      onOpenStatus={openStatus}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <BrandTitle />
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.newMessageBtn}
            onPress={() => {
              setSearchVisible((visible) => !visible);
              if (searchVisible) setSearchText('');
            }}
            accessibilityRole="button"
            accessibilityLabel={searchVisible ? 'Close chat search' : 'Search chats'}
          >
            <Ionicons name={searchVisible ? 'close' : 'search'} size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.newMessageBtn}
            onPress={openNewMessage}
            accessibilityRole="button"
            accessibilityLabel="New chat"
          >
            <Ionicons name="create-outline" size={23} color={COLORS.cyan} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.sectionTabs}>
        {[
          { key: 'chats', label: 'CHATS', icon: 'chatbubbles-outline' },
          { key: 'status', label: 'STATUS', icon: 'radio-button-on-outline' },
          { key: 'calls', label: 'CALLS', icon: 'call-outline' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.sectionTab, activeSection === tab.key && styles.sectionTabActive]}
            onPress={() => setActiveSection(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeSection === tab.key }}
          >
            <Ionicons name={tab.icon} size={17} color={activeSection === tab.key ? COLORS.cyan : '#8B95A7'} />
            <Text style={[styles.sectionTabText, activeSection === tab.key && styles.sectionTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeSection === 'chats' && searchVisible ? (
        <View style={styles.searchContainer}>
            <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="search" size={18} color="#888" style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search chats..."
              placeholderTextColor="#888"
              value={searchText}
              onChangeText={setSearchText}
              accessibilityLabel="Search chats"
              autoFocus
            />
            {searchText ? (
              <TouchableOpacity onPress={() => setSearchText('')} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color="#78818C" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {activeSection === 'calls' ? (
        <View style={styles.callsContent}>
          <View style={styles.callsIcon}>
            <Ionicons name="call-outline" size={30} color={COLORS.cyan} />
          </View>
          <Text style={[styles.callsTitle, { color: colors.text }]}>Your calls</Text>
          <Text style={[styles.callsDescription, { color: colors.muted }]}>
            Call history will appear here when calling is connected to MzansiReels.
          </Text>
          <View style={styles.callsUnavailable}>
            <Ionicons name="information-circle-outline" size={18} color="#8B95A7" />
            <Text style={[styles.callsUnavailableText, { color: colors.muted }]}>Audio and video calls are not connected yet.</Text>
          </View>
          <TouchableOpacity
            style={styles.startCallButton}
            onPress={() => Alert.alert(
              'Calls unavailable',
              'Calling cannot start until a real-time calling provider is configured.',
            )}
            accessibilityRole="button"
            accessibilityLabel="Start an audio or video call"
          >
            <Ionicons name="add" size={18} color="#061116" />
            <Text style={styles.startCallText}>Start a call</Text>
          </TouchableOpacity>
        </View>
      ) : activeSection === 'status' ? (
        <ScrollView contentContainerStyle={styles.statusList}>
          {statusList}
        </ScrollView>
      ) : (
        <FlatList
          data={loading || loadError ? [] : filteredConversations}
          keyExtractor={(conversation) => conversation.chatId}
          renderItem={renderConversation}
          ListHeaderComponent={(
            <TouchableOpacity
              style={styles.archiveToggle}
              onPress={() => setShowArchived((current) => !current)}
            >
              <Ionicons name="archive-outline" size={18} color={COLORS.cyan} />
              <Text style={[styles.archiveToggleText, { color: colors.text }]}>{showArchived ? 'Back to chats' : 'Archived chats'}</Text>
              <Ionicons name="chevron-forward" size={16} color="#717B86" />
            </TouchableOpacity>
          )}
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
          ListEmptyComponent={loading ? (
            <ActivityIndicator size="large" color={COLORS.cyan} style={styles.loader} />
          ) : loadError ? (
            <View style={styles.errorState}>
              <Text style={styles.errorText}>{loadError}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={load}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : filteredConversations.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons
                  name={searchText ? 'search-outline' : showArchived ? 'archive-outline' : 'chatbubbles-outline'}
                  size={37}
                  color={COLORS.cyan}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {searchText ? 'No matching conversations' : showArchived ? 'No archived chats' : 'No messages yet'}
              </Text>
              <Text style={styles.emptyText}>
                {searchText ? 'Try another name or message.' : showArchived ? 'Archived conversations will appear here.' : 'Start a conversation!'}
              </Text>
              <TouchableOpacity
                style={styles.startButton}
                onPress={searchText ? () => setSearchText('') : showArchived ? () => setShowArchived(false) : openNewMessage}
              >
                <Text style={styles.startButtonText}>{searchText ? 'Clear search' : showArchived ? 'Back to chats' : 'New chat'}</Text>
              </TouchableOpacity>
            </View>
          ) : <Text style={styles.noResults}>No conversations match your search.</Text>}
          keyboardShouldPersistTaps="handled"
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
        onUploaded={(story) => {
          setStories((current) => [story, ...current.filter((item) => item.$id !== story.$id)]);
        }}
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
              accessibilityLabel="Close new chat"
            >
              <Ionicons name="close" size={25} color="#F1F4F7" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Chat</Text>
            <View style={styles.modalClose} />
          </View>
          <View style={styles.searchContainer}>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color="#888" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search for a user by name or @username..."
                placeholderTextColor="#888"
                value={userSearch}
                onChangeText={setUserSearch}
                autoFocus
                accessibilityLabel="Search people"
              />
            </View>
          </View>
          {userSearch.trim().replace(/^@/, '').length < 2 ? (
            <View style={styles.directoryEmpty}>
              <Text style={styles.directoryPlaceholder}>
                Search for a user to start chatting.
              </Text>
            </View>
          ) : usersLoading ? (
            <ActivityIndicator size="large" color={COLORS.cyan} style={styles.loader} />
          ) : userSearchError ? (
            <View style={styles.directoryEmpty}>
              <Text style={styles.directoryPlaceholder}>{userSearchError}</Text>
            </View>
          ) : users.length === 0 ? (
            <View style={styles.directoryEmpty}>
              <Text style={styles.directoryPlaceholder}>
                No users found matching '{userSearch.trim()}'.
              </Text>
            </View>
          ) : (
            <FlatList
              data={users}
              keyExtractor={(person) => person.$id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <View style={styles.userRow}>
                  <Avatar uri={item.avatarUrl} userId={item.userId} name={item.name || item.username} size={48} />
                  <TouchableOpacity style={styles.userInfo} onPress={() => startChat(item)}>
                    <View style={styles.userNameRow}>
                      <Text style={styles.userName}>{item.name || item.username || 'Mzansi User'}</Text>
                      {item.isVerified === true ? <Ionicons name="checkmark-circle" size={14} color={COLORS.cyan} /> : null}
                    </View>
                    <Text style={styles.userHandle}>@{item.username || 'user'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.profileButton}
                    onPress={() => navigation.navigate('UserProfile', {
                      userId: item.userId,
                      userName: item.username || item.name || 'User',
                    })}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${item.username || item.name || 'user'} profile`}
                  >
                    <Ionicons name="person-outline" size={18} color="#8B95A7" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.openChatButton}
                    onPress={() => startChat(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Message ${item.username || item.name || 'user'}`}
                  >
                    <Ionicons name="chatbubble-outline" size={18} color={COLORS.cyan} />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0D12' },
  header: { height: 54, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 17, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  newMessageBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#151820' },
  sectionTabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#252A35' },
  sectionTab: { flex: 1, minWidth: 0, height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 19, backgroundColor: 'transparent' },
  sectionTabActive: { backgroundColor: 'rgba(0,229,255,0.12)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.35)' },
  sectionTabText: { color: '#8B95A7', fontSize: 13, fontWeight: '700' },
  sectionTabTextActive: { color: COLORS.cyan },
  searchContainer: { paddingHorizontal: 16, marginBottom: 10 },
  searchBar: { flexDirection: 'row', backgroundColor: '#151820', borderRadius: 12, alignItems: 'center', paddingHorizontal: 13, height: 44, borderWidth: 1, borderColor: '#252A35' },
  searchIcon: { marginRight: 8, alignSelf: 'center' },
  searchInput: { flex: 1, color: '#fff', fontSize: 14, paddingVertical: 0 },
  loader: { marginTop: 50 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 78, paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: 12, marginBottom: 8, borderRadius: 16, backgroundColor: '#151820' },
  avatarContainer: { width: 50, height: 50, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  onlineDot: { position: 'absolute', right: 0, bottom: 1, width: 13, height: 13, borderRadius: 7, backgroundColor: '#00FF00', borderWidth: 2, borderColor: '#151820' },
  conversationDetails: { flex: 1, flexDirection: 'column', marginLeft: 12, minHeight: 46, justifyContent: 'center' },
  conversationContent: { flex: 1, justifyContent: 'center' },
  conversationTopLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  nameAndBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flex: 1, fontSize: 15 },
  readName: { color: '#8B95A7', fontWeight: '500' },
  unreadName: { color: '#FFFFFF', fontWeight: '700' },
  username: { color: '#8B95A7', fontSize: 10, marginTop: -3, marginBottom: 3 },
  time: { color: '#8B95A7', fontSize: 11 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00E5FF' },
  previewRow: { flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  preview: { flex: 1, fontSize: 13 },
  readPreview: { color: '#8B95A7', fontWeight: '400' },
  unreadPreview: { color: '#FFFFFF', fontWeight: '600' },
  readReceipt: { marginRight: 5 },
  typingText: { color: COLORS.cyan, fontWeight: '700' },
  previewIcon: { marginRight: 5 },
  mutedIcon: { marginLeft: 4, marginRight: 6 },
  rowMeta: { minHeight: 48, alignItems: 'flex-end', justifyContent: 'space-between', marginLeft: 8, paddingVertical: 3 },
  unreadBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#00E5FF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { color: '#071014', fontSize: 9, fontWeight: '800' },
  swipeActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginBottom: 8, backgroundColor: '#0B0D12' },
  swipeAction: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  pinAction: { backgroundColor: '#167E91' },
  archiveAction: { backgroundColor: '#46505F' },
  muteAction: { backgroundColor: '#59616B' },
  deleteAction: { backgroundColor: '#D93A55' },
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
  archiveToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#252A35' },
  archiveToggleText: { flex: 1, color: '#E7EBF0', fontSize: 13, fontWeight: '700' },
  statusList: { flexGrow: 1, paddingBottom: 20 },
  callsContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 45 },
  callsIcon: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', borderRadius: 36, backgroundColor: 'rgba(0,229,255,0.12)' },
  callsTitle: { color: '#fff', fontSize: 19, fontWeight: '800', marginTop: 17 },
  callsDescription: { maxWidth: 300, color: '#8B95A7', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  callsUnavailable: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, borderColor: '#252A35', borderRadius: 12, backgroundColor: '#151820' },
  callsUnavailableText: { color: '#8B95A7', fontSize: 11 },
  startCallButton: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 17, paddingHorizontal: 17, paddingVertical: 10, borderRadius: 20, backgroundColor: COLORS.cyan },
  startCallText: { color: '#061116', fontSize: 13, fontWeight: '800' },
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalClose: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { color: '#F3F5F7', fontSize: 17, fontWeight: '800' },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  userInfo: { flex: 1, marginLeft: 13 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  profileButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  openChatButton: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center', marginLeft: 3 },
  userName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  userHandle: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  directoryPlaceholder: { color: '#8B95A7', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 36, paddingHorizontal: 24 },
  directoryEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
});
