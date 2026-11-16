import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useIsFocused } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Avatar from './Avatar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { databases, ID, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import { formatStoryAge, getStoryExpiresAt } from '../config/storyUtils';
import { getOrCreateChat, sendMessage } from '../config/chatService';

const STORY_DURATION_MS = 15000;

function StoryVideo({ uri, shouldPlay }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = false;
  });
  const { status, error } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    if (shouldPlay) player.play();
    else player.pause();
    return () => player.pause();
  }, [player, shouldPlay]);

  return (
    <>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
      />
      {status === 'error' ? (
        <View style={styles.mediaError}>
          <Text style={styles.mediaErrorText}>{error?.message || 'Could not load this video.'}</Text>
        </View>
      ) : status === 'loading' ? (
        <ActivityIndicator style={styles.mediaLoading} color={COLORS.cyan} size="large" />
      ) : null}
    </>
  );
}

function ProgressSegment({ active, complete, progress }) {
  const width = complete ? '100%' : active ? progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  }) : '0%';
  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, { width }]} />
    </View>
  );
}

function ViewersBottomSheet({ visible, storyId, onClose }) {
  const [viewers, setViewers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible || !storyId) return;
    loadViewers();
  }, [visible, storyId]);

  const loadViewers = async () => {
    if (!storyId) return;
    setLoading(true);
    setError('');
    try {
      const pages = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const page = await databases.listDocuments(DATABASE_ID, COLLECTIONS.storyViews, [
          Query.equal('storyId', storyId),
          Query.orderDesc('viewedAt'),
          Query.limit(100),
          Query.offset(offset),
        ]);
        pages.push(...page.documents);
        offset += page.documents.length;
        hasMore = page.documents.length > 0 && offset < page.total;
      }

      const viewerById = new Map();
      pages.forEach((doc) => {
        const prev = viewerById.get(doc.viewerId);
        if (!prev || new Date(doc.viewedAt) > new Date(prev.viewedAt)) {
          viewerById.set(doc.viewerId, doc);
        }
      });

      const uniqueViewers = [...viewerById.values()];
      setViewers(uniqueViewers);
    } catch (err) {
      console.error('Could not load story viewers:', err);
      setError(err.message || 'Could not load viewers.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.sheetBackdrop} onPress={onClose} activeOpacity={1} />
      <TouchableOpacity
        style={[styles.sheet, { paddingBottom: undefined }]}
        onPress={(e) => e.stopPropagation()}
        activeOpacity={1}
      >
        <View style={styles.sheetHandle} />
        <Text style={[styles.sheetTitle, { color: COLORS.text }]}>Story Views</Text>
        <View style={styles.sheetClose} onPress={onClose}>
          <Ionicons name="close" size={24} color={COLORS.text} />
        </View>

        {loading ? (
          <View style={styles.sheetLoading}>
            <ActivityIndicator size="large" color={COLORS.cyan} />
          </View>
        ) : error ? (
          <View style={styles.sheetError}>
            <Text style={styles.sheetErrorText}>{error}</Text>
          </View>
        ) : (
          <FlatList
            data={viewers}
            keyExtractor={(item) => item.$id || item.viewerId}
            renderItem={({ item }) => (
              <View style={styles.viewerItem}>
                <Avatar uri={item.viewerAvatar} userId={item.viewerId} name={item.viewerName} size={40} />
                <Text style={[styles.viewerName, { color: COLORS.text }]}>{item.viewerName || 'Mzansi User'}</Text>
              </View>
            )}
            contentContainerStyle={styles.viewerList}
            ListEmptyComponent={<Text style={styles.sheetEmpty}>No views yet.</Text>}
          />
        )}
      </TouchableOpacity>
    </Modal>
  );
}

