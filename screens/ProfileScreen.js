import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, storage, ID, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, BUCKET_ID, COLORS, fileIdFromUrl } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { ensureUserDoc } from '../config/helpers';
import VideoGrid from '../components/VideoGrid';
import Avatar from '../components/Avatar';

export default function ProfileScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [userDoc, setUserDoc] = useState(null);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false); // 👈 NEW STATE

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
    
    const result = await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ['images'], 
      allowsEditing: true, 
      aspect: [1, 1], 
      quality: 0.5 
    });
    
    if (result.canceled) return;
    
    const asset = result.assets[0];
    setUploadingAvatar(true); // 👈 Show spinner

    try {
      const file = await storage.createFile(BUCKET_ID, ID.unique(), {
        name: asset.fileName || 'avatar.jpg',
        type: asset.mimeType || 'image/jpeg',
        size: asset.fileSize,
        uri: asset.uri,
      });
      
      const avatarUrl = storage.getFileView(BUCKET_ID, file.$id).toString();
      const doc = userDoc || (await ensureUserDoc(user));
      
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, doc.$id, { avatarUrl });
      setUserDoc({ ...doc, avatarUrl });
      
      Alert.alert('Success', 'Profile picture updated!'); // 👈 Success message
    } catch (error) {
      console.log("AVATAR ERROR:", error);
      Alert.alert('Error', error.message || 'Could not update avatar.'); // 👈 Real error message
    } finally {
      setUploadingAvatar(false);
    }
  };

  const confirmDelete = (video) => {
    Alert.alert('Delete Video', 'This will permanently remove it from MzansiReels.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await databases.deleteDocument(DATABASE_ID, COLLECTIONS.videos, video.$id);
            const fileId = fileIdFromUrl(video.videoUrl);
            if (fileId) await storage.deleteFile(BUCKET_ID, fileId).catch(() => {});
            setVideos((prev) => prev.filter((v) => v.$id !== video.$id));
          } catch (error) { Alert.alert('Error', 'Could not delete the video.'); }
        },
      },
    ]);
  };

  const handleLongPress = (video) => {
    Alert.alert(
      'Manage Video',
      'What would you like to do?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Edit Caption', onPress: () => navigation.navigate('EditVideo', { video }) },
        { text: 'Delete Video', style: 'destructive', onPress: () => confirmDelete(video) },
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
        <TouchableOpacity onPress={pickAvatar} style={styles.avatarWrapper} disabled={uploadingAvatar}>
          <Avatar uri={userDoc?.avatarUrl} name={user?.name} size={90} bordered />
          <View style={styles.editIcon}>
            {uploadingAvatar ? (
               <ActivityIndicator size="small" color="#fff" />
            ) : (
               <Ionicons name="camera" size={14} color="#fff" />
            )}
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
        onDelete={confirmDelete}
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
  statsRow: { flexDirection: 'row', gap: 30 },
  statBox: { alignItems: 'center' },
  statNumber: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  bioSection: { paddingHorizontal: 20, marginTop: 15 },
  name: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  email: { color: COLORS.muted, fontSize: 13, marginBottom: 8 },
  bioText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  editProfileBtn: { marginHorizontal: 20, marginTop: 15, paddingVertical: 10, backgroundColor: COLORS.card, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  editProfileText: { color: '#fff', fontWeight: 'bold', fontSize: 15 }
});