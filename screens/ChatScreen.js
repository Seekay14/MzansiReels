import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, Alert, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { databases, storage, ID, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, BUCKET_ID, COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';

const POLL_MS = 4000;

export default function ChatScreen({ route, navigation }) {
  const { userId: otherId, userName: otherName } = route.params;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const listRef = useRef(null);

  const fetchMessages = useCallback(async () => {
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
    } catch (error) { console.log('Error fetching messages:', error); }
  }, [user, otherId]);

  useFocusEffect(useCallback(() => {
    fetchMessages();
    const timer = setInterval(fetchMessages, POLL_MS);
    return () => clearInterval(timer);
  }, [fetchMessages]));

  const sendMessage = async () => {
    const text = newMessage.trim();
    if (!text) return;
    setNewMessage('');
    try {
      const doc = await databases.createDocument(DATABASE_ID, COLLECTIONS.messages, ID.unique(), {
        senderId: user.$id, receiverId: otherId, text,
      });
      setMessages((prev) => [...prev, doc]);
    } catch (error) { setNewMessage(text); Alert.alert('Error', 'Failed to send.'); }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5 });
    if (result.canceled) return;
    
    const asset = result.assets[0];
    try {
      const fileId = ID.unique();
      const file = await storage.createFile(BUCKET_ID, fileId, {
        name: 'chat_image.jpg', type: 'image/jpeg', size: asset.fileSize, uri: asset.uri,
      });
      const imageUrl = storage.getFileView(BUCKET_ID, fileId).toString();
      
      const doc = await databases.createDocument(DATABASE_ID, COLLECTIONS.messages, ID.unique(), {
        senderId: user.$id, receiverId: otherId, text: imageUrl, // We store the image URL in the text field
      });
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
        <View style={{ flex: 1 }}><Text style={styles.headerTitle}>{otherName}</Text><Text style={styles.headerStatus}>Active now</Text></View>
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

      <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={pickImage}>
          <Ionicons name="image-outline" size={26} color={COLORS.cyan} />
        </TouchableOpacity>
        <View style={styles.inputWrapper}>
          <TextInput style={styles.input} placeholder="Message..." placeholderTextColor="#888" value={newMessage} onChangeText={setNewMessage} multiline />
        </View>
        {newMessage.trim() ? (
          <TouchableOpacity style={styles.sendBtn} onPress={sendMessage}><Ionicons name="send" size={20} color="#000" /></TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.iconBtn}><Ionicons name="mic-outline" size={26} color={COLORS.muted} /></TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  headerStatus: { color: '#00FF7F', fontSize: 12, marginTop: 2 },
  bubble: { maxWidth: '80%', padding: 8, borderRadius: 20, marginBottom: 10 },
  mine: { backgroundColor: COLORS.cyan, alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { backgroundColor: COLORS.card, alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  text: { fontSize: 16, marginBottom: 4, paddingHorizontal: 4 },
  time: { fontSize: 10, alignSelf: 'flex-end', fontWeight: '500', paddingHorizontal: 4 },
  imageMsg: { width: 200, height: 200, borderRadius: 15, marginBottom: 4 },
  inputContainer: { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: 'center' },
  inputWrapper: { flex: 1, backgroundColor: COLORS.card, borderRadius: 25, paddingHorizontal: 15, paddingVertical: 10, marginHorizontal: 8 },
  input: { color: '#fff', fontSize: 16 },
  iconBtn: { padding: 5 },
  sendBtn: { backgroundColor: COLORS.cyan, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 5 },
});