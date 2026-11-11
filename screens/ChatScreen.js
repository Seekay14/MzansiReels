import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, Alert, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { client, databases, storage, ID, Permission, Role, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, BUCKET_ID, COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { getFileViewUrl, getUserDoc, notify } from '../config/helpers';
import {
  fetchMessages as loadChatMessages,
  getOrCreateChat,
  sendMessage as createChatMessage,
  sendStickerMessage,
} from '../config/chatService';
import Avatar from '../components/Avatar';
import StickerPicker from '../components/StickerPicker';

const POLL_MS = 4000;

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
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [stickerPickerVisible, setStickerPickerVisible] = useState(false);
  const [chatId, setChatId] = useState(initialChatId || null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messageError, setMessageError] = useState('');
  const [otherUserDoc, setOtherUserDoc] = useState(null);
  const listRef = useRef(null);
  const typingTimer = useRef(null);
  const typingDocumentIds = useRef(new Map());
  const typingWriteQueue = useRef(Promise.resolve());
  const publishedTypingState = useRef(false);

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
    if (chatId || !otherId || !user?.$id) return undefined;
    let active = true;
    getOrCreateChat(user.$id, otherId)
      .then((chat) => {
        if (active) setChatId(chat.$id);
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
      .then(async () => {
        let documentId = typingDocumentIds.current.get(chatId);
        if (!documentId) {
          const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.typingStatus, [
            Query.equal('chatId', chatId),
            Query.equal('userId', user.$id),
            Query.limit(1),
          ]);
          documentId = result.documents[0]?.$id || null;
          if (documentId) typingDocumentIds.current.set(chatId, documentId);
        }

        if (!documentId && !isTyping) return;

        if (documentId) {
          await databases.updateDocument(
            DATABASE_ID,
            COLLECTIONS.typingStatus,
            documentId,
            { isTyping },
            [
              Permission.read(Role.user(otherId)),
              Permission.update(Role.user(user.$id)),
              Permission.delete(Role.user(user.$id)),
            ],
          );
        } else {
          const document = await databases.createDocument(
            DATABASE_ID,
            COLLECTIONS.typingStatus,
            ID.unique(),
            { chatId, userId: user.$id, isTyping },
            [
              Permission.read(Role.user(otherId)),
              Permission.update(Role.user(user.$id)),
              Permission.delete(Role.user(user.$id)),
            ],
          );
          typingDocumentIds.current.set(chatId, document.$id);
        }
      })
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
    if (!chatId || !otherId || !user?.$id) {
      setMessagesLoading(false);
      if (!otherId || !user?.$id) setMessageError('This conversation could not be opened.');
      return;
    }
    setMessageError('');
    try {
      const fetchedMessages = await loadChatMessages(chatId);
      setMessages(fetchedMessages);
      const unreadMessages = fetchedMessages.filter(
        (message) => message.receiverId === user.$id && message.isRead === false,
      );
      await Promise.all(unreadMessages.map((message) => (
        databases.updateDocument(DATABASE_ID, COLLECTIONS.messages, message.$id, { isRead: true })
      )));
      if (unreadMessages.length) {
        const unreadIds = new Set(unreadMessages.map((message) => message.$id));
        setMessages((current) => current.map((message) => (
          unreadIds.has(message.$id) ? { ...message, isRead: true } : message
        )));
      }
    } catch (error) {
      console.error(error);
      setMessageError('Failed to load messages. Please try again.');
    } finally {
      setMessagesLoading(false);
    }
  }, [user?.$id, otherId, chatId]);

  useFocusEffect(useCallback(() => {
    fetchMessages();
    if (!chatId || !otherId || !user?.$id) return undefined;
    const timer = setInterval(fetchMessages, POLL_MS);
    return () => clearInterval(timer);
  }, [chatId, fetchMessages, otherId, user?.$id]));

  const sendMessage = async () => {
    const text = newMessage.trim();
    if (!text || !user?.$id || !otherId) return;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = null;
    publishedTypingState.current = false;
    await persistTypingStatus(false);
    setNewMessage('');
    let optimisticId;
    try {
      if (!chatId) throw new Error('Chat is still loading. Please try again.');
      optimisticId = `local-${Date.now()}`;
      const optimisticMessage = {
        $id: optimisticId,
        $createdAt: new Date().toISOString(),
        chatId,
        senderId: user.$id,
        receiverId: otherId,
        text,
        isRead: false,
      };
      setMessages((prev) => [...prev, optimisticMessage]);
      const doc = await createChatMessage(chatId, user.$id, otherId, text);
      setMessages((prev) => prev.map((message) => (
        message.$id === optimisticId ? doc : message
      )));
      await notify(otherId, user.name, 'message', user.avatarUrl);
    } catch (error) {
      console.error(error);
      if (optimisticId) {
        setMessages((prev) => prev.filter((message) => message.$id !== optimisticId));
      }
      setNewMessage(text);
      Alert.alert('Error', error.message || 'Failed to send message.');
    }
  };

  const sendSticker = async (stickerUrl) => {
    setStickerPickerVisible(false);
    if (!chatId || !user?.$id || !otherId) {
      Alert.alert('Please wait', 'Your chat is still being set up.');
      return;
    }

    const optimisticId = `local-sticker-${Date.now()}`;
    setMessages((current) => [...current, {
      $id: optimisticId,
      $createdAt: new Date().toISOString(),
      chatId,
      senderId: user.$id,
      receiverId: otherId,
      text: '',
      messageType: 'sticker',
      stickerUrl,
      isRead: false,
    }]);
    try {
      const savedMessage = await sendStickerMessage(chatId, user.$id, otherId, stickerUrl);
      setMessages((current) => current.map((message) => (
        message.$id === optimisticId ? savedMessage : message
      )));
      await notify(otherId, user.name, 'message', user.avatarUrl);
    } catch (error) {
      console.error('Could not send sticker:', error);
      setMessages((current) => current.filter((message) => message.$id !== optimisticId));
      Alert.alert('Error', error.message || 'Could not send sticker.');
    }
  };

  const pickImage = async () => {
    if (!chatId || !user?.$id || !otherId) {
      Alert.alert('Please wait', 'Your chat is still being set up.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (result.canceled) return;
    
    const asset = result.assets[0];
    try {
      const fileId = ID.unique();
      const file = await storage.createFile(BUCKET_ID, fileId, {
        name: 'chat_image.jpg', type: 'image/jpeg', size: asset.fileSize, uri: asset.uri,
      });
      const imageUrl = getFileViewUrl(fileId);
      if (!chatId) throw new Error('Chat is still loading. Please try again.');
      const doc = await createChatMessage(chatId, user.$id, otherId, imageUrl, 'image');
      setMessages((prev) => [...prev, doc]);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', error.message || 'Could not send image.');
    }
  };

  const deleteMessage = (msgId) => {
    Alert.alert('Delete Message', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await databases.deleteDocument(DATABASE_ID, COLLECTIONS.messages, msgId);
          setMessages((prev) => prev.filter((m) => m.$id !== msgId));
        } catch (error) {
          console.error(error);
          Alert.alert('Error', error.message || 'Could not delete message.');
        }
      }},
    ]);
  };

  const formatTime = (isoString) => new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 15 }}><Ionicons name="arrow-back" size={26} color="#fff" /></TouchableOpacity>
        <TouchableOpacity
          onPress={() => otherId && navigation.navigate('UserProfile', {
            userId: otherId,
            userName: otherUserDoc?.username || otherName,
          })}
          disabled={!otherId}
          accessibilityRole="button"
          accessibilityLabel={`View ${otherName}'s profile`}
        >
          <Avatar uri={otherUserDoc?.avatarUrl || otherUserAvatar} userId={otherId} name={otherName} size={40} style={{ marginRight: 10 }} />
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
            accessibilityLabel={`View ${otherName}'s profile`}
          >
            <Text style={styles.headerTitle}>{otherName}</Text>
            {otherUserDoc?.isVerified === true ? (
              <Ionicons name="checkmark-circle" size={16} color={COLORS.cyan} />
            ) : null}
          </TouchableOpacity>
          <Text style={styles.headerStatus}>Direct messages</Text>
        </View>
      </View>

      {messageError ? (
        <View style={styles.messageError}>
          <Ionicons name="cloud-offline-outline" size={40} color={COLORS.muted} />
          <Text style={styles.messageErrorText}>{messageError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchMessages}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : messagesLoading && messages.length === 0 ? (
        <View style={styles.messageError}>
          <ActivityIndicator size="large" color={COLORS.cyan} />
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={[...messages].reverse()}
            inverted
            keyExtractor={(item) => item.$id}
            contentContainerStyle={{ padding: 15, paddingBottom: 20 }}
            renderItem={({ item }) => {
              const isMe = item.senderId === user?.$id;
              const isSticker = item.messageType === 'sticker';
              const isImage = item.messageType === 'image' || item.text?.startsWith('http');

              return (
                <TouchableOpacity
                  style={[
                    styles.bubble,
                    isSticker && styles.stickerBubble,
                    !isSticker && (isMe ? styles.mine : styles.theirs),
                  ]}
                  onLongPress={() => isMe && deleteMessage(item.$id)}
                >
                  {isSticker ? (
                    <Image source={{ uri: item.stickerUrl }} style={styles.stickerMsg} />
                  ) : isImage ? (
                    <Image source={{ uri: item.text }} style={styles.imageMsg} />
                  ) : (
                    <Text style={[styles.text, isMe ? { color: '#000' } : { color: '#fff' }]}>{item.text}</Text>
                  )}
                  <Text style={[styles.time, isMe ? { color: 'rgba(0,0,0,0.6)' } : { color: COLORS.muted }]}>{formatTime(item.$createdAt)}</Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={<Text style={{ color: COLORS.muted, textAlign: 'center', marginTop: 50 }}>Say hi to start the conversation.</Text>}
          />

          <View style={[styles.composerContainer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View style={styles.inputContainer}>
              <TouchableOpacity style={styles.iconBtn} onPress={pickImage}>
                <Ionicons name="image-outline" size={26} color={COLORS.cyan} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setStickerPickerVisible(true)}
                disabled={!chatId}
                accessibilityRole="button"
                accessibilityLabel="Choose a sticker"
              >
                <Ionicons name="happy-outline" size={25} color={COLORS.cyan} />
              </TouchableOpacity>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  placeholder="Message..."
                  placeholderTextColor="#888"
                  value={newMessage}
                  onChangeText={(text) => {
                    setNewMessage(text);
                    handleTyping(text);
                  }}
                  editable={Boolean(chatId)}
                  multiline
                />
              </View>
              {newMessage.trim() ? (
                <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}><Ionicons name="send" size={20} color="#000" /></TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.iconBtn}><Ionicons name="mic-outline" size={26} color={COLORS.muted} /></TouchableOpacity>
              )}
            </View>
            {isOtherTyping && (
              <Text style={styles.typingIndicator}>{otherName || 'User'} is typing...</Text>
            )}
          </View>
        </>
      )}
      <StickerPicker
        visible={stickerPickerVisible}
        onClose={() => setStickerPickerVisible(false)}
        onSelect={sendSticker}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  messageError: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  messageErrorText: { color: COLORS.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 12 },
  retryButton: { backgroundColor: COLORS.cyan, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 10, marginTop: 16 },
  retryButtonText: { color: '#000', fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  chatNameRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5 },
  headerStatus: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  bubble: { maxWidth: '80%', padding: 8, borderRadius: 20, marginBottom: 10 },
  mine: { backgroundColor: COLORS.cyan, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { backgroundColor: COLORS.card, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  stickerBubble: { padding: 2, backgroundColor: 'transparent' },
  text: { fontSize: 16, marginBottom: 4, paddingHorizontal: 4 },
  time: { fontSize: 10, alignSelf: 'flex-end', fontWeight: '500', paddingHorizontal: 4 },
  imageMsg: { width: 200, height: 200, borderRadius: 15, marginBottom: 4 },
  stickerMsg: { width: 150, height: 150, borderRadius: 12, marginBottom: 4 },
  composerContainer: { borderTopWidth: 1, borderTopColor: COLORS.border },
  inputContainer: { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 10, alignItems: 'center' },
  inputWrapper: { flex: 1, backgroundColor: COLORS.card, borderRadius: 25, paddingHorizontal: 15, paddingVertical: 10, marginHorizontal: 8 },
  input: { color: '#fff', fontSize: 16 },
  typingIndicator: { color: COLORS.muted, fontSize: 12, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  iconBtn: { padding: 5 },
  sendBtn: { backgroundColor: COLORS.cyan, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 5 },
});