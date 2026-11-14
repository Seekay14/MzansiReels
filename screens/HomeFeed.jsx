import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import TextPostCard from '../components/TextPostCard';
import SkeletonPost from '../components/SkeletonPost';
import BrandTitle from '../components/BrandTitle';
import CreatePostComposer from '../components/CreatePostComposer';
import CreatePostModal from '../components/CreatePostModal';
import StoriesRow, { groupStories } from '../components/StoriesRow';
import StoryViewer from '../components/StoryViewer';
import TopLoadingBar from '../components/TopLoadingBar';
import { client, databases, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import { fetchActiveStories } from '../config/storyService';
import { useAuth } from '../context/AuthContext';
import { requireAuth } from '../config/helpers';
import { useTheme } from '../context/ThemeContext';
import { useSearchMenu } from '../context/SearchMenuContext';
import * as ImagePicker from 'expo-image-picker';
import Avatar from '../components/Avatar';

const PAGE_SIZE = 20;

export default function HomeFeed({ navigation }) {
  const { user } = useAuth();
  const { colors } = useTheme();
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
    if (!postId || viewedPostIds.current.has(postId)) return;
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
  }, []);

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
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.posts, [
        Query.orderDesc('uploadedAt'),
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
  }, []);

  const fetchStories = useCallback(async () => {
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

  useEffect(() => {
    if (focused) {
      fetchPosts();
      fetchStories();
    }
  }, [focused, fetchPosts, fetchStories]);

  useEffect(() => {
    if (!focused) return undefined;
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.stories}.documents`,
      (event) => {
        if (event.events?.some((name) => name.endsWith('.create') || name.endsWith('.delete'))) {
          fetchStories();
        }
      },
    );
    return unsubscribe;
  }, [fetchStories, focused]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setHasNewPosts(false);
    fetchPosts();
    fetchStories();
  }, [fetchPosts, fetchStories]);

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
  const storiesHeader = (
    <View>
      <StoriesRow
        stories={stories}
        user={user}
        onOpenStory={(index) => {
          setActiveStoryGroup(index);
          setStoryViewerVisible(true);
        }}
      />
      <CreatePostComposer
        user={user}
        desktop={isDesktop}
        onPressComposer={() => openPostModal()}
        onPickImage={() => pickPostMedia('image')}
        onPickVideo={() => pickPostMedia('video')}
        onPressEmoji={() => openPostModal('text', null, true)}
      />
    </View>
  );

  const feedContent = loading && posts.length === 0 ? (
    <FlatList
      data={Array.from({ length: 5 }, (_, index) => `skeleton-${index}`)}
      keyExtractor={(item) => item}
      renderItem={() => <SkeletonPost />}
      ListHeaderComponent={storiesHeader}
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
        <Text style={styles.retryText}>Try again</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <FlatList
      ref={listRef}
      data={visiblePosts}
      keyExtractor={(item) => item.$id}
      renderItem={({ item }) => (
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
      )}
      ListHeaderComponent={storiesHeader}
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
            <Ionicons name="newspaper-outline" size={38} color={COLORS.cyan} />
          </View>
          <Text style={styles.emptyTitle}>Nothing to see here yet</Text>
          <Text style={styles.emptyText}>Follow some creators or post your first update!</Text>
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
        { backgroundColor: colors.bg },
        isDesktop && styles.desktopScreen,
        isDesktop && { backgroundColor: colors.bg },
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
        { backgroundColor: colors.bg, borderBottomColor: colors.border },
        isDesktop && styles.desktopTopBar,
        isDesktop && { backgroundColor: colors.card, borderBottomColor: colors.border },
      ]}>
        <BrandTitle />
        <View style={styles.topActions}>
          {user ? (
            <TouchableOpacity
              style={styles.topIconButton}
              onPress={() => navigation.navigate('Notifications')}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Ionicons name="notifications-outline" size={22} color={colors.text} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.topIconButton}
            onPress={openSearchMenu}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Ionicons name="search-outline" size={22} color={colors.text} />
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
          <Ionicons name="arrow-up" size={16} color="#061116" />
          <Text style={styles.newPostsText}>Show new posts</Text>
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
          <View style={[styles.sidebar, styles.leftSidebar, { width: sidebarWidth, borderRightColor: colors.border }]}>
            <Text style={[styles.sidebarHeading, { color: colors.muted }]}>Navigation</Text>
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
                <Ionicons name={item.icon} size={21} color={item.active ? colors.accent : colors.muted} />
                <Text style={[styles.sidebarLinkText, { color: colors.text }, item.active && styles.sidebarLinkTextActive]}>
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
              <Ionicons name="search-outline" size={21} color={colors.muted} />
              <Text style={[styles.sidebarLinkText, { color: colors.text }]}>Search</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View
          style={[
            styles.feedColumn,
            isDesktop && styles.desktopFeedColumn,
            isDesktop && { width: feedWidth },
            isDesktop && { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {feedContent}
        </View>
        {showRightSidebar ? (
          <View style={[styles.sidebar, styles.rightSidebar, { width: sidebarWidth, borderLeftColor: colors.border }]}>
            <Text style={[styles.sidebarHeading, { color: colors.muted }]}>Suggested Creators</Text>
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
                  <Text style={[styles.creatorName, { color: colors.text }]} numberOfLines={1}>{creator.name}</Text>
                  <Text style={[styles.creatorSubtitle, { color: colors.muted }]}>Suggested for you</Text>
                </View>
              </TouchableOpacity>
            )) : (
              <Text style={[styles.sidebarEmpty, { color: colors.muted }]}>Creators from your feed will appear here.</Text>
            )}
          </View>
        ) : null}
      </View>
      {!loading && errorMessage && posts.length > 0 ? <Text style={styles.inlineError}>{errorMessage}</Text> : null}
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
  emptyList: { flexGrow: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyIcon: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 38, backgroundColor: 'rgba(0,229,255,0.1)' },
  emptyTitle: { color: '#F1F4F7', fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 17 },
  emptyText: { color: '#9BA3AD', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 12 },
  retryButton: { marginTop: 15, paddingHorizontal: 19, paddingVertical: 10, borderRadius: 18, backgroundColor: COLORS.cyan },
  retryText: { color: '#061116', fontSize: 13, fontWeight: '800' },
  footerLoader: { paddingVertical: 16 },
  inlineError: { color: '#FF7B86', textAlign: 'center', padding: 8 },
});
