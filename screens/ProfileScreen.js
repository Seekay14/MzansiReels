import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID, fileIdFromUrl } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { ensureUserDoc, getVideoThumbnail } from '../config/helpers';
import { formatCompactCount } from '../config/formatNumbers';
import {
  fetchAllProfileDocuments,
  fetchProfileActivityContent,
  fetchProfileDocumentsByIds,
  fetchProfileFollowCounts,
  filterVisibleProfileContent,
} from '../config/profileContentService';
import { uploadProfilePicture } from '../config/profilePictureService';
import { getResponsiveScale } from '../config/responsive';
import Avatar from '../components/Avatar';
import LaunchCountdownCard from '../components/LaunchCountdownCard';
import MzansiLoader from '../components/MzansiLoader';
import TextPostCard from '../components/TextPostCard';
import TopLoadingBar from '../components/TopLoadingBar';
import UserProfileScreen from './UserProfileScreen';

const PROFILE_TABS = [
  { id: 'posts', label: 'Posts', icon: 'document-text-outline' },
  { id: 'videos', label: 'videos', icon: 'videocam-outline' },
  { id: 'liked', label: 'liked', icon: 'heart-outline' },
  { id: 'saved', label: 'saved', icon: 'bookmark-outline' },
];

function MyProfileScreen({ navigation }) {
  const { user, setUser } = useAuth();
  const profileUserId = user?.$id;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scale = getResponsiveScale(width);
  const isDesktop = Platform.OS === 'web' && width > 768;
  const [userDoc, setUserDoc] = useState(null);
  const [videos, setVideos] = useState([]);
  const [uploadedVideos, setUploadedVideos] = useState([]);
  const [uploadedPosts, setUploadedPosts] = useState([]);
  const [failedThumbnailIds, setFailedThumbnailIds] = useState({});
  const [postsCount, setPostsCount] = useState(0);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [activeTab, setActiveTab] = useState('posts');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const loadRequest = useRef(0);

  const fetchProfile = useCallback(async () => {
    if (!profileUserId) return;
    const requestId = ++loadRequest.current;
    setErrorMessage('');
    setVideos([]);
    setUploadedVideos([]);
    setUploadedPosts([]);
    setFailedThumbnailIds({});
    setPostsCount(0);
    setFollowCounts({ followers: 0, following: 0 });
    try {
      const doc = await ensureUserDoc(user);
      if (requestId !== loadRequest.current) return;
      setUserDoc(doc);

      const [ownVideos, ownPosts, relationCounts] = await Promise.all([
        fetchAllProfileDocuments(COLLECTIONS.videos, [
          Query.equal('userId', profileUserId),
          Query.orderDesc('uploadedAt'),
        ]),
        fetchAllProfileDocuments(COLLECTIONS.posts, [
          Query.equal('userId', profileUserId),
          Query.orderDesc('uploadedAt'),
        ]),
        fetchProfileFollowCounts(profileUserId, doc),
      ]);
      if (requestId !== loadRequest.current) return;
      setPostsCount(ownVideos.length + ownPosts.length);
      setFollowCounts(relationCounts);
      setUploadedVideos(ownVideos);
      setUploadedPosts(ownPosts);
      if (activeTab === 'liked') {
        const activity = await fetchProfileActivityContent(profileUserId, 'likes');
        const visibleItems = await filterVisibleProfileContent(activity, profileUserId);
        if (requestId === loadRequest.current) setVideos(visibleItems);
      } else if (activeTab === 'saved') {
        const bookmarks = await fetchAllProfileDocuments(COLLECTIONS.bookmarks, [
          Query.equal('userId', profileUserId),
          Query.orderDesc('$createdAt'),
        ]);
        const [savedVideos, savedPosts] = await Promise.all([
          fetchProfileDocumentsByIds(COLLECTIONS.videos, bookmarks.map((item) => item.videoId)),
          fetchProfileDocumentsByIds(COLLECTIONS.posts, bookmarks.map((item) => item.postId)),
        ]);
        const savedItems = [
          ...savedVideos,
          ...savedPosts.map((post) => ({ ...post, mediaType: 'post' })),
        ].sort((a, b) => new Date(b.uploadedAt || b.$createdAt) - new Date(a.uploadedAt || a.$createdAt));
        const visibleItems = await filterVisibleProfileContent(savedItems, profileUserId);
        if (requestId === loadRequest.current) setVideos(visibleItems);
      }
    } catch (error) {
      if (requestId !== loadRequest.current) return;
      console.error('Could not load profile:', error);
      setErrorMessage('Could not load your profile. Pull down to try again.');
    } finally {
      if (requestId === loadRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [activeTab, profileUserId, user]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchProfile();
    return () => {
      loadRequest.current += 1;
    };
  }, [fetchProfile]));

  const pickAvatar = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to change your picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;

      setUploadingAvatar(true);
      const { url: avatarUrl, userDocument } = await uploadProfilePicture(result.assets[0], user);
      setUserDoc(userDocument);
      await setUser({ ...user, avatarUrl });
    } catch (error) {
      console.error('Could not update profile picture:', error);
      Alert.alert('Could not update photo', error.message || 'Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const shareProfile = async () => {
    try {
      const username = userDoc?.username || user?.username || 'username unavailable';
      await Share.share({ message: `Check out @${username} on MzansiReels!` });
    } catch (error) {
      console.error('Could not share profile:', error);
      Alert.alert('Could not share profile', error.message || 'Please try again.');
    }
  };

  const openReelsViewer = (videoId) => {
    const activeItems = activeTab === 'videos'
      ? uploadedVideos
      : activeTab === 'posts'
        ? uploadedPosts
        : videos;
    const allVideos = activeItems.filter((item) => item.mediaType !== 'post');
    const video = allVideos.find((item) => item.$id === videoId);
    if (!video) return;
    navigation.navigate('Home', {
      screen: 'Watch',
      params: { video, allVideos },
    });
  };

  const openVideo = (video) => {
    if (video.mediaType === 'post') {
      navigation.navigate('Home', { screen: 'Feed' });
      return;
    }
    openReelsViewer(video.$id);
  };

  const handleLongPress = (video) => {
    Alert.alert('Manage Video', 'What would you like to do?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Edit Caption', onPress: () => navigation.navigate('EditVideo', { video }) },
    ]);
  };

  const username = userDoc?.username || user?.username || 'username unavailable';
  const displayName = userDoc?.displayName || userDoc?.name || user?.displayName || user?.name || 'Name unavailable';
  const tileSize = width / 3;

  const renderVideo = ({ item }) => {
    let thumbnailUrl = item.mediaType === 'post'
      ? item.imageUrl || ''
      : item.thumbnailUrl || '';
    if (item.mediaType !== 'post' || item.postType === 'video') {
      try {
        thumbnailUrl = getVideoThumbnail({ ...item, thumbnailUrl });
      } catch (error) {
        console.error('Could not create profile video preview URL:', error);
      }
    }

    const isTextPost = item.mediaType === 'post' && item.postType === 'text';
    const isPost = item.mediaType === 'post';
    const isVideo = !isPost;

    return (
      <TouchableOpacity
        style={[styles.videoTile, { width: tileSize, height: tileSize }]}
        onPress={() => openVideo(item)}
        onLongPress={() => {
          if (!isPost) handleLongPress(item);
        }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={isPost ? `Open post ${item.content || ''}` : `Open reel ${item.caption || ''}`}
      >
        {isTextPost ? (
          <View style={styles.textPostTile}>
            <Ionicons name="text-outline" size={30} color="#AAB2BD" />
          </View>
        ) : thumbnailUrl && !failedThumbnailIds[item.$id] ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={[StyleSheet.absoluteFillObject, { aspectRatio: 1 }]}
            resizeMode="cover"
            onLoad={() => {
              if (__DEV__ && isVideo) {
                console.debug('PROFILE VIDEO THUMBNAIL LOADED:', {
                  videoDocumentId: item.$id,
                  thumbnailField: item.thumbnailUrl || '',
                  thumbnailFileId: fileIdFromUrl(item.thumbnailUrl) || '',
                  videoFileId: item.videoFileId || fileIdFromUrl(item.videoUrl) || '',
                  generatedThumbnailUrl: thumbnailUrl,
                });
              }
            }}
            onError={(event) => {
              if (__DEV__ && isVideo) {
                console.error('PROFILE VIDEO THUMBNAIL LOAD FAILED:', {
                  videoDocumentId: item.$id,
                  thumbnailField: item.thumbnailUrl || '',
                  thumbnailFileId: fileIdFromUrl(item.thumbnailUrl) || '',
                  videoFileId: item.videoFileId || fileIdFromUrl(item.videoUrl) || '',
                  generatedThumbnailUrl: thumbnailUrl,
                  error: event.nativeEvent?.error || 'Image network failure',
                });
              }
              setFailedThumbnailIds((current) => ({ ...current, [item.$id]: true }));
            }}
          />
        ) : (
          <View style={styles.videoPlaceholder}>
            <Ionicons name={isPost ? 'image-outline' : 'videocam-outline'} size={28} color="#727985" />
          </View>
        )}
        {isVideo ? (
          <View style={styles.tileMeta}>
            <Ionicons name="play" size={12} color="#fff" />
            <Text style={styles.tileMetaText}>{formatCompactCount(item.views)}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderPost = ({ item }) => (
    <TextPostCard
      post={item}
      user={user}
      currentUser={user}
      navigation={navigation}
      desktop={isDesktop}
      onDelete={(postId) => setUploadedPosts((current) => current.filter((post) => post.$id !== postId))}
      onShared={(sharedPost, originalShares, originalPostId) => {
        setUploadedPosts((current) => [
          sharedPost,
          ...current.map((post) => (
            post.$id === originalPostId
              ? { ...post, shares: originalShares }
              : post
          )).filter((post) => post.$id !== sharedPost.$id),
        ]);
      }}
    />
  );

  const renderEmptyGrid = () => (
    <View style={styles.emptyGrid}>
      {Array.from({ length: 9 }, (_, index) => (
        <View key={`empty-${index}`} style={[styles.skeletonTile, { width: tileSize, height: tileSize }]} />
      ))}
      <View pointerEvents="none" style={styles.emptyGridMessage}>
        <Ionicons name={
          activeTab === 'posts' ? 'document-text-outline'
            : activeTab === 'videos' ? 'videocam-outline'
              : activeTab === 'saved' ? 'bookmark-outline' : 'heart-outline'
        } size={23} color={COLORS.cyan} />
        <Text style={styles.emptyGridTitle}>
          {activeTab === 'posts' ? 'No posts yet'
            : activeTab === 'videos' ? 'No videos yet'
              : activeTab === 'saved' ? 'No saved content yet' : 'No liked content yet'}
        </Text>
        {activeTab === 'videos' && <Text style={styles.emptyGridSubtitle}>Tap + to get started</Text>}
      </View>
    </View>
  );

  const header = (
    <View style={[styles.profileHeader, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={shareProfile} style={styles.headerIcon} accessibilityRole="button" accessibilityLabel="Share profile">
          <Ionicons name="share-social-outline" size={22} color="#F6F8FA" />
        </TouchableOpacity>
        <Text numberOfLines={1} style={[styles.usernameHeader, { color: colors.text }]}>@{username}</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate('Settings')}
          style={styles.headerIcon}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={22} color="#F6F8FA" />
        </TouchableOpacity>
      </View>

      <View style={styles.profileDetails}>
        <TouchableOpacity
          onPress={pickAvatar}
          disabled={uploadingAvatar}
          style={[styles.avatarWrapper, { width: 112 * scale, height: 112 * scale }]}
          accessibilityRole="button"
          accessibilityLabel="Edit profile picture"
        >
          <Avatar uri={userDoc?.avatarUrl} userId={user?.$id} name={displayName} size={104 * scale} bordered />
          <View style={styles.cameraBadge}>
            {uploadingAvatar
              ? <ActivityIndicator size="small" color="#071014" />
              : <Ionicons name="camera" size={15} color="#071014" />}
          </View>
        </TouchableOpacity>

        <View style={styles.identity}>
          <View style={styles.handleRow}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.handleText}>@{username}</Text>
            {userDoc?.isVerified === true && (
              <Ionicons name="checkmark-circle" size={17} color={COLORS.cyan} style={styles.verifiedIcon} />
            )}
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('EditProfile', { userDoc })}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={userDoc?.bio ? 'Edit bio' : 'Add a bio'}
          >
            <Text style={[styles.bioText, { color: colors.text }, !userDoc?.bio && { color: colors.muted }]}>
              {userDoc?.bio || 'Tap to add a bio...'}
            </Text>
          </TouchableOpacity>
          {userDoc?.province ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={15} color="#929AA5" />
              <Text style={styles.locationText}>{userDoc.province}, SA</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.statsRow}>
        <TouchableOpacity
          style={styles.statBox}
          activeOpacity={0.72}
          onPress={() => setActiveTab('posts')}
          accessibilityRole="button"
          accessibilityLabel={`View ${postsCount} posts`}
        >
          <Text style={[styles.statNumber, { color: colors.text }]}>{postsCount}</Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Posts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.statBox}
          activeOpacity={0.72}
          onPress={() => navigation.navigate('FollowersList', { userId: user?.$id, username })}
          accessibilityRole="button"
          accessibilityLabel={`View ${followCounts.followers} followers`}
        >
          <Text style={[styles.statNumber, { color: colors.text }]}>{formatCompactCount(followCounts.followers)}</Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Followers</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.statBox}
          activeOpacity={0.72}
          onPress={() => navigation.navigate('FollowingList', { userId: user?.$id, username })}
          accessibilityRole="button"
          accessibilityLabel={`View ${followCounts.following} following`}
        >
          <Text style={[styles.statNumber, { color: colors.text }]}>{formatCompactCount(followCounts.following)}</Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Following</Text>
        </TouchableOpacity>
      </View>

      <LaunchCountdownCard />

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.editProfileButton}
          onPress={() => navigation.navigate('EditProfile', { userDoc })}
          accessibilityRole="button"
        >
          <Text style={styles.editProfileText}>Edit Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={() => navigation.getParent()?.navigate('Upload')}
          accessibilityRole="button"
          accessibilityLabel="Upload a new video"
        >
          <Ionicons name="add" size={27} color="#071014" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {PROFILE_TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tabButton}
              onPress={() => setActiveTab(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Ionicons name={tab.icon} size={17} color={selected ? COLORS.cyan : '#89919C'} />
              <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>{tab.label}</Text>
              <View style={[styles.tabUnderline, selected && styles.tabUnderlineActive]} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.loadingContainer}>
          <MzansiLoader />
        </View>
        <TopLoadingBar isLoading={loading || refreshing} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <TopLoadingBar isLoading={loading || refreshing} />
      {errorMessage ? <Text style={styles.errorMessage}>{errorMessage}</Text> : null}
      <FlatList
        key={activeTab === 'posts' ? 'profile-posts-list' : 'profile-grid-three-columns'}
        data={activeTab === 'posts'
          ? uploadedPosts
          : activeTab === 'videos'
            ? uploadedVideos
            : videos}
        numColumns={activeTab === 'posts' ? 1 : 3}
        keyExtractor={(item) => `${item.mediaType || 'video'}-${item.$id}`}
        renderItem={activeTab === 'posts' ? renderPost : renderVideo}
        ListHeaderComponent={header}
        ListEmptyComponent={activeTab === 'posts'
          ? <Text style={styles.emptyPosts}>You haven’t shared any posts yet.</Text>
          : renderEmptyGrid}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchProfile();
            }}
            tintColor={COLORS.cyan}
          />
        }
      />
    </View>
  );
}

