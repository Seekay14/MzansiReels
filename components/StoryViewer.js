import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Image,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useIsFocused } from '@react-navigation/native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Avatar from './Avatar';
import ViewersListModal from './ViewersListModal';
import { databases, Query } from '../config/appwrite';
import { COLLECTIONS, DATABASE_ID } from '../config/constants';
import { recordStoryView } from '../config/storyViewService';
import { formatStoryAge, getStoryExpiresAt } from '../config/storyUtils';

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
        <ActivityIndicator style={styles.mediaLoading} color="#00E5FF" size="large" />
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
  const screenFocused = useIsFocused();
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
    recordStoryView(selectedStory, currentUser)
      .then(({ story: updatedStory }) => {
        if (mountedRef.current) onViewRecorded?.(updatedStory, selectedStory.$id);
      })
      .catch((error) => {
        console.error(`Could not record a view for story ${selectedStory.$id}:`, error);
        trackedStoryIds.current.delete(selectedStory.$id);
        if (active) setViewTrackingError(error.message || 'Could not record this story view.');
      });

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

  if (!story) return null;
  const expiresAt = getStoryExpiresAt(story);
  if (expiresAt === null || expiresAt <= Date.now()) return null;
  const mediaType = story.mediaType || story.type;
  const authorName = authorProfile?.name || story.userName || 'Creator';
  const authorUsername = authorProfile?.username || story.username;
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
              <Text style={styles.mediaErrorText}>Could not load this image.</Text>
            </View>
          ) : (
            <View style={styles.textStory}>
              <Text style={styles.storyText}>{story.content}</Text>
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
              <View style={styles.analyticsCounts}>
                <View style={styles.analyticsCount}>
                  <Ionicons name="eye-outline" size={17} color="#FFFFFF" />
                  <Text style={styles.analyticsText}>{Number(story.views) || 0} views</Text>
                </View>
                <View style={styles.analyticsCount}>
                  <Ionicons name="heart-outline" size={17} color="#FF668B" />
                  <Text style={styles.analyticsText}>
                    {Number.isFinite(Number(story.likes)) ? `${Number(story.likes)} likes` : 'Likes unavailable'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.viewersButton}
                onPress={() => setViewersVisible(true)}
                accessibilityRole="button"
                accessibilityLabel="View story viewers"
              >
                <Ionicons name="people-outline" size={17} color="#061116" />
                <Text style={styles.viewersButtonText}>Viewers</Text>
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
                <Text numberOfLines={1} style={styles.userName}>{authorName}</Text>
                <Text numberOfLines={1} style={styles.storyAge}>
                  {authorUsername ? `@${authorUsername} · ` : ''}{formatStoryAge(story)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeViewer}
                accessibilityRole="button"
                accessibilityLabel="Close story"
              >
                <Ionicons name="close" size={26} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {isOwner ? (
        <ViewersListModal
          visible={viewersVisible}
          storyId={story.$id}
          onClose={() => setViewersVisible(false)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#050505',
    justifyContent: 'center',
  },
  textStory: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 34,
    backgroundColor: '#162B36',
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
  leftZone: {
    flex: 1,
  },
  rightZone: {
    flex: 2,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    paddingHorizontal: 10,
    paddingTop: 12,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 4,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: '#fff',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
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
  analyticsCounts: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  analyticsCount: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  analyticsText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  viewersButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 17, backgroundColor: '#00E5FF' },
  viewersButtonText: { color: '#061116', fontSize: 12, fontWeight: '800' },
  viewTrackingError: { position: 'absolute', right: 14, bottom: 15, left: 14, zIndex: 2, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.72)' },
  viewTrackingErrorText: { color: '#FFD4DE', fontSize: 11, textAlign: 'center' },
});
