import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
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
import { useVideoPlayer, VideoView } from 'expo-video';
import Avatar from './Avatar';
import { databases } from '../config/appwrite';
import { COLLECTIONS, DATABASE_ID } from '../config/constants';

const STORY_DURATION_MS = 15000;

function StoryVideo({ uri }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = false;
    instance.play();
  });

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="contain"
      nativeControls={false}
    />
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
  onClose,
}) {
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [storyIndex, setStoryIndex] = useState(0);
  const progress = useRef(new Animated.Value(0)).current;
  const viewedStoryIds = useRef(new Set());
  const group = storyGroups[groupIndex];
  const stories = group?.stories || [];
  const story = stories[storyIndex];

  useEffect(() => {
    if (!visible) return;
    setGroupIndex(Math.max(0, Math.min(initialGroupIndex, storyGroups.length - 1)));
    setStoryIndex(0);
    viewedStoryIds.current.clear();
  }, [initialGroupIndex, storyGroups.length, visible]);

  const goNext = useCallback(() => {
    if (storyIndex + 1 < stories.length) {
      setStoryIndex((current) => current + 1);
    } else if (groupIndex + 1 < storyGroups.length) {
      setGroupIndex((current) => current + 1);
      setStoryIndex(0);
    } else {
      onClose();
    }
  }, [groupIndex, onClose, stories.length, storyIndex, storyGroups.length]);

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
    if (!visible || !story) return undefined;
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION_MS,
      useNativeDriver: false,
    });
    animation.start();
    const timer = setTimeout(goNext, STORY_DURATION_MS);
    return () => {
      clearTimeout(timer);
      animation.stop();
    };
  }, [goNext, progress, story, visible]);

  useEffect(() => {
    if (!visible || !story?.$id || !userId || story.userId === userId) return;
    if (viewedStoryIds.current.has(story.$id)) return;
    viewedStoryIds.current.add(story.$id);

    databases.incrementDocumentAttribute(
      DATABASE_ID,
      COLLECTIONS.stories,
      story.$id,
      'views',
      1,
    ).catch((error) => {
      viewedStoryIds.current.delete(story.$id);
      console.error(`Could not increment story view count for ${story.$id}:`, error);
    });
  }, [story, userId, visible]);

  if (!story) return null;
  const isOwner = story.userId === userId;

  const mediaType = story.mediaType || story.type;
  const mediaUrl = story.mediaUrl
    || (mediaType === 'video' ? story.videoUrl : story.imageUrl)
    || story.videoUrl
    || story.imageUrl;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <View style={styles.screen}>
        {mediaType === 'video' && mediaUrl ? (
          <StoryVideo key={story.$id} uri={mediaUrl} />
        ) : mediaUrl ? (
          <Image source={{ uri: mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        ) : (
          <View style={styles.textStory}>
            <Text style={styles.storyText}>{story.content}</Text>
          </View>
        )}

        <View style={styles.tapZones}>
          <Pressable style={styles.leftZone} onPress={goPrevious} accessibilityLabel="Previous story" />
          <Pressable style={styles.rightZone} onPress={goNext} accessibilityLabel="Next story" />
        </View>

        {isOwner ? (
          <View style={styles.viewCount}>
            <Ionicons name="eye-outline" size={17} color="#fff" />
            <Text style={styles.viewCountText}>{Number(story.views) || 0} Views</Text>
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
              uri={story.avatarUrl}
              userId={story.userId}
              name={story.userName || 'Creator'}
              size={36}
            />
            <Text numberOfLines={1} style={styles.userName}>{story.userName || 'Creator'}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close story"
            >
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
    marginLeft: 9,
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowRadius: 5,
  },
  closeButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewCount: {
    position: 'absolute',
    bottom: 30,
    left: 18,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  viewCountText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
