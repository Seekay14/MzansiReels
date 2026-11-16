import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, TouchableOpacity, StyleSheet, Dimensions, FlatList, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VideoCard from '../components/VideoCard';
import { blockUser } from '../config/helpers';
import { useAuth } from '../context/AuthContext';
import { COLORS, COLLECTIONS, DATABASE_ID } from '../config/constants';
import { databases, Query } from '../config/appwrite';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PAGE_SIZE = 20;

export default function WatchScreen({ route, navigation }) {
  // 👈 Receive the full list of videos if available
  const { video, allVideos } = route.params;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [muted, setMuted] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletedVideoIds, setDeletedVideoIds] = useState([]);
  const [blockedUserIds, setBlockedUserIds] = useState([]);
  const requestId = useRef(0);

  // Build initial feed: ensure selected video is present, then start at its index.
  const initialFeed = useMemo(() => {
    const videos = allVideos && allVideos.length > 0 ? [...allVideos] : [video];
    if (!videos.some((item) => item.$id === video.$id)) {
      videos.unshift(video);
    }
    return videos;
  }, [video, allVideos]);

  const [feed, setFeed] = useState(initialFeed);

  const initialIndex = useMemo(() => {
    const idx = feed.findIndex((item) => item.$id === video.$id);
    return Math.max(0, idx);
  }, [feed, video]);

  const [activeIndex, setActiveIndex] = useState(initialIndex);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const activeItem = viewableItems.find((item) => (
      item.isViewable && Number.isInteger(item.index)
    ));
    if (activeItem) setActiveIndex(activeItem.index);
  }).current;
  const visibleActiveIndex = Math.min(activeIndex, Math.max(feed.length - 1, 0));

  const fetchMore = useCallback(async () => {
    if (loadingMore || !hasMore || !user?.$id) return;
    const request = ++requestId.current;
    setLoadingMore(true);
    try {
      const queries = [
        Query.orderDesc('$createdAt'),
        Query.limit(PAGE_SIZE),
        Query.offset(page * PAGE_SIZE),
      ];
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.videos, queries);
      if (request !== requestId.current) return;
      const existingIds = new Set(feed.map((v) => v.$id));
      const newVideos = result.documents.filter(
        (v) => !existingIds.has(v.$id)
          && !deletedVideoIds.includes(v.$id)
          && !blockedUserIds.includes(v.userId),
      );
      setFeed((current) => [...current, ...newVideos]);
      setHasMore(newVideos.length > 0);
      setPage((p) => p + 1);
    } catch (error) {
      console.error('Could not load more videos:', error);
    } finally {
      if (request === requestId.current) setLoadingMore(false);
    }
  }, [loadingMore, hasMore, user?.$id, page, feed, deletedVideoIds, blockedUserIds]);

  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) fetchMore();
  }, [loadingMore, hasMore, fetchMore]);

  return (
    <View style={[styles.container, { backgroundColor: COLORS.bg }]}>
      {/* 👈 Using FlatList to allow scrolling downwards */}
      <FlatList
        data={feed}
        keyExtractor={(item) => item.$id}
        renderItem={({ item, index }) => (
          <VideoCard
            item={item}
            currentUser={user}
            navigation={navigation}
            height={SCREEN_HEIGHT}
            isActive={focused && index === visibleActiveIndex}
            muted={muted}
            onToggleMute={() => setMuted((current) => !current)}
            onDeleted={(videoId) => setDeletedVideoIds((current) => [...current, videoId])}
            onNotInterested={(videoId) => setDeletedVideoIds((current) => [...current, videoId])}
            onBlockUser={async (userId) => {
              if (!user?.$id) throw new Error('Please sign in to block a creator.');
              await blockUser(user.$id, userId);
              setBlockedUserIds((current) => (
                current.includes(userId) ? current : [...current, userId]
              ));
            }}
            onOpenProfile={(v) => navigation.navigate('UserProfile', { userId: v.userId, userName: v.userName })}
          />
        )}
        pagingEnabled
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * index,
          index,
        })}
        onEndReached={loadMore}
        onEndReachedThreshold={0.75}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
      />
      
      {/* Floating Glassy Back Button */}
      <TouchableOpacity 
        style={[styles.backButton, { top: insets.top + 10 }]} 
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={28} color={COLORS.text} />
      </TouchableOpacity>
      
      {loadingMore && <ActivityIndicator style={styles.footerLoader} color={COLORS.cyan} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.bg 
  },
  backButton: { 
    position: 'absolute', 
    left: 20, 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', 
    alignItems: 'center',
    zIndex: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  footerLoader: { padding: 18 },
});
