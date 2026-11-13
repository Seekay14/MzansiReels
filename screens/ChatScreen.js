import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, Keyboard, KeyboardAvoidingView, LayoutAnimation, Linking, Platform, Alert, Image, ActivityIndicator, Modal, ScrollView, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { client, databases, storage, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, BUCKET_ID, COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { blockUser, getFileViewUrl, getUserDoc, notify } from '../config/helpers';
import { uploadMediaFile } from '../config/mediaUpload';
import {
  fetchMessages as loadChatMessages,
  findChat,
  getChatForParticipants,
  markMessagesAsRead,
  setTypingStatus,
  sendMessageToParticipants,
  updateMessageReaction,
} from '../config/chatService';
import Avatar from '../components/Avatar';
import ChatInputBar from '../components/ChatInputBar';
import StickerPicker from '../components/StickerPicker';
import ChatMenuBottomSheet from '../components/ChatMenuBottomSheet';
import MessageContextMenu from '../components/MessageContextMenu';
import { EmojiKeyboard } from 'rn-emoji-keyboard';

const EMOJI_THEME = {
  backdrop: 'transparent',
  knob: '#303642',
  container: '#151820',
  header: '#F3F5F7',
  skinTonesContainer: '#151820',
  category: {
    icon: '#8B95A7',
    iconActive: '#00E5FF',
    container: '#151820',
    containerActive: '#252A35',
  },
  search: {
    background: '#0B0D12',
    text: '#F3F5F7',
    placeholder: '#8B95A7',
    icon: '#8B95A7',
  },
  customButton: {
    icon: '#8B95A7',
    iconPressed: '#00E5FF',
    background: '#151820',
    backgroundPressed: '#252A35',
  },
  emoji: { selected: 'rgba(0,229,255,0.2)' },
};

const CHAT_THEMES = {
  default: { label: 'Default MzansiReels', background: '#0B0D12', outgoing: '#00E5FF', outgoingText: '#061116', incoming: '#151820' },
  dark: { label: 'Dark', background: '#000000', outgoing: '#263238', outgoingText: '#FFFFFF', incoming: '#151515' },
  midnight: { label: 'Midnight', background: '#080B1B', outgoing: '#273C75', outgoingText: '#FFFFFF', incoming: '#12182D' },
  cyan: { label: 'Cyan accent', background: '#0B0D12', outgoing: '#00E5FF', outgoingText: '#061116', incoming: '#151820' },
  pink: { label: 'Pink accent', background: '#0B0D12', outgoing: '#FF0055', outgoingText: '#FFFFFF', incoming: '#151820' },
};

const muteSettingsKey = (userId) => `muted_chat_expiry_${userId}`;
const pinnedChatsKey = (userId) => `pinned_chats_${userId}`;
const chatThemeKey = (userId, chatId) => `chat_theme_${userId}_${chatId}`;
const localClearKey = (userId, chatId) => `chat_local_clear_${userId}_${chatId}`;
const localHiddenMessagesKey = (userId, chatId) => `chat_hidden_messages_${userId}_${chatId}`;
const LINK_PATTERN = /https?:\/\/[^\s]+/gi;

function renderHighlightedText(text, term) {
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedTerm})`, 'ig'));
  return parts.map((part, index) => (
    part.toLowerCase() === term.toLowerCase()
      ? <Text key={`${index}-${part}`} style={styles.searchHighlight}>{part}</Text>
      : part
  ));
}

const POLL_MS = 4000;

function mergeMessages(...messageLists) {
  return [...new Map(
    messageLists.flat().map((message) => [message.$id, message]),
  ).values()].sort((first, second) => (
    new Date(first.$createdAt).getTime() - new Date(second.$createdAt).getTime()
  ));
}

function belongsToConversation(message, currentUserId, otherUserId) {
  return (
    (message.senderId === currentUserId && message.receiverId === otherUserId)
    || (message.senderId === otherUserId && message.receiverId === currentUserId)
  );
}

function ChatVideoMessage({ uri, fullscreen = false }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = false;
  });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });

  return (
    <TouchableOpacity
      style={[styles.videoMessage, fullscreen && styles.fullVideoMessage]}
      onPress={() => (player.playing ? player.pause() : player.play())}
      accessibilityRole="button"
      accessibilityLabel={player.playing ? 'Pause video' : 'Play video'}
    >
      <VideoView
        player={player}
        style={[styles.videoPreview, fullscreen && styles.fullVideoPreview]}
        contentFit={fullscreen ? 'contain' : 'cover'}
        nativeControls={fullscreen}
      />
      {status === 'error' ? (
        <Text style={styles.videoError}>{error?.message || 'Could not load video.'}</Text>
      ) : !player.playing ? (
        <View style={styles.videoPlayIcon}>
          <Ionicons name="play" size={26} color="#fff" />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function ChatAudioMessage({ uri }) {
  const soundRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    const sound = new Audio.Sound();
    soundRef.current = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (!active || !status.isLoaded) return;
      setPlaying(status.isPlaying);
      setProgress(status.durationMillis
        ? Math.min(1, status.positionMillis / status.durationMillis)
        : 0);
    });
    sound.loadAsync({ uri }).then(() => {
      if (active) setReady(true);
    }).catch((error) => {
      if (active) setLoadError(error.message || 'Could not load this voice note.');
      console.error('Could not load voice note:', error);
    });
    return () => {
      active = false;
      sound.unloadAsync().catch((error) => {
        console.error('Could not release voice note playback:', error);
      });
    };
  }, [uri]);

  const togglePlayback = async () => {
    if (!ready || !soundRef.current) return;
    try {
      if (playing) await soundRef.current.pauseAsync();
      else await soundRef.current.playAsync();
    } catch (error) {
      console.error('Could not play voice note:', error);
      setLoadError(error.message || 'Could not play this voice note.');
    }
  };

  return (
    <View style={styles.audioMessage}>
      <TouchableOpacity
        style={styles.audioPlayButton}
        onPress={togglePlayback}
        disabled={!ready}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
      >
        {ready
          ? <Ionicons name={playing ? 'pause' : 'play'} size={19} color={COLORS.cyan} />
          : <ActivityIndicator size="small" color={COLORS.cyan} />}
      </TouchableOpacity>
      <View style={styles.audioProgressTrack}>
        <View style={[styles.audioProgressFill, { width: `${progress * 100}%` }]} />
      </View>
      {loadError ? <Text style={styles.audioError}>{loadError}</Text> : null}
    </View>
  );
}

export default function ChatScreen({ route, navigation }) {
  const {
    chatId: initialChatId,
    otherUserId: routeOtherId,
    otherUserName: routeOtherName,
    otherUserAvatar = null,
  } = route?.params || {};
  const otherId = routeOtherId || route?.params?.userId || null;
  const otherName = routeOtherName || route?.params?.userName || 'User';
  const { user } = useAuth();
  const { colors: appColors, mode: appThemeMode } = useTheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [messageContextMenuVisible, setMessageContextMenuVisible] = useState(false);
  const [contextMessage, setContextMessage] = useState(null);
  const [contextAnchor, setContextAnchor] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [systemKeyboardVisible, setSystemKeyboardVisible] = useState(false);
  const [stickerPickerVisible, setStickerPickerVisible] = useState(false);
  const [chatId, setChatId] = useState(initialChatId || null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [messageOffset, setMessageOffset] = useState(0);
  const [messageError, setMessageError] = useState('');
  const [sendError, setSendError] = useState('');
  const [otherUserDoc, setOtherUserDoc] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [attachmentProgress, setAttachmentProgress] = useState(0);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [recordingVoiceNote, setRecordingVoiceNote] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const [messageSearchVisible, setMessageSearchVisible] = useState(false);
  const [messageSearchText, setMessageSearchText] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState([]);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);
  const [messageSearchError, setMessageSearchError] = useState('');
  const [highlightedMessageId, setHighlightedMessageId] = useState('');
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [detailsTab, setDetailsTab] = useState('Media');
  const [detailMessages, setDetailMessages] = useState([]);
  const [detailOffset, setDetailOffset] = useState(0);
  const [detailHasMore, setDetailHasMore] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [chatThemeId, setChatThemeId] = useState('default');
  const [themePickerVisible, setThemePickerVisible] = useState(false);
  const [themePreviewId, setThemePreviewId] = useState('default');
  const [mutedUntil, setMutedUntil] = useState(null);
  const [chatPinned, setChatPinned] = useState(false);
  const [blockDocumentId, setBlockDocumentId] = useState('');
  const [localClearAt, setLocalClearAt] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [muteSaving, setMuteSaving] = useState(false);
  const listRef = useRef(null);
  const loadedChatId = useRef('');
  const typingTimer = useRef(null);
  const typingWriteQueue = useRef(Promise.resolve());
  const publishedTypingState = useRef(false);
  const recordingRef = useRef(null);
  const selectedChatThemeId = themePickerVisible ? themePreviewId : chatThemeId;
  const selectedChatTheme = CHAT_THEMES[selectedChatThemeId] || CHAT_THEMES.default;
  const chatTheme = appThemeMode === 'light' && selectedChatThemeId === 'default'
    ? {
      ...selectedChatTheme,
      background: appColors.bg,
      incoming: appColors.card,
    }
    : selectedChatTheme;
  const headerName = otherUserDoc?.name || otherName;
  const headerUsername = otherUserDoc?.username
    ? `@${otherUserDoc.username.replace(/^@/, '')}`
    : '';

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setSystemKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setSystemKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!otherId) {
      setOtherUserDoc(null);
      return undefined;
    }
    getUserDoc(otherId).then((profile) => {
      if (active) setOtherUserDoc(profile);
    }).catch((error) => {
      console.error('Could not load chat participant profile:', error);
    });
    return () => {
      active = false;
    };
  }, [otherId]);

  useEffect(() => {
    let active = true;
    if (!user?.$id || !chatId) {
      setChatThemeId('default');
      setChatPinned(false);
      setMutedUntil(null);
      setLocalClearAt(null);
      return () => { active = false; };
    }

    const loadLocalChatPreferences = async () => {
      try {
        const [theme, clearAt, muteSettings, pinnedChats] = await Promise.all([
          AsyncStorage.getItem(chatThemeKey(user.$id, chatId)),
          AsyncStorage.getItem(localClearKey(user.$id, chatId)),
          AsyncStorage.getItem(muteSettingsKey(user.$id)),
          AsyncStorage.getItem(pinnedChatsKey(user.$id)),
        ]);
        if (!active) return;
        if (theme && CHAT_THEMES[theme]) setChatThemeId(theme);
        else setChatThemeId('default');
        setLocalClearAt(clearAt ? Number(clearAt) : null);
        const pinnedIds = pinnedChats ? JSON.parse(pinnedChats) : [];
        setChatPinned(pinnedIds.includes(chatId));
        const settings = muteSettings ? JSON.parse(muteSettings) : {};
        const storedMuteUntil = settings[chatId] || null;
        if (storedMuteUntil && Number(storedMuteUntil) !== -1 && Number(storedMuteUntil) <= Date.now()) {
          delete settings[chatId];
          await AsyncStorage.setItem(muteSettingsKey(user.$id), JSON.stringify(settings));
          if (active) setMutedUntil(null);
        } else {
          setMutedUntil(storedMuteUntil ? Number(storedMuteUntil) : null);
        }
      } catch (error) {
        console.error('Could not load chat preferences:', error);
      }
    };

    loadLocalChatPreferences();
    return () => { active = false; };
  }, [chatId, user?.$id]);

  useEffect(() => {
    let active = true;
    if (!user?.$id || !otherId) {
      setBlockDocumentId('');
      return () => { active = false; };
    }
    databases.listDocuments(DATABASE_ID, COLLECTIONS.blocks, [
      Query.equal('blockerId', user.$id),
      Query.equal('blockedId', otherId),
      Query.limit(1),
    ]).then((result) => {
      if (active) setBlockDocumentId(result.documents[0]?.$id || '');
    }).catch((error) => {
      console.error('Could not check the existing block preference:', error);
    });
    return () => { active = false; };
  }, [otherId, user?.$id]);

  useEffect(() => {
    let active = true;
    const term = messageSearchText.trim().toLowerCase();
    setMessageSearchResults([]);
    setMessageSearchError('');
    if (!messageSearchVisible || term.length < 2 || !chatId || !user?.$id || !otherId) {
      setMessageSearchLoading(false);
      return () => { active = false; };
    }

    const timer = setTimeout(async () => {
      setMessageSearchLoading(true);
      try {
        await getChatForParticipants(chatId, user.$id, otherId);
        const matches = [];
        let offset = 0;
        while (active) {
          const page = await databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
            Query.equal('chatId', chatId),
            Query.orderDesc('$createdAt'),
            Query.limit(100),
            Query.offset(offset),
          ]);
          matches.push(...page.documents.filter((message) => (
            (message.text || '').toLowerCase().includes(term)
          )));
          if (active) setMessageSearchResults([...matches]);
          offset += page.documents.length;
          if (!page.documents.length || offset >= page.total) break;
        }
      } catch (error) {
        console.error('Could not search this conversation:', error);
        if (active) setMessageSearchError(error.message || 'Could not search messages.');
      } finally {
        if (active) setMessageSearchLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [chatId, messageSearchText, messageSearchVisible, otherId, user?.$id]);

  useEffect(() => {
    if (chatId || !otherId || !user?.$id) return undefined;
    let active = true;
    findChat(user.$id, otherId)
      .then((chat) => {
        if (active && chat) setChatId(chat.$id);
      })
      .catch((error) => {
        console.error('Could not load chat:', error);
        if (active) setMessageError('Failed to load messages. Please try again.');
        if (active) Alert.alert('Chat unavailable', error.message || 'Could not open this chat.');
      });
    return () => { active = false; };
  }, [chatId, otherId, user?.$id]);

  const persistTypingStatus = useCallback((isTyping) => {
    if (!chatId || !user?.$id || !otherId) return Promise.resolve();

    typingWriteQueue.current = typingWriteQueue.current
      .then(() => setTypingStatus(chatId, isTyping))
      .catch((error) => {
        console.error('Could not update chat typing status:', error);
        if (isTyping) publishedTypingState.current = false;
      });

    return typingWriteQueue.current;
  }, [chatId, otherId, user?.$id]);

  const handleTyping = useCallback((text) => {
    if (typingTimer.current) clearTimeout(typingTimer.current);

    if (text.length > 0 && !publishedTypingState.current) {
      publishedTypingState.current = true;
      persistTypingStatus(true);
    }

    typingTimer.current = setTimeout(() => {
      publishedTypingState.current = false;
      persistTypingStatus(false);
    }, 2000);
  }, [persistTypingStatus]);

  useEffect(() => {
    if (!chatId || !user?.$id || !otherId) return undefined;
    let active = true;
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.typingStatus}.documents`,
      (event) => {
        const document = event.payload;
        if (
          active
          && document.chatId === chatId
          && document.userId !== user.$id
        ) {
          setIsOtherTyping(document.isTyping === true);
        }
      },
    );

    return () => {
      active = false;
      unsubscribe();
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = null;
      publishedTypingState.current = false;
      persistTypingStatus(false);
    };
  }, [chatId, otherId, persistTypingStatus, user?.$id]);

  const fetchMessages = useCallback(async () => {
    if (!otherId || !user?.$id) {
      setMessagesLoading(false);
      setMessageError('This conversation could not be opened.');
      return;
    }
    if (!chatId) {
      setMessages([]);
      setMessagesLoading(false);
      setMessageError('');
      loadedChatId.current = '';
      setMessageOffset(0);
      setHasMoreMessages(true);
      return;
    }
    setMessageError('');
    try {
      await getChatForParticipants(chatId, user.$id, otherId);
      const latestPage = await loadChatMessages(chatId);
      const fetchedMessages = latestPage.documents
        .filter((message) => belongsToConversation(message, user.$id, otherId));
      const [clearAtValue, hiddenMessageIdsValue] = await Promise.all([
        AsyncStorage.getItem(localClearKey(user.$id, chatId)),
        AsyncStorage.getItem(localHiddenMessagesKey(user.$id, chatId)),
      ]);
      const clearAt = clearAtValue ? Number(clearAtValue) : localClearAt;
      const hiddenIds = hiddenMessageIdsValue ? JSON.parse(hiddenMessageIdsValue) : [];
      if (!Array.isArray(hiddenIds)) throw new Error('Saved hidden-message data is invalid.');
      if (clearAtValue) setLocalClearAt(clearAt);
      const visibleMessages = clearAt
        ? fetchedMessages.filter((message) => new Date(message.$createdAt).getTime() > clearAt)
        : fetchedMessages;
      const visibleMessagesWithoutHidden = visibleMessages.filter((message) => !hiddenIds.includes(message.$id));
      if (loadedChatId.current !== chatId) {
        loadedChatId.current = chatId;
        setMessages(visibleMessagesWithoutHidden);
        setMessageOffset(latestPage.nextOffset);
        setHasMoreMessages(latestPage.hasMore);
      } else {
        setMessages((current) => mergeMessages(current, visibleMessagesWithoutHidden));
      }
      const unreadMessages = visibleMessages.filter(
        (message) => !hiddenIds.includes(message.$id)
          && message.receiverId === user.$id
          && message.isRead === false,
      );
      if (unreadMessages.length) {
        try {
          const unreadIds = new Set(await markMessagesAsRead(unreadMessages, user.$id));
          setMessages((current) => current.map((message) => (
            unreadIds.has(message.$id) ? { ...message, isRead: true } : message
          )));
        } catch (error) {
          console.error('Could not mark incoming messages as read:', error);
        }
      }
    } catch (error) {
      console.error(error);
      setMessageError('Failed to load messages. Please try again.');
    } finally {
      setMessagesLoading(false);
    }
  }, [user?.$id, otherId, chatId, localClearAt]);

  const loadOlderMessages = useCallback(async () => {
    if (!chatId || !user?.$id || !otherId || loadingOlderMessages || !hasMoreMessages) return;
    setLoadingOlderMessages(true);
    try {
      await getChatForParticipants(chatId, user.$id, otherId);
      const olderPage = await loadChatMessages(chatId, messageOffset);
      const page = olderPage.documents
        .filter((message) => belongsToConversation(message, user.$id, otherId));
      const [clearAtValue, hiddenMessageIdsValue] = await Promise.all([
        AsyncStorage.getItem(localClearKey(user.$id, chatId)),
        AsyncStorage.getItem(localHiddenMessagesKey(user.$id, chatId)),
      ]);
      const clearAt = clearAtValue ? Number(clearAtValue) : localClearAt;
      const hiddenIds = hiddenMessageIdsValue ? JSON.parse(hiddenMessageIdsValue) : [];
      if (!Array.isArray(hiddenIds)) throw new Error('Saved hidden-message data is invalid.');
      const visibleMessages = page.filter((message) => (
        (!clearAt || new Date(message.$createdAt).getTime() > clearAt)
        && !hiddenIds.includes(message.$id)
      ));
      setMessages((current) => mergeMessages(current, visibleMessages));
      setMessageOffset(olderPage.nextOffset);
      setHasMoreMessages(olderPage.hasMore);

      const unreadMessages = visibleMessages.filter((message) => (
        message.receiverId === user.$id && message.isRead === false
      ));
      if (unreadMessages.length) {
        try {
          const unreadIds = new Set(await markMessagesAsRead(unreadMessages, user.$id));
          setMessages((current) => current.map((message) => (
            unreadIds.has(message.$id) ? { ...message, isRead: true } : message
          )));
        } catch (error) {
          console.error('Could not mark older incoming messages as read:', error);
        }
      }
    } catch (error) {
      console.error('Could not load older messages:', error);
      Alert.alert('Could not load older messages', error.message || 'Please try again.');
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [
    chatId,
    hasMoreMessages,
    loadingOlderMessages,
    localClearAt,
    messageOffset,
    otherId,
    user?.$id,
  ]);

  useFocusEffect(useCallback(() => {
    fetchMessages();
    if (!chatId || !otherId || !user?.$id) return undefined;
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.messages}.documents`,
      (event) => {
        if (event.payload?.chatId === chatId) fetchMessages();
      },
    );
    const timer = setInterval(fetchMessages, POLL_MS);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, [chatId, fetchMessages, otherId, user?.$id]));

  const showCallUnavailable = (kind) => {
    Alert.alert(
      `${kind} calls unavailable`,
      'Calling is not connected in this app version, so this call cannot be started.',
    );
  };

  const sendMessage = async (messageText = newMessage, attachmentUrl = '', attachmentType = 'text') => {
    const text = messageText.trim();
    if ((!text && !attachmentUrl) || !user?.$id || !otherId || sendingMessage) return false;
    if (blockDocumentId) {
      Alert.alert('User blocked', 'Unblock this user before sending messages from this account.');
      return false;
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = null;
    publishedTypingState.current = false;
    void persistTypingStatus(false);
    const replyToId = replyingTo?.$id || '';
    setSendError('');
    setSendingMessage(true);
    try {
      await createChatMessage({
        text,
        attachmentUrl,
        attachmentType,
        replyToId,
      });
      if (attachmentType === 'text') {
        setNewMessage((current) => current === messageText ? '' : current);
      }
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
      setReplyingTo((current) => current?.$id === replyToId ? null : current);
      try {
        await notify(otherId, user.name, 'message', user.avatarUrl);
      } catch (notificationError) {
        console.error('Message sent, but its notification could not be created:', notificationError);
      }
      return true;
    } catch (error) {
      console.error('Could not send message:', error);
      setSendError(error.message || 'Message could not be sent. Please try again.');
      return false;
    } finally {
      setSendingMessage(false);
    }
  };

  const createChatMessage = async ({
    text,
    attachmentUrl = '',
    attachmentType = 'text',
    stickerUrl = '',
    replyToId = '',
  }) => {
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const data = {
      senderId: user.$id,
      receiverId: otherId,
      chatId: chatId || '',
      text,
      attachmentUrl,
      attachmentType,
      stickerUrl,
      replyToId,
      reactions: '',
      isRead: false,
      expiresAt,
    };
    const optimisticId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMessage = {
      ...data,
      $id: optimisticId,
      $createdAt: createdAt,
    };
    setMessages((current) => mergeMessages(current, [optimisticMessage]));
    try {
      const { chat, message: savedMessage } = await sendMessageToParticipants(
        user.$id,
        otherId,
        text,
        attachmentUrl,
        attachmentType,
        stickerUrl,
        replyToId,
        chatId || '',
      );
      setChatId(chat.$id);
      setMessages((current) => mergeMessages(
        current.filter((message) => message.$id !== optimisticId),
        [savedMessage],
      ));
      return savedMessage;
    } catch (error) {
      setMessages((current) => current.filter((message) => message.$id !== optimisticId));
      throw error;
    }
  };

  const sendSticker = async (stickerUrl) => {
    setStickerPickerVisible(false);
    if (!user?.$id || !otherId) {
      Alert.alert('Chat unavailable', 'Sign in and select a user before sending a sticker.');
      return;
    }

    setSendError('');
    try {
      await createChatMessage({
        text: '',
        attachmentType: 'sticker',
        stickerUrl,
      });
      requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated: true }));
      try {
        await notify(otherId, user.name, 'message', user.avatarUrl);
      } catch (notificationError) {
        console.error('Sticker sent, but its notification could not be created:', notificationError);
      }
    } catch (error) {
      console.error('Could not send sticker:', error);
      setSendError(error.message || 'Sticker could not be sent. Please try again.');
    }
  };

  const pickAttachment = async () => {
    if (!user?.$id || !otherId) {
      Alert.alert('Chat unavailable', 'Sign in and select a user before sending an image.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted && Platform.OS !== 'web') {
      Alert.alert('Permission needed', 'Allow photo library access to send an attachment.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const selected = result.assets[0];
    const mediaType = selected.type === 'video' ? 'video' : 'image';
    const asset = { ...selected, type: mediaType };
    let uploadedFileId;
    setUploadingAttachment(true);
    setAttachmentProgress(0);
    try {
      uploadedFileId = await uploadMediaFile(asset, {
        userId: user.$id,
        kind: mediaType,
        folder: `messages/${user.$id}`,
        onProgress: ({ progress }) => setAttachmentProgress(Math.round(progress)),
      });
      const mediaUrl = getFileViewUrl(uploadedFileId);
      const sent = await sendMessage('', mediaUrl, mediaType);
      if (!sent) {
        await storage.deleteFile(BUCKET_ID, uploadedFileId);
        uploadedFileId = null;
        return;
      }
      uploadedFileId = null;
    } catch (error) {
      console.error(`Could not send ${mediaType} attachment:`, error);
      if (uploadedFileId) {
        try {
          await storage.deleteFile(BUCKET_ID, uploadedFileId);
        } catch (cleanupError) {
          console.error(`Could not clean up failed chat attachment ${uploadedFileId}:`, cleanupError);
        }
      }
      Alert.alert('Attachment failed', error.message || 'Could not send this attachment.');
    } finally {
      setUploadingAttachment(false);
      setAttachmentProgress(0);
    }
  };

  const sendVoiceNote = async (uri) => {
    if (!uri || !user?.$id || !otherId) throw new Error('The voice recording is unavailable.');
    let uploadedFileId;
    setUploadingAttachment(true);
    setAttachmentProgress(0);
    try {
      uploadedFileId = await uploadMediaFile({
        uri,
        type: 'audio',
        mimeType: 'audio/mp4',
        fileName: 'voice-note.m4a',
      }, {
        userId: user.$id,
        kind: 'audio',
        folder: `messages/${user.$id}`,
        onProgress: ({ progress }) => setAttachmentProgress(Math.round(progress)),
      });
      const sent = await sendMessage('', getFileViewUrl(uploadedFileId), 'audio');
      if (!sent) {
        await storage.deleteFile(BUCKET_ID, uploadedFileId);
        uploadedFileId = null;
        return;
      }
      uploadedFileId = null;
    } catch (error) {
      if (uploadedFileId) {
        try {
          await storage.deleteFile(BUCKET_ID, uploadedFileId);
        } catch (cleanupError) {
          console.error(`Could not clean up voice note ${uploadedFileId}:`, cleanupError);
        }
      }
      throw error;
    } finally {
      setUploadingAttachment(false);
      setAttachmentProgress(0);
    }
  };

  const startVoiceNote = async () => {
    if (!user?.$id || !otherId || recordingVoiceNote || uploadingAttachment) return;
    if (Platform.OS === 'web') {
      Alert.alert('Voice notes unavailable', 'Voice recording is currently available in the mobile app only.');
      return;
    }
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone permission needed', 'Allow microphone access to record a voice note.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setRecordingSeconds(0);
      setRecordingVoiceNote(true);
    } catch (error) {
      console.error('Could not start voice note recording:', error);
      Alert.alert('Recording failed', error.message || 'Could not start recording.');
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch((modeError) => {
        console.error('Could not reset audio mode:', modeError);
      });
    }
  };

  const stopVoiceNote = async (discard = false) => {
    const recording = recordingRef.current;
    if (!recording) return;
    recordingRef.current = null;
    setRecordingVoiceNote(false);
    try {
      const status = await recording.getStatusAsync();
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      if (!discard && uri && (status.durationMillis || 0) > 0) await sendVoiceNote(uri);
    } catch (error) {
      console.error('Could not finish or send voice note:', error);
      Alert.alert('Voice note failed', error.message || 'Could not send this recording.');
    } finally {
      setRecordingSeconds(0);
    }
  };

  useEffect(() => {
    if (!recordingVoiceNote) return undefined;
    const timer = setInterval(() => {
      setRecordingSeconds((seconds) => seconds + 1);
    }, 1000);
    const maxDurationTimer = setTimeout(() => stopVoiceNote(), 120_000);
    return () => {
      clearInterval(timer);
      clearTimeout(maxDurationTimer);
    };
  }, [recordingVoiceNote]);

  useEffect(() => () => {
    if (recordingRef.current) {
      recordingRef.current.stopAndUnloadAsync().catch((error) => {
        console.error('Could not stop voice recording when leaving chat:', error);
      });
    }
  }, []);

  const openMessageActions = (message, anchor) => {
    setContextMessage(message);
    setContextAnchor(anchor || null);
    setMessageContextMenuVisible(true);
  };

  const reactToMessage = async (message, reaction) => {
    if (!message?.$id || message.$id.startsWith('local-')) {
      Alert.alert('Reaction unavailable', 'Wait until the message has finished sending.');
      return;
    }
    const previousMessage = messages.find((item) => item.$id === message.$id) || message;
    setMessages((current) => current.map((item) => (
      item.$id === message.$id ? { ...item, reactions: reaction } : item
    )));
    try {
      const updated = await updateMessageReaction(message.$id, reaction);
      setMessages((current) => current.map((item) => (
        item.$id === updated.$id ? { ...item, reactions: updated.reactions || reaction } : item
      )));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch((error) => {
        console.warn('Could not trigger reaction success haptics:', error);
      });
    } catch (error) {
      setMessages((current) => current.map((item) => (
        item.$id === message.$id && item.reactions === reaction
          ? { ...item, reactions: previousMessage.reactions || '' }
          : item
      )));
      console.error(`Could not save reaction for message ${message.$id}:`, error);
      Alert.alert('Reaction failed', error.message || 'Could not save this reaction.');
    }
  };

  const copyMessage = async (message) => {
    const text = message?.text || message?.attachmentUrl || message?.stickerUrl;
    if (!text) {
      Alert.alert('Nothing to copy', 'This message does not contain copyable text or a link.');
      return;
    }
    try {
      await Clipboard.setStringAsync(text);
      Alert.alert('Copied!', 'Message copied to clipboard.');
    } catch (error) {
      console.error('Could not copy message:', error);
      Alert.alert('Copy failed', error.message || 'Could not copy this message.');
    }
  };

  const forwardMessage = async (message) => {
    const attachmentType = message.attachmentType || message.messageType || 'text';
    const content = message.text
      || (attachmentType === 'sticker' ? message.stickerUrl : message.attachmentUrl)
      || '';
    if (!content) {
      Alert.alert('Forward unavailable', 'This message does not contain shareable content.');
      return;
    }
    try {
      await Share.share({ message: content });
    } catch (error) {
      console.error('Could not forward message:', error);
      Alert.alert('Forward failed', error.message || 'Could not share this message.');
    }
  };

  const hideMessageForMe = async (message) => {
    if (!message?.$id) return;
    if (message.$id.startsWith('local-')) {
      setMessages((current) => current.filter((item) => item.$id !== message.$id));
      return;
    }
    if (!user?.$id || !chatId) {
      Alert.alert('Could not delete message', 'This conversation is not ready yet.');
      return;
    }
    try {
      const key = localHiddenMessagesKey(user.$id, chatId);
      const stored = await AsyncStorage.getItem(key);
      const hiddenIds = stored ? JSON.parse(stored) : [];
      const nextHiddenIds = [...new Set([...hiddenIds, message.$id])];
      await AsyncStorage.setItem(key, JSON.stringify(nextHiddenIds));
      setMessages((current) => current.filter((item) => item.$id !== message.$id));
    } catch (error) {
      console.error(`Could not hide message ${message.$id} on this device:`, error);
      Alert.alert('Delete failed', error.message || 'Could not delete this message for you.');
    }
  };

  const deleteMessageForEveryone = async (message) => {
    if (!message?.$id || message.senderId !== user?.$id) {
      Alert.alert('Not allowed', 'You can only delete your own messages for everyone.');
      return;
    }
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.messages, message.$id);
      setMessages((current) => current.filter((item) => item.$id !== message.$id));
    } catch (error) {
      console.error(`Could not delete message ${message.$id} for everyone:`, error);
      Alert.alert('Delete failed', error.message || 'Could not delete this message for everyone.');
    }
  };

  const confirmDeleteMessage = (message) => {
    const actions = [
      {
        text: 'Cancel',
        style: 'cancel',
        onPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error) => {
          console.warn('Could not trigger delete-menu haptics:', error);
        }),
      },
      {
        text: 'Delete for me',
        style: 'destructive',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error) => {
            console.warn('Could not trigger delete-menu haptics:', error);
          });
          hideMessageForMe(message);
        },
      },
    ];
    if (message.senderId === user?.$id) {
      actions.splice(1, 0, {
        text: 'Delete for everyone',
        style: 'destructive',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error) => {
            console.warn('Could not trigger delete-menu haptics:', error);
          });
          deleteMessageForEveryone(message);
        },
      });
    }
    Alert.alert('Delete message?', undefined, actions);
  };

  const editMessage = (message) => {
    setEditingMessage(message);
    setEditDraft(message.text || '');
  };

  const saveEditedMessage = async () => {
    const text = editDraft.trim();
    if (!editingMessage || editingMessage.senderId !== user?.$id || !text) {
      if (editingMessage && editingMessage.senderId !== user?.$id) {
        Alert.alert('Not allowed', 'You can only edit your own messages.');
      }
      return;
    }
    try {
      const updated = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.messages,
        editingMessage.$id,
        { text },
      );
      setMessages((current) => current.map((message) => (
        message.$id === updated.$id ? updated : message
      )));
      setEditingMessage(null);
    } catch (error) {
      console.error('Could not edit message:', error);
      Alert.alert('Edit failed', error.message || 'Could not edit this message.');
    }
  };

  const searchResults = messageSearchText.trim().length >= 2 ? messageSearchResults : [];
  const detailItems = detailMessages.filter((message) => {
    const type = message.attachmentType || message.messageType || 'text';
    if (detailsTab === 'Media') return ['image', 'video'].includes(type);
    if (detailsTab === 'Documents') return type === 'document';
    return type === 'text' && /https?:\/\/[^\s]+/i.test(message.text || '');
  });

  const openMessageResult = (message) => {
    setMessageSearchVisible(false);
    setHighlightedMessageId(message.$id);
    const combinedMessages = [...new Map(
      [...messages, ...messageSearchResults].map((item) => [item.$id, item]),
    ).values()].sort((a, b) => new Date(a.$createdAt) - new Date(b.$createdAt));
    setMessages(combinedMessages);
    const data = [...combinedMessages].reverse();
    const index = data.findIndex((item) => item.$id === message.$id);
    if (index >= 0) {
      requestAnimationFrame(() => listRef.current?.scrollToIndex({
        index,
        animated: true,
        viewPosition: 0.5,
      }));
    }
    setTimeout(() => setHighlightedMessageId(''), 2500);
  };

  const openConversationDetails = () => {
    setMenuVisible(false);
    setDetailsTab('Media');
    setDetailMessages([]);
    setDetailOffset(0);
    setDetailHasMore(true);
    setDetailsVisible(true);
    loadDetailPage(true);
  };

  const loadDetailPage = async (reset = false) => {
    if (!chatId || !user?.$id || !otherId || detailsLoading) return;
    setDetailsLoading(true);
    try {
      await getChatForParticipants(chatId, user.$id, otherId);
      const offset = reset ? 0 : detailOffset;
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
        Query.equal('chatId', chatId),
        Query.orderDesc('$createdAt'),
        Query.limit(40),
        Query.offset(offset),
      ]);
      setDetailMessages((current) => reset ? result.documents : [...current, ...result.documents]);
      setDetailOffset(offset + result.documents.length);
      setDetailHasMore(result.documents.length === 40);
    } catch (error) {
      console.error('Could not load conversation media:', error);
      Alert.alert('Could not load conversation details', error.message || 'Please try again.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const openMediaViewer = (message) => {
    const type = message.attachmentType || message.messageType || 'text';
    const uri = message.attachmentUrl || message.text;
    if (uri && ['image', 'video'].includes(type)) setSelectedMedia({ type, uri });
  };

  const openLink = async (url) => {
    try {
      if (await Linking.canOpenURL(url)) await Linking.openURL(url);
      else Alert.alert('Cannot open link', 'This link is not supported on this device.');
    } catch (error) {
      console.error('Could not open shared link:', error);
      Alert.alert('Could not open link', error.message || 'Please try again.');
    }
  };

  const exportConversation = () => {
    setMenuVisible(false);
    if (!chatId || !user?.$id || !otherId) {
      Alert.alert('Export unavailable', 'Send the first message before exporting this conversation.');
      return;
    }
    Alert.alert(
      'Export chat?',
      'A text file containing messages from this conversation will be created and shared.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Export', onPress: async () => {
          if (actionBusy) return;
          setActionBusy(true);
          try {
            await getChatForParticipants(chatId, user.$id, otherId);
            const exportedMessages = [];
            let offset = 0;
            while (true) {
              const page = await databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
                Query.equal('chatId', chatId),
                Query.orderAsc('$createdAt'),
                Query.limit(100),
                Query.offset(offset),
              ]);
              exportedMessages.push(...page.documents);
              offset += page.documents.length;
              if (!page.documents.length || offset >= page.total) break;
            }
            const lines = exportedMessages.map((message) => {
              const sender = message.senderId === user.$id ? (user.name || 'You') : (otherUserDoc?.name || otherName);
              const timestamp = new Date(message.$createdAt).toLocaleString();
              const kind = message.attachmentType || message.messageType || 'text';
              const content = kind === 'text'
                ? message.text || ''
                : `${kind}: ${message.attachmentUrl || message.text || message.stickerUrl || ''}`;
              return `[${timestamp}] ${sender}: ${content}`;
            });
            const path = `${FileSystem.cacheDirectory}mzansireels-chat-${chatId}-${Date.now()}.txt`;
            await FileSystem.writeAsStringAsync(path, lines.join('\n'), { encoding: FileSystem.EncodingType.UTF8 });
            if (!(await Sharing.isAvailableAsync())) {
              throw new Error('File sharing is not available on this device.');
            }
            await Sharing.shareAsync(path, { mimeType: 'text/plain', dialogTitle: 'Export conversation' });
          } catch (error) {
            console.error('Could not export chat:', error);
            Alert.alert('Export failed', error.message || 'Could not export this conversation.');
          } finally {
            setActionBusy(false);
          }
        }},
      ],
    );
  };

  const clearLocalConversation = () => {
    setMenuVisible(false);
    if (!chatId || !user?.$id) {
      Alert.alert('Nothing to clear', 'This conversation has no saved message history yet.');
      return;
    }
    Alert.alert(
      'Clear chat on this device?',
      'This hides the current message history on this device only. It does not delete messages for the other participant.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear on this device', style: 'destructive', onPress: async () => {
          try {
            const clearedAt = Date.now();
            await AsyncStorage.setItem(localClearKey(user.$id, chatId), String(clearedAt));
            setLocalClearAt(clearedAt);
            setMessages([]);
          } catch (error) {
            console.error('Could not clear local chat history:', error);
            Alert.alert('Could not clear chat', error.message || 'Please try again.');
          }
        }},
      ],
    );
  };

  const saveMuteDuration = async (duration) => {
    if (!user?.$id || !chatId) {
      Alert.alert('Mute unavailable', 'Send the first message before changing notification preferences.');
      return;
    }
    setMuteSaving(true);
    try {
      const settings = JSON.parse((await AsyncStorage.getItem(muteSettingsKey(user.$id))) || '{}');
      const legacyMuted = JSON.parse((await AsyncStorage.getItem(`muted_chats_${user.$id}`)) || '[]');
      if (duration === null) {
        delete settings[chatId];
        setMutedUntil(null);
        await AsyncStorage.setItem(
          `muted_chats_${user.$id}`,
          JSON.stringify(legacyMuted.filter((id) => id !== chatId)),
        );
      } else {
        settings[chatId] = duration === -1 ? -1 : Date.now() + duration;
        setMutedUntil(settings[chatId]);
        const next = legacyMuted.includes(chatId) ? legacyMuted : [...legacyMuted, chatId];
        await AsyncStorage.setItem(`muted_chats_${user.$id}`, JSON.stringify(next));
      }
      await AsyncStorage.setItem(muteSettingsKey(user.$id), JSON.stringify(settings));
    } catch (error) {
      console.error('Could not update mute preference:', error);
      Alert.alert('Mute preference failed', error.message || 'Could not save this preference.');
    } finally {
      setMuteSaving(false);
    }
  };

  const saveChatTheme = async (themeId) => {
    if (!user?.$id || !chatId) {
      Alert.alert('Theme unavailable', 'Send the first message before changing this chat theme.');
      return;
    }
    try {
      await AsyncStorage.setItem(chatThemeKey(user.$id, chatId), themeId);
      setChatThemeId(themeId);
      setThemePickerVisible(false);
    } catch (error) {
      console.error('Could not save chat theme:', error);
      Alert.alert('Theme could not be saved', error.message || 'Please try again.');
    }
  };

  const toggleChatPin = async () => {
    setMenuVisible(false);
    if (!user?.$id || !chatId) {
      Alert.alert('Pin unavailable', 'Send the first message before pinning this conversation.');
      return;
    }
    try {
      const pinnedIds = JSON.parse((await AsyncStorage.getItem(pinnedChatsKey(user.$id))) || '[]');
      const next = pinnedIds.includes(chatId)
        ? pinnedIds.filter((id) => id !== chatId)
        : [...pinnedIds, chatId];
      await AsyncStorage.setItem(pinnedChatsKey(user.$id), JSON.stringify(next));
      setChatPinned(next.includes(chatId));
    } catch (error) {
      console.error('Could not update pinned conversation:', error);
      Alert.alert('Pin update failed', error.message || 'Could not save this preference.');
    }
  };

  const toggleBlockUser = () => {
    setMenuVisible(false);
    if (!user?.$id || !otherId) return;
    const isBlocked = Boolean(blockDocumentId);
    Alert.alert(
      isBlocked ? `Unblock ${otherName}?` : `Block ${otherName}?`,
      isBlocked
        ? 'This removes the block record from your account.'
        : 'This records the block in MzansiReels. The current backend does not yet enforce blocks on message writes.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: isBlocked ? 'Unblock' : 'Block', style: isBlocked ? 'default' : 'destructive', onPress: async () => {
          try {
            if (isBlocked) {
              await databases.deleteDocument(DATABASE_ID, COLLECTIONS.blocks, blockDocumentId);
              setBlockDocumentId('');
            } else {
              const block = await blockUser(user.$id, otherId);
              setBlockDocumentId(block.$id);
            }
          } catch (error) {
            console.error('Could not update block preference:', error);
            Alert.alert('Block update failed', error.message || 'Please try again.');
          }
        }},
      ],
    );
  };

  const showBackendRequirement = (feature) => {
    setMenuVisible(false);
    Alert.alert(
      `${feature} not configured`,
      'This feature needs a verified Appwrite schema and server-side enforcement. It is not enabled rather than presenting a client-only control as secure.',
    );
  };

  const formatTime = (isoString) => new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const toggleEmojiPicker = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (showEmojiPicker) {
      setShowEmojiPicker(false);
      return;
    }
    Keyboard.dismiss();
    setShowEmojiPicker(true);
  };

  const handleEmojiSelected = ({ emoji }) => {
    const next = `${newMessage}${emoji}`;
    setNewMessage(next);
    handleTyping(next);
  };

  const closeEmojiPicker = () => {
    if (showEmojiPicker) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShowEmojiPicker(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: chatTheme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: chatTheme.background, borderBottomColor: appColors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 15 }}><Ionicons name="arrow-back" size={26} color={appColors.text} /></TouchableOpacity>
        <TouchableOpacity
          onPress={() => otherId && navigation.navigate('UserProfile', {
            userId: otherId,
            userName: otherUserDoc?.username || otherName,
          })}
          disabled={!otherId}
          accessibilityRole="button"
          accessibilityLabel={`View ${headerName}'s profile`}
        >
          <Avatar uri={otherUserDoc?.avatarUrl || otherUserAvatar} userId={otherId} name={headerName} size={40} style={{ marginRight: 10 }} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            style={styles.chatNameRow}
            onPress={() => otherId && navigation.navigate('UserProfile', {
              userId: otherId,
              userName: otherUserDoc?.username || otherName,
            })}
            disabled={!otherId}
            accessibilityRole="button"
            accessibilityLabel={`View ${headerName}'s profile`}
          >
            <Text style={[styles.headerTitle, { color: appColors.text }]}>{headerName}</Text>
            {otherUserDoc?.isVerified === true ? (
              <Ionicons name="checkmark-circle" size={16} color={COLORS.cyan} />
            ) : null}
          </TouchableOpacity>
          <Text style={[styles.headerStatus, { color: appColors.muted }]}>
            {headerUsername || 'Direct messages'}
            {otherUserDoc?.isOnline ? `${headerUsername ? ' · ' : ''}Online` : ''}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={() => showCallUnavailable('Audio')}
            accessibilityRole="button"
            accessibilityLabel="Audio call unavailable"
          >
            <Ionicons name="call-outline" size={20} color={chatTheme.outgoing} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={() => showCallUnavailable('Video')}
            accessibilityRole="button"
            accessibilityLabel="Video call unavailable"
          >
            <Ionicons name="videocam-outline" size={21} color={chatTheme.outgoing} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerActionButton}
            onPress={() => setMenuVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Chat options"
          >
            <Ionicons name="ellipsis-vertical" size={21} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {messageError ? (
        <View style={[styles.messageError, styles.flexArea]}>
          <Ionicons name="cloud-offline-outline" size={40} color={COLORS.muted} />
          <Text style={styles.messageErrorText}>{messageError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchMessages}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : messagesLoading && messages.length === 0 ? (
        <View style={[styles.messageError, styles.flexArea]}>
          <ActivityIndicator size="large" color={COLORS.cyan} />
        </View>
      ) : (
          <FlatList
            ref={listRef}
            style={styles.messagesList}
            data={[...messages].reverse()}
            inverted
            keyExtractor={(item) => item.$id}
            onEndReached={loadOlderMessages}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingOlderMessages
              ? <ActivityIndicator size="small" color={COLORS.cyan} />
              : null}
            onScrollToIndexFailed={({ averageItemLength, index }) => {
              listRef.current?.scrollToOffset({ offset: averageItemLength * index, animated: true });
            }}
            contentContainerStyle={{ padding: 15, paddingBottom: 20 }}
            renderItem={({ item }) => {
              if (item.expiresAt && new Date(item.expiresAt).getTime() <= Date.now()) return null;
              const isMe = item.senderId === user?.$id;
              const attachmentType = item.attachmentType || item.messageType || 'text';
              const attachmentUrl = item.attachmentUrl;
              const isSticker = attachmentType === 'sticker' || Boolean(item.stickerUrl);
              const isImage = attachmentType === 'image';
              const isVideo = attachmentType === 'video';
              const isAudio = attachmentType === 'audio';
              const repliedMessage = item.replyToId
                ? messages.find((message) => message.$id === item.replyToId)
                : null;

              return (
                <TouchableOpacity
                  style={[
                    styles.bubble,
                    isSticker && styles.stickerBubble,
                    !isSticker && (isMe ? styles.mine : styles.theirs),
                    !isSticker && { backgroundColor: isMe ? chatTheme.outgoing : chatTheme.incoming },
                    item.$id === highlightedMessageId && styles.highlightedBubble,
                  ]}
                  onLongPress={(event) => openMessageActions(item, event.nativeEvent)}
                  delayLongPress={250}
                >
                  {item.replyToId ? (
                    <View style={styles.replyPreview}>
                      <Text style={styles.replyPreviewName} numberOfLines={1}>
                        {repliedMessage?.senderId === user?.$id ? 'You' : otherName}
                      </Text>
                      <Text style={styles.replyPreviewText} numberOfLines={2}>
                        {repliedMessage?.text
                          || (repliedMessage
                            ? `${repliedMessage.attachmentType || 'Media'} message`
                            : 'Original message unavailable')}
                      </Text>
                    </View>
                  ) : null}
                  {isSticker && item.stickerUrl ? (
                    <Image source={{ uri: item.stickerUrl }} style={styles.stickerMsg} />
                  ) : null}
                  {item.text ? (
                    <Text style={[styles.text, isMe ? { color: chatTheme.outgoingText } : { color: appColors.text }]}>
                      {messageSearchText.trim() && item.text?.toLowerCase().includes(messageSearchText.trim().toLowerCase())
                        ? renderHighlightedText(item.text, messageSearchText.trim())
                        : item.text}
                    </Text>
                  ) : null}
                  {attachmentUrl && isImage ? <Image source={{ uri: attachmentUrl }} style={styles.imageMsg} /> : null}
                  {attachmentUrl && isVideo ? <ChatVideoMessage uri={attachmentUrl} /> : null}
                  {attachmentUrl && isAudio ? <ChatAudioMessage uri={attachmentUrl} /> : null}
                  <View style={styles.messageMeta}>
                    <Text style={[styles.time, isMe ? { color: 'rgba(0,0,0,0.6)' } : { color: COLORS.muted }]}>{formatTime(item.$createdAt)}</Text>
                    {isMe ? (
                      <Ionicons
                        name={item.isRead ? 'checkmark-done' : 'checkmark'}
                        size={14}
                        color={item.isRead ? '#087D91' : chatTheme.outgoingText}
                      />
                    ) : null}
                  </View>
                  {item.reactions ? (
                    <View style={styles.reactionBadge}>
                      <Text style={styles.reactionBadgeText}>{item.reactions}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={{ color: COLORS.muted, textAlign: 'center', marginTop: 50 }}>Say hi to start the conversation.</Text>}
          />
      )}
      {showEmojiPicker && !recordingVoiceNote ? (
        <View style={styles.emojiPickerContainer}>
          <EmojiKeyboard
            onEmojiSelected={handleEmojiSelected}
            allowMultipleSelections
            enableSearchBar
            disableSafeArea
            theme={EMOJI_THEME}
          />
        </View>
      ) : null}
      <View style={[
        styles.composerContainer,
        { backgroundColor: chatTheme.background, borderTopColor: appColors.border },
        { paddingBottom: systemKeyboardVisible || showEmojiPicker ? 0 : Math.max(insets.bottom, 10) },
      ]}>
        {replyingTo ? (
          <View style={styles.replyingBanner}>
            <View style={styles.replyingCopy}>
              <Text style={styles.replyingTitle}>
                Replying to {replyingTo.senderId === user?.$id ? 'yourself' : otherName}
              </Text>
              <Text style={styles.replyingText} numberOfLines={1}>
                {replyingTo.text || `${replyingTo.attachmentType || 'Media'} message`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.cancelReplyButton}
              onPress={() => setReplyingTo(null)}
              accessibilityRole="button"
              accessibilityLabel="Cancel reply"
            >
              <Ionicons name="close" size={19} color="#AAB3BF" />
            </TouchableOpacity>
          </View>
        ) : null}
        {sendError ? <Text style={styles.sendErrorText}>{sendError}</Text> : null}
        <View style={styles.inputContainer}>
          <ChatInputBar
            value={newMessage}
            onChangeText={(text) => {
              setNewMessage(text);
              setSendError('');
              handleTyping(text);
            }}
            onInputFocus={closeEmojiPicker}
            showEmojiPicker={showEmojiPicker}
            onToggleEmojiPicker={toggleEmojiPicker}
            onSend={() => sendMessage(newMessage)}
            onAttachment={pickAttachment}
            onVoiceNote={startVoiceNote}
            onStickerPress={() => {
              closeEmojiPicker();
              setStickerPickerVisible(true);
            }}
            recording={recordingVoiceNote}
            recordingSeconds={recordingSeconds}
            onStopRecording={() => stopVoiceNote()}
            onDiscardRecording={() => stopVoiceNote(true)}
            sending={sendingMessage || uploadingAttachment}
            disabled={!otherId || !user?.$id}
          />
        </View>
        {uploadingAttachment ? (
          <View style={styles.attachmentProgress}>
            <ActivityIndicator size="small" color={COLORS.cyan} />
            <Text style={styles.typingIndicator}>
              Uploading attachment{attachmentProgress > 0 ? ` ${attachmentProgress}%` : '…'}
            </Text>
          </View>
        ) : null}
        {isOtherTyping && (
          <Text style={styles.typingIndicator}>{otherName || 'User'} is typing...</Text>
        )}
      </View>
      <ChatMenuBottomSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        userId={otherId}
        name={otherName}
        username={otherUserDoc?.username}
        avatarUrl={otherUserDoc?.avatarUrl || otherUserAvatar}
        isMuted={Boolean(mutedUntil === -1 || mutedUntil > Date.now())}
        isPinned={chatPinned}
        isBlocked={Boolean(blockDocumentId)}
        actionBusy={actionBusy || muteSaving}
        onViewProfile={() => {
          setMenuVisible(false);
          if (otherId) navigation.navigate('UserProfile', {
            userId: otherId,
            userName: otherUserDoc?.username || otherName,
          });
        }}
        onSearchMessages={() => {
          setMenuVisible(false);
          setMessageSearchText('');
          setMessageSearchVisible(true);
        }}
        onViewMedia={openConversationDetails}
        onExportChat={exportConversation}
        onMute={(duration) => {
          setMenuVisible(false);
          saveMuteDuration(duration);
        }}
        onPin={toggleChatPin}
        onTheme={() => {
          setMenuVisible(false);
          setThemePreviewId(chatThemeId);
          setThemePickerVisible(true);
        }}
        onClearChat={clearLocalConversation}
        onBlock={toggleBlockUser}
        onReport={() => showBackendRequirement('User reports')}
        onDisappearingMessages={() => showBackendRequirement('Disappearing messages')}
        onLockChat={() => showBackendRequirement('Chat lock')}
        onAudioCall={() => {
          setMenuVisible(false);
          showCallUnavailable('Audio');
        }}
        onVideoCall={() => {
          setMenuVisible(false);
          showCallUnavailable('Video');
        }}
      />
      <MessageContextMenu
        visible={messageContextMenuVisible}
        message={contextMessage}
        anchor={contextAnchor}
        senderName={contextMessage?.senderId === user?.$id
          ? user?.name || 'You'
          : otherUserDoc?.name || otherName}
        senderAvatarUrl={contextMessage?.senderId === user?.$id
          ? user?.avatarUrl
          : otherUserDoc?.avatarUrl || otherUserAvatar}
        isOwnMessage={contextMessage?.senderId === user?.$id}
        onClose={() => setMessageContextMenuVisible(false)}
        onReact={reactToMessage}
        onReply={(message) => {
          setReplyingTo(message);
          closeEmojiPicker();
        }}
        onCopy={copyMessage}
        onForward={forwardMessage}
        onEdit={editMessage}
        onDelete={confirmDeleteMessage}
      />
      <Modal
        visible={messageSearchVisible}
        animationType="slide"
        onRequestClose={() => setMessageSearchVisible(false)}
      >
        <View style={[styles.detailScreen, { paddingTop: insets.top }]}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setMessageSearchVisible(false)} style={styles.detailBack}>
              <Ionicons name="arrow-back" size={23} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.detailTitle}>Search messages</Text>
          </View>
          <View style={styles.detailSearchBar}>
            <Ionicons name="search" size={18} color="#8B95A7" />
            <TextInput
              style={styles.detailSearchInput}
              value={messageSearchText}
              onChangeText={setMessageSearchText}
              placeholder="Search in this conversation"
              placeholderTextColor="#8B95A7"
              autoFocus
              accessibilityLabel="Search messages in this conversation"
            />
            {messageSearchText ? (
              <TouchableOpacity onPress={() => setMessageSearchText('')} accessibilityLabel="Clear message search">
                <Ionicons name="close-circle" size={19} color="#8B95A7" />
              </TouchableOpacity>
            ) : null}
          </View>
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.$id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.searchResult} onPress={() => openMessageResult(item)}>
                <Text numberOfLines={2} style={styles.searchResultText}>
                  {renderHighlightedText(item.text || (item.attachmentType || item.messageType || 'Message'), messageSearchText.trim())}
                </Text>
                <Text style={styles.searchResultTime}>{formatTime(item.$createdAt)}</Text>
              </TouchableOpacity>
            )}
            ListHeaderComponent={messageSearchLoading ? (
              <ActivityIndicator size="small" color={COLORS.cyan} style={styles.detailLoader} />
            ) : null}
            ListEmptyComponent={(
              <Text style={styles.detailEmptyText}>
                {messageSearchError
                  || (messageSearchText.trim().length < 2
                    ? 'Enter at least 2 characters to search this conversation.'
                    : messageSearchLoading ? 'Searching messages…' : 'No matching messages in this conversation.')}
              </Text>
            )}
          />
        </View>
      </Modal>
      <Modal
        visible={detailsVisible}
        animationType="slide"
        onRequestClose={() => setDetailsVisible(false)}
      >
        <View style={[styles.detailScreen, { paddingTop: insets.top }]}>
          <View style={styles.detailHeader}>
            <TouchableOpacity onPress={() => setDetailsVisible(false)} style={styles.detailBack}>
              <Ionicons name="arrow-back" size={23} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.detailTitle}>Media, links & files</Text>
          </View>
          <View style={styles.detailTabs}>
            {['Media', 'Links', 'Documents'].map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.detailTab, detailsTab === tab && styles.detailTabActive]}
                onPress={() => setDetailsTab(tab)}
                accessibilityRole="tab"
                accessibilityState={{ selected: detailsTab === tab }}
              >
                <Text style={[styles.detailTabText, detailsTab === tab && styles.detailTabTextActive]}>{tab}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView contentContainerStyle={styles.detailContent}>
            {detailItems.map((message) => {
              const type = message.attachmentType || message.messageType || 'text';
              const uri = message.attachmentUrl || message.text || '';
              if (detailsTab === 'Links') {
                const links = (message.text || '').match(LINK_PATTERN) || [];
                return links.map((url, index) => (
                  <TouchableOpacity
                    key={`${message.$id}-${index}`}
                    style={styles.linkRow}
                    onPress={() => openLink(url)}
                    accessibilityRole="link"
                  >
                    <Ionicons name="link-outline" size={20} color={COLORS.cyan} />
                    <View style={styles.linkCopy}>
                      <Text style={styles.linkText} numberOfLines={2}>{url}</Text>
                      <Text style={styles.searchResultTime}>{formatTime(message.$createdAt)}</Text>
                    </View>
                    <Ionicons name="open-outline" size={17} color="#8B95A7" />
                  </TouchableOpacity>
                ));
              }
              if (detailsTab === 'Documents') {
                return (
                  <TouchableOpacity
                    key={message.$id}
                    style={styles.linkRow}
                    onPress={() => openLink(uri)}
                  >
                    <Ionicons name="document-outline" size={20} color={COLORS.cyan} />
                    <View style={styles.linkCopy}>
                      <Text style={styles.linkText} numberOfLines={1}>{message.text || uri}</Text>
                      <Text style={styles.searchResultTime}>{formatTime(message.$createdAt)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={message.$id}
                  style={styles.mediaTile}
                  onPress={() => openMediaViewer(message)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open shared ${type}`}
                >
                  {type === 'image' ? (
                    <Image source={{ uri }} style={styles.mediaThumbnail} />
                  ) : (
                    <View style={styles.videoThumbnail}>
                      <Ionicons name="play-circle" size={38} color="#fff" />
                    </View>
                  )}
                  <Text style={styles.mediaDate}>{new Date(message.$createdAt).toLocaleDateString()}</Text>
                </TouchableOpacity>
              );
            })}
            {detailsLoading ? <ActivityIndicator color={COLORS.cyan} style={styles.detailLoader} /> : null}
            {detailHasMore ? (
              <TouchableOpacity
                style={styles.loadMoreButton}
                onPress={() => loadDetailPage()}
                disabled={detailsLoading}
              >
                <Text style={styles.loadMoreText}>{detailsLoading ? 'Loading…' : 'Load older items'}</Text>
              </TouchableOpacity>
            ) : null}
            {!detailsLoading && detailItems.length === 0 && !detailHasMore ? (
              <Text style={styles.detailEmptyText}>
                {detailsTab === 'Documents'
                  ? 'No document attachments are available in this chat.'
                  : detailsTab === 'Links' ? 'No shared links yet.' : 'No shared photos or videos yet.'}
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
      <Modal
        visible={Boolean(selectedMedia)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedMedia(null)}
      >
        <View style={styles.mediaViewer}>
          <TouchableOpacity
            style={styles.mediaClose}
            onPress={() => setSelectedMedia(null)}
            accessibilityLabel="Close media viewer"
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          {selectedMedia?.type === 'image' ? (
            <Image source={{ uri: selectedMedia.uri }} style={styles.fullImage} resizeMode="contain" />
          ) : selectedMedia?.type === 'video' ? (
            <ChatVideoMessage uri={selectedMedia.uri} fullscreen />
          ) : null}
        </View>
      </Modal>
      <Modal
        visible={themePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setThemePreviewId(chatThemeId);
          setThemePickerVisible(false);
        }}
      >
        <View style={styles.editBackdrop}>
          <View style={styles.themeCard}>
            <Text style={styles.editTitle}>Chat theme</Text>
            <Text style={styles.themeDescription}>Preview a look for this conversation only.</Text>
            <View style={[styles.themePreview, { backgroundColor: chatTheme.background }]}>
              <View style={[styles.themeBubble, { backgroundColor: chatTheme.incoming, alignSelf: 'flex-start' }]} />
              <View style={[styles.themeBubble, { backgroundColor: chatTheme.outgoing, alignSelf: 'flex-end' }]} />
            </View>
            <ScrollView style={styles.themeOptions}>
              {Object.entries(CHAT_THEMES).map(([id, theme]) => (
                <TouchableOpacity
                  key={id}
                  style={[styles.themeOption, themePreviewId === id && styles.themeOptionSelected]}
                  onPress={() => setThemePreviewId(id)}
                >
                  <View style={[styles.themeSwatch, { backgroundColor: theme.outgoing }]} />
                  <Text style={styles.themeOptionText}>{theme.label}</Text>
                  {themePreviewId === id ? <Ionicons name="checkmark" size={19} color={COLORS.cyan} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.editActions}>
              <TouchableOpacity onPress={() => {
                setThemePreviewId(chatThemeId);
                setThemePickerVisible(false);
              }}>
                <Text style={styles.editCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editSaveButton}
                onPress={() => saveChatTheme(themePreviewId)}
              >
                <Text style={styles.editSave}>Apply theme</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <StickerPicker
        visible={stickerPickerVisible}
        onClose={() => setStickerPickerVisible(false)}
        onSelect={sendSticker}
      />
      <Modal
        visible={Boolean(editingMessage)}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingMessage(null)}
      >
        <View style={styles.editBackdrop}>
          <View style={styles.editCard}>
            <Text style={styles.editTitle}>Edit message</Text>
            <TextInput
              style={styles.editInput}
              value={editDraft}
              onChangeText={setEditDraft}
              multiline
              autoFocus
              accessibilityLabel="Edit message text"
            />
            <View style={styles.editActions}>
              <TouchableOpacity onPress={() => setEditingMessage(null)}>
                <Text style={styles.editCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.editSaveButton}
                onPress={saveEditedMessage}
                disabled={!editDraft.trim()}
              >
                <Text style={styles.editSave}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  flexArea: { flex: 1 },
  messagesList: { flex: 1 },
  messageError: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  messageErrorText: { color: COLORS.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 12 },
  retryButton: { backgroundColor: COLORS.cyan, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 10, marginTop: 16 },
  retryButtonText: { color: '#000', fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7, marginLeft: 8 },
  headerActionButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: COLORS.card },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  chatNameRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5 },
  headerStatus: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  bubble: { maxWidth: '80%', padding: 8, borderRadius: 20, marginBottom: 10 },
  highlightedBubble: { borderWidth: 2, borderColor: '#FFFFFF' },
  mine: { backgroundColor: COLORS.cyan, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { backgroundColor: COLORS.card, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  stickerBubble: { padding: 2, backgroundColor: 'transparent' },
  replyPreview: { minWidth: 160, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 6, borderLeftWidth: 3, borderLeftColor: '#00BFD5', borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.12)' },
  replyPreviewName: { color: '#00BFD5', fontSize: 11, fontWeight: '800' },
  replyPreviewText: { color: '#E5E9ED', fontSize: 11, marginTop: 2 },
  text: { fontSize: 16, marginBottom: 4, paddingHorizontal: 4 },
  time: { fontSize: 10, alignSelf: 'flex-end', fontWeight: '500', paddingHorizontal: 4 },
  messageMeta: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 2 },
  reactionBadge: { position: 'absolute', right: 7, bottom: -7, minWidth: 27, height: 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderWidth: 1, borderColor: '#343A42', borderRadius: 13, backgroundColor: '#20242B' },
  reactionBadgeText: { color: '#FFFFFF', fontSize: 14 },
  imageMsg: { width: 200, height: 200, borderRadius: 15, marginBottom: 4 },
  videoMessage: { width: 220, height: 220, borderRadius: 15, overflow: 'hidden', backgroundColor: '#080A0F', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  fullVideoMessage: { width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', borderRadius: 0, marginBottom: 0 },
  videoPreview: { width: '100%', height: '100%' },
  fullVideoPreview: { width: '100%', height: '100%' },
  videoPlayIcon: { position: 'absolute', width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  videoError: { position: 'absolute', color: '#fff', textAlign: 'center', padding: 14 },
  audioMessage: { width: 210, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 },
  audioPlayButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#0B0D12', alignItems: 'center', justifyContent: 'center' },
  audioProgressTrack: { flex: 1, height: 4, borderRadius: 3, backgroundColor: '#737D89', overflow: 'hidden' },
  audioProgressFill: { height: '100%', backgroundColor: COLORS.cyan },
  audioError: { color: COLORS.pink, fontSize: 11 },
  stickerMsg: { width: 150, height: 150, borderRadius: 12, marginBottom: 4 },
  composerContainer: { borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.bg },
  replyingBanner: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 10, marginTop: 8, paddingLeft: 11, paddingRight: 7, borderLeftWidth: 3, borderLeftColor: COLORS.cyan, borderRadius: 10, backgroundColor: '#171A21' },
  replyingCopy: { flex: 1, paddingVertical: 7 },
  replyingTitle: { color: COLORS.cyan, fontSize: 11, fontWeight: '800' },
  replyingText: { color: '#D5DCE2', fontSize: 12, marginTop: 3 },
  cancelReplyButton: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center' },
  inputContainer: { paddingHorizontal: 10, paddingTop: 10 },
  sendErrorText: { color: COLORS.pink, fontSize: 12, paddingHorizontal: 20, paddingTop: 6 },
  emojiPickerContainer: { height: 300, paddingHorizontal: 10, paddingTop: 8, backgroundColor: '#151820' },
  typingIndicator: { color: COLORS.muted, fontSize: 12, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  attachmentProgress: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6 },
  searchHighlight: { color: '#061116', backgroundColor: COLORS.cyan, fontWeight: '800' },
  detailScreen: { flex: 1, backgroundColor: '#0B0D12' },
  detailHeader: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#252A35',
  },
  detailBack: { width: 42, height: 42, justifyContent: 'center' },
  detailTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  detailSearchBar: {
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginHorizontal: 15,
    marginVertical: 12,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: '#151820',
  },
  detailSearchInput: { flex: 1, color: '#fff', fontSize: 14 },
  searchResult: { minHeight: 62, paddingHorizontal: 17, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#252A35' },
  searchResultText: { color: '#F3F5F7', fontSize: 14, lineHeight: 20 },
  searchResultTime: { color: '#8B95A7', fontSize: 11, marginTop: 6 },
  detailEmptyText: { color: '#8B95A7', fontSize: 13, textAlign: 'center', marginTop: 35, paddingHorizontal: 25 },
  detailTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#252A35' },
  detailTab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  detailTabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.cyan },
  detailTabText: { color: '#8B95A7', fontSize: 13, fontWeight: '700' },
  detailTabTextActive: { color: COLORS.cyan },
  detailContent: { flexDirection: 'row', flexWrap: 'wrap', padding: 10, paddingBottom: 35 },
  mediaTile: { width: '33.333%', padding: 4 },
  mediaThumbnail: { width: '100%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#151820' },
  videoThumbnail: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#151820' },
  mediaDate: { color: '#8B95A7', fontSize: 9, marginTop: 3 },
  linkRow: { width: '100%', minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 9, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#252A35' },
  linkCopy: { flex: 1 },
  linkText: { color: '#00E5FF', fontSize: 13, lineHeight: 18 },
  detailLoader: { width: '100%', marginVertical: 14 },
  loadMoreButton: { width: '100%', alignItems: 'center', paddingVertical: 15 },
  loadMoreText: { color: COLORS.cyan, fontSize: 13, fontWeight: '700' },
  mediaViewer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  mediaClose: { position: 'absolute', top: 45, right: 18, zIndex: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '100%' },
  themeCard: { maxHeight: '88%', padding: 18, borderWidth: 1, borderColor: '#252A35', borderRadius: 18, backgroundColor: '#151820' },
  themeDescription: { color: '#8B95A7', fontSize: 12, marginTop: -7, marginBottom: 12 },
  themePreview: { minHeight: 90, justifyContent: 'center', gap: 9, padding: 12, borderRadius: 12, marginBottom: 10 },
  themeBubble: { width: '62%', height: 18, borderRadius: 10 },
  themeOptions: { maxHeight: 260 },
  themeOption: { minHeight: 45, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, borderRadius: 9 },
  themeOptionSelected: { backgroundColor: '#252A35' },
  themeSwatch: { width: 16, height: 16, borderRadius: 8, marginRight: 11 },
  themeOptionText: { flex: 1, color: '#F3F5F7', fontSize: 13 },
  editBackdrop: { flex: 1, justifyContent: 'center', paddingHorizontal: 22, backgroundColor: 'rgba(0,0,0,0.72)' },
  editCard: { padding: 18, borderWidth: 1, borderColor: '#252A35', borderRadius: 18, backgroundColor: '#151820' },
  editTitle: { color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 13 },
  editInput: { minHeight: 90, maxHeight: 180, padding: 12, borderWidth: 1, borderColor: '#303642', borderRadius: 12, color: '#fff', backgroundColor: '#0B0D12', textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 20, marginTop: 16 },
  editCancel: { color: '#AAB1BA', fontSize: 14, fontWeight: '700' },
  editSaveButton: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18, backgroundColor: COLORS.cyan },
  editSave: { color: '#071014', fontSize: 13, fontWeight: '800' },
});