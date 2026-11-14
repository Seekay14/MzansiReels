import React, { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  AppState, StyleSheet, Text, View, TouchableOpacity, Pressable, Modal, TextInput, Switch,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator, Image, Animated, Share,
  TouchableWithoutFeedback, Dimensions, Easing,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PostCommentModal from './PostCommentModal';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { databases, storage, ID, Permission, Query, Role } from '../config/appwrite';
import { BUCKET_ID, DATABASE_ID, COLLECTIONS, COLORS, fileIdFromUrl } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { getUserDoc, notify, reportVideo, requireAuth, toggleVideoLike } from '../config/helpers';
import Avatar from './Avatar';
import { createFollowRelationship, deleteFollowRelationships } from '../config/profileContentService';

// Horizontal-swipe tuning. The vertical fail offset is what keeps the
// up/down paging scroll of the parent FlatList untouched: before the pan
// activates, any vertical drift past this distance makes the handler fail so
// the scroll view keeps ownership of the gesture.
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_ACTIVATE_DISTANCE = 20;
const SWIPE_FAIL_VERTICAL_DRIFT = 24;
const SWIPE_COMMIT_DISTANCE = 84;
const SWIPE_COMMIT_VELOCITY = 700;
const SWIPE_MAX_DRAG = Math.min(140, Math.round(SCREEN_WIDTH * 0.34));
const SWIPE_HINT_VISIBLE_MS = 3600;

export default function VideoCard({
  item,
  videoCollectionId = COLLECTIONS.videos,
  isActive,
  height,
  muted = false,
  onToggleMute,
  onOpenProfile,
  navigation,
  onDeleted,
  onNotInterested,
  onBlockUser,
}) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isOwnVideo = user?.$id === item.userId;
  const usesPostsCollection = videoCollectionId === COLLECTIONS.posts;

  const [paused, setPaused] = useState(false);
  const [needsPlaybackGesture, setNeedsPlaybackGesture] = useState(false);
  const [likes, setLikes] = useState(item.likes || 0);
  const [viewCount, setViewCount] = useState(item.views || 0);
  const [isLiked, setIsLiked] = useState(false);
  const [creatorVerified, setCreatorVerified] = useState(false);
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [commentCount, setCommentCount] = useState(0);
  const [isCommentsVisible, setIsCommentsVisible] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [creatorMenuVisible, setCreatorMenuVisible] = useState(false);
  const [editDetailsVisible, setEditDetailsVisible] = useState(false);
  const [videoCaption, setVideoCaption] = useState(item.content || item.caption || '');
  const [videoCategory, setVideoCategory] = useState(item.category || 'General');
  const [isPrivate, setIsPrivate] = useState(item.isPrivate === true);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);
  const [isSavingToDevice, setIsSavingToDevice] = useState(false);
  const [isSharingVideo, setIsSharingVideo] = useState(false);
  const [isDeletingVideo, setIsDeletingVideo] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [appIsActive, setAppIsActive] = useState(
    AppState.currentState === 'active' || AppState.currentState === null,
  );

  const heartScale = useRef(new Animated.Value(1)).current;
  const pausedOverlayOpacity = useRef(new Animated.Value(0)).current;
  const busy = useRef(false);
  const followBusy = useRef(false);
  const fetchedMeta = useRef(false);
  const viewCounted = useRef(false);

    // Swipe-left-to-profile state
    const swipeX = useRef(new Animated.Value(0)).current;
    const profileHintOpacity = useRef(new Animated.Value(0)).current;
    const profileHintDismissed = useRef(false);
    const swipeCommitted = useRef(false);

    // Keep the navigation callback fresh without rebuilding the gesture.
    const openProfileRef = useRef(onOpenProfile);
    useEffect(() => {
      openProfileRef.current = onOpenProfile;
    }, [onOpenProfile]);
    const navigationRef = useRef(navigation);
    useEffect(() => {
      navigationRef.current = navigation;
    }, [navigation]);
    const itemRef = useRef(item);
    useEffect(() => {
      itemRef.current = item;
    }, [item]);

  useEffect(() => {
    fetchedMeta.current = false;
    setIsLiked(false);
    setIsBookmarked(false);
    setIsFollowing(false);
  }, [item.$id, user?.$id]);

  // ── expo-video player ──
  const player = useVideoPlayer(item.videoUrl, (p) => {
    p.loop = true;
    p.audioMixingMode = 'auto';
    p.muted = muted || !isActive;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player?.playing ?? false });

  useEffect(() => {
    setVideoCaption(item.content || item.caption || '');
    setVideoCategory(item.category || 'General');
    setIsPrivate(item.isPrivate === true);
  }, [item.$id, item.content, item.caption, item.category, item.isPrivate]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppIsActive(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  useLayoutEffect(() => {
    if (!player) return;
    player.muted = muted || !isActive || !appIsActive;
  }, [appIsActive, isActive, muted, player]);

  useEffect(() => {
    if (!player) return;
    try {
      if (isActive && appIsActive && !paused) {
        player.play();
      } else {
        player.pause();
      }
    } catch (error) {
      console.error(`Could not update Reel playback for ${item.$id}:`, error);
    }
  }, [appIsActive, isActive, item.$id, paused, player]);

  useEffect(() => {
    let active = true;
    setCreatorProfile(null);
    setCreatorVerified(false);
    if (!item.userId) {
      return undefined;
    }
    getUserDoc(item.userId).then((profile) => {
      if (active) {
        setCreatorProfile(profile);
        setCreatorVerified(profile?.isVerified === true);
      }
    }).catch((error) => {
      console.error('Could not load Reel creator verification status:', error);
    });
    return () => {
      active = false;
    };
  }, [item.userId]);

  useEffect(() => {
    Animated.timing(pausedOverlayOpacity, {
      toValue: paused ? 1 : 0,
      duration: paused ? 220 : 160,
      useNativeDriver: true,
    }).start();
  }, [paused, pausedOverlayOpacity]);

  const togglePlayback = () => {
    setPaused((wasPaused) => !wasPaused);
  };

    // Swipe left on a Reel to open the creator's profile.
    const isSheetOpen = isCommentsVisible || creatorMenuVisible || editDetailsVisible;

    const resetSwipe = (animated = true) => {
      swipeCommitted.current = false;
      if (!animated) {
        swipeX.setValue(0);
        return;
      }
      Animated.spring(swipeX, {
        toValue: 0,
        damping: 18,
        stiffness: 210,
        mass: 0.7,
        useNativeDriver: true,
      }).start();
    };

    const commitSwipe = (direction) => {
      if (swipeCommitted.current) return;
      swipeCommitted.current = true;
      profileHintDismissed.current = true;
      Animated.timing(swipeX, {
        toValue: direction * SWIPE_MAX_DRAG,
        duration: 120,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          if (direction < 0) {
            openProfileRef.current?.(itemRef.current);
          } else {
            const currentNavigation = navigationRef.current;
            if (currentNavigation?.canGoBack?.()) {
              currentNavigation.goBack();
            } else {
              currentNavigation?.navigate?.('Reels', { screen: 'Feed' });
            }
          }
        }
        resetSwipe();
      });
    };

    const swipeGesture = useMemo(
      () => Gesture.Pan()
        .activeOffsetX([-SWIPE_ACTIVATE_DISTANCE, SWIPE_ACTIVATE_DISTANCE])
        // Vertical drift fails the pan before it activates, so the Reels
        // FlatList keeps full ownership of up/down paging.
        .failOffsetY([-SWIPE_FAIL_VERTICAL_DRIFT, SWIPE_FAIL_VERTICAL_DRIFT])
        .shouldCancelWhenOutside(false)
        // Driving an Animated.Value and navigating: keep it on the JS thread.
        .runOnJS(true)
        .enabled(!isSheetOpen)
        .onUpdate((event) => {
          if (swipeCommitted.current) return;
          swipeX.setValue(Math.max(
            -SWIPE_MAX_DRAG,
            Math.min(SWIPE_MAX_DRAG, event.translationX),
          ));
        })
        .onEnd((event) => {
          if (swipeCommitted.current) return;
          const draggedLeft = event.translationX <= -SWIPE_COMMIT_DISTANCE;
          const flickedLeft = event.velocityX <= -SWIPE_COMMIT_VELOCITY
            && event.translationX < -SWIPE_ACTIVATE_DISTANCE;
          const draggedRight = event.translationX >= SWIPE_COMMIT_DISTANCE;
          const flickedRight = event.velocityX >= SWIPE_COMMIT_VELOCITY
            && event.translationX > SWIPE_ACTIVATE_DISTANCE;
          if (draggedLeft || flickedLeft) commitSwipe(-1);
          else if (draggedRight || flickedRight) commitSwipe(1);
          else resetSwipe();
        })
        .onFinalize(() => {
          // Interrupted by the parent scroll view or a cancelled touch.
          if (!swipeCommitted.current) resetSwipe();
        }),
      [isSheetOpen],
    );

    // Fade the swipe hint in while the Reel plays, then fade it back out.
    useEffect(() => {
      if (!isActive || paused || isSheetOpen || !isPlaying || profileHintDismissed.current) {
        Animated.timing(profileHintOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }).start();
        return undefined;
      }

      Animated.timing(profileHintOpacity, {
        toValue: 1,
        duration: 320,
        delay: 350,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();

      const hideTimer = setTimeout(() => {
        profileHintDismissed.current = true;
        Animated.timing(profileHintOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();
      }, SWIPE_HINT_VISIBLE_MS);
      return () => clearTimeout(hideTimer);
    }, [isActive, isPlaying, isSheetOpen, paused, profileHintOpacity]);

    useEffect(() => {
      // Every Reel starts un-swiped with its own hint.
      swipeCommitted.current = false;
      profileHintDismissed.current = false;
      swipeX.setValue(0);
    }, [item.$id, swipeX]);

  const handleToggleMute = () => {
    const nextMuted = !muted;
    if (isActive && player) {
      player.muted = nextMuted || !appIsActive;
      if (Platform.OS === 'web' && !nextMuted && !paused && !isPlaying && appIsActive) {
        try {
          player.play();
        } catch (error) {
          console.error(`Could not start Reel playback for ${item.$id}:`, error);
        }
      }
    }
    onToggleMute?.();
  };

  const handlePlayWithSound = () => {
    if (!isActive || !appIsActive || !player) return;
    setNeedsPlaybackGesture(false);
    setPaused(false);
    if (muted) onToggleMute?.();
    player.muted = false;
    try {
      player.play();
    } catch (error) {
      console.error(`Could not start Reel playback for ${item.$id}:`, error);
    }
  };

  useEffect(() => {
    if (!isActive) {
      viewCounted.current = false;
      return;
    }

    if (paused || !isPlaying || viewCounted.current || videoCollectionId === COLLECTIONS.posts) return undefined;

    const timer = setTimeout(async () => {
      viewCounted.current = true;
      try {
        const updatedVideo = await databases.incrementDocumentAttribute(
          DATABASE_ID,
          videoCollectionId,
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
  }, [isActive, isPlaying, item.$id, paused, videoCollectionId]);

  // Detect native playback errors (Just logs, does not hide video)
  const { status, error } = useEvent(player, 'statusChange', { status: player?.status });
  useEffect(() => {
    if (status === 'error') console.log('Video playback error:', error);
  }, [status, error]);

  useEffect(() => {
    if (
      Platform.OS !== 'web'
      || !isActive
      || !appIsActive
      || paused
      || isPlaying
      || status !== 'readyToPlay'
    ) {
      setNeedsPlaybackGesture(false);
      return undefined;
    }

    const timer = setTimeout(() => {
      if (!player.playing) setNeedsPlaybackGesture(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [appIsActive, isActive, isPlaying, item.$id, paused, player, status]);

  // ── Fetch Meta (Likes, Comments, Bookmarks, Follows) ──
  useEffect(() => {
    if (!isActive || fetchedMeta.current) return;
    fetchedMeta.current = true;
    
    (async () => {
      if (user?.$id) {
        try {
          const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.videoLikes, [
            Query.equal('videoId', item.$id), Query.equal('userId', user.$id), Query.limit(1),
          ]);
          if (res.documents[0]) setIsLiked(true);
        } catch (e) { console.log(e.message); }
      }

      try {
        const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.comments, [
          Query.equal('videoId', item.$id), Query.limit(1),
        ]);
        setCommentCount(res.total);
      } catch (e) { console.log(e.message); }

      if (user?.$id) {
        try {
          const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.bookmarks, [
            Query.equal('videoId', item.$id), Query.equal('userId', user.$id), Query.limit(1),
          ]);
          if (res.documents[0]) setIsBookmarked(true);
        } catch (e) { console.log(e.message); }

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
      }
    })();
  }, [isActive, user?.$id, item.$id, item.userId]);

  // ── Actions ──
  const handleLike = async () => {
    if (!requireAuth('like this Reel', navigation, user) || busy.current) return;
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
      const result = await toggleVideoLike(item.$id, user.$id, user.name, user.avatarUrl);
      setLikes(result.likes);
      setIsLiked(result.isLiked);
    } catch (error) {
      console.error('Could not update video like:', error);
      setLikes(previousLikes);
      setIsLiked(previousIsLiked);
      Alert.alert('Error', 'Could not update your like. Please try again.');
    } finally { busy.current = false; }
  };

  const handleFollow = async () => {
    if (
      !requireAuth('follow this creator', navigation, user)
      || followBusy.current
      || !item.userId
      || item.userId === user?.$id
    ) return;
    followBusy.current = true;
    try {
      if (isFollowing) {
        await deleteFollowRelationships(user.$id, item.userId);
        setIsFollowing(false);
      } else {
        const result = await createFollowRelationship(user.$id, item.userId);
        setIsFollowing(true);
        if (result.created) {
          await notify(item.userId, user.name || 'Someone', 'follow', user.avatarUrl);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Could not update follow status.');
    } finally {
      followBusy.current = false;
    }
  };

  const updateVideoDetails = async (videoId, newCaption, newCategory) => {
    const category = newCategory.trim().slice(0, 50) || 'General';
    const updatedVideo = await databases.updateDocument(
      DATABASE_ID,
      videoCollectionId,
      videoId,
      videoCollectionId === COLLECTIONS.posts
        ? { content: newCaption.trim() }
        : { caption: newCaption.trim(), category },
    );
    setVideoCaption(updatedVideo.content || updatedVideo.caption || '');
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
        videoCollectionId,
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
    if (!requireAuth('share this Reel', navigation, user)) return;
    setIsSharingVideo(true);
    try {
      if (Platform.OS === 'web') {
        await Share.share({
          message: `Check out @${creatorUsername}'s video on MzansiReels! ${videoCaption}`,
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
            await databases.deleteDocument(DATABASE_ID, videoCollectionId, item.$id);
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
    setCreatorMenuVisible(false);
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
    if (!requireAuth('bookmark this Reel', navigation, user)) return;
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
      setCreatorMenuVisible(false);
    } catch (error) { Alert.alert('Error', 'Could not update bookmark.'); }
  };

  const creatorDisplayName = creatorProfile?.displayName
    || creatorProfile?.name
    || item.displayName
    || item.userName
    || 'Name unavailable';
  const creatorUsername = creatorProfile?.username
    || item.username
    || (item.userName && !/\s/.test(item.userName) ? item.userName : 'username unavailable');

  return (
    <View style={[styles.card, { height: height || '100%' }]}>
      
      {/* 1. FALLBACK BACKGROUND (Thumbnail) */}
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFillObject} blurRadius={15} />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#111' }]} />
      )}

      {/* 2. VIDEO PLAYER (wrapped in the swipe-left-to-profile gesture) */}
            <GestureDetector gesture={swipeGesture} touchAction="pan-y">
              <Animated.View style={[styles.swipeSurface, { transform: [{ translateX: swipeX }] }]}>
                <TouchableWithoutFeedback onPress={togglePlayback}>
                  <View style={styles.videoTouchArea}>
                    <VideoView
                      player={player}
                      style={styles.video}
                      contentFit="contain"
                      nativeControls={false}
                      allowsFullscreen={false}
                    />
                    {status === 'loading' ? (
                      <ActivityIndicator style={styles.playerIndicator} color="#fff" size="large" />
                    ) : status === 'error' ? (
                      <View style={styles.playerError} pointerEvents="none">
                        <Text style={styles.playerErrorText}>
                          {error?.message || 'This Reel could not be played.'}
                        </Text>
                      </View>
                    ) : !item.videoUrl ? (
                      <View style={styles.playerError} pointerEvents="none">
                        <Text style={styles.playerErrorText}>This Reel has no playable video URL.</Text>
                      </View>
                    ) : null}
            </View>
                </TouchableWithoutFeedback>

                <Animated.View
                  pointerEvents="none"
                  style={[styles.centerScreen, { opacity: pausedOverlayOpacity }]}
                >
                  <Ionicons name="play" size={80} color="rgba(255,255,255,0.78)" />
                </Animated.View>
              </Animated.View>
            </GestureDetector>

            {/* 3. SWIPE-LEFT HINT */}
      <Animated.View
        pointerEvents="none"
              style={[styles.swipeHint, { opacity: profileHintOpacity, top: insets.top + 58 }]}
      >
              <Ionicons name="chevron-back" size={13} color="#fff" />
              <View style={styles.swipeHintDivider} />
              <Ionicons name="person-circle-outline" size={16} color="#fff" />
      </Animated.View>

      {Platform.OS === 'web' && isActive && needsPlaybackGesture && (
        <TouchableOpacity
          style={styles.playWithSoundButton}
          onPress={handlePlayWithSound}
          accessibilityRole="button"
          accessibilityLabel="Play Reel with sound"
        >
          <Ionicons name="play" size={18} color="#fff" />
          <Text style={styles.playWithSoundText}>Tap to play with sound</Text>
        </TouchableOpacity>
      )}

      {/* 4. BOTTOM GRADIENT & OVERLAY */}
      <LinearGradient 
        colors={['transparent', 'rgba(0,0,0,0.8)']} 
        style={styles.bottomGradient} 
        pointerEvents="none" 
      />
      
      <View style={[styles.bottomOverlay, { bottom: Math.max(insets.bottom, 20) + 10 }]} pointerEvents="box-none">
        <TouchableOpacity
          onPress={() => onOpenProfile?.(item)}
          style={{ alignSelf: 'flex-start', maxWidth: '100%' }}
          accessibilityRole="button"
          accessibilityLabel={`View @${creatorUsername} profile`}
        >
          <View style={styles.creatorHandleRow}>
            <Text style={styles.username} numberOfLines={1} ellipsizeMode="tail">@{creatorUsername}</Text>
            {creatorVerified && (
              <Ionicons name="checkmark-circle" size={16} color={COLORS.cyan} />
            )}
          </View>
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
        <TouchableOpacity
          style={styles.muteButton}
          onPress={handleToggleMute}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Unmute Reel audio' : 'Mute Reel audio'}
        >
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={() => onOpenProfile?.(item)}>
            <View style={styles.avatarWrapper}>
              <Avatar
                userId={item.userId}
                fallbackUrl={item.avatarUrl}
                name={creatorDisplayName}
                size={48}
              />
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
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={36} color={isLiked ? COLORS.cyan : '#fff'} />
          </Animated.View>
          <Text style={styles.actionText}>{likes}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => {
            if (requireAuth('comment on this Reel', navigation, user)) setIsCommentsVisible(true);
          }}
        >
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

      </View>

      <TouchableOpacity
        style={[styles.moreOptionsButton, { top: insets.top + 10 }]}
        onPress={() => setCreatorMenuVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="More video options"
      >
        <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
      </TouchableOpacity>

      <PostCommentModal
        visible={isCommentsVisible}
        videoId={item.$id}
        user={user}
        navigation={navigation}
        onClose={() => setIsCommentsVisible(false)}
        onCommentsLoaded={setCommentCount}
        onOpenProfile={(commentUserId, commentUserName) => onOpenProfile?.({
          userId: commentUserId,
          userName: commentUserName,
        })}
        onCommentAdded={(comment) => {
          setCommentCount((count) => count + 1);
          if (item.userId !== user?.$id) {
            notify(
              item.userId,
              user?.name || comment.userName || 'Someone',
              'comment',
              user?.avatarUrl,
              item.$id,
            );
          }
        }}
      />

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

            <TouchableOpacity
              style={styles.creatorMenuRow}
              onPress={handleToggleMute}
              accessibilityRole="button"
              accessibilityLabel={muted ? 'Unmute video' : 'Mute video'}
            >
              <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color={COLORS.cyan} />
              <Text style={styles.creatorMenuText}>{muted ? 'Unmute video' : 'Mute video'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.creatorMenuRow}
              onPress={handleBookmark}
              accessibilityRole="button"
              accessibilityLabel={isBookmarked ? 'Remove video from saved' : 'Save video'}
            >
              <Ionicons name={isBookmarked ? 'bookmark' : 'bookmark-outline'} size={22} color={COLORS.cyan} />
              <Text style={styles.creatorMenuText}>{isBookmarked ? 'Remove from saved' : 'Save'}</Text>
            </TouchableOpacity>
            {!isOwnVideo && (
              <TouchableOpacity
                style={styles.creatorMenuRow}
                onPress={promptVideoReport}
                accessibilityRole="button"
                accessibilityLabel="Report video"
              >
                <Ionicons name="flag-outline" size={22} color="#FF5B67" />
                <Text style={styles.creatorMenuText}>Report video</Text>
              </TouchableOpacity>
            )}

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
                    setVideoCaption(item.content || item.caption || '');
                    setVideoCategory(item.category || 'General');
                    setCreatorMenuVisible(false);
                    setEditDetailsVisible(true);
                  }}
                >
                  <Ionicons name="create-outline" size={22} color={COLORS.cyan} />
                  <Text style={styles.creatorMenuText}>Edit caption & category</Text>
                  <Ionicons name="chevron-forward" size={19} color={COLORS.muted} />
                </TouchableOpacity>

                {!usesPostsCollection && (
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
                )}

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
    swipeSurface: { ...StyleSheet.absoluteFillObject },
  videoTouchArea: { ...StyleSheet.absoluteFillObject },
  
  video: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%',
  },
  playerIndicator: { ...StyleSheet.absoluteFillObject, alignSelf: 'center' },
  playerError: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  playerErrorText: { color: '#fff', fontSize: 14, textAlign: 'center' },
  playWithSoundButton: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    zIndex: 6,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
  },
  playWithSoundText: { color: '#fff', fontSize: 14, fontWeight: '700', marginLeft: 8 },

  // Gradient overlay at bottom
  bottomGradient: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 180, zIndex: 2,
  },

    // Small "swipe left for profile" affordance pinned to the right edge.
    swipeHint: {
      position: 'absolute',
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 6,
      paddingRight: 6,
      paddingVertical: 7,
      borderTopLeftRadius: 16,
      borderBottomLeftRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.42)',
      borderWidth: 1,
      borderRightWidth: 0,
      borderColor: 'rgba(255,255,255,0.22)',
      zIndex: 11,
    },
    swipeHintDivider: {
      width: 1,
      height: 11,
      marginHorizontal: 4,
      backgroundColor: 'rgba(255,255,255,0.35)',
    },
  moreOptionsButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    zIndex: 12,
  },

  bottomOverlay: { position: 'absolute', left: 15, right: 80, zIndex: 10 },
  creatorHandleRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', maxWidth: '100%', gap: 6 },
  username: { flexShrink: 1, color: '#fff', fontSize: 17, fontWeight: '800', ...shadow },
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
  muteButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
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
});