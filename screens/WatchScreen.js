import React, { useState, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VideoCard from '../components/VideoCard';
import { blockUser } from '../config/helpers';
import { useAuth } from '../context/AuthContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function WatchScreen({ route, navigation }) {
  // 👈 Receive the full list of videos if available
  const { video, allVideos } = route.params;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [muted, setMuted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => {
    const initialIndex = allVideos?.findIndex((item) => item.$id === video.$id) ?? 0;
    return Math.max(0, initialIndex);
  });
  const [deletedVideoIds, setDeletedVideoIds] = useState([]);
  const [blockedUserIds, setBlockedUserIds] = useState([]);

  // If allVideos is passed, use it. Otherwise, just show the single video.
  const feed = (allVideos && allVideos.length > 0 ? allVideos : [video])
    .filter((item) => !deletedVideoIds.includes(item.$id) && !blockedUserIds.includes(item.userId));

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const activeItem = viewableItems.find((item) => (
      item.isViewable && Number.isInteger(item.index)
    ));
    if (activeItem) setActiveIndex(activeItem.index);
  }).current;
  const visibleActiveIndex = Math.min(activeIndex, Math.max(feed.length - 1, 0));

  return (
    <View style={styles.container}>
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
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />
      
      {/* Floating Glassy Back Button */}
      <TouchableOpacity 
        style={[styles.backButton, { top: insets.top + 10 }]} 
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#000' 
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
});