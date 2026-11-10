import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CameraView } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, ID } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS, MAX_UPLOAD_MB } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { getUserDoc, generateAndUploadThumbnail, getAvatarPreviewUrl, getFileViewUrl } from '../config/helpers';
import { uploadMediaFile, uploadVideo } from '../config/mediaUpload';

function Preview({ uri }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

export default function UploadScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [asset, setAsset] = useState(null);
  const [thumbnailAsset, setThumbnailAsset] = useState(null);
  const [caption, setCaption] = useState('');
  const [soundName, setSoundName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0); 
  const [uploadStatus, setUploadStatus] = useState(null);

  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const cameraRef = useRef(null);

  const accept = (result) => {
    if (result.canceled) return;
    const picked = result.assets[0];
    if (picked.fileSize && picked.fileSize > MAX_UPLOAD_MB * 1024 * 1024) {
      return Alert.alert('Video too large', `Please pick a video under ${MAX_UPLOAD_MB} MB.`);
    }
    setAsset(picked);
    setThumbnailAsset(null);
  };

  const pickFromLibrary = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted && Platform.OS !== 'web') {
        return Alert.alert('Permission needed', 'Allow photo library access to pick a video.');
      }
      accept(await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        quality: 1,
      }));
    } catch (error) {
      console.error('Could not open the video library:', error);
      Alert.alert('Error', 'Could not open your video library.');
    }
  };

  const pickThumbnail = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted && Platform.OS !== 'web') {
        return Alert.alert('Permission needed', 'Allow photo library access to choose a cover image.');
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.85,
      });
      if (!result.canceled) setThumbnailAsset(result.assets[0]);
    } catch (error) {
      console.error('Could not choose a video cover:', error);
      Alert.alert('Error', 'Could not choose a cover image.');
    }
  };

  const openCamera = async () => {
    try {
      const [cameraPermission, microphonePermission] = await Promise.all([
        Camera.requestCameraPermissionsAsync(),
        Camera.requestMicrophonePermissionsAsync(),
      ]);
      if (cameraPermission.status === 'granted' && microphonePermission.status === 'granted') {
        setIsCameraOpen(true);
      } else {
        Alert.alert('Permission needed', 'Allow camera and microphone access to record a video with sound.');
      }
    } catch (error) {
      console.error('Could not request camera permission:', error);
      Alert.alert('Error', 'Camera access could not be requested.');
    }
  };

  const takeVideo = async () => {
    if (cameraRef.current && !isRecording) {
      setIsRecording(true);
      try {
        const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
        if (video) {
          setAsset({ uri: video.uri, fileName: 'camera_video.mp4', mimeType: 'video/mp4' });
          setThumbnailAsset(null);
          setIsCameraOpen(false);
        }
      } catch (error) {
        console.error('Video recording failed:', error);
        Alert.alert('Recording failed', 'The video could not be recorded. Please try again.');
      } finally {
        setIsRecording(false);
      }
    }
  };

  const stopRecording = () => {
    if (isRecording) {
      cameraRef.current?.stopRecording();
    }
  };

  const handlePost = async () => {
    if (!asset) return Alert.alert('Hold on', 'Please select a video first!');
    
    setIsUploading(true);
    setUploadStatus({ type: 'uploading', message: 'Uploading video…' });
    setProgress(10); 

    const progressInterval = setInterval(() => {
      setProgress((prev) => (prev < 85 ? prev + 10 : prev));
    }, 400);

    try {
      let userDoc = null;
      try {
        userDoc = await getUserDoc(user.$id);
      } catch (error) {
        console.error('Could not load creator profile for video upload:', error);
      }
      const fileId = await uploadVideo(
        asset,
        user.$id,
        (uploadProgress) => setProgress(Math.max(10, Math.round(uploadProgress.progress * 0.75))),
        ({ status, message }) => {
          setUploadStatus({ type: status, message });
        },
      );
      const videoUrl = String(getFileViewUrl(fileId));
      if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
        throw new Error('Could not generate a valid video URL.');
      }

      setProgress(90); 

      let thumbnailUrl = '';
      if (thumbnailAsset) {
        const thumbnailId = await uploadMediaFile(thumbnailAsset, {
          userId: user.$id,
          kind: 'image',
          publicRead: true,
          folder: `videos/${user.$id}/thumbnails`,
        });
        thumbnailUrl = getAvatarPreviewUrl(thumbnailId);
      } else if (Platform.OS !== 'web') {
        try {
          thumbnailUrl = await generateAndUploadThumbnail(asset.uri, fileId, user.$id);
        } catch (e) {
          console.error('Thumbnail generation failed:', e);
        }
      }

      const videoData = {
        caption: caption.trim() || 'No caption',
        videoUrl,
        userName: String(user.name || 'Anonymous'),
        userId: String(user.$id),
        avatarUrl: String(userDoc?.avatarUrl || ''),
        thumbnailUrl: String(thumbnailUrl || ''),
        soundName: soundName.trim() || '',
        category: 'General',
        likes: 0,
        views: 0,
        uploadedAt: new Date().toISOString(),
      };
      const createdVideo = await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.videos,
        ID.unique(),
        videoData,
      );

      clearInterval(progressInterval);
      setProgress(100);
      setUploadStatus({ type: 'success', message: 'Video uploaded successfully!' });

      setTimeout(() => {
        setAsset(null);
        setCaption('');
        setSoundName('');
        setIsUploading(false);
        setProgress(0);
        Alert.alert('Success', 'Video posted successfully!');
        navigation.navigate('Home', { screen: 'Feed', params: { refresh: Date.now() } });
      }, 500);
      return createdVideo;
    } catch (error) {
      clearInterval(progressInterval);
      console.error('Upload failed:', error);
      setUploadStatus({ type: 'error', message: error.message || 'Video upload failed. Please try again.' });
      Alert.alert('Upload Failed', error.message || JSON.stringify(error));
      setIsUploading(false);
      setProgress(0);
    }
  };

  if (isCameraOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <CameraView style={{ flex: 1 }} facing="back" ref={cameraRef}>
          <View style={{ flex: 1, backgroundColor: 'transparent', flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingBottom: 40 }}>
            <TouchableOpacity
              onPress={isRecording ? stopRecording : takeVideo}
              accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
              style={[styles.recordButton, isRecording && styles.recordingButton]}
            >
              {isRecording && <View style={styles.stopIcon} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsCameraOpen(false)} disabled={isRecording} style={{ position: 'absolute', top: insets.top + 20, right: 20 }}>
              <Ionicons name="close" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}><Text style={styles.headerTitle}>New Post</Text></View>

      <View style={styles.mediaPicker}>
        {asset ? (
          <>
            <Preview uri={asset.uri} />
            <TouchableOpacity style={styles.clear} onPress={() => setAsset(null)}><Ionicons name="close" size={20} color="#fff" /></TouchableOpacity>
          </>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <Ionicons name="cloud-upload-outline" size={60} color={COLORS.cyan} />
            <Text style={styles.uploadText}>Add a video</Text>
            <View style={styles.pickRow}>
              <TouchableOpacity style={styles.pickButton} onPress={pickFromLibrary}><Ionicons name="images" size={18} color="#000" /><Text style={styles.pickText}>Library</Text></TouchableOpacity>
              {Platform.OS !== 'web' && (
                <TouchableOpacity style={styles.pickButton} onPress={openCamera}>
                  <Ionicons name="videocam" size={18} color="#000" />
                  <Text style={styles.pickText}>Record</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>

      {asset && (
        <TouchableOpacity style={styles.thumbnailPicker} onPress={pickThumbnail}>
          {thumbnailAsset ? (
            <Image source={{ uri: thumbnailAsset.uri }} style={styles.thumbnailPreview} />
          ) : (
            <View style={styles.thumbnailPlaceholder}>
              <Ionicons name="image-outline" size={22} color={COLORS.cyan} />
            </View>
          )}
          <View style={styles.thumbnailDetails}>
            <Text style={styles.thumbnailTitle}>Video cover</Text>
            <Text style={styles.thumbnailSubtitle}>
              {thumbnailAsset ? 'Tap to change your cover' : 'Choose a cover image'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.muted} />
        </TouchableOpacity>
      )}

      <View style={styles.inputSection}>
        <TextInput style={styles.captionInput} placeholder="Add a description and hashtags..." placeholderTextColor="#888" multiline maxLength={150} value={caption} onChangeText={setCaption} />
        <Text style={styles.counter}>{caption.length}/150</Text>

        <View style={styles.soundInputContainer}>
          <Ionicons name="musical-notes" size={20} color={COLORS.cyan} style={{ marginRight: 10 }} />
          <TextInput 
            style={styles.soundInput} 
            placeholder="Add a sound name (e.g., Amapiano Beat)" 
            placeholderTextColor="#888" 
            value={soundName} 
            onChangeText={setSoundName} 
          />
        </View>
      </View>

      <TouchableOpacity style={[styles.postButton, isUploading && { opacity: 0.7 }]} onPress={handlePost} disabled={isUploading}>
        {isUploading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <ActivityIndicator color="#fff" style={{ marginRight: 10 }} />
            <Text style={styles.postButtonText}>Uploading {progress}%</Text>
          </View>
        ) : (
          <Text style={styles.postButtonText}>Post to Feed</Text>
        )}
      </TouchableOpacity>

      {uploadStatus && (
        <Text style={[
          styles.uploadStatus,
          uploadStatus.type === 'success' && styles.uploadStatusSuccess,
          uploadStatus.type === 'error' && styles.uploadStatusError,
        ]}>
          {uploadStatus.message}
        </Text>
      )}

      {isUploading && (
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${progress}%` }]} />
        </View>
      )}
      {isUploading && <Text style={styles.hint}>Keep the app open while we upload your video...</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  mediaPicker: { height: 340, margin: 20, borderRadius: 15, borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.card, overflow: 'hidden' },
  recordButton: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.pink, borderWidth: 5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  recordingButton: { backgroundColor: '#fff' },
  stopIcon: { width: 24, height: 24, borderRadius: 5, backgroundColor: COLORS.pink },
  thumbnailPicker: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginTop: -4, marginBottom: 20, padding: 12, borderRadius: 12, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  thumbnailPreview: { width: 42, height: 56, borderRadius: 7 },
  thumbnailPlaceholder: { width: 42, height: 56, borderRadius: 7, backgroundColor: '#0A0A0F', alignItems: 'center', justifyContent: 'center' },
  thumbnailDetails: { flex: 1, marginLeft: 12 },
  thumbnailTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  thumbnailSubtitle: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  uploadText: { color: '#888', fontSize: 16, marginTop: 10, fontWeight: '500' },
  pickRow: { flexDirection: 'row', marginTop: 16 },
  pickButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cyan, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, marginHorizontal: 6 },
  pickText: { color: '#000', fontWeight: 'bold', marginLeft: 6 },
  clear: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  inputSection: { marginHorizontal: 20, marginBottom: 20 },
  captionInput: { color: '#fff', fontSize: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 10, minHeight: 50 },
  counter: { color: '#555', fontSize: 12, textAlign: 'right', marginTop: 4 },
  soundInputContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 15, backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10 },
  soundInput: { flex: 1, color: '#fff', fontSize: 14 },
  postButton: { backgroundColor: COLORS.pink, marginHorizontal: 20, paddingVertical: 15, borderRadius: 10, alignItems: 'center' },
  postButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  uploadStatus: { color: COLORS.cyan, fontSize: 14, fontWeight: '600', textAlign: 'center', marginHorizontal: 20, marginTop: 12 },
  uploadStatusSuccess: { color: '#45D483' },
  uploadStatusError: { color: '#FF5B67' },
  hint: { color: '#888', textAlign: 'center', marginTop: 12, marginBottom: 30 },
  progressContainer: { height: 6, backgroundColor: COLORS.card, borderRadius: 3, marginHorizontal: 20, marginTop: 15, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: COLORS.cyan, borderRadius: 3 },
});