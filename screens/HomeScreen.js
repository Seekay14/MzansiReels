import React, { useRef, useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, FlatList, ActivityIndicator, Text, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import VideoCard from '../components/VideoCard';
import { databases, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('foryou'); 
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [height, setHeight] = useState(0);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    try {
      let queries = [Query.orderDesc('$createdAt'), Query.limit(20)];

      if (activeTab === 'following' && user) {
        const followsRes = await databases.listDocuments(
          DATABASE_ID, 
          COLLECTIONS.follows, 
          [Query.equal('followerId', user.$id), Query.limit(100)]
        );
        
        const followedIds = followsRes.documents.map(doc => doc.followingId);
        
        if (followedIds.length > 0) {
          queries.push(Query.equal('userId', followedIds)); 
        } else {
          setVideos([]);
          setLoading(false);
          return;
        }
      }

      const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.videos, queries);
      setVideos(res.documents);
    } catch (error) {
      console.log('Error fetching feed:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, user]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed, focused]);

  const onRefresh = () => {
    setRefreshing(true);
    setActiveIndex(0);
    fetchFeed();
  };

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) setActiveIndex(viewableItems[0].index);
  }).current;

  return (
    <View style={styles.container} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      
      {/* TOP HEADER WITH TABS */}
      <View style={[styles.topHeader, { top: insets.top + 10 }]} pointerEvents="box-none">
        <View style={{ flex: 1 }} />
        
        <View style={styles.tabsContainer}>
          <TouchableOpacity onPress={() => setActiveTab('following')}>
            <Text style={[styles.tabText, activeTab === 'following' && styles.activeTabText]}>Following</Text>
            {activeTab === 'following' && <View style={styles.activeTabIndicator} />}
          </TouchableOpacity>
          
          <TouchableOpacity onPress={() => setActiveTab('foryou')}>
            <Text style={[styles.tabText, activeTab === 'foryou' && styles.activeTabText]}>For You</Text>
            {activeTab === 'foryou' && <View style={styles.activeTabIndicator} />}
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={{ flex: 1, alignItems: 'flex-end' }} onPress={() => navigation.navigate('Notifications')}>
          <Ionicons name="notifications-outline" size={28} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={[styles.center, { backgroundColor: COLORS.bg }]}>
          <ActivityIndicator size="large" color={COLORS.cyan} />
        </View>
      ) : height > 0 ? (
        <FlatList
          data={videos}
          keyExtractor={(item) => item.$id}
          renderItem={({ item, index }) => (
            <VideoCard
              item={item}
              height={height}
              isActive={focused && index === activeIndex}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onOpenProfile={(v) => navigation.navigate('UserProfile', { userId: v.userId, userName: v.userName })}
            />
          )}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.cyan} progressViewOffset={insets.top + 40} />}
          ListEmptyComponent={
            <View style={[styles.center, { backgroundColor: COLORS.bg }]}>
              <Ionicons name="videocam-off-outline" size={60} color={COLORS.muted} />
              <Text style={{ color: COLORS.muted, marginTop: 10, fontSize: 16, textAlign: 'center', paddingHorizontal: 20 }}>
                {activeTab === 'following' ? "You aren't following anyone with videos yet." : "No videos uploaded yet."}
              </Text>
            </View>
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topHeader: { 
    position: 'absolute', 
    left: 0, 
    right: 0, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    paddingHorizontal: 20, 
    zIndex: 10 
  },
  tabsContainer: { 
    flexDirection: 'row', 
    gap: 20 
  },
  tabText: { 
    color: 'rgba(255, 255, 255, 0.6)', 
    fontSize: 17, 
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3
  },
  activeTabText: { 
    color: '#fff' 
  },
  activeTabIndicator: { 
    height: 2, 
    backgroundColor: '#fff', 
    marginTop: 4, 
    borderRadius: 2 
  }
});