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
  const muted = false;
  const [activeIndex, setActiveIndex] = useState(0);
  const [deletedVideoIds, setDeletedVideoIds] = useState([]);
  const [blockedUserIds, setBlockedUserIds] = useState([]);

  // If allVideos is passed, use it. Otherwise, just show the single video.
  const feed = (allVideos && allVideos.length > 0 ? allVideos : [video])
    .filter((item) => !deletedVideoIds.includes(item.$id) && !blockedUserIds.includes(item.userId));

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index);
  }).current;

  return (
    <View style={styles.container}>
      {/* 👈 Using FlatList to allow scrolling downwards */}
      <FlatList
        data={feed}
        keyExtractor={(item) => item.$id}
        renderItem={({ item, index }) => (
          <VideoCard
            item={item}
            height={SCREEN_HEIGHT}
            isActive={focused && index === activeIndex}
            muted={muted}
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
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
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