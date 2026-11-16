import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Share,
  useWindowDimensions,
} from 'react-native';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, ID, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import {
  blockUser,
  createNotification,
  ensureUserDoc,
  getUserDoc,
  requireAuth,
} from '../config/helpers';
import VideoGrid from '../components/VideoGrid';
import Avatar from '../components/Avatar';
import TextPostCard from '../components/TextPostCard';
import { formatCompactCount } from '../config/formatNumbers';
import { getResponsiveScale } from '../config/responsive';
import {
  createFollowRelationship,
  deleteFollowRelationships,
  fetchAllProfileDocuments,
  fetchProfileActivityContent,
  fetchProfileFollowCounts,
  fetchProfileMutuals,
  filterVisibleProfileContent,
} from '../config/profileContentService';

const PROFILE_TABS = [
  { id: 'posts', label: 'Posts', icon: 'document-text-outline' },
  { id: 'videos', label: 'videos', icon: 'videocam-outline' },
  { id: 'liked', label: 'liked', icon: 'heart-outline' },
  { id: 'saved', label: 'saved', icon: 'bookmark-outline' },
];

export default function UserProfileScreen({ route, navigation }) {
  const { userId, userName } = route.params || {};
  const profileUserId = userId;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const scale = getResponsiveScale(width);
  const isDesktop = Platform.OS === 'web' && width > 768;
  const isSelf = user?.$id === userId;
  const [userDoc, setUserDoc] = useState(null);
  const [videos, setVideos] = useState([]);
  const [posts, setPosts] = useState([]);
  const [activityItems, setActivityItems] = useState([]);
  const [followCounts, setFollowCounts] = useState({ followers: 0, following: 0 });
  const [followDocId, setFollowDocId] = useState(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followsYou, setFollowsYou] = useState(false);
  const [mutualProfiles, setMutualProfiles] = useState([]);
  const [blockDocumentId, setBlockDocumentId] = useState('');
  const [blockBusy, setBlockBusy] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [hasStatus, setHasStatus] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState('posts');
  const [loadedUserId, setLoadedUserId] = useState(null);
  const [loadError, setLoadError] = useState('');
  const loadRequest = useRef(0);
  const followRefreshRequest = useRef(0);
  const userDocRef = useRef(userDoc);

  useEffect(() => {
    userDocRef.current = userDoc;
  }, [userDoc]);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setUserDoc(null);
    setVideos([]);
    setPosts([]);
    setActivityItems([]);
    setFollowDocId(null);
    setIsFollowing(false);
    setFollowsYou(false);
    setMutualProfiles([]);
    setBlockDocumentId('');
    setFollowCounts({ followers: 0, following: 0 });
    setBusy(false);
    setBlockBusy(false);
    setMenuVisible(false);
    setLoadError('');
    try {
      const [doc, outgoingFollow, incomingFollow, block, mutuals] = await Promise.all([
        userId ? getUserDoc(userId) : Promise.resolve(null),
        isSelf || !user?.$id ? null : databases.listDocuments(DATABASE_ID, COLLECTIONS.follows, [
          Query.equal('followerId', user.$id),
          Query.equal('followingId', userId),
          Query.limit(1),
        ]).catch((error) => {
          console.error('Could not load follow status:', error);
          return null;
        }),
        isSelf || !user?.$id ? null : databases.listDocuments(DATABASE_ID, COLLECTIONS.follows, [
          Query.equal('followerId', userId),
          Query.equal('followingId', user.$id),
          Query.limit(1),
        ]).catch((error) => {
          console.error('Could not load reverse follow status:', error);
          return null;
        }),
        isSelf || !user?.$id ? null : databases.listDocuments(DATABASE_ID, COLLECTIONS.blocks, [
          Query.equal('blockerId', user.$id),
          Query.equal('blockedId', userId),
          Query.limit(1),
        ]).catch((error) => {
          console.error('Could not load block status:', error);
          return null;
        }),
        isSelf || !user?.$id
          ? Promise.resolve([])
          : fetchProfileMutuals(user.$id, userId).catch((error) => {
              console.error('Could not load mutual followers:', error);
              return [];
            }),
      ]);
      if (requestId !== loadRequest.current) return;
      const canViewContent = isSelf || doc?.isPrivate === false;
      const [vids, userPosts, relationCounts, activity] = await Promise.all([
        canViewContent && userId
          ? fetchAllProfileDocuments(COLLECTIONS.videos, [
              Query.equal('userId', userId),
              Query.orderDesc('$createdAt'),
            ])
          : Promise.resolve([]),
        canViewContent && userId
          ? fetchAllProfileDocuments(COLLECTIONS.posts, [
              Query.equal('userId', profileUserId),
              Query.orderDesc('$createdAt'),
            ])
          : Promise.resolve([]),
        doc ? fetchProfileFollowCounts(userId, doc) : Promise.resolve({ followers: 0, following: 0 }),
        canViewContent && activeTab === 'liked'
          ? fetchProfileActivityContent(userId, 'likes')
          : Promise.resolve([]),
      ]);
      if (requestId !== loadRequest.current) return;
      const visibleActivity = await filterVisibleProfileContent(activity, user?.$id);
      if (requestId !== loadRequest.current) return;
      setUserDoc(doc);
      setVideos(canViewContent
        ? vids.filter((video) => isSelf || video.isPrivate !== true)
        : []);
      setPosts(canViewContent
        ? userPosts.filter((post) => isSelf || post.isPrivate !== true)
        : []);
      setActivityItems(visibleActivity);
      setFollowCounts(relationCounts);
      setFollowDocId(outgoingFollow?.documents?.[0]?.$id || null);
      setIsFollowing(Boolean(outgoingFollow?.documents?.[0]));
      setFollowsYou(Boolean(incomingFollow?.documents?.[0]));
      setBlockDocumentId(block?.documents?.[0]?.$id || '');
      setMutualProfiles(mutuals);
    } catch (error) {
      if (requestId !== loadRequest.current) return;
      console.log('Error fetching user profile:', error);
      setLoadError('Could not load this profile. Please try again.');
    } finally {
      if (requestId === loadRequest.current) {
        setLoadedUserId(userId);
        setLoading(false);
      }
    }
  }, [activeTab, profileUserId, userId, isSelf, user?.$id]);

  const refreshFollowState = useCallback(async () => {
    if (isSelf || !user?.$id || !userId) return;
    const requestId = ++followRefreshRequest.current;
    try {
      const [outgoingFollow, incomingFollow, relationCounts, mutuals] = await Promise.all([
        databases.listDocuments(DATABASE_ID, COLLECTIONS.follows, [
          Query.equal('followerId', user.$id),
          Query.equal('followingId', userId),
          Query.limit(1),
        ]),
        databases.listDocuments(DATABASE_ID, COLLECTIONS.follows, [
          Query.equal('followerId', userId),
          Query.equal('followingId', user.$id),
          Query.limit(1),
        ]),
        fetchProfileFollowCounts(userId, userDocRef.current),
        fetchProfileMutuals(user.$id, userId),
      ]);
      if (requestId !== followRefreshRequest.current) return;
      setFollowDocId(outgoingFollow.documents[0]?.$id || null);
      setIsFollowing(Boolean(outgoingFollow.documents[0]));
      setFollowsYou(Boolean(incomingFollow.documents[0]));
      setFollowCounts(relationCounts);
      setMutualProfiles(mutuals);
    } catch (error) {
      if (requestId === followRefreshRequest.current) {
        console.warn('Could not refresh follow status:', error);
      }
    }
  }, [isSelf, user?.$id, userId]);

  useFocusEffect(useCallback(() => {
    load();
    return () => {
      loadRequest.current += 1;
      followRefreshRequest.current += 1;
    };
  }, [load]));

  useFocusEffect(useCallback(() => {
    if (isSelf || !user?.$id || !userId) return undefined;
    let active = true;
    let refreshTimer = null;
    const followPollTimer = setInterval(() => {
      if (active) refreshFollowState();
    }, 30000);
    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(followPollTimer);
      followRefreshRequest.current += 1;
    };
  }, [isSelf, refreshFollowState, user?.$id, userId]));

  const username = userDoc?.username || userName || 'username unavailable';
  const displayName = userDoc?.displayName || userDoc?.name || username;
  const mutualFriendsCount = mutualProfiles.length;
  const mutualFirstName = mutualProfiles[0]?.displayName
    || mutualProfiles[0]?.name
    || mutualProfiles[0]?.username
    || 'Name unavailable';
  const mutualFriendsText = mutualFriendsCount === 1
    ? `Followed by ${mutualFirstName}`
    : mutualFriendsCount > 1
      ? `Followed by ${mutualFirstName} and ${mutualFriendsCount - 1} ${mutualFriendsCount === 2 ? 'other' : 'others'}`
      : '';

  const persistFollowCounts = async () => {
    try {
      const currentProfile = await ensureUserDoc(user);
      const currentCounts = await fetchProfileFollowCounts(user.$id, currentProfile);
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, currentProfile.$id, {
        following: currentCounts.following,
      });
      setUserDoc((current) => current ? { ...current, following: currentCounts.following } : current);
    } catch (error) {
      console.error('Follow relationship saved, but your following count could not be updated:', error);
      Alert.alert('Follow saved', 'Your relationship was saved, but the following count could not be refreshed.');
    }
  };

  const toggleFollow = async () => {
    if (!user?.$id) {
      Alert.alert('Login Required', 'Please log in to follow.');
      return;
    }
    if (busy || isSelf || !userId) return;
    const wasFollowing = isFollowing;
    const previousFollowDocId = followDocId;
    const previousCounts = followCounts;
    const countDelta = wasFollowing ? -1 : 1;
    const optimisticCounts = {
      ...followCounts,
      followers: Math.max(0, followCounts.followers + countDelta),
    };

    setBusy(true);
    setIsFollowing(!wasFollowing);
    setFollowDocId(wasFollowing ? null : 'pending');
    setFollowCounts(optimisticCounts);
    try {
      let changedRelationship = false;
      if (wasFollowing) {
        changedRelationship = (await deleteFollowRelationships(user.$id, userId)) > 0;
        if (!changedRelationship) setFollowCounts(previousCounts);
      } else {
        const result = await createFollowRelationship(user.$id, userId);
        setFollowDocId(result.relationship.$id);
        if (!result.created) {
          setFollowCounts(previousCounts);
          setIsFollowing(true);
        } else {
          changedRelationship = true;
          try {
            await createNotification(userId, user.displayName || user.name, user.avatarUrl, 'follow');
          } catch (error) {
            console.error('Follow succeeded, but its notification could not be created:', error);
          }
        }
      }

      if (wasFollowing) setFollowDocId(null);
      if (changedRelationship) await persistFollowCounts();
      await refreshFollowState();
    } catch (error) {
      setFollowDocId(previousFollowDocId);
      setFollowCounts(previousCounts);
      setIsFollowing(wasFollowing);
      console.error('Could not update follow relationship:', error);
      Alert.alert('Follow update failed', error.message || 'Could not update follow.');
    } finally {
      setBusy(false);
    }
  };

  const shareProfile = async () => {
    setMenuVisible(false);
    try {
      const profileLink = Linking.createURL(`profile/${encodeURIComponent(userId)}`, {
        scheme: 'mzansireels',
        queryParams: { userName: username },
      });
      await Share.share({
        message: `Check out ${displayName} (@${username}) on MzansiReels: ${profileLink}`,
      });
    } catch (error) {
      console.error('Could not share profile:', error);
      Alert.alert('Could not share profile', error.message || 'Please try again.');
    }
  };

  const showUnavailableAction = (action) => {
    setMenuVisible(false);
    Alert.alert(
      `${action} unavailable`,
      action === 'Mute'
        ? 'Profile-level muting is not supported by the current backend.'
        : 'User reporting is not configured in the current backend.',
    );
  };

  const confirmBlockUser = () => {
    setMenuVisible(false);
    if (!requireAuth('block this user', navigation, user) || !userId || blockBusy) return;
    const currentlyBlocked = Boolean(blockDocumentId);
    Alert.alert(
      currentlyBlocked ? `Unblock ${displayName}?` : `Block ${displayName}?`,
      currentlyBlocked
        ? 'This removes the block record from your account.'
        : 'This records the block in MzansiReels. The backend may not enforce blocks in every feature.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: currentlyBlocked ? 'Unblock' : 'Block',
          style: currentlyBlocked ? 'default' : 'destructive',
          onPress: async () => {
            setBlockBusy(true);
            try {
              if (currentlyBlocked) {
                await databases.deleteDocument(DATABASE_ID, COLLECTIONS.blocks, blockDocumentId);
                setBlockDocumentId('');
              } else {
                const block = await blockUser(user.$id, userId);
                setBlockDocumentId(block.$id);
              }
            } catch (error) {
              console.error('Could not update block relationship:', error);
              Alert.alert('Block update failed', error.message || 'Please try again.');
            } finally {
              setBlockBusy(false);
            }
          },
        },
      ],
    );
  };

  if (loading || loadedUserId !== userId) {
    return <View style={[styles.container, { justifyContent: 'center', backgroundColor: COLORS.bg }]}><ActivityIndicator size="large" color={COLORS.accent} /></View>;
  }

  const isPrivateProfile = !isSelf && userDoc?.isPrivate === true;
  const emptyContentMessage = loadError || (!userDoc ? 'Profile unavailable.' : null);
  const contentCount = videos.length + posts.length;
  const displayItems = activeTab === 'posts'
    ? posts.map((post) => ({ ...post, mediaType: 'post' }))
    : activeTab === 'videos'
      ? videos
      : activeTab === 'liked'
        ? activityItems
        : [];
  const openReelsViewer = (videoId) => {
    const video = displayItems.find((item) => item.$id === videoId && item.mediaType !== 'post');
    if (!video) return;
    navigation.navigate('Home', {
      screen: 'Watch',
      params: { video, allVideos: displayItems.filter((item) => item.mediaType !== 'post') },
    });
  };
  const isFriends = isFollowing && followsYou;
  const followLabel = isFriends
    ? 'Friends'
    : isFollowing
      ? 'Following'
      : followsYou
        ? 'Follow Back'
        : 'Follow';
  const renderProfilePost = ({ item }) => (
    <TextPostCard
      post={item}
      user={user}
      currentUser={user}
      navigation={navigation}
      desktop={isDesktop}
      onDelete={(postId) => setPosts((current) => current.filter((post) => post.$id !== postId))}
      onShared={(sharedPost, originalShares, originalPostId) => {
        setPosts((current) => current.map((post) => (
          post.$id === originalPostId
            ? { ...post, shares: originalShares }
            : post
        )));
      }}
    />
  );
  const header = (
    <View style={[styles.headerWrapper, { paddingTop: Math.max(insets.top, 8) }]}>
      <View style={styles.topBarRow}>
        {!isSelf && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
        )}
        <View style={styles.headerSpacer} />
        <TouchableOpacity
          onPress={() => navigation.navigate('Settings')}
          style={styles.headerIcon}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings-outline" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.identityContainer}>
        <View style={styles.usernameRow}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.usernameText, { color: COLORS.text }]}>@{username}</Text>
          {userDoc?.isVerified === true && (
            <Ionicons name="checkmark-circle" size={16} color={COLORS.cyan} style={styles.verifiedBadge} />
          )}
        </View>
        <View style={[styles.avatarWrapperBase, hasStatus && styles.activeAvatarRing]}
          accessibilityRole="button"
          accessibilityLabel="Profile picture"
        >
          <Avatar uri={userDoc?.avatarUrl} userId={userId} name={displayName} size={96 * scale} />
          {isSelf && (
            <View style={styles.cameraBadgeLarge}>
              <Ionicons name="camera" size={16} color={COLORS.bg} />
            </View>
          )}
        </View>
        {userDoc?.bio ? (
          <Text style={[styles.bioText, { color: COLORS.text }]}>
            {userDoc.bio}
          </Text>
        ) : (
          <Text style={[styles.bioText, { color: COLORS.muted }]}>Tap to add a bio...</Text>
        )}
        {userDoc?.province ? (
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={15} color={COLORS.muted} />
            <Text style={[styles.locationText, { color: COLORS.muted }]}>{userDoc.province}, SA</Text>
          </View>
        ) : null}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.statBox}
            activeOpacity={0.72}
            onPress={() => setActiveTab('posts')}
            accessibilityRole="button"
            accessibilityLabel={`View ${contentCount} posts`}
          >
            <Text style={[styles.statNumber, { color: COLORS.text }]}>{contentCount}</Text>
            <Text style={[styles.statLabel, { color: COLORS.muted }]}>Posts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statBox}
            activeOpacity={0.72}
            onPress={() => navigation.navigate('FollowersList', { userId, username })}
            accessibilityRole="button"
            accessibilityLabel={`View ${formatCompactCount(followCounts.followers)} followers`}
          >
            <Text style={[styles.statNumber, { color: COLORS.text }]}>{formatCompactCount(followCounts.followers)}</Text>
            <Text style={[styles.statLabel, { color: COLORS.muted }]}>Followers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.statBox}
            activeOpacity={0.72}
            onPress={() => navigation.navigate('FollowingList', { userId, username })}
            accessibilityRole="button"
            accessibilityLabel={`View ${formatCompactCount(followCounts.following)} following`}
          >
            <Text style={[styles.statNumber, { color: COLORS.text }]}>{formatCompactCount(followCounts.following)}</Text>
            <Text style={[styles.statLabel, { color: COLORS.muted }]}>Following</Text>
          </TouchableOpacity>
        </View>
        {!isSelf && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.followButton, isFollowing ? styles.followingButton : styles.notFollowingButton]}
              onPress={toggleFollow}
              disabled={busy}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={followLabel}
            >
              {busy ? (
                <ActivityIndicator size="small" color={COLORS.text} />
              ) : (
                <Text style={[styles.followText, { color: isFollowing ? COLORS.cyan : COLORS.bg }]}>{followLabel}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.messageButton}
              onPress={() => {
                if (requireAuth('message this user', navigation, user)) {
                  navigation.navigate('Messages', { screen: 'Chat', params: { userId, userName: username } });
                }
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Message ${displayName}`}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        )}
        {isSelf && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.editProfileButton, { borderColor: COLORS.border, backgroundColor: COLORS.card }]}
              onPress={() => navigation.navigate('EditProfile', { userDoc })}
              accessibilityRole="button"
            >
              <Text style={[styles.editProfileText, { color: COLORS.text }]}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => navigation.getParent()?.navigate('Upload')}
              accessibilityRole="button"
              accessibilityLabel="Upload a new video"
            >
              <Ionicons name="add" size={27} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        )}
        {mutualFriendsCount > 0 ? (
          <Text style={[styles.mutualFriendsText, { color: COLORS.muted }]}>
            {mutualFriendsText}
          </Text>
        ) : null}
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
              <Text style={[styles.tabLabel, { color: selected ? COLORS.text : COLORS.muted }]}>{tab.label}</Text>
              <View style={[styles.tabUnderline, selected && styles.tabUnderlineActive]} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: COLORS.bg }]}>
      {activeTab === 'posts' ? (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.$id}
          renderItem={renderProfilePost}
          ListHeaderComponent={header}
          ListEmptyComponent={(
            <Text style={styles.emptyPosts}>
              {emptyContentMessage || (isPrivateProfile ? 'This account is private.' : 'No posts yet.')}
            </Text>
          )}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <VideoGrid
          videos={displayItems}
          header={header}
          onPress={(item) => (
            item.mediaType === 'post'
              ? navigation.navigate('Home', { screen: 'Feed' })
              : openReelsViewer(item.$id)
          )}
          emptyText={emptyContentMessage || (isPrivateProfile
            ? 'This account is private.'
            : activeTab === 'saved'
              ? 'Saved items are private to the account owner.'
              : activeTab === 'videos'
                ? 'No videos yet.'
                : 'No liked content yet.')}
        />
      )}
      <Modal
        visible={menuVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setMenuVisible(false)}
      >
        <View style={styles.menuOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMenuVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Close profile actions"
          />
          <View style={[styles.menuSheet, { backgroundColor: COLORS.card, paddingBottom: Math.max(insets.bottom, 18) }]}>
            <View style={styles.menuHandle} />
            <TouchableOpacity style={styles.menuItem} onPress={shareProfile} disabled={blockBusy}>
              <Ionicons name="share-social-outline" size={20} color={COLORS.text} />
              <Text style={[styles.menuItemText, { color: COLORS.text }]}>Share Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => showUnavailableAction('Mute')} disabled={blockBusy}>
              <Ionicons name="volume-mute-outline" size={20} color={COLORS.text} />
              <Text style={[styles.menuItemText, { color: COLORS.text }]}>Mute</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={confirmBlockUser} disabled={blockBusy}>
              <Ionicons name="ban-outline" size={20} color={COLORS.pink} />
              <Text style={[styles.menuItemText, styles.dangerText]}>
                {blockDocumentId ? 'Unblock User' : 'Block User'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => showUnavailableAction('Report')} disabled={blockBusy}>
              <Ionicons name="flag-outline" size={20} color={COLORS.pink} />
              <Text style={[styles.menuItemText, styles.dangerText]}>Report</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', backgroundColor: COLORS.bg },
  headerWrapper: { width: '100%', alignItems: 'center', paddingHorizontal: 24, paddingBottom: 12 },
  topBarRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingTop: 10, paddingBottom: 4 },
  headerSpacer: { width: 40 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center' },
  headerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  identityContainer: { alignItems: 'center', gap: 10, paddingHorizontal: 24, marginTop: 8, width: '100%' },
  usernameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4, width: '100%' },
  usernameText: { color: COLORS.text, fontSize: 24, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5 },
  verifiedBadge: { marginLeft: 6 },
  avatarWrapperBase: { position: 'relative', width: 120, height: 120, alignItems: 'center', justifyContent: 'center', borderRadius: 60 },
  activeAvatarRing: { borderWidth: 2, borderColor: COLORS.cyan },
  cameraBadgeLarge: { position: 'absolute', right: -6, bottom: -6, width: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: COLORS.cyan, borderWidth: 2, borderColor: COLORS.bg },
  bioText: { color: COLORS.text, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: '80%', marginTop: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  locationText: { color: COLORS.muted, fontSize: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 18, width: '100%' },
  statBox: { alignItems: 'center', minWidth: 60 },
  statNumber: { color: COLORS.text, fontSize: 20, fontWeight: '900' },
  statLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '700', marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 14 },
  followButton: { minWidth: 118, minHeight: 42, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  notFollowingButton: { backgroundColor: COLORS.cyan },
  followingButton: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.cyan },
  followText: { color: COLORS.bg, fontWeight: 'bold', fontSize: 16 },
  editProfileButton: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  editProfileText: { color: COLORS.text, fontSize: 13, fontWeight: '800' },
  uploadButton: { width: 46, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: COLORS.cyan },
  messageButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  mutualFriendsText: { fontSize: 11, marginTop: 10 },
  tabBar: { height: 48, flexDirection: 'row', borderBottomWidth: 1, borderColor: COLORS.border, width: '100%' },
  tabButton: { flex: 1, position: 'relative', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  tabLabel: { fontSize: 12, fontWeight: '700' },
  tabUnderline: { position: 'absolute', height: 2, left: '22%', right: '22%', bottom: 0, backgroundColor: 'transparent', borderRadius: 1 },
  tabUnderlineActive: { backgroundColor: COLORS.cyan },
  menuOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' },
  menuSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 20, paddingTop: 12 },
  menuHandle: { width: 42, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: COLORS.muted, marginBottom: 14 },
  menuItem: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  menuItemText: { fontSize: 15, fontWeight: '600', marginLeft: 13 },
  dangerText: { color: COLORS.pink },
  emptyPosts: { color: COLORS.muted, textAlign: 'center', paddingVertical: 32, paddingHorizontal: 20 },
});
