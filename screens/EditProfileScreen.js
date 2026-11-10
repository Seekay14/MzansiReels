import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { databases } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { ensureUserDoc, getAvatarPreviewUrl } from '../config/helpers';
import Avatar from '../components/Avatar';
import { uploadProfilePicture } from '../config/mediaUpload';

export default function EditProfileScreen({ route, navigation }) {
  const { user, setUser } = useAuth();
  const [userDoc, setUserDoc] = useState(route.params?.userDoc || null);
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(userDoc?.name || '');
  const [username, setUsername] = useState(userDoc?.username || '');
  const [bio, setBio] = useState(userDoc?.bio || '');
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState(null);

  const pickAvatar = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be signed in to change your profile picture.');
      return;
    }

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
      if (result.canceled) return;

      const asset = result.assets[0];
      setUploadingAvatar(true);
      setAvatarStatus({ type: 'uploading', message: 'Uploading profile picture…' });
      const profileDoc = userDoc || await ensureUserDoc(user);
      const fileId = await uploadProfilePicture(asset, user.$id, ({ status, message }) => {
        setAvatarStatus({ type: status, message });
      });
      const avatarUrl = getAvatarPreviewUrl(fileId);

      const updatedDoc = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.users,
        profileDoc.$id,
        { avatarUrl },
      );
      setUserDoc(updatedDoc);
      setUser({ ...user, avatarUrl });
      setAvatarStatus({ type: 'success', message: 'Profile picture updated successfully!' });
    } catch (error) {
      console.error('Profile picture upload failed:', error);
      setAvatarStatus({ type: 'error', message: error.message || 'Could not update profile picture.' });
      Alert.alert('Error', error.message || 'Could not update profile picture.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!user) {
      Alert.alert('Error', 'You must be signed in to update your profile.');
      return;
    }

    setLoading(true);
    try {
      const profileDoc = userDoc || await ensureUserDoc(user);
      const updatedDoc = await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, profileDoc.$id, {
        name: name.trim(),
        username: username.trim().toLowerCase().replace(/\s+/g, ''), 
        bio: bio.trim(),
      });
      setUserDoc(updatedDoc);

      Alert.alert("Success", "Profile updated!");
      navigation.goBack(); 
    } catch (error) {
      console.log("EDIT PROFILE ERROR:", error);
      Alert.alert("Error", error.message || "Could not update profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 10 }]}>
        
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="close" size={28} color="#fff" /></TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <TouchableOpacity onPress={handleSave} disabled={loading || uploadingAvatar}>
            {loading ? <ActivityIndicator color={COLORS.cyan} /> : <Text style={styles.saveText}>Save</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.avatarPicker}
          onPress={pickAvatar}
          disabled={uploadingAvatar || loading}
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
        >
          <View style={styles.avatarContainer}>
            <Avatar uri={userDoc?.avatarUrl} name={name || user?.name} size={96} bordered />
            {uploadingAvatar && (
              <View style={styles.avatarLoading}>
                <ActivityIndicator color={COLORS.cyan} size="large" />
              </View>
            )}
          </View>
          <Text style={styles.changePhotoText}>
            {uploadingAvatar ? 'Uploading photo…' : 'Change profile picture'}
          </Text>
        </TouchableOpacity>
        {avatarStatus && (
          <Text style={[
            styles.avatarStatus,
            avatarStatus.type === 'success' && styles.avatarStatusSuccess,
            avatarStatus.type === 'error' && styles.avatarStatusError,
          ]}>
            {avatarStatus.message}
          </Text>
        )}

        <View style={styles.form}>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your display name" placeholderTextColor="#555" />

          <Text style={styles.label}>Username (@handle)</Text>
          <View style={styles.usernameWrapper}>
            <Text style={styles.atSymbol}>@</Text>
            <TextInput 
              style={[styles.input, styles.usernameInput]} 
              value={username} 
              onChangeText={setUsername} 
              placeholder="username" 
              placeholderTextColor="#555"
              autoCapitalize="none"
            />
          </View>

          <Text style={styles.label}>Bio</Text>
          <TextInput 
            style={[styles.input, styles.bioInput]} 
            value={bio} 
            onChangeText={setBio} 
            placeholder="Tell people about yourself..." 
            placeholderTextColor="#555" 
            multiline 
            maxLength={150}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  saveText: { color: COLORS.cyan, fontSize: 16, fontWeight: 'bold' },
  avatarPicker: { alignItems: 'center', paddingTop: 24 },
  avatarContainer: { width: 100, height: 100, justifyContent: 'center', alignItems: 'center' },
  avatarLoading: { ...StyleSheet.absoluteFillObject, borderRadius: 50, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  changePhotoText: { color: COLORS.cyan, fontSize: 14, fontWeight: '600', marginTop: 10 },
  avatarStatus: { color: COLORS.cyan, fontSize: 13, textAlign: 'center', marginTop: 10, paddingHorizontal: 20 },
  avatarStatusSuccess: { color: '#45D483' },
  avatarStatusError: { color: '#FF5B67' },
  form: { padding: 20 },
  label: { color: COLORS.muted, fontSize: 14, marginBottom: 8, marginTop: 15, fontWeight: '600' },
  input: { backgroundColor: COLORS.card, color: '#fff', borderRadius: 10, padding: 15, fontSize: 16, borderWidth: 1, borderColor: '#2A2A35' },
  usernameWrapper: { flexDirection: 'row', alignItems: 'center' },
  atSymbol: { color: COLORS.muted, fontSize: 18, fontWeight: 'bold', position: 'absolute', left: 15, zIndex: 1 },
  usernameInput: { flex: 1, paddingLeft: 35 },
  bioInput: { height: 100, textAlignVertical: 'top' }
});