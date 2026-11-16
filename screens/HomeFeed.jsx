import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import TextPostCard from '../components/TextPostCard';
import SkeletonPost from '../components/SkeletonPost';
import BrandTitle from '../components/BrandTitle';
import CreatePostComposer from '../components/CreatePostComposer';
import CreatePostModal from '../components/CreatePostModal';
import FeaturedCreatorsCarousel from '../components/FeaturedCreatorsCarousel';
import { groupStories } from '../components/StoriesRow';
import StoryViewer from '../components/StoryViewer';
import TopLoadingBar from '../components/TopLoadingBar';
import { databases, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import { fetchActiveStories } from '../config/storyService';
import { useAuth } from '../context/AuthContext';
import { requireAuth } from '../config/helpers';
import { useSearchMenu } from '../context/SearchMenuContext';
import * as ImagePicker from 'expo-image-picker';
import Avatar from '../components/Avatar';

const PAGE_SIZE = 20;

function StoryCard({ story, creatorName, isRead, onPress }) {
  const pressScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(pressScale, { toValue: 0.96, duration: 100, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.timing(pressScale, { toValue: 1, duration: 100, useNativeDriver: true }).start();
  };

  const storyUrl = story.mediaUrl || story.imageUrl || story.videoUrl || '';
  const avatarUrl = story.avatarUrl || '';

  return (
    <TouchableOpacity
      style={[styles.storyCard, isRead ? styles.storyReadBorder : styles.storyUnreadBorder]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      activeOpacity={1}
      accessibilityRole="button"
      accessibilityLabel={`View ${creatorName}'s story`}
    >
      <Animated.View style={{ transform: [{ scale: pressScale }] }}>
        <View style={styles.storyMediaWrapper}>
          {storyUrl ? (
            <Image source={{ uri: storyUrl }} style={styles.storyMedia} resizeMode="cover" />
          ) : avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.storyMedia} resizeMode="cover" />
          ) : (
            <LinearGradient colors={['#1A1B23', '#0A0A0F']} style={styles.storyMediaFallback} />
          )}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.9)']} style={styles.storyGradient} />
        </View>
        <Text numberOfLines={2} style={styles.storyName}>{creatorName}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

function ReelsCarousel({ reels, navigation, user }) {
  if (!reels || reels.length === 0) return null;

  const handleReelPress = (video) => {
    navigation.navigate('Watch', { video, allVideos: reels });
  };

  const pressScale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(pressScale, {
      toValue: 0.96,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(pressScale, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  return (
    <View style={styles.reelsSection}>
      <View style={styles.reelsDividerWrapper}>
        <View style={styles.reelsHeaderRow}>
        <View style={styles.reelsHeaderLeft}>
          <Ionicons name="videocam-outline" size={18} color={COLORS.text} />
          <Text style={styles.reelsHeaderText}>Reels</Text>
        </View>
        <TouchableOpacity
          style={styles.watchAllLink}
          onPress={() => navigation.navigate('Watch')}
          accessibilityRole="button"
          accessibilityLabel="Watch all reels"
        >
          <Text style={styles.watchAllText}>Watch all</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.reelsList}
      >
        {reels.map((video) => {
          const creatorName = video.userName || video.name || 'User';
          const creatorUsername = video.username || video.userName || '';
          const isVerified = video.isVerified === true;
          const thumbnailUrl = video.thumbnailUrl || video.videoUrl || '';
          const caption = video.content || video.caption || '';
          const views = Number(video.views || 0);
          const formattedViews = views >= 1000 ? `${(views / 1000).toFixed(1)}K` : String(views || 0);

          return (
            <TouchableOpacity
              key={video.$id}
              style={styles.reelCard}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={() => handleReelPress(video)}
              activeOpacity={1}
              accessibilityRole="button"
              accessibilityLabel={`View ${creatorName}'s reel`}
            >
              <Animated.View style={{ transform: [{ scale: pressScale }] }}>
                <View style={styles.reelMediaWrapper}>
                  {thumbnailUrl ? (
                    <Image
                      source={{ uri: thumbnailUrl }}
                      style={styles.reelMedia}
                      resizeMode="cover"
                    />
                  ) : (
                    <LinearGradient
                      colors={['#1A1B23', '#0A0A0F']}
                      style={styles.reelMediaFallback}
                    >
                      <Ionicons
                        name="videocam-outline"
                        size={40}
                        color="rgba(255,255,255,0.1)"
                      />
                    </LinearGradient>
                  )}
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.9)']}
                    style={styles.reelGradient}
                  />
                  <View style={styles.reelStats}>
                    <Ionicons name="play" size={12} color={COLORS.text} />
                    <Text style={styles.reelViews}>{formattedViews}</Text>
                  </View>
                  <View style={styles.reelPlayOverlay}>
                    <Ionicons name="play" size={44} color={COLORS.text} />
                  </View>
                </View>
                <View style={styles.reelInfo}>
                  {caption ? (
                    <Text numberOfLines={2} style={styles.reelCaption}>
                      {caption}
                    </Text>
                  ) : null}
                  <View style={styles.reelUsernameRow}>
                    <Text style={styles.reelUsername}>
                      @{creatorUsername || creatorName}
                    </Text>
                    {isVerified && (
                      <Ionicons name="checkmark-circle" size={12} color={COLORS.cyan} style={styles.verifyBadge} />
                    )}
                  </View>
                </View>
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      </View>
    </View>
  );
}

export default function HomeFeed({ navigation }) {
  const { user } = useAuth();
  const { openSearchMenu } = useSearchMenu();
  const { width } = useWindowDimensions();
  const [layoutWidth, setLayoutWidth] = useState(width);
  const screenWidth = layoutWidth || width;
  const isDesktop = Platform.OS === 'web' && screenWidth > 768;
  const showRightSidebar = isDesktop && screenWidth >= 1200;
  const sidebarWidth = screenWidth < 950 ? 160 : 250;
  const columnGap = screenWidth < 950 ? 16 : 24;
  const horizontalPadding = screenWidth < 1000 ? 12 : 24;
  const feedWidth = isDesktop
    ? Math.min(
      600,
      screenWidth - horizontalPadding * 2 - sidebarWidth * (showRightSidebar ? 2 : 1)
        - columnGap * (showRightSidebar ? 2 : 1),
    )
    : undefined;
  const focused = useIsFocused();
  const [posts, setPosts] = useState([]);
  const [stories, setStories] = useState([]);
  const [loadingStories, setLoadingStories] = useState(false);
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [activeStoryGroup, setActiveStoryGroup] = useState(0);
  const [postModalVisible, setPostModalVisible] = useState(false);
  const [draftPostType, setDraftPostType] = useState('text');
  const [draftAsset, setDraftAsset] = useState(null);
  const [draftEmojiOpen, setDraftEmojiOpen] = useState(false);
  const [hiddenPostIds, setHiddenPostIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [hasNewPosts, setHasNewPosts] = useState(false);
  const [reels, setReels] = useState([]);
  const [loadingReels, setLoadingReels] = useState(false);
  const listRef = useRef(null);
  const listOffset = useRef(0);
  const scrollOffset = useRef(0);
  const topPostId = useRef(null);
  const viewedPostIds = useRef(new Set());
  const viewTimers = useRef(new Map());
  const focusedRef = useRef(focused);
  const storyGroups = React.useMemo(
    () => groupStories(stories.filter((story) => story.userId !== user?.$id), user?.$id),
    [stories, user?.$id],
  );
  const suggestedCreators = React.useMemo(() => {
    const creators = new Map();
    posts.forEach((post) => {
      if (post.userId && post.userId !== user?.$id && !creators.has(post.userId)) {
        creators.set(post.userId, {
          userId: post.userId,
          name: post.userName || 'Mzansi Creator',
          avatarUrl: post.avatarUrl || '',
        });
      }
    });
    return [...creators.values()].slice(0, 6);
  }, [posts, user?.$id]);
  const updateStoryAfterView = useCallback((updatedStory) => {
    setStories((current) => current.map((story) => (
      story.$id === updatedStory.$id ? updatedStory : story
    )));
  }, []);

  useEffect(() => {
    focusedRef.current = focused;
  }, [focused]);

  const incrementView = useCallback(async (postId) => {
    if (!postId || !user?.$id || viewedPostIds.current.has(postId)) return;
    viewedPostIds.current.add(postId);
    try {
      const post = await databases.getDocument(DATABASE_ID, COLLECTIONS.posts, postId);
      const updatedPost = await databases.updateDocument(DATABASE_ID, COLLECTIONS.posts, postId, {
        views: (Number(post.views) || 0) + 1,
      });
      setPosts((current) => current.map((item) => (
        item.$id === postId ? { ...item, views: updatedPost.views } : item
      )));
    } catch (error) {
      viewedPostIds.current.delete(postId);
      console.error(`Could not increment view count for post ${postId}:`, error);
    }
  }, [user?.$id]);

  const onViewableItemsChanged = useCallback(({ changed }) => {
    changed.forEach(({ item, isViewable }) => {
      if (!item?.$id) return;
      if (isViewable) {
        if (!focusedRef.current) return;
        if (viewedPostIds.current.has(item.$id) || viewTimers.current.has(item.$id)) return;
        const timer = setTimeout(() => {
          viewTimers.current.delete(item.$id);
          incrementView(item.$id);
        }, 2000);
        viewTimers.current.set(item.$id, timer);
      } else {
        const timer = viewTimers.current.get(item.$id);
        if (timer) {
          clearTimeout(timer);
          viewTimers.current.delete(item.$id);
        }
      }
    });
  }, [incrementView]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  useEffect(() => () => {
    viewTimers.current.forEach((timer) => clearTimeout(timer));
    viewTimers.current.clear();
  }, []);

  useEffect(() => {
    if (focused) return undefined;
    viewTimers.current.forEach((timer) => clearTimeout(timer));
    viewTimers.current.clear();
    return undefined;
  }, [focused]);

  const fetchPosts = useCallback(async ({ append = false } = {}) => {
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setErrorMessage('');
    }
    try {
      if (!user?.$id) {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        setPosts([]);
        return;
      }

      const followsResult = await databases.listDocuments(DATABASE_ID, COLLECTIONS.follows, [
        Query.equal('followerId', user.$id),
        Query.limit(1000),
      ]);
      const followingIds = followsResult.documents.map((doc) => doc.followingId).filter(Boolean);

      if (followingIds.length === 0) {
        setPosts([]);
        setHasMore(false);
        setErrorMessage('');
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
        return;
      }

      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.posts, [
        Query.orderDesc('uploadedAt'),
        Query.equal('userId', followingIds),
        Query.limit(PAGE_SIZE),
        Query.offset(append ? listOffset.current : 0),
      ]);
      const offset = append ? listOffset.current : 0;
      listOffset.current = offset + result.documents.length;
      if (append) {
        setPosts((current) => {
          const currentIds = new Set(current.map((post) => post.$id));
          return [...current, ...result.documents.filter((post) => !currentIds.has(post.$id))];
        });
      } else {
        setPosts(result.documents);
        topPostId.current = result.documents[0]?.$id || null;
      }
      setHasMore(listOffset.current < result.total);
    } catch (error) {
      console.error('Could not load home feed posts:', error);
      setErrorMessage('Could not load posts. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [user?.$id]);

  const fetchStories = useCallback(async () => {
    if (!user?.$id) {
      setStories([]);
      return;
    }
    setLoadingStories(true);
    try {
      const activeStories = await fetchActiveStories();
      setStories(activeStories.filter((story) => story.userId !== user?.$id));
    } catch (error) {
      console.error('Could not load active stories:', error);
    } finally {
      setLoadingStories(false);
    }
  }, [user?.$id]);

  const fetchReels = useCallback(async () => {
    if (!user?.$id) {
      setReels([]);
      return;
    }
    setLoadingReels(true);
    try {
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.videos, [
        Query.orderDesc('$createdAt'),
        Query.limit(10),
      ]);
      setReels(result.documents);
    } catch (error) {
      console.error('Could not load reels:', error);
    } finally {
      setLoadingReels(false);
    }
  }, [user?.$id]);

  useEffect(() => {
    if (focused) {
      fetchPosts();
      fetchStories();
      fetchReels();
    }
  }, [focused, fetchPosts, fetchStories, fetchReels]);

  useEffect(() => {
    if (!focused || !user?.$id) return undefined;
    const storyTimer = setInterval(fetchStories, 30000);
    return () => clearInterval(storyTimer);
  }, [fetchStories, focused, user?.$id]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setHasNewPosts(false);
    fetchPosts();
    fetchStories();
    fetchReels();
  }, [fetchPosts, fetchStories, fetchReels]);

  useEffect(() => {
    const tabNavigation = navigation.getParent()?.getParent();
    if (!tabNavigation) return undefined;
    return tabNavigation.addListener('tabPress', (event) => {
      const homeRoute = tabNavigation.getState().routes.find((route) => route.name === 'Home');
      if (
        event.target === homeRoute?.key
        && tabNavigation.isFocused()
        && focusedRef.current
      ) {
        refresh();
      }
    });
  }, [navigation, refresh]);

  const loadMore = () => {
    if (!loading && !loadingMore && hasMore) fetchPosts({ append: true });
  };

  const checkForNewPosts = useCallback(async () => {
    if (!user?.$id || !topPostId.current) return;
    try {
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.posts, [
        Query.orderDesc('uploadedAt'),
        Query.limit(1),
      ]);
      const latestPost = result.documents[0];
      if (!latestPost || latestPost.$id === topPostId.current) return;

      if (scrollOffset.current > 120) {
        setHasNewPosts(true);
      } else {
        await fetchPosts();
      }
    } catch (error) {
      console.error('Could not check for new feed posts:', error);
    }
  }, [fetchPosts, user?.$id]);

  useEffect(() => {
    if (!focused || !user?.$id) return undefined;
    const intervalId = setInterval(checkForNewPosts, 30000);
    return () => clearInterval(intervalId);
  }, [checkForNewPosts, focused, user?.$id]);

  const showNewPosts = () => {
    setHasNewPosts(false);
    scrollOffset.current = 0;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setRefreshing(true);
    fetchPosts();
    fetchStories();
  };

  const hidePost = (postId) => {
    setHiddenPostIds((current) => current.includes(postId) ? current : [...current, postId]);
  };

  const removePost = (postId) => {
    setPosts((current) => current.filter((post) => post.$id !== postId));
    listOffset.current = Math.max(0, listOffset.current - 1);
  };

  const addSharedPost = useCallback((sharedPost, originalShares, originalPostId) => {
    setPosts((current) => {
      const withUpdatedOriginal = current.map((post) => (
        post.$id === originalPostId
          ? { ...post, shares: originalShares }
          : post
      ));
      return [
        sharedPost,
        ...withUpdatedOriginal.filter((post) => post.$id !== sharedPost.$id),
      ];
    });
    listOffset.current += 1;
    topPostId.current = sharedPost.$id;
  }, []);

  const openPostModal = useCallback((type = 'text', asset = null, emojiOpen = false) => {
    if (!requireAuth('create a post', navigation, user)) return;
    setDraftPostType(type);
    setDraftAsset(asset);
    setDraftEmojiOpen(emojiOpen);
    setPostModalVisible(true);
  }, [navigation, user]);

  const pickPostMedia = useCallback(async (type) => {
    if (!requireAuth('create a post', navigation, user)) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted && Platform.OS !== 'web') {
        Alert.alert('Permission needed', 'Allow photo library access to choose media.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: type === 'image' ? ['images'] : ['videos'],
        quality: 1,
      });
      if (!result.canceled && result.assets?.[0]) {
        openPostModal(type, result.assets[0]);
      }
    } catch (error) {
      console.error(`Could not select ${type} for post:`, error);
      Alert.alert('Could not open library', error.message || 'Please try again.');
    }
  }, [navigation, openPostModal, user]);

  const handlePostCreated = useCallback((post, type) => {
    if (type === 'video') return;
    setPosts((current) => [post, ...current.filter((item) => item.$id !== post.$id)]);
    listOffset.current += 1;
    topPostId.current = post.$id;
    setHasNewPosts(false);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const visiblePosts = posts.filter((post) => !hiddenPostIds.includes(post.$id));
  const feedData = React.useMemo(() => {
    if (visiblePosts.length === 0) return visiblePosts;
    return [
      visiblePosts[0],
      { type: 'reels_carousel', id: 'reels-carousel' },
      { type: 'verified_creators', id: 'verified-creators' },
      ...visiblePosts.slice(1),
    ];
  }, [visiblePosts]);
  const storiesHeader = (
    <View>
      {user?.$id ? (
        <CreatePostComposer
          user={user}
          desktop={isDesktop}
          onPressComposer={() => openPostModal()}
          onPickImage={() => pickPostMedia('image')}
          onPickVideo={() => pickPostMedia('video')}
          onPressEmoji={() => openPostModal('text', null, true)}
        />
      ) : null}
      <View style={[styles.storiesContainer, { borderBottomColor: COLORS.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.storiesList}
        >
          <TouchableOpacity
            style={[styles.storyCard, styles.createStoryCard]}
            onPress={() => navigation.navigate('Messages', { screen: 'Status' })}
            accessibilityRole="button"
            accessibilityLabel="Create your own status"
          >
            <View style={styles.createStoryCardContent}>
              <Ionicons name="videocam" size={30} color={COLORS.text} />
            </View>
            <Text numberOfLines={2} style={[styles.storyName, { color: COLORS.text }]}>Create status</Text>
          </TouchableOpacity>
          {storyGroups.map((group) => {
            const story = group.latest;
            const creatorName = group.stories[0]?.userName || group.stories[0]?.name || 'User';
            const isRead = story.isRead === true;
            return (
              <StoryCard
                key={group.userId}
                story={story}
                creatorName={creatorName}
                isRead={isRead}
                onPress={() => { setActiveStoryGroup(storyGroups.indexOf(group)); setStoryViewerVisible(true); }}
              />
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  const feedContent = loading && posts.length === 0 ? (
    <FlatList
      data={Array.from({ length: 5 }, (_, index) => `skeleton-${index}`)}
      keyExtractor={(item) => item}
      renderItem={() => <SkeletonPost />}
      ListHeaderComponent={
        <>
          {storiesHeader}
        </>
      }
      contentContainerStyle={isDesktop ? styles.desktopListContent : styles.listContent}
      style={styles.feedList}
      showsVerticalScrollIndicator={false}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
    />
  ) : errorMessage && posts.length === 0 ? (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={40} color={COLORS.muted} />
      <Text style={styles.emptyText}>{errorMessage}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => fetchPosts()}>
          <Text style={[styles.retryText, { color: COLORS.muted }]}>Try again</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <FlatList
      ref={listRef}
      data={feedData}
      keyExtractor={(item) => {
        if (item.type === 'reels_carousel') return item.id;
        if (item.type === 'verified_creators') return item.id;
        return item.$id;
      }}
      renderItem={({ item }) => {
        if (item.type === 'reels_carousel') {
          return (
            <View style={styles.carouselWrapper}>
              <ReelsCarousel reels={reels} navigation={navigation} user={user} />
            </View>
          );
        }
        if (item.type === 'verified_creators') {
          return (
            <View style={[styles.carouselWrapper, styles.verifiedCreatorsWrapper]}>
              <FeaturedCreatorsCarousel navigation={navigation} />
            </View>
          );
        }
        return (
          <TextPostCard
            post={item}
            user={user}
            currentUser={user}
            navigation={navigation}
            onHide={hidePost}
            onDelete={removePost}
            onShared={addSharedPost}
            desktop={isDesktop}
          />
        );
      }}
      ListHeaderComponent={
        <>
          {storiesHeader}
        </>
      }
      contentContainerStyle={[
        visiblePosts.length ? styles.listContent : styles.emptyList,
        isDesktop && styles.desktopListContent,
      ]}
      style={styles.feedList}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.cyan} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      onScroll={(event) => {
        scrollOffset.current = event.nativeEvent.contentOffset.y;
      }}
      scrollEventThrottle={200}
      ListEmptyComponent={(
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Ionicons name="person-add-outline" size={38} color={COLORS.cyan} />
          </View>
          <Text style={[styles.emptyTitle, { color: COLORS.text }]}>Follow some creators to see their posts here.</Text>
          <Text style={[styles.emptyText, { color: COLORS.muted }]}>Find creators you like, tap Follow, and their posts will show up in your feed.</Text>
        </View>
      )}
      ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.cyan} style={styles.footerLoader} /> : null}
    />
  );
  const tabNavigation = navigation.getParent()?.getParent();
  const openTab = (routeName) => {
    if (['Messages', 'Profile'].includes(routeName) && !requireAuth(`open ${routeName.toLowerCase()}`, navigation, user)) {
      return;
    }
    tabNavigation?.navigate(routeName);
  };

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: COLORS.bg },
        isDesktop && styles.desktopScreen,
        isDesktop && { backgroundColor: COLORS.bg },
      ]}
      onLayout={({ nativeEvent }) => {
        const nextWidth = nativeEvent.layout.width;
        setLayoutWidth((current) => (
          Math.round(current) === Math.round(nextWidth) ? current : nextWidth
        ));
      }}
    >
      <View style={[
        styles.topBar,
        { backgroundColor: COLORS.bg, borderBottomColor: COLORS.border },
        isDesktop && styles.desktopTopBar,
        isDesktop && { backgroundColor: COLORS.card, borderBottomColor: COLORS.border },
      ]}>
        <BrandTitle />
        <View style={styles.topActions}>
          {user ? (
            <TouchableOpacity
              style={[styles.topIconButton, { backgroundColor: COLORS.raised }]}
              onPress={() => navigation.navigate('Notifications')}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Ionicons name="notifications-outline" size={22} color={COLORS.text} />
            </TouchableOpacity>
          ) : null}
            <TouchableOpacity
              style={[styles.topIconButton, { backgroundColor: COLORS.raised }]}
              onPress={openSearchMenu}
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
            <Ionicons name="search-outline" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>
      </View>
      {hasNewPosts ? (
        <TouchableOpacity
          style={styles.newPostsBanner}
          onPress={showNewPosts}
          accessibilityRole="button"
          accessibilityLabel="Show new posts"
        >
              <Ionicons name="arrow-up" size={16} color={COLORS.muted} />
          <Text style={[styles.newPostsText, { color: COLORS.muted }]}>Show new posts</Text>
        </TouchableOpacity>
      ) : null}
      <View
        style={[
          styles.feedLayout,
          isDesktop && styles.desktopFeedLayout,
          isDesktop && {
            columnGap,
            paddingHorizontal: horizontalPadding,
          },
        ]}
      >
        {isDesktop ? (
          <View style={[styles.sidebar, styles.leftSidebar, { width: sidebarWidth, borderRightColor: COLORS.border }]}>
            <Text style={[styles.sidebarHeading, { color: COLORS.muted }]}>Navigation</Text>
            {[
              { label: 'Home', icon: 'home-outline', route: 'Home', active: true },
              { label: 'Reels', icon: 'play-circle-outline', route: 'Reels' },
              { label: 'Messages', icon: 'chatbubbles-outline', route: 'Messages' },
              { label: 'Profile', icon: 'person-outline', route: 'Profile' },
            ].map((item) => (
              <TouchableOpacity
                key={item.route}
                style={[styles.sidebarLink, item.active && styles.sidebarLinkActive]}
                onPress={() => openTab(item.route)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <Ionicons name={item.icon} size={21} color={item.active ? COLORS.accent : COLORS.muted} />
                <Text style={[styles.sidebarLinkText, { color: COLORS.text }, item.active && styles.sidebarLinkTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.sidebarLink}
              onPress={() => navigation.navigate('Search')}
              accessibilityRole="button"
              accessibilityLabel="Search"
            >
              <Ionicons name="search-outline" size={21} color={COLORS.muted} />
              <Text style={[styles.sidebarLinkText, { color: COLORS.text }]}>Search</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View
          style={[
            styles.feedColumn,
            isDesktop && styles.desktopFeedColumn,
            isDesktop && { width: feedWidth },
            isDesktop && { backgroundColor: COLORS.card, borderColor: COLORS.border },
          ]}
        >
          {feedContent}
        </View>
        {showRightSidebar ? (
          <View style={[styles.sidebar, styles.rightSidebar, { width: sidebarWidth, borderLeftColor: COLORS.border }]}>
            <Text style={[styles.sidebarHeading, { color: COLORS.muted }]}>Suggested Creators</Text>
            {suggestedCreators.length ? suggestedCreators.map((creator) => (
              <TouchableOpacity
                key={creator.userId}
                style={styles.creatorLink}
                onPress={() => navigation.navigate('UserProfile', {
                  userId: creator.userId,
                  userName: creator.name,
                })}
                accessibilityRole="button"
                accessibilityLabel={`View ${creator.name}'s profile`}
              >
                <Avatar uri={creator.avatarUrl} userId={creator.userId} name={creator.name} size={40} />
                <View style={styles.creatorCopy}>
                  <Text style={[styles.creatorName, { color: COLORS.text }]} numberOfLines={1}>{creator.name}</Text>
                  <Text style={[styles.creatorSubtitle, { color: COLORS.muted }]}>Suggested for you</Text>
                </View>
              </TouchableOpacity>
            )) : (
              <Text style={[styles.sidebarEmpty, { color: COLORS.muted }]}>Creators from your feed will appear here.</Text>
            )}
          </View>
        ) : null}
      </View>
      {!loading && errorMessage && posts.length > 0 ? <Text style={[styles.inlineError, { color: COLORS.muted }]}>{errorMessage}</Text> : null}
      <TopLoadingBar isLoading={loading || refreshing || loadingMore || loadingStories} />
      <StoryViewer
        visible={storyViewerVisible}
        storyGroups={storyGroups}
        initialGroupIndex={activeStoryGroup}
        userId={user?.$id}
        currentUser={user}
        onClose={() => setStoryViewerVisible(false)}
        onViewRecorded={updateStoryAfterView}
      />
      <CreatePostModal
        visible={postModalVisible}
        user={user}
        initialPostType={draftPostType}
        initialAsset={draftAsset}
        initialEmojiOpen={draftEmojiOpen}
        onClose={() => setPostModalVisible(false)}
        onPosted={handlePostCreated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  desktopScreen: { backgroundColor: '#18191A' },
  topBar: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  desktopTopBar: { height: 60, paddingHorizontal: 24, backgroundColor: '#242526', borderBottomColor: '#3A3B3C' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  feedLayout: { flex: 1 },
  desktopFeedLayout: { flexDirection: 'row', justifyContent: 'center', alignItems: 'stretch', paddingTop: 16 },
  feedColumn: { flex: 1, minWidth: 0 },
  desktopFeedColumn: { flex: 0, maxWidth: 600, minWidth: 0, overflow: 'hidden', borderWidth: 1, borderColor: '#3A3B3C', borderRadius: 12, backgroundColor: '#242526' },
  feedList: { flex: 1 },
  desktopListContent: { paddingTop: 0, paddingBottom: 18 },
  sidebar: { flexShrink: 0, alignSelf: 'flex-start', paddingTop: 12 },
  leftSidebar: { borderRightWidth: 1, borderRightColor: '#3A3B3C', paddingRight: 14 },
  rightSidebar: { borderLeftWidth: 1, borderLeftColor: '#3A3B3C', paddingLeft: 14 },
  sidebarHeading: { color: '#B0B3B8', fontSize: 14, fontWeight: '700', marginBottom: 14, paddingHorizontal: 10 },
  sidebarLink: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 10, borderRadius: 10, marginBottom: 4 },
  sidebarLinkActive: { backgroundColor: '#263238' },
  sidebarLinkText: { color: '#E4E6EB', fontSize: 14, fontWeight: '600' },
  sidebarLinkTextActive: { color: COLORS.cyan },
  creatorLink: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4 },
  creatorCopy: { flex: 1, minWidth: 0 },
  creatorName: { color: '#E4E6EB', fontSize: 13, fontWeight: '700' },
  creatorSubtitle: { color: '#B0B3B8', fontSize: 11, marginTop: 3 },
  sidebarEmpty: { color: '#B0B3B8', fontSize: 12, lineHeight: 18, paddingHorizontal: 10 },
  topIconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#171A21' },
  newPostsBanner: { position: 'absolute', zIndex: 2, top: 62, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 9, borderRadius: 20, backgroundColor: COLORS.cyan, elevation: 5, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  newPostsText: { color: '#061116', fontSize: 12, fontWeight: '800', marginLeft: 6 },
  listContent: { paddingTop: 12, paddingBottom: 18 },
  storiesContainer: { paddingTop: 10, paddingBottom: 12 },
  storiesList: { paddingHorizontal: 14, paddingTop: 8, gap: 10 },
  storyCard: {
    width: 100,
    height: 140,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: COLORS.card,
    overflow: 'hidden',
    alignItems: 'center',
  },
  createStoryCard: {
    width: 100,
    height: 140,
    borderRadius: 12,
    backgroundColor: COLORS.cyan,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  createStoryCardContent: { alignItems: 'center', justifyContent: 'center' },
  storyReadBorder: { borderColor: COLORS.muted },
  storyUnreadBorder: { borderColor: COLORS.cyan },
  storyMediaWrapper: { width: '100%', height: 100, position: 'relative', overflow: 'hidden' },
  storyMedia: { width: '100%', height: '100%' },
  storyMediaFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  storyGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%' },
  storyName: { width: 100, fontSize: 10, fontWeight: '800', color: COLORS.text, textAlign: 'center', paddingHorizontal: 4, marginTop: 4 },
  emptyList: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyIcon: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 38, backgroundColor: 'rgba(0,229,255,0.1)' },
  emptyTitle: { color: '#F1F4F7', fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 17 },
  emptyText: { color: '#9BA3AD', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 12 },
  retryButton: { marginTop: 15, paddingHorizontal: 19, paddingVertical: 10, borderRadius: 18, backgroundColor: COLORS.cyan },
  retryText: { color: '#061116', fontSize: 13, fontWeight: '800' },
  footerLoader: { paddingVertical: 16 },
  inlineError: { color: '#FF7B86', textAlign: 'center', padding: 8 },
  reelsSection: { marginVertical: 14 },
  reelsDividerWrapper: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.bg,
    paddingTop: 10,
    marginBottom: 10,
  },
  carouselWrapper: {
    borderTopWidth: 8,
    borderTopColor: COLORS.bg,
    borderBottomWidth: 8,
    borderBottomColor: COLORS.bg,
    marginBottom: 0,
  },
  verifiedCreatorsWrapper: {
    borderBottomWidth: 8,
    borderBottomColor: COLORS.bg,
    marginBottom: 8,
  },
  reelsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: COLORS.bg,
    marginBottom: 10,
  },
  reelsHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  reelsHeaderText: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  watchAllLink: { paddingHorizontal: 8 },
  watchAllText: { color: COLORS.cyan, fontSize: 13, fontWeight: '700' },
  reelsList: { paddingHorizontal: 15, gap: 14, paddingBottom: 15 },
  reelCard: {
    width: 150,
    height: 250,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: COLORS.card,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    overflow: 'hidden',
  },
  reelMediaWrapper: { width: 150, height: 190, position: 'relative', overflow: 'hidden' },
  reelMedia: { width: '100%', height: '100%' },
  reelMediaFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  reelGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '55%' },
  reelPlayOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  reelStats: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 14 },
  reelViews: { color: COLORS.text, fontSize: 11, fontWeight: '700' },
  reelInfo: { paddingHorizontal: 10, paddingBottom: 10 },
  reelCaption: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  reelUsernameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reelUsername: { fontSize: 11.5, fontWeight: '700', color: COLORS.text },
  verifyBadge: { marginTop: -1 },
});

