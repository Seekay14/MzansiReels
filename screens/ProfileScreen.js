import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { ensureUserDoc, getAvatarPreviewUrl } from '../config/helpers';
import { uploadProfilePicture } from '../config/mediaUpload';
import VideoGrid from '../components/VideoGrid';
import Avatar from '../components/Avatar';

export default function ProfileScreen({ navigation }) {
  const { user, setUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [userDoc, setUserDoc] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState(null);

  const fetchProfile = useCallback(async () => {
    try {
      const doc = await ensureUserDoc(user);
      setUserDoc(doc);
      
      const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.videos, [
        Query.equal('userId', user.$id), Query.orderDesc('$createdAt'), Query.limit(60),
      ]);
      setVideos(res.documents);
      
    } catch (error) {
      console.log('Error fetching profile:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => { fetchProfile(); }, [fetchProfile]));

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', 'Allow photo library access to change your picture.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setUploadingAvatar(true);
    setAvatarStatus({ type: 'uploading', message: 'Uploading profile picture…' });
    try {
      const fileId = await uploadProfilePicture(asset, user.$id, ({ status, message }) => {
        setAvatarStatus({ type: status, message });
      });
      const avatarUrl = getAvatarPreviewUrl(fileId);
      const doc = userDoc || (await ensureUserDoc(user));
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, doc.$id, { avatarUrl });
      setUserDoc({ ...doc, avatarUrl });
      setUser({ ...user, avatarUrl });
      setAvatarStatus({ type: 'success', message: 'Profile picture updated successfully!' });
    } catch (error) {
      console.error('Profile avatar upload failed:', error);
      setAvatarStatus({ type: 'error', message: error.message || 'Could not update avatar.' });
      Alert.alert('Error', error.message || 'Could not update avatar.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLongPress = (video) => {
    Alert.alert(
      'Manage Video',
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Edit Caption', onPress: () => navigation.navigate('EditVideo', { video }) },
      ]
    );
  };

  if (loading) return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator size="large" color={COLORS.cyan} /></View>;

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      
      <View style={styles.topBar}>
        <Text style={styles.usernameHeader}>@{userDoc?.username || user?.name?.toLowerCase().replace(/\s+/g, '') || 'user'}</Text>
        
        <TouchableOpacity style={styles.settingsBtn} onPress={() => navigation.navigate('Settings')}>
          <Ionicons name="settings-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.profileInfo}>
        <TouchableOpacity onPress={pickAvatar} style={styles.avatarWrapper}>
          <Avatar uri={userDoc?.avatarUrl} name={user?.name} size={90} bordered />
          <View style={styles.editIcon}>
            {uploadingAvatar
              ? <ActivityIndicator size="small" color="#000" />
              : <Ionicons name="camera" size={14} color="#fff" />}
          </View>
        </TouchableOpacity>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{videos.length}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{userDoc?.followers || 0}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{userDoc?.following || 0}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </View>
        </View>
      </View>

      <View style={styles.bioSection}>
        {avatarStatus && (
          <Text style={[
            styles.avatarStatus,
            avatarStatus.type === 'success' && styles.avatarStatusSuccess,
            avatarStatus.type === 'error' && styles.avatarStatusError,
          ]}>
            {avatarStatus.message}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          <Text style={styles.name}>{userDoc?.name || user?.name || 'User'}</Text>
          {userDoc?.isVerified === true && (
            <Ionicons name="checkmark-circle" size={18} color={COLORS.cyan} style={{ marginLeft: 6 }} />
          )}
        </View>
        <Text style={styles.email}>{user?.email}</Text>
        
        {userDoc?.bio ? (
          <Text style={styles.bioText}>{userDoc.bio}</Text>
        ) : (
          <Text style={[styles.bioText, { color: '#555' }]}>Tap "Edit Profile" to add a bio.</Text>
        )}
      </View>

      <TouchableOpacity 
        style={styles.editProfileBtn} 
        onPress={() => navigation.navigate('EditProfile', { userDoc })}
      >
        <Text style={styles.editProfileText}>Edit Profile</Text>
      </TouchableOpacity>

      <View style={styles.mediaActions}>
        <TouchableOpacity
          style={styles.mediaActionButton}
          onPress={pickAvatar}
          disabled={uploadingAvatar}
          accessibilityRole="button"
        >
          <Ionicons name="image-outline" size={17} color={COLORS.cyan} />
          <Text style={styles.mediaActionText}>Change Profile Picture</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.mediaActionButton}
          onPress={() => navigation.getParent()?.navigate('Upload')}
          accessibilityRole="button"
        >
          <Ionicons name="cloud-upload-outline" size={17} color={COLORS.cyan} />
          <Text style={styles.mediaActionText}>Upload Video</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <VideoGrid
        videos={videos}
        header={header}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); fetchProfile(); }}
        onPress={(video) => navigation.navigate('Home', { 
          screen: 'Watch', 
          params: { video: video, allVideos: videos } 
        })}
        onLongPress={handleLongPress}
        emptyText="No posts yet. Tap + to upload!"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 15 },
  usernameHeader: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  settingsBtn: { padding: 8, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: '#333' },
  profileInfo: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 20 },
  avatarWrapper: { position: 'relative' },
  editIcon: { position: 'absolute', bottom: 0, right: 0, backgroundColor: COLORS.cyan, padding: 6, borderRadius: 15, borderWidth: 2, borderColor: COLORS.bg },
  avatarStatus: { color: COLORS.cyan, fontSize: 13, marginBottom: 10 },
  avatarStatusSuccess: { color: '#45D483' },
  avatarStatusError: { color: '#FF5B67' },
  statsRow: { flexDirection: 'row', gap: 30 },
  statBox: { alignItems: 'center' },
  statNumber: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  bioSection: { paddingHorizontal: 20, marginTop: 15 },
  name: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  email: { color: COLORS.muted, fontSize: 13, marginBottom: 8 },
  bioText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  editProfileBtn: { marginHorizontal: 20, marginTop: 15, paddingVertical: 10, backgroundColor: COLORS.card, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  editProfileText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  mediaActions: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 10 },
  mediaActionButton: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 8, backgroundColor: COLORS.card, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border },
  mediaActionText: { color: '#fff', fontSize: 12, fontWeight: '600' },
});