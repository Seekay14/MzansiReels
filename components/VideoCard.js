import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Pressable, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, FlatList, Share, ActivityIndicator, Image, Animated, Dimensions
} from 'react-native';
import { Video, ResizeMode } from 'expo-av'; 
import { Ionicons } from '@expo/vector-icons';
import { databases, ID, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { notify, timeAgo } from '../config/helpers';
import Avatar from './Avatar';

const { width } = Dimensions.get('window');

export default function VideoCard({ item, isActive, height, muted = false, onToggleMute, onOpenProfile }) {
  const { user } = useAuth();
  const videoRef = useRef(null);

  const [paused, setPaused] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [likes, setLikes] = useState(item.likes || 0);
  const [isLiked, setIsLiked] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [isCommentsVisible, setIsCommentsVisible] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);

  const heartScale = useRef(new Animated.Value(1)).current;
  const busy = useRef(false);
  const fetchedMeta = useRef(false);

  useEffect(() => {
    if (videoRef.current) {
      if (isActive && !paused && !hasError) {
        videoRef.current.playAsync().catch(() => setHasError(true));
      } else {
        videoRef.current.pauseAsync();
      }
    }
  }, [isActive, paused, hasError]);

  useEffect(() => {
    if (!isActive || fetchedMeta.current || !user) return;
    fetchedMeta.current = true;
    (async () => {
      try {
        const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.likes, [
          Query.equal('videoId', item.$id), Query.equal('userId', user.$id), Query.limit(1),
        ]);
        if (res.documents[0]) setIsLiked(true);
      } catch (e) { console.log('like lookup failed:', e.message); }
      
      try {
        const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.comments, [
          Query.equal('videoId', item.$id), Query.limit(1),
        ]);
        setCommentCount(res.total);
      } catch (e) { console.log('comment count failed:', e.message); }

      try {
        const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.bookmarks, [
          Query.equal('videoId', item.$id), Query.equal('userId', user.$id), Query.limit(1),
        ]);
        if (res.documents[0]) setIsBookmarked(true);
      } catch (e) { console.log('bookmark lookup failed:', e.message); }
    })();
  }, [isActive, user, item.$id]);

  useEffect(() => { if (isCommentsVisible) fetchComments(); }, [isCommentsVisible]);

  const fetchComments = async () => {
    try {
      const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.comments, [
        Query.equal('videoId', item.$id), Query.orderDesc('$createdAt'), Query.limit(50),
      ]);
      setComments(res.documents);
      setCommentCount(res.total);
    } catch (error) { console.log('Error fetching comments:', error); }
  };

  const handleLike = async () => {
    if (busy.current || !user) return;
    busy.current = true;
    
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.4, duration: 100, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 1, duration: 100, useNativeDriver: true })
    ]).start();

    const newCount = isLiked ? Math.max(0, likes - 1) : likes + 1;
    setLikes(newCount);
    setIsLiked(!isLiked);
    
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.videos, item.$id, { likes: newCount });
    } catch (error) {
      setLikes(likes);
      setIsLiked(isLiked);
    } finally { busy.current = false; }
  };

  const handleBookmark = async () => {
    if (!user) return;
    try {
      if (isBookmarked) {
        const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.bookmarks, [
          Query.equal('videoId', item.$id), Query.equal('userId', user.$id), Query.limit(1),
        ]);
        if (res.documents[0]) {
          await databases.deleteDocument(DATABASE_ID, COLLECTIONS.bookmarks, res.documents[0].$id);
          setIsBookmarked(false);
        }
      } else {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.bookmarks, ID.unique(), {
          videoId: item.$id, userId: user.$id
        });
        setIsBookmarked(true);
      }
    } catch (error) {
      Alert.alert("Error", "Could not update bookmark.");
    }
  };

  const handlePostComment = async () => {
    if (newComment.trim() === '' || !user) return;
    setIsSubmitting(true);
    try {
      const userRes = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
        Query.equal('userId', user.$id), Query.limit(1)
      ]);
      const userAvatar = userRes.documents[0]?.avatarUrl || '';
      const displayName = userRes.documents[0]?.username || user.name || 'User';

      const response = await databases.createDocument(DATABASE_ID, COLLECTIONS.comments, ID.unique(), {
        videoId: item.$id, 
        userName: displayName, 
        text: newComment.trim(),
        avatarUrl: userAvatar, 
      });
      
      setComments((prev) => [response, ...prev]);
      setCommentCount((c) => c + 1);
      setNewComment('');
      if (item.userId !== user.$id) notify(item.userId, displayName, 'comment');
    } catch (error) { 
      Alert.alert('Error', 'Could not post comment.'); 
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const isCreatorVerified = item.userName?.toLowerCase() === 'mzansireel' || item.isVerified === true;

  return (
    <View style={[styles.card, height ? { height } : null]}>
      
      {/* 👈 1. FALLBACK BACKGROUND (Thumbnail) */}
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFillObject} blurRadius={2} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#111' }]} />
      )}

      {/* 👈 2. VIDEO PLAYER (Overlays the thumbnail if it works) */}
      {!hasError && (
        <Video
          ref={videoRef}
          source={{ uri: item.videoUrl }}
          style={StyleSheet.absoluteFillObject}
          resizeMode={ResizeMode.COVER}
          isLooping
          isMuted={muted}
          shouldPlay={isActive && !paused}
          onError={() => setHasError(true)}
        />
      )}

      {/* 👈 3. PREVIEW BADGE (Shows if video fails) */}
      {hasError && (
        <View style={styles.previewBadge}>
          <Ionicons name="image-outline" size={14} color="#fff" />
          <Text style={styles.previewText}>Preview Mode</Text>
        </View>
      )}

      {/* PAUSE ICON */}
      {paused && !hasError && (
        <View style={styles.centerScreen}>
          <Ionicons name="play" size={80} color="rgba(255,255,255,0.7)" />
        </View>
      )}
      
      {/* TAP TO PAUSE */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setPaused((p) => !p)} />

      {/* 👈 4. BOTTOM OVERLAY (User & Caption) */}
      <View style={styles.bottomOverlay} pointerEvents="box-none">
        <TouchableOpacity onPress={() => onOpenProfile?.(item)} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.username}>@{item.userName || 'user'}</Text>
          {isCreatorVerified && (
            <Ionicons name="checkmark-circle" size={16} color={COLORS.cyan} style={{ marginLeft: 5, marginBottom: 6 }} />
          )}
        </TouchableOpacity>
        <Text style={styles.caption} numberOfLines={2}>{item.caption}</Text>
        
        <View style={styles.soundContainer}>
          <Ionicons name="musical-notes" size={14} color="#fff" />
          <Text style={styles.soundText} numberOfLines={1}>{item.soundName || 'Original Audio'}</Text>
        </View>
      </View>

      {/* 👈 5. RIGHT OVERLAY (Action Buttons) */}
      <View style={styles.rightOverlay}>
        <TouchableOpacity style={styles.actionButton} onPress={() => onOpenProfile?.(item)}>
          <View style={styles.avatarWrapper}>
             <Avatar uri={item.avatarUrl} name={item.userName} size={48} />
          </View>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={42} color={isLiked ? COLORS.pink : '#fff'} />
          </Animated.View>
          <Text style={styles.actionText}>{likes}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={() => setIsCommentsVisible(true)}>
          <Ionicons name="chatbubble" size={36} color="#fff" />
          <Text style={styles.actionText}>{commentCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleBookmark}>
          <Ionicons name={isBookmarked ? "bookmark" : "bookmark-outline"} size={32} color={isBookmarked ? COLORS.cyan : "#fff"} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={onToggleMute}>
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={34} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* COMMENTS MODAL */}
      <Modal animationType="slide" transparent visible={isCommentsVisible} onRequestClose={() => setIsCommentsVisible(false)}>
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.modalBackground} onPress={() => setIsCommentsVisible(false)} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{commentCount} comments</Text>
              <TouchableOpacity onPress={() => setIsCommentsVisible(false)}><Ionicons name="close" size={28} color="#fff" /></TouchableOpacity>
            </View>
            <FlatList
              data={comments}
              keyExtractor={(c) => c.$id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: c }) => (
                <View style={styles.commentItem}>
                  <Avatar uri={c.avatarUrl} name={c.userName} size={38} style={{ marginRight: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.commentUser}>@{c.userName} · {timeAgo(c.$createdAt)}</Text>
                    <Text style={styles.commentText}>{c.text}</Text>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={{ color: COLORS.muted, textAlign: 'center', marginTop: 30 }}>Be the first to comment!</Text>}
            />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.inputContainer}>
              <TextInput style={styles.input} placeholder="Add comment..." placeholderTextColor={COLORS.muted} value={newComment} onChangeText={setNewComment} editable={!isSubmitting} />
              <TouchableOpacity onPress={handlePostComment} disabled={isSubmitting} style={{ padding: 5 }}>
                {isSubmitting ? <ActivityIndicator color={COLORS.cyan} /> : <Ionicons name="send" size={24} color={COLORS.cyan} style={{ marginLeft: 5 }} />}
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 };

