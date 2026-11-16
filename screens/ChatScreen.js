import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, Alert, Image, ActivityIndicator, Modal, Clipboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { databases, storage, ID, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, BUCKET_ID, COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { getFileViewUrl, notify, blockUser, unblockUser } from '../config/helpers';
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
  const [editMessage, setEditMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [muted, setMuted] = useState(false);
  const [longPressMenuVisible, setLongPressMenuVisible] = useState(false);
  const [longPressMenuItem, setLongPressMenuItem] = useState(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockerId, setBlockerId] = useState(null);

  // 1. Load or Create the Chat
  useEffect(() => {
    if (chatId || !otherId || !user?.$id) return undefined;
    let active = true;
      getOrCreateChat(user.$id, otherId)
        .then((chat) => {
          if (active) setChatId(chat.$id);
          if (active) loadMutedState();
        })
      .catch((error) => {
        console.error('Could not load chat:', error);
        if (active) setMessageError('Failed to load messages.');
      });
    return () => { active = false; };
  }, [chatId, otherId, user?.$id]);

  // 1b. Check block status
  useEffect(() => {
    if (!otherId || !user?.$id) return undefined;
    let active = true;
    (async () => {
      try {
        const [blockedByMe, blockedByThem] = await Promise.all([
          databases.listDocuments(DATABASE_ID, COLLECTIONS.blocks, [
            Query.equal('blockerId', user.$id),
            Query.equal('blockedId', otherId),
            Query.limit(1),
          ]),
          databases.listDocuments(DATABASE_ID, COLLECTIONS.blocks, [
            Query.equal('blockerId', otherId),
            Query.equal('blockedId', user.$id),
            Query.limit(1),
          ]),
        ]);
        if (active && (blockedByMe.documents[0] || blockedByThem.documents[0])) {
          setIsBlocked(true);
          setBlockerId(blockedByMe.documents[0] ? user.$id : otherId);
        }
      } catch (error) {
        console.error('Could not check block status:', error);
      }
    })();
    return () => { active = false; };
  }, [otherId, user?.$id]);

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
  const sendMessage = async (statusReply = null) => {
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
        ...(statusReply && {
          isStatusReply: true,
          storyId: statusReply.storyId,
          storyMediaUrl: statusReply.storyMediaUrl,
        }),
      };
      setMessages((prev) => [...prev, optimisticMessage]);
      
      const doc = await createChatMessage(chatId, user.$id, otherId, text);
      const finalDoc = statusReply
        ? { ...doc, isStatusReply: true, storyId: statusReply.storyId, storyMediaUrl: statusReply.storyMediaUrl }
        : doc;
      setMessages((prev) => prev.map((m) => m.$id === optimisticId ? finalDoc : m));
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
    Alert.alert('Delete Message', 'Are you sure you want to delete this message?', [
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

  const handleMessageLongPress = (item) => {
    setLongPressMenuItem(item);
    setLongPressMenuVisible(true);
  };

  const handleLongPressAction = (action) => {
    const item = longPressMenuItem;
    if (!item) return;
    const isMe = item.senderId === user?.$id;
    setLongPressMenuVisible(false);
    setLongPressMenuItem(null);

    if (action === 'reply') {
      // TODO: Implement reply quoting
      Alert.alert('Reply', 'Reply quoting coming soon.');
    } else if (action === 'copy') {
      Clipboard.setString(item.text || '');
      Alert.alert('Copied', 'Message copied to clipboard.');
    } else if (action === 'react') {
      // TODO: Implement reactions
      Alert.alert('React', 'Reactions coming soon.');
    } else if (action === 'edit' && isMe) {
      setEditMessage(item);
      setEditText(item.text || '');
    } else if (action === 'deleteEveryone' && isMe) {
      Alert.alert('Delete for Everyone', 'Are you sure you want to delete this message for everyone?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await databases.deleteDocument(DATABASE_ID, COLLECTIONS.messages, item.$id);
            setMessages((prev) => prev.filter((m) => m.$id !== item.$id));
          } catch (error) {
            Alert.alert('Error', error.message || 'Could not delete message.');
          }
        }},
      ]);
    } else if (action === 'deleteMe' && !isMe) {
      Alert.alert('Delete for Me', 'Are you sure you want to hide this message?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Hide', style: 'destructive', onPress: async () => {
          try {
            await databases.updateDocument(DATABASE_ID, COLLECTIONS.messages, item.$id, { deletedForMe: true });
            setMessages((prev) => prev.filter((m) => m.$id !== item.$id));
          } catch (error) {
            Alert.alert('Error', error.message || 'Could not hide message.');
          }
        }},
      ]);
    }
  };

  const saveEdit = async () => {
    if (!editMessage || !editText.trim()) return;
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.messages, editMessage.$id, { text: editText.trim() });
      setMessages((prev) => prev.map((m) => m.$id === editMessage.$id ? { ...m, text: editText.trim() } : m));
      setEditMessage(null);
      setEditText('');
    } catch (error) {
      Alert.alert('Error', error.message || 'Could not edit message.');
    }
  };

  const formatTime = (isoString) => new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const loadMutedState = useCallback(async () => {
    if (!chatId || !user?.$id) return;
    try {
      const saved = await AsyncStorage.getItem(`@mzansireels/mute_${chatId}`);
      setMuted(saved === 'true');
    } catch (error) {
      console.error('Could not load mute state:', error);
    }
  }, [chatId, user?.$id]);

  const toggleMute = async () => {
    if (!chatId || !user?.$id) return;
    const next = !muted;
    setMuted(next);
    try {
      await AsyncStorage.setItem(`@mzansireels/mute_${chatId}`, String(next));
    } catch (error) {
      setMuted(!next);
      Alert.alert('Error', error.message || 'Could not update mute setting.');
    }
  };

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
              const isStatusReply = item.isStatusReply;
              return (
                <TouchableOpacity
                  style={[styles.bubble, isMe ? styles.mine : styles.theirs, isStatusReply && styles.statusReplyBubble]}
                  onLongPress={() => handleMessageLongPress(item)}
                >
                  {isStatusReply && (
                    <View style={styles.statusReplyHeader}>
                      {item.storyMediaUrl ? (
                        <Image source={{ uri: item.storyMediaUrl }} style={styles.statusReplyThumb} />
                      ) : (
                        <Ionicons name="camera-outline" size={16} color={COLORS.muted} style={styles.statusReplyThumb} />
                      )}
                      <Text style={styles.statusReplyText}>Replied to your status</Text>
                    </View>
                  )}
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

          {/* Input Bar / Blocked State */}
          {isBlocked ? (
            <View style={[styles.composerContainer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
              <View style={styles.blockedMessageContainer}>
                <Ionicons name="ban-outline" size={28} color={COLORS.muted} />
                <Text style={styles.blockedMessageText}>
                  {blockerId === user?.$id
                    ? 'You blocked this user. You cannot send messages.'
                    : 'You cannot send messages to this user.'}
                </Text>
                {blockerId === user?.$id && (
                  <TouchableOpacity
                    style={styles.unblockButton}
                    onPress={() => {
                      Alert.alert('Unblock User', `Unblock ${otherName}?`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Unblock', style: 'destructive', onPress: async () => {
                          try {
                            await unblockUser(user.$id, otherId);
                            setIsBlocked(false);
                            navigation.goBack();
                          } catch (error) {
                            Alert.alert('Error', error.message || 'Could not unblock user.');
                          }
                        }},
                      ]);
                    }}
                  >
                    <Ionicons name="checkmark-outline" size={20} color={COLORS.cyan} />
                    <Text style={styles.unblockButtonText}>Unblock</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : (
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
          )}
        <Modal visible={chatMenuVisible} animationType="slide" transparent onRequestClose={() => setChatMenuVisible(false)}>
          <TouchableOpacity style={[styles.sheetBackdrop, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={() => setChatMenuVisible(false)} activeOpacity={1} />
          <TouchableOpacity style={[styles.sheetPanel, { backgroundColor: COLORS.card }]} onPress={(e) => e.stopPropagation()} activeOpacity={1}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHandle} />
              <Text style={[styles.sheetTitle, { color: COLORS.text }]}>Chat Options</Text>
              <View style={styles.sheetClose} onPress={() => setChatMenuVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </View>
            </View>
            <TouchableOpacity style={styles.sheetItem} onPress={() => { setChatMenuVisible(false); navigation.navigate('UserProfile', { userId: otherId, userName: otherName }); }}>
              <Ionicons name="person-outline" size={22} color={COLORS.text} style={styles.sheetIcon} />
              <Text style={[styles.sheetItemText, { color: COLORS.text }]}>View Contact</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetItem} onPress={() => {
              setChatMenuVisible(false);
              Alert.alert('Search Messages', 'Enter a keyword to search messages in this chat.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Search', style: 'default', onPress: () => {
                  // Search logic would go here
                }},
              ]);
            }}>
              <Ionicons name="search-outline" size={22} color={COLORS.text} style={styles.sheetIcon} />
              <Text style={[styles.sheetItemText, { color: COLORS.text }]}>Search</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetItem} onPress={() => {
              setChatMenuVisible(false);
              Alert.alert('Media, Links, and Docs', 'Shared media grid coming soon.');
            }}>
              <Ionicons name="images-outline" size={22} color={COLORS.text} style={styles.sheetIcon} />
              <Text style={[styles.sheetItemText, { color: COLORS.text }]}>Media, Links, and Docs</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.sheetItem, muted && styles.sheetItemMuted]} onPress={toggleMute}>
              <Ionicons name={muted ? 'notifications-off' : 'notifications-outline'} size={22} color={muted ? COLORS.muted : COLORS.text} style={styles.sheetIcon} />
              <Text style={[styles.sheetItemText, { color: COLORS.text }]}>{muted ? 'Unmute Notifications' : 'Mute Notifications'}</Text>
              {muted && <Ionicons name="checkmark" size={18} color={COLORS.cyan} style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetItem} onPress={() => {
              setChatMenuVisible(false);
              Alert.alert('Clear Chat', 'Are you sure you want to clear this chat? This cannot be undone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: async () => {
                  try {
                    await Promise.all(messages.map((message) =>
                      databases.deleteDocument(DATABASE_ID, COLLECTIONS.messages, message.$id)
                    ));
                    setMessages([]);
                    if (chatId) {
                      try {
                        await databases.updateDocument(DATABASE_ID, COLLECTIONS.chats, chatId, {
                          lastMessage: 'Chat cleared',
                        });
                      } catch (updateError) {
                        console.error('Could not update chat lastMessage:', updateError);
                      }
                    }
                  } catch (error) {
                    console.error('Could not clear chat:', error);
                    Alert.alert('Error', error.message || 'Could not clear chat.');
                  }
                }},
              ]);
            }}>
              <Ionicons name="trash-outline" size={22} color={COLORS.text} style={styles.sheetIcon} />
              <Text style={[styles.sheetItemText, { color: COLORS.text }]}>Clear Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetItem} onPress={() => {
              setChatMenuVisible(false);
              Alert.alert('Block User', `Block ${otherName}? They won't be able to message you.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Block', style: 'destructive', onPress: async () => {
                  try {
                    await blockUser(user.$id, otherId);
                    setIsBlocked(true);
                    setBlockerId(user.$id);
                    navigation.goBack();
                  } catch (error) {
                    Alert.alert('Error', error.message || 'Could not block user.');
                  }
                }},
              ]);
            }}>
              <Ionicons name="ban-outline" size={22} color={COLORS.text} style={styles.sheetIcon} />
              <Text style={[styles.sheetItemText, { color: COLORS.text }]}>Block User</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Edit Message Modal */}
        <Modal visible={!!editMessage} animationType="slide" transparent onRequestClose={() => setEditMessage(null)}>
          <TouchableOpacity style={[styles.sheetBackdrop, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={() => setEditMessage(null)} activeOpacity={1} />
          <TouchableOpacity style={[styles.editPanel, { backgroundColor: COLORS.card }]} onPress={(e) => e.stopPropagation()} activeOpacity={1}>
            <View style={styles.editHeader}>
              <Text style={styles.editTitle}>Edit Message</Text>
              <TouchableOpacity style={styles.editClose} onPress={() => setEditMessage(null)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.editInput}
              value={editText}
              onChangeText={setEditText}
              placeholder="Type your message..."
              multiline
              numberOfLines={4}
            />
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.editCancelBtn} onPress={() => setEditMessage(null)}>
                <Text style={styles.editCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.editSaveBtn} onPress={saveEdit} disabled={!editText.trim()}>
                <Text style={styles.editSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Long Press Message Menu */}
        <Modal visible={longPressMenuVisible} animationType="slide" transparent onRequestClose={() => setLongPressMenuVisible(false)}>
          <TouchableOpacity style={[styles.sheetBackdrop, { backgroundColor: 'rgba(0,0,0,0.5)' }]} onPress={() => setLongPressMenuVisible(false)} activeOpacity={1} />
          <TouchableOpacity style={[styles.longPressPanel, { backgroundColor: COLORS.card }]} onPress={(e) => e.stopPropagation()} activeOpacity={1}>
            <View style={styles.longPressHeader}>
              <Text style={styles.longPressTitle}>Message Options</Text>
              <TouchableOpacity style={styles.longPressClose} onPress={() => setLongPressMenuVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.longPressItem} onPress={() => handleLongPressAction('reply')}>
              <Ionicons name="reply" size={20} color={COLORS.text} style={styles.longPressIcon} />
              <Text style={[styles.longPressItemText, { color: COLORS.text }]}>Reply</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.longPressItem} onPress={() => handleLongPressAction('copy')}>
              <Ionicons name="copy" size={20} color={COLORS.text} style={styles.longPressIcon} />
              <Text style={[styles.longPressItemText, { color: COLORS.text }]}>Copy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.longPressItem} onPress={() => handleLongPressAction('react')}>
              <Ionicons name="happy" size={20} color={COLORS.text} style={styles.longPressIcon} />
              <Text style={[styles.longPressItemText, { color: COLORS.text }]}>React</Text>
            </TouchableOpacity>
            {longPressMenuItem && longPressMenuItem.senderId === user?.$id && (
              <>
                <TouchableOpacity style={styles.longPressItem} onPress={() => handleLongPressAction('edit')}>
                  <Ionicons name="create" size={20} color={COLORS.text} style={styles.longPressIcon} />
                  <Text style={[styles.longPressItemText, { color: COLORS.text }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.longPressItem, styles.longPressItemDestructive]} onPress={() => handleLongPressAction('deleteEveryone')}>
                  <Ionicons name="trash-outline" size={20} color={COLORS.pink} style={styles.longPressIcon} />
                  <Text style={[styles.longPressItemText, { color: COLORS.pink }]}>Delete for Everyone</Text>
                </TouchableOpacity>
              </>
            )}
            {longPressMenuItem && longPressMenuItem.senderId !== user?.$id && (
              <TouchableOpacity style={[styles.longPressItem, styles.longPressItemDestructive]} onPress={() => handleLongPressAction('deleteMe')}>
                <Ionicons name="trash-outline" size={20} color={COLORS.pink} style={styles.longPressIcon} />
                <Text style={[styles.longPressItemText, { color: COLORS.pink }]}>Delete for Me</Text>
              </TouchableOpacity>
            )}
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
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  sheetHandle: { width: 40, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: COLORS.muted, marginVertical: 10 },
  sheetTitle: { flex: 1, color: COLORS.text, fontSize: 17, fontWeight: '800', textAlign: 'center', paddingTop: 10 },
  sheetClose: { position: 'absolute', right: 18, top: 12 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sheetItemMuted: { backgroundColor: 'rgba(0,229,255,0.05)' },
  sheetIcon: { marginRight: 14 },
  sheetItemText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  editPanel: { width: '90%', maxWidth: 500, backgroundColor: COLORS.card, borderRadius: 20, alignSelf: 'center', justifyContent: 'center', margin: 20, padding: 24 },
  editHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  editTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  editClose: { padding: 4 },
  editInput: { color: COLORS.text, fontSize: 16, textAlignVertical: 'top', minHeight: 120, padding: 12, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.bg },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 12 },
  editCancelBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  editCancelText: { color: COLORS.muted, fontSize: 15, fontWeight: '600' },
  editSaveBtn: { backgroundColor: COLORS.cyan, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  editSaveText: { color: COLORS.bg, fontSize: 15, fontWeight: '800' },
  longPressPanel: { width: '100%', backgroundColor: COLORS.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden', paddingBottom: 20 },
  longPressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  longPressTitle: { color: COLORS.text, fontSize: 18, fontWeight: '800' },
  longPressClose: { padding: 4 },
  longPressItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  longPressItemDestructive: { borderBottomColor: COLORS.border },
  longPressIcon: { marginRight: 14, fontSize: 20 },
  longPressItemText: { color: COLORS.text, fontSize: 15, fontWeight: '600' },
  statusReplyBubble: { borderLeftWidth: 3, borderLeftColor: COLORS.cyan, backgroundColor: 'rgba(0,229,255,0.08)' },
  statusReplyHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, paddingHorizontal: 4 },
  statusReplyThumb: { width: 24, height: 24, borderRadius: 6 },
  statusReplyText: { fontSize: 11, color: COLORS.muted, fontWeight: '600' },
  blockedMessageContainer: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingVertical: 30, gap: 10 },
  blockedMessageText: { color: COLORS.muted, fontSize: 14, textAlign: 'center', paddingHorizontal: 40 },
  unblockButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.cyan },
  unblockButtonText: { color: COLORS.cyan, fontSize: 13, fontWeight: '700' },
});