import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { client, databases, storage, ID, Permission, Role, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, BUCKET_ID, COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { getFileViewUrl, getOrCreateChat, notify, sendMessage as createChatMessage } from '../config/helpers';
import Avatar from '../components/Avatar';

const POLL_MS = 4000;

export default function ChatScreen({ route, navigation }) {
  const { userId: otherId, userName: otherName } = route.params;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [chatId, setChatId] = useState(route.params.chatId || null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const listRef = useRef(null);
  const typingTimer = useRef(null);
  const typingDocumentIds = useRef(new Map());
  const typingWriteQueue = useRef(Promise.resolve());
  const publishedTypingState = useRef(false);

  useEffect(() => {
    if (chatId) return undefined;
    let active = true;
    getOrCreateChat(user.$id, otherId)
      .then((id) => {
        if (active) setChatId(id);
      })
      .catch((error) => {
        console.error('Could not load chat:', error);
        if (active) Alert.alert('Chat unavailable', error.message || 'Could not open this chat.');
      });
    return () => { active = false; };
  }, [chatId, otherId, user.$id]);

  const persistTypingStatus = useCallback((isTyping) => {
    if (!chatId) return Promise.resolve();

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
  }, [chatId, otherId, user.$id]);

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
    if (!chatId) return undefined;
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
  }, [chatId, persistTypingStatus, user.$id]);

  const fetchMessages = useCallback(async () => {
    if (!chatId) return;
    try {
      const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
        Query.or([
          Query.and([Query.equal('senderId', user.$id), Query.equal('receiverId', otherId)]),
          Query.and([Query.equal('senderId', otherId), Query.equal('receiverId', user.$id)]),
        ]),
        Query.orderAsc('$createdAt'),
        Query.limit(200),
      ]);
      setMessages(res.documents);
      const unreadMessages = res.documents.filter(
        (message) => message.receiverId === user.$id && message.isRead === false,
      );
      await Promise.all(unreadMessages.map((message) => (
        databases.updateDocument(DATABASE_ID, COLLECTIONS.messages, message.$id, { isRead: true })
      )));
    } catch (error) { console.log('Error fetching messages:', error); }
  }, [user.$id, otherId, chatId]);

  useFocusEffect(useCallback(() => {
    fetchMessages();
    const timer = setInterval(fetchMessages, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchMessages]));

  const sendMessage = async () => {
    const text = newMessage.trim();
    if (!text) return;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = null;
    publishedTypingState.current = false;
    await persistTypingStatus(false);
    setNewMessage('');
    try {
      if (!chatId) throw new Error('Chat is still loading. Please try again.');
      const doc = await createChatMessage(chatId, user.$id, text, false);
      setMessages((prev) => [...prev, doc]);
      await notify(otherId, user.name, 'message');
    } catch (error) { setNewMessage(text); Alert.alert('Error', 'Failed to send.'); }
  };

  const pickImage = async () => {
    if (!chatId) {
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
      const doc = await createChatMessage(chatId, user.$id, imageUrl, false, '', 'image');
      setMessages((prev) => [...prev, doc]);
    } catch (error) { Alert.alert('Error', 'Could not send image.'); }
  };

  const deleteMessage = (msgId) => {
    Alert.alert('Delete Message', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await databases.deleteDocument(DATABASE_ID, COLLECTIONS.messages, msgId);
          setMessages((prev) => prev.filter((m) => m.$id !== msgId));
        } catch (error) { Alert.alert('Error', 'Could not delete.'); }
      }},
    ]);
  };

  const formatTime = (isoString) => new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 15 }}><Ionicons name="arrow-back" size={26} color="#fff" /></TouchableOpacity>
        <Avatar name={otherName} size={40} style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}><Text style={styles.headerTitle}>{otherName}</Text><Text style={styles.headerStatus}>Direct messages</Text></View>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.$id}
        contentContainerStyle={{ padding: 15, paddingBottom: 20 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => {
          const isMe = item.senderId === user.$id;
          const isImage = item.text.startsWith('http');
          
          return (
            <TouchableOpacity 
              style={[styles.bubble, isMe ? styles.mine : styles.theirs]}
              onLongPress={() => isMe && deleteMessage(item.$id)}
            >
              {isImage ? (
                <Image source={{ uri: item.text }} style={styles.imageMsg} />
              ) : (
                <Text style={[styles.text, isMe ? { color: '#000' } : { color: '#fff' }]}>{item.text}</Text>
              )}
              <Text style={[styles.time, isMe ? { color: 'rgba(0,0,0,0.6)' } : { color: COLORS.muted }]}>{formatTime(item.$createdAt)}</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={{ color: COLORS.muted, textAlign: 'center', marginTop: 50 }}>Say hi to start the conversation 👋</Text>}
      />

      <View style={[styles.composerContainer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.iconBtn} onPress={pickImage}>
            <Ionicons name="image-outline" size={26} color={COLORS.cyan} />
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
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
  input: { color: '#fff', fontSize: 16 },
  typingIndicator: { color: COLORS.muted, fontSize: 12, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 },
  iconBtn: { padding: 5 },
  sendBtn: { backgroundColor: COLORS.cyan, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 5 },
});