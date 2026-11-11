import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import TextPostCard from '../components/TextPostCard';
import SkeletonPost from '../components/SkeletonPost';
import StoriesRow, { groupStories } from '../components/StoriesRow';
import StoryViewer from '../components/StoryViewer';
import StoryUploadModal from '../components/StoryUploadModal';
import TopLoadingBar from '../components/TopLoadingBar';
import { databases, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import { useAuth } from '../context/AuthContext';

const PAGE_SIZE = 20;

export default function HomeFeed({ navigation }) {
  const { user } = useAuth();
  const focused = useIsFocused();
  const [posts, setPosts] = useState([]);
  const [stories, setStories] = useState([]);
  const [loadingStories, setLoadingStories] = useState(false);
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [storyUploadVisible, setStoryUploadVisible] = useState(false);
  const [activeStoryGroup, setActiveStoryGroup] = useState(0);
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
  const storyGroups = React.useMemo(() => groupStories(stories, user?.$id), [stories, user?.$id]);

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
    if (!user?.$id) return;
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
  }, [user?.$id]);

  const fetchStories = useCallback(async () => {
    setLoadingStories(true);
    try {
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.stories, [
        Query.greaterThan('createdAt', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
        Query.orderDesc('createdAt'),
        Query.limit(100),
      ]);
      setStories(result.documents);
    } catch (error) {
      console.error('Could not load active stories:', error);
    } finally {
      setLoadingStories(false);
    }
  }, []);

  useEffect(() => {
    if (focused) {
      fetchPosts();
      fetchStories();
    }
  }, [focused, fetchPosts, fetchStories]);

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

  const visiblePosts = posts.filter((post) => !hiddenPostIds.includes(post.$id));
  const storiesHeader = (
    <StoriesRow
      stories={stories}
      user={user}
      onAddStory={() => setStoryUploadVisible(true)}
      onOpenStory={(index) => {
        setActiveStoryGroup(index);
        setStoryViewerVisible(true);
      }}
    />
  );

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>Mzansi<Text style={styles.brandAccent}>Reels</Text></Text>
        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.topIconButton}
            onPress={() => navigation.navigate('Notifications')}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={22} color="#F1F4F7" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.topIconButton}
            onPress={() => navigation.navigate('NewMessage')}
            accessibilityRole="button"
            accessibilityLabel="New message"
          >
            <Ionicons name="paper-plane-outline" size={21} color="#F1F4F7" />
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
      {loading && posts.length === 0 ? (
        <FlatList
          data={Array.from({ length: 5 }, (_, index) => `skeleton-${index}`)}
          keyExtractor={(item) => item}
          renderItem={() => <SkeletonPost />}
          ListHeaderComponent={storiesHeader}
          contentContainerStyle={styles.listContent}
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
              navigation={navigation}
              onHide={hidePost}
              onDelete={removePost}
              onShared={addSharedPost}
            />
          )}
          ListHeaderComponent={storiesHeader}
          contentContainerStyle={visiblePosts.length ? styles.listContent : styles.emptyList}
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
      )}
      {!loading && errorMessage && posts.length > 0 ? <Text style={styles.inlineError}>{errorMessage}</Text> : null}
      <TopLoadingBar isLoading={loading || refreshing || loadingMore || loadingStories} />
      <StoryViewer
        visible={storyViewerVisible}
        storyGroups={storyGroups}
        initialGroupIndex={activeStoryGroup}
        userId={user?.$id}
        onClose={() => setStoryViewerVisible(false)}
      />
      <StoryUploadModal
        visible={storyUploadVisible}
        user={user}
        onClose={() => setStoryUploadVisible(false)}
        onUploaded={(story) => setStories((current) => [story, ...current])}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  brand: { color: '#F6F8FA', fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  brandAccent: { color: COLORS.cyan },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
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
