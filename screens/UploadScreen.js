import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CameraType } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, storage, ID, account } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, BUCKET_ID, COLORS, MAX_UPLOAD_MB } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { getUserDoc, generateAndUploadThumbnail } from '../config/helpers'; // 👈 IMPORTED CORRECTLY

function Preview({ uri }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

export default function UploadScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [asset, setAsset] = useState(null);
  const [caption, setCaption] = useState('');
  const [soundName, setSoundName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0); 

  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const cameraRef = useRef(null);

  const accept = (result) => {
    if (result.canceled) return;
    const picked = result.assets[0];
    if (picked.fileSize && picked.fileSize > MAX_UPLOAD_MB * 1024 * 1024) {
      return Alert.alert('Video too large', `Please pick a video under ${MAX_UPLOAD_MB} MB.`);
    }
    setAsset(picked);
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted && Platform.OS !== 'web') return Alert.alert('Permission needed', 'Allow photo library access to pick a video.');
    
    accept(await ImagePicker.launchImageLibraryAsync({ 
      mediaTypes: ['videos'], 
      quality: 1,
    }));
  };

  const openCamera = async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    setHasCameraPermission(status === 'granted');
    if (status === 'granted') {
      setIsCameraOpen(true);
    } else {
      Alert.alert('Permission needed', 'Allow camera access to record a video.');
    }
  };

  const takeVideo = async () => {
    if (cameraRef.current) {
      const video = await cameraRef.current.recordAsync();
      if (video) {
        setAsset({ uri: video.uri, fileName: 'camera_video.mp4', mimeType: 'video/mp4' });
        setIsCameraOpen(false);
      }
    }
  };

  const handlePost = async () => {
    if (!asset) return Alert.alert('Hold on', 'Please select a video first!');
    
    setIsUploading(true);
    setProgress(10); 

    const progressInterval = setInterval(() => {
      setProgress((prev) => (prev < 85 ? prev + 10 : prev));
    }, 400);

    try {
      const userDoc = await getUserDoc(user.$id).catch(() => null);
      const fileId = ID.unique();
      let videoUrl = "";

      if (Platform.OS === 'web') {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        
        const formData = new FormData();
        formData.append('fileId', fileId);
        formData.append('file', blob, asset.fileName || 'video.mp4');

        const session = await account.getSession('current');

        const uploadRes = await fetch(
          `https://cloud.appwrite.io/v1/storage/buckets/${BUCKET_ID}/files`,
          {
            method: 'POST',
            headers: {
              'X-Appwrite-Project': '6af0b93b00320e635f66',
              'X-Appwrite-Platform': '127.0.0.1',
              'X-Appwrite-Session': session.secret,
            },
            body: formData,
          }
        );

        if (!uploadRes.ok) {
          const err = await uploadRes.json();
          throw new Error(err.message || 'Upload failed');
        }

        videoUrl = `https://cloud.appwrite.io/v1/storage/buckets/${BUCKET_ID}/files/${fileId}/view?project=6af0b93b00320e635f66`;

      } else {
        const uploadedFile = await storage.createFile(BUCKET_ID, fileId, {
          name: asset.fileName || 'video.mp4',
          type: asset.mimeType || 'video/mp4',
          size: asset.fileSize || 1000000,
          uri: asset.uri,
        });
        videoUrl = storage.getFileView(BUCKET_ID, uploadedFile.$id).toString();
      }

      setProgress(90); 

      // 👈 THUMBNAIL GENERATION
      let thumbnailUrl = '';
      if (Platform.OS !== 'web') {
        try {
          thumbnailUrl = await generateAndUploadThumbnail(asset.uri, fileId);
        } catch (e) {
          console.log("Thumbnail error:", e);
        }
      }
      
      if (!thumbnailUrl) {
        thumbnailUrl = `https://picsum.photos/seed/${fileId}/400/600`;
      }

      await databases.createDocument(DATABASE_ID, COLLECTIONS.videos, ID.unique(), {
        caption: caption.trim() || 'No caption',
        videoUrl, 
        thumbnailUrl,
        userName: user.name || 'Anonymous',
        userId: user.$id,
        likes: 0,
        avatarUrl: userDoc?.avatarUrl || '',
        soundName: soundName.trim() || 'Original Audio', 
      });

      clearInterval(progressInterval);
      setProgress(100);

      setTimeout(() => {
        setAsset(null);
        setCaption('');
        setSoundName('');
        setIsUploading(false);
        setProgress(0);
        Alert.alert('Success', 'Video posted successfully!');
        navigation.navigate('Home', { screen: 'Feed', params: { refresh: Date.now() } });
      }, 500);
      
    } catch (error) {
      clearInterval(progressInterval);
      console.log("UPLOAD ERROR:", error);
      Alert.alert('Upload Failed', error.message || JSON.stringify(error));
      setIsUploading(false);
      setProgress(0);
    }
  };

  if (isCameraOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Camera style={{ flex: 1 }} type={CameraType.back} ref={cameraRef}>
          <View style={{ flex: 1, backgroundColor: 'transparent', flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingBottom: 40 }}>
            <TouchableOpacity onPress={takeVideo} style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: COLORS.pink, borderWidth: 5, borderColor: '#fff' }} />
            <TouchableOpacity onPress={() => setIsCameraOpen(false)} style={{ position: 'absolute', top: insets.top + 20, right: 20 }}>
              <Ionicons name="close" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
        </Camera>
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
              <TouchableOpacity style={styles.pickButton} onPress={openCamera}><Ionicons name="videocam" size={18} color="#000" /><Text style={styles.pickText}>Record</Text></TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <View style={styles.inputSection}>
        <TextInput style={styles.captionInput} placeholder="Write a caption..." placeholderTextColor="#888" multiline maxLength={150} value={caption} onChangeText={setCaption} />
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
  hint: { color: '#888', textAlign: 'center', marginTop: 12, marginBottom: 30 },
  progressContainer: { height: 6, backgroundColor: COLORS.card, borderRadius: 3, marginHorizontal: 20, marginTop: 15, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: COLORS.cyan, borderRadius: 3 },
});