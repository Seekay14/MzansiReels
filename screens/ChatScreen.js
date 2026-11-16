import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, Alert, Image, ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { databases, storage, ID, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, BUCKET_ID, COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { getFileViewUrl, notify } from '../config/helpers';
import { fetchMessages as loadChatMessages, getOrCreateChat, sendMessage as createChatMessage } from '../config/chatService';
import Avatar from '../components/Avatar';

const POLL_MS = 4000;

export default function ChatScreen({ route, navigation }) {
  const {
    chatId: initialChatId,
    otherUserId: routeOtherId,
    otherUserName: routeOtherName,
    otherUserAvatar = null,
    otherUserIsVerified = false,
  } = route?.params || {};
  const otherId = routeOtherId || route?.params?.userId || null;
  const otherName = routeOtherName || route?.params?.userName || 'User';
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatId, setChatId] = useState(initialChatId || null);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [messageError, setMessageError] = useState('');
  const listRef = useRef(null);
  const [chatMenuVisible, setChatMenuVisible] = useState(false);

  // 1. Load or Create the Chat
  useEffect(() => {
    if (chatId || !otherId || !user?.$id) return undefined;
    let active = true;
    getOrCreateChat(user.$id, otherId)
      .then((chat) => {
        if (active) setChatId(chat.$id);
      })
      .catch((error) => {
        console.error('Could not load chat:', error);
        if (active) setMessageError('Failed to load messages.');
      });
    return () => { active = false; };
  }, [chatId, otherId, user?.$id]);

  // 2. Fetch Messages
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
      
      // Mark as read
      const unreadMessages = fetchedMessages.filter(
        (message) => message.receiverId === user.$id && message.isRead === false,
      );
      if (unreadMessages.length) {
        await Promise.all(unreadMessages.map((message) => (
          databases.updateDocument(DATABASE_ID, COLLECTIONS.messages, message.$id, { isRead: true })
        )));
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

  // 3. Send Message
  const sendMessage = async () => {
    const text = newMessage.trim();
    if (!text || !user?.$id || !otherId) return;
    if (!chatId) return Alert.alert('Error', 'Chat is still loading. Please try again.');
    
    setNewMessage('');
    let optimisticId;
    try {
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
      setMessages((prev) => prev.map((m) => m.$id === optimisticId ? doc : m));
    } catch (error) {
      console.error(error);
      if (optimisticId) setMessages((prev) => prev.filter((m) => m.$id !== optimisticId));
      setNewMessage(text);
      Alert.alert('Error', error.message || 'Failed to send message.');
    }
  };

  // 4. Pick Image
  const pickImage = async () => {
    if (!chatId || !user?.$id || !otherId) return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (result.canceled) return;
    
    const asset = result.assets[0];
    try {
      const fileId = ID.unique();
      const file = await storage.createFile(BUCKET_ID, fileId, {
        name: 'chat_image.jpg', type: 'image/jpeg', size: asset.fileSize, uri: asset.uri,
      });
      const imageUrl = getFileViewUrl(fileId);
      const doc = await createChatMessage(chatId, user.$id, otherId, imageUrl);
      setMessages((prev) => [...prev, doc]);
    } catch (error) {
      console.error(error);
      Alert.alert('Error', error.message || 'Could not send image.');
    }
  };

  // 5. Delete Message
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
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 15 }}>
          <Ionicons name="arrow-back" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Avatar uri={otherUserAvatar} userId={otherId} name={otherName} size={40} style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <View style={styles.headerNameRow}>
            <Text style={[styles.headerTitle, { color: COLORS.text }]}>{otherName}</Text>
            {otherUserIsVerified && (
              <Ionicons name="checkmark-circle" size={16} color={COLORS.cyan} style={styles.headerBadge} />
            )}
          </View>
          <Text style={styles.headerStatus}>Direct messages</Text>
        </View>
        <TouchableOpacity onPress={() => setChatMenuVisible(true)}>
          <Ionicons name="ellipsis-vertical" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      {/* Message List */}
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
              const isImage = item.text.startsWith('http');
              return (
                <TouchableOpacity
                  style={[styles.bubble, isMe ? styles.mine : styles.theirs]}
                  onLongPress={() => isMe && deleteMessage(item.$id)}
                >
                  {isImage ? (
                    <Image source={{ uri: item.text }} style={styles.imageMsg} />
                  ) : (
                    <Text style={[styles.text, isMe ? { color: COLORS.text } : { color: COLORS.text }]}>{item.text}</Text>
                  )}
                  <Text style={[styles.time, isMe ? { color: COLORS.bg } : { color: COLORS.muted }]}>
                    {formatTime(item.$createdAt)}
                  </Text>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={{ color: COLORS.muted, textAlign: 'center', marginTop: 50 }}>
                Say hi to start the conversation.
              </Text>
            }
          />

          {/* Input Bar */}
          <View style={[styles.composerContainer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View style={styles.inputContainer}>
              <TouchableOpacity style={styles.iconBtn} onPress={pickImage}>
                <Ionicons name="image-outline" size={26} color={COLORS.cyan} />
              </TouchableOpacity>
              <View style={styles.inputWrapper}>
                <TextInput
                  style={[styles.input, { color: COLORS.text }]}
                  placeholder="Message..."
                  placeholderTextColor={COLORS.muted}
                  value={newMessage}
                  onChangeText={setNewMessage}
                  editable={Boolean(chatId)}
                  multiline
                />
              </View>
              {newMessage.trim() ? (
                <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}>
                  <Ionicons name="send" size={20} color={COLORS.bg} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.iconBtn}>
                  <Ionicons name="mic-outline" size={26} color={COLORS.muted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        <Modal visible={chatMenuVisible} animationType="slide" transparent onRequestClose={() => setChatMenuVisible(false)}>
          <TouchableOpacity style={[styles.sheetBackdrop, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={() => setChatMenuVisible(false)} activeOpacity={1} />
          <TouchableOpacity style={[styles.sheetPanel, { backgroundColor: COLORS.card }]} onPress={(e) => e.stopPropagation()} activeOpacity={1}>
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: COLORS.text }]}>Chat Options</Text>
            <View style={styles.sheetClose} onPress={() => setChatMenuVisible(false)}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </View>
            <TouchableOpacity style={styles.sheetItem} onPress={() => { setChatMenuVisible(false); navigation.navigate('UserProfile', { userId: otherId, userName: otherName }); }}>
              <Ionicons name="person-outline" size={22} color={COLORS.text} style={styles.sheetIcon} />
              <Text style={[styles.sheetItemText, { color: COLORS.text }]}>View Contact</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetItem} onPress={() => { setChatMenuVisible(false); Alert.alert('Search', 'Coming soon.'); }}>
              <Ionicons name="search-outline" size={22} color={COLORS.text} style={styles.sheetIcon} />
              <Text style={[styles.sheetItemText, { color: COLORS.text }]}>Search</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetItem} onPress={() => { setChatMenuVisible(false); Alert.alert('Media, Links, and Docs', 'Coming soon.'); }}>
              <Ionicons name="images-outline" size={22} color={COLORS.text} style={styles.sheetIcon} />
              <Text style={[styles.sheetItemText, { color: COLORS.text }]}>Media, Links, and Docs</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetItem} onPress={() => { setChatMenuVisible(false); Alert.alert('Mute Notifications', 'Coming soon.'); }}>
              <Ionicons name="notifications-outline" size={22} color={COLORS.text} style={styles.sheetIcon} />
              <Text style={[styles.sheetItemText, { color: COLORS.text }]}>Mute Notifications</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetItem} onPress={() => { setChatMenuVisible(false); Alert.alert('Clear Chat', 'Coming soon.'); }}>
              <Ionicons name="trash-outline" size={22} color={COLORS.text} style={styles.sheetIcon} />
              <Text style={[styles.sheetItemText, { color: COLORS.text }]}>Clear Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetItem} onPress={() => { setChatMenuVisible(false); Alert.alert('Block User', 'Coming soon.'); }}>
              <Ionicons name="ban-outline" size={22} color={COLORS.text} style={styles.sheetIcon} />
              <Text style={[styles.sheetItemText, { color: COLORS.text }]}>Block User</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  messageError: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  messageErrorText: { color: COLORS.muted, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 12 },
  retryButton: { backgroundColor: COLORS.cyan, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 10, marginTop: 16 },
  retryButtonText: { color: COLORS.bg, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: COLORS.text, fontSize: 17, fontWeight: 'bold' },
  headerNameRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  headerBadge: { marginLeft: 4 },
  headerStatus: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  bubble: { maxWidth: '80%', padding: 8, borderRadius: 20, marginBottom: 10 },
  mine: { backgroundColor: COLORS.cyan, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { backgroundColor: COLORS.card, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  text: { fontSize: 16, marginBottom: 4, paddingHorizontal: 4 },
  time: { fontSize: 10, alignSelf: 'flex-end', fontWeight: '500', paddingHorizontal: 4 },
  imageMsg: { width: 200, height: 200, borderRadius: 15, marginBottom: 4 },
  composerContainer: { borderTopWidth: 1, borderTopColor: COLORS.border },
  inputContainer: { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 10, alignItems: 'center' },
  inputWrapper: { flex: 1, backgroundColor: COLORS.card, borderRadius: 25, paddingHorizontal: 15, paddingVertical: 10, marginHorizontal: 8 },
  input: { color: COLORS.text, fontSize: 16 },
  iconBtn: { padding: 5 },
  sendBtn: { backgroundColor: COLORS.cyan, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 5 },
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetPanel: { width: '100%', height: '65%', backgroundColor: COLORS.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden', justifyContent: 'flex-end' },
  sheetHandle: { width: 40, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: COLORS.muted, marginVertical: 10 },
  sheetTitle: { flex: 1, color: COLORS.text, fontSize: 17, fontWeight: '800', textAlign: 'center', paddingTop: 10 },
  sheetClose: { position: 'absolute', right: 18, top: 12 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetIcon: { marginRight: 14 },
  sheetItemText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
});