export default function ProfileScreen({ route, navigation }) {
  const { user } = useAuth();
  const targetUserId = route?.params?.userId;
  if (targetUserId && targetUserId !== user?.$id) {
    return <UserProfileScreen route={route} navigation={navigation} />;
  }
  return <MyProfileScreen navigation={navigation} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { alignItems: 'center', justifyContent: 'center' },
  profileHeader: { paddingBottom: 0 },
  topBar: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17 },
  headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  usernameHeader: { flex: 1, color: '#F6F8FA', fontSize: 16, fontWeight: '800', textAlign: 'center', marginHorizontal: 8 },
  profileDetails: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 21, paddingTop: 16 },
  avatarWrapper: { position: 'relative', width: 112, height: 112, alignItems: 'center', justifyContent: 'center', marginRight: 19 },
  cameraBadge: { position: 'absolute', right: 3, bottom: 3, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: COLORS.cyan, borderWidth: 3, borderColor: COLORS.bg },
  identity: { flex: 1, justifyContent: 'center' },
  handleRow: { minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 3 },
  handleText: { flexShrink: 1, color: '#fff', fontSize: 15, fontWeight: '800' },
  verifiedIcon: { flexShrink: 0 },
  bioText: { color: '#E8EAED', fontSize: 13, lineHeight: 18, marginTop: 10 },
  bioPlaceholder: { color: '#818995' },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
  locationText: { color: '#929AA5', fontSize: 12, marginLeft: 4 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginTop: 19, marginHorizontal: 17, paddingVertical: 13, borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  statBox: { minWidth: 78, alignItems: 'center' },
  statNumber: { color: '#fff', fontSize: 18, fontWeight: '900' },
  statLabel: { color: '#9098A3', fontSize: 11, fontWeight: '600', marginTop: 3 },
  emptyPosts: { color: COLORS.muted, textAlign: 'center', paddingVertical: 32, paddingHorizontal: 20 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 15, marginBottom: 16, gap: 10 },
  editProfileButton: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#3A414B', backgroundColor: '#151820' },
  editProfileText: { color: '#F3F5F7', fontSize: 13, fontWeight: '800' },
  uploadButton: { width: 46, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: COLORS.cyan },
  tabBar: { height: 48, flexDirection: 'row', borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tabButton: { flex: 1, position: 'relative', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  tabLabel: { color: '#89919C', fontSize: 12, fontWeight: '700' },
  tabLabelActive: { color: '#F5F7F9' },
  tabUnderline: { position: 'absolute', height: 2, left: '22%', right: '22%', bottom: 0, backgroundColor: 'transparent', borderRadius: 1 },
  tabUnderlineActive: { backgroundColor: COLORS.cyan },
  videoTile: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.bg, overflow: 'hidden' },
  videoPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#191C24' },
  textPostTile: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#292929' },
  tileMeta: { position: 'absolute', left: 7, bottom: 7, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.62)' },
  tileMetaText: { color: '#fff', fontSize: 10, fontWeight: '700', marginLeft: 3 },
  emptyGrid: { flexDirection: 'row', flexWrap: 'wrap', position: 'relative' },
  skeletonTile: { borderWidth: 1, borderColor: COLORS.bg, backgroundColor: '#151820' },
  emptyGridMessage: { position: 'absolute', top: '50%', left: 18, right: 18, alignItems: 'center', justifyContent: 'center', paddingVertical: 15, borderRadius: 14, backgroundColor: 'rgba(10,10,15,0.88)', transform: [{ translateY: -35 }] },
  emptyGridTitle: { color: '#F4F6F8', fontSize: 15, fontWeight: '800', marginTop: 6, textAlign: 'center' },
  emptyGridSubtitle: { color: '#9CA4AE', fontSize: 12, marginTop: 4 },
  errorMessage: { color: '#FF7B86', textAlign: 'center', fontSize: 12, padding: 8, backgroundColor: '#21171B' },
});