const styles = StyleSheet.create({
  card: { flex: 1, width: '100%', justifyContent: 'flex-end', backgroundColor: '#000' },
  centerScreen: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 5 },
  
  previewBadge: { position: 'absolute', top: 50, right: 20, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, zIndex: 20 },
  previewText: { color: '#fff', fontSize: 12, fontWeight: 'bold', marginLeft: 5 },

  bottomOverlay: { position: 'absolute', bottom: 25, left: 15, right: 90, zIndex: 10 },
  username: { color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 6, ...shadow },
  caption: { color: '#fff', fontSize: 15, lineHeight: 20, fontWeight: '400', ...shadow },
  
  soundContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  soundText: { color: '#fff', fontSize: 13, marginLeft: 5, ...shadow },

  rightOverlay: { position: 'absolute', bottom: 25, right: 10, alignItems: 'center', zIndex: 10 },
  actionButton: { alignItems: 'center', marginBottom: 22 },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 5, ...shadow },
  
  avatarWrapper: { borderWidth: 2, borderColor: '#fff', borderRadius: 28, padding: 1 },
  
  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalBackground: { flex: 1 },
  modalContent: { backgroundColor: '#1A1A24', height: '70%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#2A2A35', paddingBottom: 15, marginBottom: 20 },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  commentItem: { flexDirection: 'row', marginBottom: 20 },
  commentUser: { color: '#888', fontSize: 12, marginBottom: 4, fontWeight: '600' },
  commentText: { color: '#fff', fontSize: 15, lineHeight: 20 },
  
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#2A2A35', paddingTop: 15, paddingBottom: 15 },
  input: { flex: 1, backgroundColor: '#0A0A0F', color: '#fff', borderRadius: 25, paddingHorizontal: 20, paddingVertical: 12, fontSize: 15 },
});