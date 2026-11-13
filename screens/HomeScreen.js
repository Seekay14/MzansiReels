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
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VideoCard from '../components/VideoCard';
import MzansiLoader from '../components/MzansiLoader';
import TopLoadingBar from '../components/TopLoadingBar';
import { databases, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { useSearchMenu } from '../context/SearchMenuContext';
import { blockUser } from '../config/helpers';

const PAGE_SIZE = 20;

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const { openSearchMenu } = useSearchMenu();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('foryou');
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [containerHeight, setContainerHeight] = useState(0);
  const [feedError, setFeedError] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const flatListRef = useRef(null);
  const requestId = useRef(0);
  const videoCount = useRef(0);
  const lastReelsTabPress = useRef(0);
  const [hasMore, setHasMore] = useState(true);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 65,
    minimumViewTime: 100,
  }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const firstVisible = viewableItems.find((item) => item.index != null);
    if (firstVisible) setActiveIndex(firstVisible.index);
  }).current;

  const fetchFeed = useCallback(async ({ append = false } = {}) => {
    const request = ++requestId.current;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setFeedError('');
    }

    try {
      const queries = [];
      const blockedUserIds = [];
      if (user?.$id) {
        let blockOffset = 0;
        let blockTotal = 0;
        while (true) {
          const blockedUsers = await databases.listDocuments(DATABASE_ID, COLLECTIONS.blocks, [
            Query.equal('blockerId', user.$id),
            Query.limit(100),
            Query.offset(blockOffset),
          ]);
          blockedUserIds.push(...blockedUsers.documents.map((block) => block.blockedId).filter(Boolean));
          blockTotal = blockedUsers.total;
          blockOffset += blockedUsers.documents.length;
          if (blockedUsers.documents.length === 0 || blockOffset >= blockTotal) break;
        }
      }

      if (blockedUserIds.length > 0) {
        queries.push(Query.notEqual('userId', [...new Set(blockedUserIds)]));
      }

      if (activeTab === 'following' && user?.$id) {
        const follows = await databases.listDocuments(DATABASE_ID, COLLECTIONS.follows, [
          Query.equal('followerId', user.$id),
          Query.limit(100),
        ]);
        const followedIds = [...new Set(follows.documents.map((doc) => doc.followingId).filter(Boolean))];
        if (followedIds.length === 0) {
          if (request === requestId.current) {
            videoCount.current = 0;
            setVideos([]);
            setHasMore(false);
          }
          return;
        }
        queries.push(Query.equal('userId', followedIds));
      }

      if (activeTab === 'foryou') {
        queries.push(
          Query.orderDesc('likes'),
          Query.orderDesc('views'),
          Query.orderDesc('$createdAt'),
        );
      } else {
        queries.push(Query.orderDesc('$createdAt'));
      }
      queries.push(
        Query.limit(PAGE_SIZE),
        Query.offset(append ? videoCount.current : 0),
      );
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.videos, queries);
      if (request !== requestId.current) return;
      const offset = append ? videoCount.current : 0;
      videoCount.current = offset + result.documents.length;
      setHasMore(videoCount.current < result.total);
      setVideos((current) => append ? [...current, ...result.documents] : result.documents);
      setFeedError('');
    } catch (error) {
      console.error('Error fetching video feed:', error);
      if (request === requestId.current) {
        setFeedError('We couldn’t load videos. Check your connection and try again.');
      }
    } finally {
      if (request === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [activeTab, user]);

  const fetchUnreadCount = useCallback(async () => {
    if (!user?.$id) {
      setUnreadCount(0);
      return;
    }
    try {
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.notifications, [
        Query.equal('userId', user.$id),
        Query.equal('isRead', false),
        Query.limit(1),
      ]);
      setUnreadCount(result.total);
    } catch (error) {
      console.error('Error fetching unread notification count:', error);
    }
  }, [user]);

  useEffect(() => {
    if (!focused) return;
    setActiveIndex(0);
    fetchFeed();
    fetchUnreadCount();
  }, [focused, activeTab, fetchFeed, fetchUnreadCount]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setActiveIndex(0);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    fetchFeed();
  }, [fetchFeed]);

  useEffect(() => {
    if (!focused) return undefined;
    const tabNavigation = navigation.getParent()?.getParent();
    if (!tabNavigation) return undefined;
    return tabNavigation.addListener('tabPress', (event) => {
      const reelsRoute = tabNavigation.getState().routes.find((route) => route.name === 'Reels');
      if (event.target !== reelsRoute?.key || !tabNavigation.isFocused()) return;

      const now = Date.now();
      if (now - lastReelsTabPress.current <= 350) {
        lastReelsTabPress.current = 0;
        onRefresh();
      } else {
        lastReelsTabPress.current = now;
      }
    });
  }, [focused, navigation, onRefresh]);

  const loadMore = useCallback(() => {
    if (!loading && !loadingMore && hasMore && videos.length >= PAGE_SIZE) {
      fetchFeed({ append: true });
    }
  }, [fetchFeed, hasMore, loading, loadingMore, videos.length]);

  const removeFromFeed = useCallback((shouldRemove) => {
    setVideos((current) => {
      const remaining = current.filter((video) => !shouldRemove(video));
      videoCount.current = Math.max(0, videoCount.current - (current.length - remaining.length));
      return remaining;
    });
  }, []);

  const selectTab = (tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setActiveIndex(0);
    setVideos([]);
    videoCount.current = 0;
    setHasMore(true);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  };

  const renderFeed = () => {
    if (loading && !refreshing) {
      return (
        <View style={styles.center}>
          <MzansiLoader />
        </View>
      );
    }

    if (feedError && videos.length === 0) {
      return (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={42} color={COLORS.muted} />
          <Text style={styles.stateText}>{feedError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchFeed()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        ref={flatListRef}
        data={videos}
        keyExtractor={(item) => item.$id}
        renderItem={({ item, index }) => (
          <VideoCard
            item={item}
            navigation={navigation}
            height={containerHeight}
            isActive={focused && index === activeIndex}
            muted={muted}
            onToggleMute={() => setMuted((current) => !current)}
            onDeleted={(videoId) => {
              setVideos((current) => current.filter((video) => video.$id !== videoId));
              videoCount.current = Math.max(0, videoCount.current - 1);
            }}
            onNotInterested={(videoId) => removeFromFeed((video) => video.$id === videoId)}
            onBlockUser={async (targetUserId) => {
              if (!user?.$id) return;
              await blockUser(user.$id, targetUserId);
              removeFromFeed((video) => video.userId === targetUserId);
            }}
            onOpenProfile={(video) => navigation.navigate('UserProfile', {
              userId: video.userId,
              userName: video.userName,
            })}
          />
        )}
        pagingEnabled
        snapToInterval={containerHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: containerHeight,
          offset: containerHeight * index,
          index,
        })}
        onEndReached={loadMore}
        onEndReachedThreshold={0.75}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.cyan}
            progressViewOffset={insets.top + 44}
          />
        }
        ListEmptyComponent={
          <View style={[styles.center, { height: containerHeight }]}>
            <Ionicons name="videocam-off-outline" size={54} color={COLORS.muted} />
            <Text style={styles.stateText}>
              {activeTab === 'following'
                ? 'Videos from creators you follow will appear here.'
                : 'No videos yet. Be the first to share one.'}
            </Text>
            {activeTab === 'following' && (
              <TouchableOpacity style={styles.retryButton} onPress={() => navigation.navigate('Search')}>
                <Text style={styles.retryText}>Find creators</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        ListFooterComponent={loadingMore ? <ActivityIndicator color={COLORS.cyan} style={styles.footerLoader} /> : null}
      />
    );
  };

  return (
    <View
      style={styles.container}
      onLayout={(event) => {
        const height = event.nativeEvent.layout.height;
        if (height > 0 && height !== containerHeight) setContainerHeight(height);
      }}
    >
      {containerHeight > 0 && renderFeed()}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0,0,0,0.68)', 'rgba(0,0,0,0)']}
        style={[styles.topShade, { height: insets.top + 78 }]}
      />
      <View style={[styles.topHeader, { top: insets.top + 8 }]}>
        <View style={styles.sideSlot} />
        <View style={styles.tabsContainer}>
          {[
            { key: 'following', title: 'Following' },
            { key: 'foryou', title: 'For You' },
          ].map(({ key, title }) => {
            const tabTitle = key === 'following' && !user ? 'Latest' : title;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => selectTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === key }}
                style={styles.tabButton}
              >
                <Text style={[styles.tabText, activeTab === key && styles.activeTabText]}>{tabTitle}</Text>
                {activeTab === key && <View style={styles.activeTabIndicator} />}
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.headerActions}>
          {user ? (
            <TouchableOpacity
              style={[styles.sideSlot, styles.notificationButton]}
              onPress={() => navigation.navigate('Notifications')}
              accessibilityRole="button"
              accessibilityLabel={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            >
              <Ionicons name="notifications-outline" size={25} color="#fff" />
              {unreadCount > 0 && <View style={styles.notificationDot} />}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.sideSlot, styles.notificationButton]}
            onPress={openSearchMenu}
            accessibilityRole="button"
            accessibilityLabel="Search"
          >
            <Ionicons name="search-outline" size={25} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
      {!user ? (
        <View style={[styles.guestBanner, { top: insets.top + 52 }]}>
          <Text style={styles.guestBannerText}>You are browsing as a guest. Log in to interact.</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')} accessibilityRole="button">
            <Text style={styles.guestLoginText}>Log In</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <TopLoadingBar isLoading={loading || refreshing || loadingMore} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, backgroundColor: COLORS.bg },
  stateText: { color: COLORS.muted, marginTop: 14, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  retryButton: { backgroundColor: COLORS.cyan, borderRadius: 22, paddingHorizontal: 22, paddingVertical: 10, marginTop: 18 },
  retryText: { color: '#000', fontWeight: '700' },
  footerLoader: { padding: 18 },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0 },
  topHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  sideSlot: { width: 42, height: 42 },
  headerActions: { flexDirection: 'row', alignItems: 'center', marginRight: -8 },
  notificationButton: { alignItems: 'center', justifyContent: 'center' },
  notificationDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.pink,
    borderWidth: 1,
    borderColor: '#000',
  },
  guestBanner: { position: 'absolute', left: 12, right: 12, minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 18, backgroundColor: 'rgba(17,24,32,0.94)', zIndex: 9 },
  guestBannerText: { color: '#D5DCE2', fontSize: 10 },
  guestLoginText: { color: COLORS.cyan, fontSize: 11, fontWeight: '800', marginLeft: 7 },
  tabsContainer: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  tabButton: { alignItems: 'center', paddingVertical: 8 },
  tabText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 16,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  activeTabText: { color: '#fff' },
  activeTabIndicator: { height: 3, width: 24, backgroundColor: COLORS.cyan, marginTop: 5, borderRadius: 2 },
});