export default function StoryViewer({
  visible,
  storyGroups,
  initialGroupIndex = 0,
  userId,
  currentUser,
  onClose,
  onViewRecorded,
}) {
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const [imageError, setImageError] = useState(false);
  const group = storyGroups[groupIndex];
  const stories = group?.stories || [];
  const story = stories[storyIndex];
  const storyRef = useRef(story);
  storyRef.current = story;
  const storyIdRef = useRef(story?.$id);
  storyIdRef.current = story?.$id;
  const mountedRef = useRef(false);
  const trackedStoryIds = useRef(new Set());
  const remainingDuration = useRef(STORY_DURATION_MS);
  const [pressPaused, setPressPaused] = useState(false);
  const [appIsActive, setAppIsActive] = useState(
    AppState.currentState === 'active' || AppState.currentState === null,
  );
  const [authorProfile, setAuthorProfile] = useState(null);
  const isOwner = story?.userId === userId;
  const [viewersVisible, setViewersVisible] = useState(false);
  const [viewTrackingError, setViewTrackingError] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const screenFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [isStoryLiked, setIsStoryLiked] = useState(false);
  const [storyLikesCount, setStoryLikesCount] = useState(0);
  const [likedStoryIds, setLikedStoryIds] = useState(new Set());
  const storyPaused = pressPaused || viewersVisible || !appIsActive || !screenFocused;
  const pendingInitialStoryId = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const closeViewer = useCallback(() => {
    setViewersVisible(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!visible) return;
    const nextGroupIndex = Math.max(0, Math.min(initialGroupIndex, storyGroups.length - 1));
    pendingInitialStoryId.current = storyGroups[nextGroupIndex]?.stories?.[0]?.$id || null;
    setGroupIndex(nextGroupIndex);
    setStoryIndex(0);
    setImageError(false);
    setPressPaused(false);
  }, [initialGroupIndex, storyGroups.length, visible]);

  useEffect(() => {
    setImageError(false);
  }, [story?.$id]);

  const goNext = useCallback(() => {
    if (storyIndex + 1 < stories.length) {
      setStoryIndex((current) => current + 1);
    } else if (groupIndex + 1 < storyGroups.length) {
      setGroupIndex((current) => current + 1);
      setStoryIndex(0);
    } else {
      closeViewer();
    }
  }, [closeViewer, groupIndex, stories.length, storyIndex, storyGroups.length]);

  const goPrevious = useCallback(() => {
    if (storyIndex > 0) {
      setStoryIndex((current) => current - 1);
    } else if (groupIndex > 0) {
      const previousGroupIndex = groupIndex - 1;
      setGroupIndex(previousGroupIndex);
      setStoryIndex(Math.max(0, storyGroups[previousGroupIndex].stories.length - 1));
    }
  }, [groupIndex, storyIndex, storyGroups]);

  useEffect(() => {
    if (!story?.$id) return;
    remainingDuration.current = STORY_DURATION_MS;
    progress.setValue(0);
    setPressPaused(false);
  }, [progress, story?.$id]);

  useEffect(() => {
    if (!visible || !story || storyPaused) return undefined;
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: remainingDuration.current,
      useNativeDriver: false,
    });
    animation.start();
    const timer = setTimeout(goNext, remainingDuration.current);
    return () => {
      clearTimeout(timer);
      progress.stopAnimation((value) => {
        if (storyIdRef.current === story?.$id) {
          remainingDuration.current = Math.max(0, STORY_DURATION_MS * (1 - value));
        }
      });
    };
  }, [goNext, progress, story?.$id, storyPaused, visible]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppIsActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let active = true;
    if (!visible || !screenFocused || !story?.userId) return () => { active = false; };
    setAuthorProfile(null);
    databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
      Query.equal('userId', story.userId),
      Query.limit(1),
    ])
      .then(async (result) => {
        let profile = result.documents[0] || null;
        if (!profile) {
          try {
            profile = await databases.getDocument(
              DATABASE_ID,
              COLLECTIONS.users,
              story.userId,
            );
          } catch (error) {
            if (error?.code !== 404) throw error;
          }
        }
        if (active) {
          setAuthorProfile(profile || (
            story.userId === userId ? currentUser : null
          ));
        }
      })
      .catch((error) => {
        console.error(`Could not load story author ${story.userId}:`, error);
      });
    return () => { active = false; };
  }, [currentUser, screenFocused, story?.userId, userId, visible]);

  useEffect(() => {
    let active = true;
    const selectedStory = storyRef.current;
    if (!visible || !screenFocused || !selectedStory || isOwner || !userId) {
      return () => { active = false; };
    }
    if (pendingInitialStoryId.current && selectedStory.$id !== pendingInitialStoryId.current) {
      return () => { active = false; };
    }
    pendingInitialStoryId.current = null;
    if (trackedStoryIds.current.has(selectedStory.$id)) return () => { active = false; };
    trackedStoryIds.current.add(selectedStory.$id);

    setViewTrackingError('');

    (async () => {
      try {
        const existing = await databases.listDocuments(DATABASE_ID, COLLECTIONS.storyViews, [
          Query.equal('storyId', selectedStory.$id),
          Query.equal('viewerId', userId),
          Query.limit(1),
        ]);

        if (existing.documents.length > 0) {
          if (active) setViewerCount(existing.documents.length);
          return;
        }

        await databases.createDocument(DATABASE_ID, COLLECTIONS.storyViews, ID.unique(), {
          storyId: selectedStory.$id,
          viewerId: userId,
          viewerName: currentUser?.name || '',
          viewerAvatar: currentUser?.avatarUrl || '',
          viewedAt: new Date().toISOString(),
        });

        if (active) setViewerCount(1);
        if (mountedRef.current) onViewRecorded?.(selectedStory, selectedStory.$id);
      } catch (error) {
        console.error(`Could not record story view for ${selectedStory.$id}:`, error);
        trackedStoryIds.current.delete(selectedStory.$id);
        if (active) setViewTrackingError(error.message || 'Could not record this story view.');
      }
    })();

    return () => { active = false; };
  }, [currentUser, isOwner, onViewRecorded, screenFocused, story?.$id, userId, visible]);

  useEffect(() => {
    if (!visible || !story) return undefined;
    const expiresAt = getStoryExpiresAt(story);
    if (expiresAt === null || expiresAt <= Date.now()) {
      closeViewer();
      return undefined;
    }
    const expirationTimer = setTimeout(closeViewer, expiresAt - Date.now());
    return () => clearTimeout(expirationTimer);
  }, [closeViewer, story, visible]);

  const loadViewerCount = async () => {
    if (!story?.$id) return;
    try {
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.storyViews, [
        Query.equal('storyId', story.$id),
        Query.limit(1),
      ]);
      setViewerCount(result.total);
    } catch (error) {
      console.error('Could not load viewer count:', error);
    }
  };

  useEffect(() => {
    loadViewerCount();
  }, [story?.$id]);

  useEffect(() => {
    let active = true;
    const loadLikes = async () => {
      try {
        const raw = await AsyncStorage.getItem(`@mzansireels/liked_stories_${userId}`);
        const ids = raw ? new Set(JSON.parse(raw)) : new Set();
        setLikedStoryIds(ids);
        if (story?.$id) {
          setIsStoryLiked(ids.has(story.$id));
          setStoryLikesCount(story.likes || 0);
        }
      } catch (error) {
        console.error('Could not load liked stories:', error);
      }
    };
    if (userId) loadLikes();
    return () => { active = false; };
  }, [userId, story?.$id]);

  const sendReply = async () => {
    if (!replyText.trim()) return;
    if (!currentUser?.$id) return;
    setSendingReply(true);
    try {
      const chat = await getOrCreateChat(currentUser.$id, story.userId);
      await sendMessage(
        chat.$id,
        currentUser.$id,
        story.userId,
        replyText,
        {
          storyId: story.$id,
          storyMediaUrl: story.mediaUrl || mediaUrl,
        },
      );
      setReplyText('');
      Alert.alert('Reply sent!');
    } catch (error) {
      console.error('Could not send story reply:', error);
      Alert.alert('Reply failed', error.message || 'Could not send your reply.');
    } finally {
      setSendingReply(false);
    }
  };

  const sendHeartReply = async () => {
    if (!currentUser?.$id) return;
    setSendingReply(true);
    try {
      const chat = await getOrCreateChat(currentUser.$id, story.userId);
      await sendMessage(chat.$id, currentUser.$id, story.userId, '❤️');
      Alert.alert('Reply sent!');
    } catch (error) {
      console.error('Could not send heart reply:', error);
      Alert.alert('Reply failed', error.message || 'Could not send your reply.');
    } finally {
      setSendingReply(false);
    }
  };

  const handleLike = async () => {
    if (!currentUser?.$id || !story?.$id) return;
    const storageKey = `@mzansireels/liked_stories_${userId}`;
    const alreadyLiked = likedStoryIds.has(story.$id);
    const newIds = new Set(likedStoryIds);
    const newCount = alreadyLiked ? Math.max(0, storyLikesCount - 1) : storyLikesCount + 1;
    const newLiked = !alreadyLiked;

    setIsStoryLiked(newLiked);
    setStoryLikesCount(newCount);
    if (alreadyLiked) newIds.delete(story.$id); else newIds.add(story.$id);
    setLikedStoryIds(newIds);

    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify([...newIds]));
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.stories, story.$id, { likes: newCount });
    } catch (error) {
      console.error('Could not toggle story like:', error);
      setIsStoryLiked(alreadyLiked);
      setStoryLikesCount(alreadyLiked ? storyLikesCount + 1 : Math.max(0, storyLikesCount - 1));
      if (alreadyLiked) newIds.delete(story.$id); else newIds.add(story.$id);
      setLikedStoryIds(newIds);
    }
  };

  if (!story) return null;
  const expiresAt = getStoryExpiresAt(story);
  if (expiresAt === null || expiresAt <= Date.now()) return null;
  const mediaType = story.mediaType || story.type;
  const authorName = authorProfile?.displayName
    || authorProfile?.name
    || story.username
    || story.userName
    || 'Name unavailable';
  const authorUsername = (authorProfile?.username || story.username || '').replace(/^@+/, '');
  const mediaUrl = story.mediaUrl
    || (mediaType === 'video' ? story.videoUrl : story.imageUrl)
    || story.videoUrl
    || story.imageUrl;

  return (
    <>
      <Modal
        visible={visible}
        animationType="fade"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={closeViewer}
      >
        <StatusBar hidden />
        <View style={styles.screen}>
          <View style={styles.mediaWrapper}>
            {mediaType === 'video' && mediaUrl ? (
              <StoryVideo
                key={story.$id}
                uri={mediaUrl}
                shouldPlay={visible && !storyPaused && !viewersVisible}
              />
            ) : mediaUrl && !imageError ? (
              <Image
                source={{ uri: mediaUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
                onError={() => setImageError(true)}
              />
            ) : mediaUrl ? (
              <View style={styles.mediaError}>
                <Text style={[styles.mediaErrorText, { color: COLORS.text }]}>Could not load this image.</Text>
              </View>
            ) : (
              <View style={styles.textStory}>
                <Text style={[styles.storyText, { color: COLORS.text }]}>{story.content}</Text>
              </View>
            )}

            <View style={styles.tapZones}>
              <Pressable
                style={styles.leftZone}
                onPressIn={() => setPressPaused(true)}
                onPressOut={() => setPressPaused(false)}
                onPress={goPrevious}
                accessibilityLabel="Previous story"
              />
              <Pressable
                style={styles.rightZone}
                onPressIn={() => setPressPaused(true)}
                onPressOut={() => setPressPaused(false)}
                onPress={goNext}
                accessibilityLabel="Next story"
              />
            </View>

            {isOwner ? (
              <View style={styles.analyticsOverlay}>
                <TouchableOpacity
                  style={styles.viewersButton}
                  onPress={() => setViewersVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel="View story viewers"
                >
                  <Ionicons name="eye-outline" size={17} color={COLORS.bg} />
                  <Text style={[styles.viewersButtonText, { color: COLORS.bg }]}>
                    {viewerCount} Viewers
                  </Text>
                </TouchableOpacity>
              </View>
            ) : viewTrackingError ? (
              <View style={styles.viewTrackingError}>
                <Text style={styles.viewTrackingErrorText}>{viewTrackingError}</Text>
              </View>
            ) : null}

            <View style={styles.header}>
              <View style={styles.progressRow}>
                {stories.map((item, index) => (
                  <ProgressSegment
                    key={item.$id}
                    complete={index < storyIndex}
                    active={index === storyIndex}
                    progress={progress}
                  />
                ))}
              </View>
              <View style={styles.userRow}>
                <Avatar
                  uri={authorProfile?.avatarUrl || story.avatarUrl}
                  userId={story.userId}
                  name={authorName}
                  size={36}
                />
                <View style={styles.authorDetails}>
                  <Text numberOfLines={1} style={[styles.userName, { color: COLORS.text }]}>{authorName}</Text>
                  <Text numberOfLines={1} style={[styles.storyAge, { color: COLORS.muted }]}>
                    {authorUsername ? `@${authorUsername} · ` : ''}{formatStoryAge(story)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={closeViewer}
                  accessibilityRole="button"
                  accessibilityLabel="Close story"
                >
                  <Ionicons name="close" size={26} color={COLORS.text} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? insets.bottom + 14 : 0}
            style={[styles.replyWrapper, { paddingBottom: insets.bottom }]}
          >
            {!isOwner && (
              <View style={styles.replyBar}>
                <TouchableOpacity
                  style={[styles.storyLike, isStoryLiked && styles.storyLikeActive]}
                  onPress={handleLike}
                  disabled={sendingReply}
                  accessibilityRole="button"
                  accessibilityLabel={isStoryLiked ? 'Unlike story' : 'Like story'}
                >
                  <Ionicons
                    name={isStoryLiked ? 'heart' : 'heart-outline'}
                    size={20}
                    color={isStoryLiked ? COLORS.cyan : COLORS.text}
                  />
                </TouchableOpacity>
                <TextInput
                  style={[styles.replyInput, sendingReply && styles.replyInputDisabled]}
                  value={replyText}
                  onChangeText={setReplyText}
                  placeholder="Send a reply…"
                  placeholderTextColor={COLORS.muted}
                  editable={!sendingReply}
                  maxLength={500}
                  returnKeyType="send"
                  onSubmitEditing={sendReply}
                  accessibilityLabel="Story reply"
                />
                <TouchableOpacity
                  style={[styles.replySend, sendingReply && styles.replySendDisabled]}
                  onPress={sendReply}
                  disabled={!replyText.trim() || sendingReply}
                  accessibilityRole="button"
                  accessibilityLabel="Send reply"
                >
                  {sendingReply ? (
                    <ActivityIndicator size="small" color={COLORS.bg} />
                  ) : (
                    <Ionicons name="send" size={20} color={COLORS.bg} />
                  )}
                </TouchableOpacity>
              </View>
            )}
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <ViewersBottomSheet
        visible={isOwner && viewersVisible}
        storyId={story.$id}
        onClose={() => setViewersVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  mediaWrapper: {
    flex: 1,
  },
  textStory: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    backgroundColor: COLORS.card,
  },
  storyText: {
    color: '#fff',
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 40,
    textAlign: 'center',
  },
  mediaLoading: { position: 'absolute', alignSelf: 'center' },
  mediaError: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  mediaErrorText: { color: '#fff', fontSize: 15, textAlign: 'center' },
  tapZones: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  leftZone: { flex: 1 },
  rightZone: { flex: 2 },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    paddingHorizontal: 10,
    paddingTop: 12,
  },
  progressRow: { flexDirection: 'row', gap: 4 },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  progressFill: { height: 3, backgroundColor: '#fff' },
  userRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  userName: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 5,
  },
  authorDetails: { flex: 1, marginLeft: 9 },
  storyAge: { marginTop: 2, color: '#D5D8DF', fontSize: 11 },
  closeButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyticsOverlay: {
    position: 'absolute',
    bottom: 26,
    left: 16,
    right: 16,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  viewersButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 17, backgroundColor: COLORS.cyan },
  viewersButtonText: { color: '#061116', fontSize: 12, fontWeight: '800' },
  viewTrackingError: { position: 'absolute', right: 14, bottom: 15, left: 14, zIndex: 2, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.72)' },
  viewTrackingErrorText: { color: COLORS.pink, fontSize: 11, textAlign: 'center' },
  replyWrapper: {},
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
  },
  replyHeart: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.06)' },
  storyLike: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.06)', marginRight: 8 },
  storyLikeActive: { backgroundColor: 'rgba(0,229,255,0.15)' },
  replyInput: { flex: 1, minWidth: 0, color: COLORS.text, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: COLORS.border, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 8, fontSize: 14, maxWidth: '75%' },
  replyInputDisabled: { opacity: 0.6 },
  replySend: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: COLORS.cyan },
  replySendDisabled: { opacity: 0.5 },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { height: '80%', backgroundColor: COLORS.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  sheetHandle: { width: 40, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: COLORS.muted, marginTop: 10 },
  sheetTitle: { flex: 1, color: COLORS.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  sheetClose: { position: 'absolute', right: 16, top: 10, zIndex: 3 },
  sheetLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sheetError: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  sheetErrorText: { color: COLORS.pink, fontSize: 14, textAlign: 'center' },
  viewerList: { paddingHorizontal: 16, paddingBottom: 20 },
  viewerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  viewerName: { marginLeft: 12, color: COLORS.text, fontSize: 14, fontWeight: '600' },
  sheetEmpty: { color: COLORS.muted, textAlign: 'center', marginTop: 30 },
});
