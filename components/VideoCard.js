import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, Pressable, Modal, TextInput, Switch,
  KeyboardAvoidingView, Platform, Alert, FlatList, ActivityIndicator, Image, Animated, Share
} from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { databases, storage, ID, Permission, Query, Role } from '../config/appwrite';
import { BUCKET_ID, DATABASE_ID, COLLECTIONS, COLORS, fileIdFromUrl } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { notify, reportVideo, timeAgo, toggleLike } from '../config/helpers';
import Avatar from './Avatar';

export default function VideoCard({
  item,
  isActive,
  height,
  muted = false,
  onOpenProfile,
  onDeleted,
  onNotInterested,
  onBlockUser,
}) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isOwnVideo = user?.$id === item.userId;

  const [paused, setPaused] = useState(false);
  const [likes, setLikes] = useState(item.likes || 0);
  const [viewCount, setViewCount] = useState(item.views || 0);
  const [isLiked, setIsLiked] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [isCommentsVisible, setIsCommentsVisible] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [creatorMenuVisible, setCreatorMenuVisible] = useState(false);
  const [editDetailsVisible, setEditDetailsVisible] = useState(false);
  const [videoCaption, setVideoCaption] = useState(item.caption || '');
  const [videoCategory, setVideoCategory] = useState(item.category || 'General');
  const [isPrivate, setIsPrivate] = useState(item.isPrivate === true);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);
  const [isSavingToDevice, setIsSavingToDevice] = useState(false);
  const [isSharingVideo, setIsSharingVideo] = useState(false);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  const heartScale = useRef(new Animated.Value(1)).current;
  const busy = useRef(false);
  const fetchedMeta = useRef(false);
  const viewCounted = useRef(false);

  // ── expo-video player ──
  const player = useVideoPlayer(item.videoUrl, (p) => {
    p.loop = true;
    p.muted = muted;
    if (isActive && !paused) p.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player?.playing ?? false });

  useEffect(() => {
    setVideoCaption(item.caption || '');
    setVideoCategory(item.category || 'General');
    setIsPrivate(item.isPrivate === true);
  }, [item.$id, item.caption, item.category, item.isPrivate]);

  useEffect(() => {
    if (!player) return;
    try {
      if (isActive && !paused) player.play();
      else player.pause();
    } catch (e) { console.log('Player action failed:', e); }
  }, [isActive, paused, player]);

  useEffect(() => { if (player) player.muted = muted; }, [muted, player]);

  useEffect(() => {
    if (!isActive) {
      viewCounted.current = false;
      return;
    }

    if (paused || !isPlaying || viewCounted.current) return undefined;

    const timer = setTimeout(async () => {
      viewCounted.current = true;
      try {
        const updatedVideo = await databases.incrementDocumentAttribute(
          DATABASE_ID,
          COLLECTIONS.videos,
          item.$id,
          'views',
          1,
        );
        setViewCount(Number(updatedVideo.views) || 0);
      } catch (error) {
        console.error('Error incrementing video view count:', error);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [isActive, isPlaying, item.$id, paused]);

  // Detect native playback errors (Just logs, does not hide video)
  const { status, error } = useEvent(player, 'statusChange', { status: player?.status });
  useEffect(() => {
    if (status === 'error') console.log('Video playback error:', error);
  }, [status, error]);

  // ── Fetch Meta (Likes, Comments, Bookmarks, Follows) ──
  useEffect(() => {
    if (!isActive || fetchedMeta.current || !user) return;
    fetchedMeta.current = true;
    
    (async () => {
      // 1. Check if Liked
      try {
        const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.likes, [
          Query.equal('videoId', item.$id), Query.equal('userId', user.$id), Query.limit(1),
        ]);
        if (res.documents[0]) setIsLiked(true);
      } catch (e) { console.log(e.message); }

      // 2. Get Comment Count
      try {
        const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.comments, [
          Query.equal('videoId', item.$id), Query.limit(1),
        ]);
        setCommentCount(res.total);
      } catch (e) { console.log(e.message); }

      // 3. Check if Bookmarked
      try {
        const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.bookmarks, [
          Query.equal('videoId', item.$id), Query.equal('userId', user.$id), Query.limit(1),
        ]);
        if (res.documents[0]) setIsBookmarked(true);
      } catch (e) { console.log(e.message); }

      // 4. Check if Following Creator
      if (item.userId !== user.$id) {
        try {
          const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.follows, [
            Query.equal('followerId', user.$id), 
            Query.equal('followingId', item.userId), 
            Query.limit(1)
          ]);
          if (res.documents[0]) setIsFollowing(true);
        } catch (e) { console.log(e.message); }
      }
    })();
  }, [isActive, user, item.$id, item.userId]);

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

  // ── Actions ──
  const handleLike = async () => {
    if (busy.current || !user) return;
    busy.current = true;

    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.4, duration: 100, useNativeDriver: true }),
      Animated.timing(heartScale, { toValue: 1, duration: 100, useNativeDriver: true })
    ]).start();

    const previousIsLiked = isLiked;
    const previousLikes = likes;
    const nextIsLiked = !previousIsLiked;
    const newCount = Math.max(0, previousLikes + (nextIsLiked ? 1 : -1));
    setLikes(newCount);
    setIsLiked(nextIsLiked);

    try {
      const result = await toggleLike(item.$id, user.$id);
      setLikes(result.likes);
      setIsLiked(result.isLiked);
      if (result.isLiked && item.userId !== user.$id) {
        notify(item.userId, user.name || 'Someone', 'like');
      }
    } catch (error) {
      console.error('Could not update video like:', error);
      setLikes(previousLikes);
      setIsLiked(previousIsLiked);
      Alert.alert('Error', 'Could not update your like. Please try again.');
    } finally { busy.current = false; }
  };

  const handleFollow = async () => {
    if (!user) return;
    try {
      if (isFollowing) {
        const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.follows, [
          Query.equal('followerId', user.$id), Query.equal('followingId', item.userId), Query.limit(1)
        ]);
        if (res.documents[0]) {
          await databases.deleteDocument(DATABASE_ID, COLLECTIONS.follows, res.documents[0].$id);
          setIsFollowing(false);
        }
      } else {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.follows, ID.unique(), {
          followerId: user.$id, followingId: item.userId
        });
        setIsFollowing(true);
        notify(item.userId, user.name || 'Someone', 'follow');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not update follow status.');
    }
  };

  const updateVideoDetails = async (videoId, newCaption, newCategory) => {
    const category = newCategory.trim().slice(0, 50) || 'General';
    const updatedVideo = await databases.updateDocument(
      DATABASE_ID,
      COLLECTIONS.videos,
      videoId,
      { caption: newCaption.trim(), category },
    );
    setVideoCaption(updatedVideo.caption || '');
    setVideoCategory(updatedVideo.category || 'General');
    setEditDetailsVisible(false);
    Alert.alert('Saved', 'Video details updated.');
    return updatedVideo;
  };

  const togglePrivacy = async (videoId, currentStatus) => {
    const nextStatus = !currentStatus;
    setIsPrivate(nextStatus);
    const fileId = fileIdFromUrl(item.videoUrl);
    if (!fileId || !user?.$id) {
      setIsPrivate(currentStatus);
      Alert.alert('Error', 'Could not identify the video file or current owner.');
      return;
    }

    const ownerRole = Role.user(user.$id);
    const permissions = [
      nextStatus ? Permission.read(ownerRole) : Permission.read(Role.any()),
      Permission.update(ownerRole),
      Permission.delete(ownerRole),
    ];
    setIsUpdatingPrivacy(true);
    try {
      await storage.updateFile({
        bucketId: BUCKET_ID,
        fileId,
        permissions,
      });
      const updatedVideo = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.videos,
        videoId,
        { isPrivate: nextStatus },
      );
      setIsPrivate(updatedVideo.isPrivate === true);
    } catch (error) {
      try {
        await storage.updateFile({
          bucketId: BUCKET_ID,
          fileId,
          permissions: [
            currentStatus ? Permission.read(ownerRole) : Permission.read(Role.any()),
            Permission.update(ownerRole),
            Permission.delete(ownerRole),
          ],
        });
      } catch (rollbackError) {
        console.error('Could not restore video storage permissions:', rollbackError);
      }
      setIsPrivate(currentStatus);
      console.error('Could not update video privacy:', error);
      Alert.alert('Error', 'Could not change video privacy. Please try again.');
    } finally {
      setIsUpdatingPrivacy(false);
    }
  };

  const downloadVideoToCache = async () => {
    if (!FileSystem.cacheDirectory) throw new Error('A temporary download folder is unavailable.');
    const downloadUri = `${FileSystem.cacheDirectory}${item.$id}-${Date.now()}.mp4`;
    const result = await FileSystem.downloadAsync(item.videoUrl, downloadUri);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Video download failed (HTTP ${result.status}).`);
    }
    return result.uri;
  };

  const saveVideoToDevice = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Unavailable', 'Saving videos to the gallery is available in the mobile app.');
      return;
    }

    setIsSavingToDevice(true);
    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow gallery access to save this video.');
        return;
      }

      const localUri = await downloadVideoToCache();
      await MediaLibrary.saveToLibraryAsync(localUri);
      setCreatorMenuVisible(false);
      Alert.alert('Saved', 'Video saved to your device.');
    } catch (error) {
      console.error('Could not save video to device:', error);
      Alert.alert('Save failed', error.message || 'Could not save this video.');
    } finally {
      setIsSavingToDevice(false);
    }
  };

  const shareVideo = async () => {
    setIsSharingVideo(true);
    try {
      if (Platform.OS === 'web') {
        await Share.share({
          message: `Check out @${item.userName}'s video on MzansiReels! ${videoCaption}`,
          url: item.videoUrl,
          title: 'MzansiReels',
        });
        setCreatorMenuVisible(false);
        return;
      }

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error('Video sharing is not available on this device.');
      }
      const localUri = await downloadVideoToCache();
      await Sharing.shareAsync(localUri, {
        mimeType: 'video/mp4',
        dialogTitle: 'Share video',
      });
      setCreatorMenuVisible(false);
    } catch (error) {
      console.error('Could not share video:', error);
      Alert.alert('Share failed', error.message || 'Could not share this video.');
    } finally {
      setIsSharingVideo(false);
    }
  };

  const confirmDeleteVideo = () => {
    Alert.alert('Delete Video', 'This will permanently remove this video.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setIsDeletingVideo(true);
          try {
            const fileId = fileIdFromUrl(item.videoUrl);
            if (!fileId) throw new Error('Could not identify the video file in Appwrite Storage.');
            await storage.deleteFile(BUCKET_ID, fileId);
            await databases.deleteDocument(DATABASE_ID, COLLECTIONS.videos, item.$id);
            setCreatorMenuVisible(false);
            setIsDeleted(true);
            onDeleted?.(item.$id);
          } catch (error) {
            console.error('Could not delete video:', error);
            Alert.alert('Delete failed', error.message || 'Could not delete this video.');
          } finally {
            setIsDeletingVideo(false);
          }
        },
      },
    ]);
  };

  const promptVideoReport = () => {
    if (!user?.$id) {
      Alert.alert('Sign in required', 'Please sign in to report a video.');
      return;
    }

    Alert.alert('Report Video', 'Why are you reporting this video?', [
      { text: 'Spam', onPress: () => submitVideoReport('Spam') },
      { text: 'Harassment', onPress: () => submitVideoReport('Harassment') },
      { text: 'Nudity', onPress: () => submitVideoReport('Nudity') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const submitVideoReport = async (reason) => {
    try {
      await reportVideo(item.$id, user.$id, reason);
      setCreatorMenuVisible(false);
      Alert.alert('Report submitted', 'Thank you for your report. Our team will review this.');
    } catch (error) {
      console.error('Could not report video:', error);
      Alert.alert('Report failed', error.message || 'Could not submit your report. Please try again.');
    }
  };

  const blockCreator = () => {
    if (!user?.$id) {
      Alert.alert('Sign in required', 'Please sign in to block a creator.');
      return;
    }

    Alert.alert('Block User', 'Are you sure you want to block this user?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block User',
        style: 'destructive',
        onPress: async () => {
          try {
            if (!onBlockUser) throw new Error('Blocking is unavailable right now.');
            await onBlockUser(item.userId);
            setCreatorMenuVisible(false);
            Alert.alert('User blocked', 'Their videos are hidden from your feed.');
          } catch (error) {
            console.error('Could not block creator:', error);
            Alert.alert('Block failed', error.message || 'Could not block this user. Please try again.');
          }
        },
      },
    ]);
  };

  const hideVideo = () => {
    onNotInterested?.(item.$id);
    setCreatorMenuVisible(false);
    Alert.alert('Video hidden', 'We’ll show you fewer videos like this.');
  };

  if (isDeleted) return null;

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
    } catch (error) { Alert.alert('Error', 'Could not update bookmark.'); }
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
        videoId: item.$id, userName: displayName, text: newComment.trim(), avatarUrl: userAvatar,
      });
      setComments((prev) => [response, ...prev]);
      setCommentCount((c) => c + 1);
      setNewComment('');
      if (item.userId !== user.$id) notify(item.userId, displayName, 'comment');
    } catch (error) { Alert.alert('Error', 'Could not post comment.'); }
    finally { setIsSubmitting(false); }
  };

  const isCreatorVerified = item.userName?.toLowerCase() === 'mzansireel' || item.isVerified === true;

  return (
    <View style={[styles.card, { height: height || '100%' }]}>
      
      {/* 1. FALLBACK BACKGROUND (Thumbnail) */}
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFillObject} blurRadius={15} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#111' }]} />
      )}

      {/* 2. VIDEO PLAYER */}
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
        allowsFullscreen={false}
      />

      {/* 3. PAUSE ICON */}
      {paused && (
        <View style={styles.centerScreen}>
          <Ionicons name="play" size={80} color="rgba(255,255,255,0.7)" />
        </View>
      )}

      {/* TAP TO PAUSE */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => setPaused((p) => !p)} />

      {/* 4. BOTTOM GRADIENT & OVERLAY */}
      <LinearGradient 
        colors={['transparent', 'rgba(0,0,0,0.8)']} 
        style={styles.bottomGradient} 
        pointerEvents="none" 
      />
      
      <View style={[styles.bottomOverlay, { bottom: Math.max(insets.bottom, 20) + 10 }]} pointerEvents="box-none">
        <TouchableOpacity onPress={() => onOpenProfile?.(item)} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.username}>@{item.userName || 'user'}</Text>
          {isCreatorVerified && (
            <Ionicons name="checkmark-circle" size={16} color={COLORS.cyan} style={{ marginLeft: 5, marginBottom: 6 }} />
          )}
        </TouchableOpacity>
        
        <Text style={styles.caption} numberOfLines={2}>{videoCaption}</Text>
        {item.hashtags && <Text style={styles.hashtags}>{item.hashtags}</Text>}
        
        <View style={styles.soundContainer}>
          <Ionicons name="musical-notes" size={14} color="#fff" />
          <Text style={styles.soundText} numberOfLines={1}>{item.soundName || 'Original Audio'}</Text>
        </View>
        {isOwnVideo && (
          <Text style={styles.viewCount}>👁️ {viewCount} views</Text>
        )}
      </View>

      {/* 5. RIGHT FLOATING ACTION COLUMN */}
      <View style={[styles.rightOverlay, { bottom: insets.bottom + 20 }]}>
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={() => onOpenProfile?.(item)}>
            <View style={styles.avatarWrapper}>
              <Avatar uri={item.avatarUrl} name={item.userName} size={48} />
            </View>
          </TouchableOpacity>

          {!isOwnVideo && (
            <TouchableOpacity onPress={handleFollow} style={[styles.followButton, isFollowing && styles.followingButton]}>
              <Ionicons name={isFollowing ? 'checkmark' : 'add'} size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.actionButton} onPress={handleLike}>
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={36} color={isLiked ? COLORS.pink : '#fff'} />
          </Animated.View>
          <Text style={styles.actionText}>{likes}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={() => setIsCommentsVisible(true)}>
          <Ionicons name="chatbubble" size={34} color="#fff" />
          <Text style={styles.actionText}>{commentCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleBookmark}>
          <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={30} color={isBookmarked ? COLORS.cyan : '#fff'} />
          <Text style={styles.actionText}>Save</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={shareVideo} disabled={isSharingVideo}>
          <Ionicons name="arrow-redo" size={32} color="#fff" />
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => setCreatorMenuVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="More video options"
        >
          <Ionicons name="ellipsis-vertical" size={30} color="#fff" />
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

      <Modal
        animationType="slide"
        transparent
        visible={creatorMenuVisible}
        onRequestClose={() => setCreatorMenuVisible(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setCreatorMenuVisible(false)} />
          <View style={[styles.creatorSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Video options</Text>
              <TouchableOpacity onPress={() => setCreatorMenuVisible(false)} accessibilityLabel="Close video options">
                <Ionicons name="close" size={25} color="#fff" />
              </TouchableOpacity>
            </View>

            {isOwnVideo ? (
              <>
                <View style={styles.statsRow}>
                  <Text style={styles.statsText}>Views  {viewCount}</Text>
                  <Text style={styles.statsText}>Likes  {likes}</Text>
                  <Text style={styles.statsText}>Comments  {commentCount}</Text>
                </View>

                <TouchableOpacity
                  style={styles.creatorMenuRow}
                  onPress={() => {
                    setVideoCaption(item.caption || '');
                    setVideoCategory(item.category || 'General');
                    setCreatorMenuVisible(false);
                    setEditDetailsVisible(true);
                  }}
                >
                  <Ionicons name="create-outline" size={22} color={COLORS.cyan} />
                  <Text style={styles.creatorMenuText}>Edit caption & category</Text>
                  <Ionicons name="chevron-forward" size={19} color={COLORS.muted} />
                </TouchableOpacity>

                <View style={styles.creatorMenuRow}>
                  <Ionicons name={isPrivate ? 'lock-closed-outline' : 'globe-outline'} size={22} color={COLORS.cyan} />
                  <View style={styles.privacyLabel}>
                    <Text style={styles.creatorMenuText}>{isPrivate ? 'Private video' : 'Public video'}</Text>
                    <Text style={styles.privacyHint}>Only you can see a private video</Text>
                  </View>
                  <Switch
                    value={!isPrivate}
                    onValueChange={() => togglePrivacy(item.$id, isPrivate)}
                    disabled={isUpdatingPrivacy}
                    trackColor={{ false: '#444', true: COLORS.cyan }}
                    thumbColor="#fff"
                    accessibilityLabel="Make video public"
                  />
                </View>

                <TouchableOpacity
                  style={styles.creatorMenuRow}
                  onPress={saveVideoToDevice}
                  disabled={isSavingToDevice}
                >
                  {isSavingToDevice
                    ? <ActivityIndicator size="small" color={COLORS.cyan} />
                    : <Ionicons name="download-outline" size={22} color={COLORS.cyan} />}
                  <Text style={styles.creatorMenuText}>Save to device</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.creatorMenuRow} onPress={shareVideo} disabled={isSharingVideo}>
                  {isSharingVideo
                    ? <ActivityIndicator size="small" color={COLORS.cyan} />
                    : <Ionicons name="share-outline" size={22} color={COLORS.cyan} />}
                  <Text style={styles.creatorMenuText}>Share video</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.creatorMenuRow, styles.deleteMenuRow]}
                  onPress={confirmDeleteVideo}
                  disabled={isDeletingVideo}
                >
                  {isDeletingVideo
                    ? <ActivityIndicator size="small" color="#FF5B67" />
                    : <Ionicons name="trash-outline" size={22} color="#FF5B67" />}
                  <Text style={[styles.creatorMenuText, styles.deleteMenuText]}>Delete video</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.creatorMenuRow}
                  onPress={shareVideo}
                  disabled={isSharingVideo}
                >
                  {isSharingVideo
                    ? <ActivityIndicator size="small" color={COLORS.cyan} />
                    : <Ionicons name="share-outline" size={22} color={COLORS.cyan} />}
                  <Text style={styles.creatorMenuText}>Share video</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.creatorMenuRow} onPress={promptVideoReport}>
                  <Ionicons name="flag-outline" size={22} color="#FF5B67" />
                  <Text style={styles.creatorMenuText}>Report Video</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.creatorMenuRow, styles.deleteMenuRow]}
                  onPress={blockCreator}
                >
                  <Ionicons name="person-remove-outline" size={22} color="#FF5B67" />
                  <Text style={[styles.creatorMenuText, styles.deleteMenuText]}>Block User</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.creatorMenuRow} onPress={hideVideo}>
                  <Ionicons name="eye-off-outline" size={22} color={COLORS.cyan} />
                  <Text style={styles.creatorMenuText}>Not interested</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={editDetailsVisible}
        onRequestClose={() => setEditDetailsVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.editModalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.editModal}>
            <Text style={styles.sheetTitle}>Edit video</Text>
            <Text style={styles.editLabel}>Caption</Text>
            <TextInput
              style={[styles.editInput, styles.captionInput]}
              value={videoCaption}
              onChangeText={setVideoCaption}
              placeholder="Write a caption"
              placeholderTextColor={COLORS.muted}
              multiline
              maxLength={2000}
            />
            <Text style={styles.editLabel}>Category</Text>
            <TextInput
              style={styles.editInput}
              value={videoCategory}
              onChangeText={setVideoCategory}
              placeholder="General"
              placeholderTextColor={COLORS.muted}
              maxLength={50}
            />
            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setEditDetailsVisible(false)}
                disabled={isSavingDetails}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={async () => {
                  setIsSavingDetails(true);
                  try {
                    await updateVideoDetails(item.$id, videoCaption, videoCategory);
                  } catch (error) {
                    console.error('Could not update video details:', error);
                    Alert.alert('Save failed', error.message || 'Could not update this video.');
                  } finally {
                    setIsSavingDetails(false);
                  }
                }}
                disabled={isSavingDetails}
              >
                {isSavingDetails
                  ? <ActivityIndicator size="small" color="#000" />
                  : <Text style={styles.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 5 };

const styles = StyleSheet.create({
  card: { width: '100%', justifyContent: 'flex-end', backgroundColor: '#000' },
  centerScreen: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 5 },
  
  video: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%',
  },

  // Gradient overlay at bottom
  bottomGradient: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 180, zIndex: 2,
  },

  bottomOverlay: { position: 'absolute', left: 15, right: 80, zIndex: 10 },
  username: { color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 6, ...shadow },
  caption: { color: '#fff', fontSize: 15, lineHeight: 20, fontWeight: '400', marginBottom: 2, ...shadow },
  hashtags: { color: COLORS.cyan, fontSize: 14, fontWeight: '600', marginBottom: 6, ...shadow },
  soundContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  soundText: { color: '#fff', fontSize: 13, marginLeft: 5, ...shadow },
  viewCount: { color: '#fff', fontSize: 12, fontWeight: '600', marginTop: 5, ...shadow },
  rightOverlay: {
    position: 'absolute',
    right: 15,
    width: 64,
    maxWidth: 64,
    alignItems: 'center',
    zIndex: 10,
  },

  avatarSection: {
    width: 56,
    alignItems: 'center',
    marginBottom: 22,
  },
  avatarWrapper: {
    width: 54,
    height: 54,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 27,
    padding: 1,
  },
  followButton: {
    position: 'absolute',
    bottom: -9,
    left: 16,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.pink,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fff',
  },
  followingButton: { backgroundColor: COLORS.cyan },

  actionButton: {
    width: 64,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 18,
  },
  actionText: {
    width: '100%',
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  modalContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalBackground: { flex: 1 },
  modalContent: { backgroundColor: '#1A1A24', height: '70%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.62)' },
  creatorSheet: {
    backgroundColor: '#171720',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: COLORS.border,
  },
  sheetHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#555', alignSelf: 'center', marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  statsText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  creatorMenuRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    gap: 14,
  },
  creatorMenuText: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' },
  privacyLabel: { flex: 1 },
  privacyHint: { color: COLORS.muted, fontSize: 11, marginTop: 3 },
  deleteMenuRow: { borderBottomWidth: 0, marginTop: 2 },
  deleteMenuText: { color: '#FF5B67' },
  editModalBackdrop: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: 'rgba(0,0,0,0.72)' },
  editModal: { backgroundColor: '#171720', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: COLORS.border },
  editLabel: { color: COLORS.muted, fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 7 },
  editInput: {
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  captionInput: { minHeight: 94, textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  cancelButton: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 9, backgroundColor: COLORS.card },
  cancelText: { color: '#fff', fontWeight: '600' },
  saveButton: { minWidth: 76, alignItems: 'center', paddingHorizontal: 18, paddingVertical: 11, borderRadius: 9, backgroundColor: COLORS.cyan },
  saveText: { color: '#000', fontWeight: '700' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#2A2A35', paddingBottom: 15, marginBottom: 20 },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 },
  commentItem: { flexDirection: 'row', marginBottom: 20 },
  commentUser: { color: '#888', fontSize: 12, marginBottom: 4, fontWeight: '600' },
  commentText: { color: '#fff', fontSize: 15, lineHeight: 20 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#2A2A35', paddingTop: 15, paddingBottom: 15 },
  input: { flex: 1, backgroundColor: '#0A0A0F', color: '#fff', borderRadius: 25, paddingHorizontal: 20, paddingVertical: 12, fontSize: 15 },
});