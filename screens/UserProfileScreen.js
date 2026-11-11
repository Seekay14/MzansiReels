import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, ID, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { getUserDoc, ensureUserDoc, notify } from '../config/helpers';
import VideoGrid from '../components/VideoGrid';
import Avatar from '../components/Avatar';

export default function UserProfileScreen({ route, navigation }) {
  const { userId, userName } = route.params;
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const isSelf = user?.$id === userId;
  const [userDoc, setUserDoc] = useState(null);
  const [videos, setVideos] = useState([]);
  const [followDocId, setFollowDocId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [doc, vids, follow] = await Promise.all([
        getUserDoc(userId).catch(() => null),
        databases.listDocuments(DATABASE_ID, COLLECTIONS.videos, [Query.equal('userId', userId), Query.orderDesc('$createdAt'), Query.limit(60)]),
        isSelf ? null : databases.listDocuments(DATABASE_ID, COLLECTIONS.follows, [
          Query.equal('followerId', user.$id), Query.equal('followingId', userId), Query.limit(1),
        ]).catch(() => null),
      ]);
      setUserDoc(doc);
      setVideos(vids.documents);
      setFollowDocId(follow?.documents?.[0]?.$id || null);
    } catch (error) {
      console.log('Error fetching user profile:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, isSelf, user]);

  useEffect(() => { load(); }, [load]);

  const adjustCounts = async (delta) => {
    try {
      if (userDoc) {
        const followers = Math.max(0, (userDoc.followers || 0) + delta);
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, userDoc.$id, { followers });
        setUserDoc((prev) => (prev ? { ...prev, followers } : prev));
      }
      const mine = await ensureUserDoc(user);
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, mine.$id, { following: Math.max(0, (mine.following || 0) + delta) });
    } catch (error) {
      console.log('counter update failed:', error.message);
    }
  };

  const toggleFollow = async () => {
    if (busy || isSelf) return;
    setBusy(true);
    try {
      if (followDocId) {
        await databases.deleteDocument(DATABASE_ID, COLLECTIONS.follows, followDocId);
        setFollowDocId(null);
        await adjustCounts(-1);
      } else {
        const doc = await databases.createDocument(DATABASE_ID, COLLECTIONS.follows, ID.unique(), { followerId: user.$id, followingId: userId });
        setFollowDocId(doc.$id);
        await adjustCounts(1);
        await notify(userId, user.name, 'follow', user.avatarUrl);
      }
    } catch (error) {
      Alert.alert('Error', 'Could not update follow.');
    } finally { setBusy(false); }
  };

  if (loading) return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator size="large" color={COLORS.cyan} /></View>;

  const following = !!followDocId;
  const header = (
    <View>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
      </View>
      <View style={styles.profileInfo}>
        <Avatar
          uri={userDoc?.avatarUrl}
          userId={userId}
          name={userName}
          size={90}
          bordered
          style={{ marginBottom: 10 }}
        />
        
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
          <Text style={styles.name}>@{userName}</Text>
          {userDoc?.isVerified === true && (
            <Ionicons name="checkmark-circle" size={20} color={COLORS.cyan} style={{ marginLeft: 6 }} />
          )}
        </View>

        <Text style={styles.sub}>{userDoc?.name || 'Mzansi User'}</Text>
        <View style={styles.statsRow}>
          <View style={styles.statBox}><Text style={styles.statNumber}>{videos.length}</Text><Text style={styles.statLabel}>Posts</Text></View>
          <View style={styles.statBox}><Text style={styles.statNumber}>{userDoc?.followers || 0}</Text><Text style={styles.statLabel}>Followers</Text></View>
          <View style={styles.statBox}><Text style={styles.statNumber}>{userDoc?.following || 0}</Text><Text style={styles.statLabel}>Following</Text></View>
        </View>
        {!isSelf && (
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.followButton, following ? styles.followingButton : styles.notFollowingButton]} onPress={toggleFollow} disabled={busy}>
              <Text style={[styles.followText, following && { color: '#fff' }]}>{following ? 'Following' : 'Follow'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.messageButton} onPress={() => navigation.navigate('Messages', { screen: 'Chat', params: { userId, userName } })}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <VideoGrid 
        videos={videos} 
        header={header} 
        onPress={(video) => navigation.navigate('Home', { 
          screen: 'Watch', 
          params: { video: video, allVideos: videos } 
        })} 
        emptyText="No videos yet." 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { paddingHorizontal: 20, paddingBottom: 10 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center' },
  profileInfo: { alignItems: 'center', paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  name: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  sub: { color: COLORS.muted, fontSize: 14, marginBottom: 15 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', width: '80%', marginBottom: 20 },
  statBox: { alignItems: 'center' },
  statNumber: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  statLabel: { color: COLORS.muted, fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center' },
  followButton: { paddingHorizontal: 30, paddingVertical: 10, borderRadius: 20 },
  notFollowingButton: { backgroundColor: COLORS.cyan },
  followingButton: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: '#333' },
  followText: { color: '#000', fontWeight: 'bold', fontSize: 16 },
  messageButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.card, borderWidth: 1, borderColor: '#333', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
});