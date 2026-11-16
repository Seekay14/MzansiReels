import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Camera, CameraView } from 'expo-camera';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, MAX_UPLOAD_MB } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { createPost } from '../config/posts';
import { useResponsiveLayout } from '../config/responsive';

const POST_TYPES = [
  { type: 'text', label: 'Text', icon: 'text-outline' },
  { type: 'image', label: 'Photo', icon: 'image-outline' },
  { type: 'video', label: 'Video', icon: 'videocam-outline' },
];

function VideoPreview({ uri }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });
  return <VideoView player={player} style={styles.mediaPreview} contentFit="cover" nativeControls={false} />;
}

export default function UploadScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height, scale, horizontalGutter } = useResponsiveLayout();
  const inputRef = useRef(null);
  const [asset, setAsset] = useState(null);
  const [content, setContent] = useState('');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [postType, setPostType] = useState('text');
  const [isSharing, setIsSharing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [privacy, setPrivacy] = useState('public');
  const cameraRef = useRef(null);

  const closeScreen = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Home');
  };

  const acceptAsset = (result) => {
    if (result.canceled || !result.assets?.[0]) return;
    const picked = result.assets[0];
    const limit = (postType === 'video' ? MAX_UPLOAD_MB : 5) * 1024 * 1024;
    if (picked.fileSize && picked.fileSize > limit) {
      Alert.alert(
        'File too large',
        `Please choose a ${postType === 'video' ? `video under ${MAX_UPLOAD_MB} MB` : 'photo under 5 MB'}.`,
      );
      return;
    }
    setAsset(picked);
    setUploadStatus(null);
  };

  const pickMedia = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted && Platform.OS !== 'web') {
        Alert.alert('Permission needed', 'Allow photo library access to choose media.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: postType === 'image' ? ['images'] : ['videos'],
        ...(postType === 'image' ? { allowsEditing: true, aspect: [4, 5] } : {}),
        quality: 1,
      });
      acceptAsset(result);
    } catch (error) {
      console.error('Could not open media library:', error);
      Alert.alert('Could not open library', error.message || 'Please try again.');
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
      Alert.alert('Camera unavailable', error.message || 'Please try again.');
    }
  };

  const recordVideo = async () => {
    if (!cameraRef.current || isRecording) return;
    setIsRecording(true);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 60 });
      if (video?.uri) {
        setAsset({ uri: video.uri, fileName: 'camera_video.mp4', mimeType: 'video/mp4' });
        setIsCameraOpen(false);
      }
    } catch (error) {
      console.error('Video recording failed:', error);
      Alert.alert('Recording failed', error.message || 'Please try again.');
    } finally {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (isRecording) cameraRef.current?.stopRecording();
  };

  const insertAtCursor = (insertedText) => {
    const start = selection.start ?? content.length;
    const end = selection.end ?? start;
    const nextContent = `${content.slice(0, start)}${insertedText}${content.slice(end)}`;
    const cursor = start + insertedText.length;
    setContent(nextContent);
    setSelection({ start: cursor, end: cursor });
    inputRef.current?.focus();
  };

  const addLocation = () => {
    if (!user?.province) {
      Alert.alert('Location unavailable', 'Add your province in profile setup to attach it to your post.');
      return;
    }
    insertAtCursor(` ${user.province}, SA`);
  };

  const handleShare = async () => {
    if (isSharing) return;
    if (postType === 'text' && !content.trim()) {
      Alert.alert('Add some text', 'Write something before sharing your post.');
      return;
    }
    if (postType !== 'text' && !asset) {
      Alert.alert('Choose media', `Select a ${postType} before sharing.`);
      return;
    }

    setIsSharing(true);
    setUploadStatus(null);
    try {
      await createPost({
        currentUser: user,
        textInput: content,
        postType,
        asset,
        onUploadStatus: setUploadStatus,
      });
      setContent('');
      setAsset(null);
      setPostType('text');
      Alert.alert('Success', 'Post shared successfully!');
      navigation.navigate('Home', { screen: 'Feed', params: { refresh: Date.now() } });
    } catch (error) {
      setUploadStatus({ status: 'error', message: error.message || 'Your post could not be shared.' });
    } finally {
      setIsSharing(false);
    }
  };

  if (isCameraOpen) {
    return (
      <View style={styles.cameraScreen}>
        <CameraView style={StyleSheet.absoluteFill} facing="back" ref={cameraRef}>
          <View style={styles.cameraControls}>
            <TouchableOpacity
              style={[styles.recordButton, isRecording && styles.recordingButton]}
              onPress={isRecording ? stopRecording : recordVideo}
              accessibilityRole="button"
              accessibilityLabel={isRecording ? 'Stop recording' : 'Start recording'}
            >
              {isRecording && <View style={styles.stopIcon} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cameraClose, { top: insets.top + 10 }]}
              onPress={() => setIsCameraOpen(false)}
              disabled={isRecording}
              accessibilityRole="button"
              accessibilityLabel="Close camera"
            >
              <Ionicons name="close" size={27} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

  const canShare = !isSharing && (postType === 'text' ? Boolean(content.trim()) : Boolean(asset));

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + 5 }]}>
        <TouchableOpacity
          style={styles.headerSide}
          onPress={closeScreen}
          disabled={isSharing}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: COLORS.text }]}>Create New Post</Text>
        <TouchableOpacity
          style={[styles.shareButton, !canShare && styles.shareButtonDisabled]}
          onPress={handleShare}
          disabled={!canShare}
          accessibilityRole="button"
          accessibilityLabel="Share post"
        >
          {isSharing
            ? <ActivityIndicator size="small" color={COLORS.bg} />
            : <Text style={[styles.shareText, !canShare && styles.shareTextDisabled]}>Post</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.privacyRow}>
        <TouchableOpacity
          style={styles.privacyButton}
          onPress={() => {
            Alert.alert(
              'Who can see this post?',
              undefined,
              [
                { text: 'Public', onPress: () => setPrivacy('public') },
                { text: 'Followers', onPress: () => setPrivacy('followers') },
                { text: 'Only Me', onPress: () => setPrivacy('only_me') },
                { text: 'Cancel', style: 'cancel' },
              ],
            );
          }}
          accessibilityRole="button"
          accessibilityLabel="Post privacy"
        >
          <Text style={[styles.privacyText, { color: COLORS.cyan, fontWeight: '700' }]}>Public</Text>
          <Ionicons name="chevron-down" size={16} color={COLORS.muted} />
        </TouchableOpacity>
      </View>

      <View style={styles.segmentedControl}>
        {POST_TYPES.map((option) => {
          const selected = postType === option.type;
          return (
            <TouchableOpacity
              key={option.type}
              style={[styles.segment, selected && styles.segmentSelected]}
              onPress={() => {
                if (isSharing) return;
                setPostType(option.type);
                setAsset(null);
                setUploadStatus(null);
              }}
              disabled={isSharing}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
            >
              <Ionicons name={option.icon} size={17} color={selected ? COLORS.text : COLORS.muted} />
              <Text style={[styles.segmentText, selected && { color: COLORS.text }]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.contentArea}
        contentContainerStyle={[styles.contentAreaInner, { paddingHorizontal: horizontalGutter }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {postType === 'text' ? (
          <>
            <TextInput
              ref={inputRef}
              style={[
                styles.textEditor,
                { minHeight: 220 * scale, fontSize: 20 * scale, lineHeight: 29 * scale },
              ]}
              placeholder="What's on your mind, Mzansi?"
              placeholderTextColor={COLORS.muted}
              value={content}
              onChangeText={setContent}
              onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
              multiline
              maxLength={500}
              textAlignVertical="top"
              autoFocus
              accessibilityLabel="Post text"
            />
            <View style={styles.charCounterRow}>
              <Text style={[styles.charCounterText, { color: COLORS.muted }]}>{content.length}/500</Text>
            </View>
          </>
        ) : (
          <>
            <TextInput
              ref={inputRef}
              style={[
                styles.captionEditor,
                { fontSize: 17 * scale, lineHeight: 25 * scale },
              ]}
              placeholder="Add a caption..."
              placeholderTextColor={COLORS.muted}
              value={content}
              onChangeText={setContent}
              onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
              multiline
              maxLength={2000}
              textAlignVertical="top"
              accessibilityLabel="Post caption"
            />
            {asset ? (
              <View style={[styles.previewFrame, { height: Math.min(390, Math.max(240, height * 0.46)), backgroundColor: COLORS.card }]}>
                {postType === 'image'
                  ? <Image source={{ uri: asset.uri }} style={styles.mediaPreview} resizeMode="cover" />
                  : <VideoPreview uri={asset.uri} />}
                <TouchableOpacity
                  style={[styles.removeMediaButton, { backgroundColor: COLORS.raised }]}
                  onPress={() => setAsset(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Remove selected media"
                >
                  <Ionicons name="close" size={19} color={COLORS.text} />
                </TouchableOpacity>
                {postType === 'video' && (
                  <View style={[styles.videoBadge, { backgroundColor: COLORS.raised }]}>
                    <Ionicons name="play" size={12} color={COLORS.text} />
                    <Text style={[styles.videoBadgeText, { color: COLORS.text }]}>Video preview</Text>
                  </View>
                )}
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.mediaPicker, { backgroundColor: COLORS.card, borderColor: COLORS.border }]}
                onPress={pickMedia}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Select ${postType}`}
              >
                <View style={styles.mediaIcon}>
                  <Ionicons name={postType === 'image' ? 'image-outline' : 'videocam-outline'} size={29} color={COLORS.cyan} />
                </View>
                <Text style={styles.mediaTitle}>Tap to select a {postType === 'image' ? 'photo' : 'video'}</Text>
                <Text style={styles.mediaHint}>Choose from your library or record a clip</Text>
                <View style={styles.mediaPickerActions}>
                  <Text style={styles.mediaPickerAction}>Browse library</Text>
                  {postType === 'video' && Platform.OS !== 'web' && (
                    <>
                      <View style={styles.actionSeparator} />
                      <TouchableOpacity onPress={openCamera} accessibilityRole="button">
                        <Text style={styles.mediaPickerAction}>Record video</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>

      {uploadStatus?.message ? (
        <Text style={[styles.statusText, uploadStatus.status === 'error' && styles.statusError]}>
          {uploadStatus.message}
        </Text>
      ) : null}

      <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 10), backgroundColor: COLORS.card, borderTopColor: COLORS.border }]}>
        <Text style={[styles.toolbarLabel, { color: COLORS.muted }]}>ADD TO YOUR POST</Text>
        <View style={styles.toolbarActions}>
          <TouchableOpacity
            style={[styles.toolbarButton, { backgroundColor: COLORS.card }]}
            onPress={() => insertAtCursor('#')}
            accessibilityRole="button"
            accessibilityLabel="Add hashtag"
          >
            <Ionicons name="pricetag-outline" size={20} color={COLORS.cyan} />
            <Text style={[styles.toolbarButtonText, { color: COLORS.text }]}>Tag</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarButton, { backgroundColor: COLORS.card }]}
            onPress={pickMedia}
            accessibilityRole="button"
            accessibilityLabel="Add photo"
          >
            <Ionicons name="image-outline" size={20} color={COLORS.cyan} />
            <Text style={[styles.toolbarButtonText, { color: COLORS.text }]}>Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarButton, { backgroundColor: COLORS.card }]}
            onPress={openCamera}
            accessibilityRole="button"
            accessibilityLabel="Record video"
          >
            <Ionicons name="videocam-outline" size={20} color={COLORS.pink} />
            <Text style={[styles.toolbarButtonText, { color: COLORS.text }]}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarButton, { backgroundColor: COLORS.card }]}
            onPress={() => insertAtCursor('😊')}
            accessibilityRole="button"
            accessibilityLabel="Add emoji"
          >
            <Ionicons name="happy-outline" size={20} color={COLORS.cyan} />
            <Text style={[styles.toolbarButtonText, { color: COLORS.text }]}>Emoji</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolbarButton, { backgroundColor: COLORS.card }]}
            onPress={addLocation}
            accessibilityRole="button"
            accessibilityLabel="Add province location"
          >
            <Ionicons name="location-outline" size={20} color={COLORS.cyan} />
            <Text style={[styles.toolbarButtonText, { color: COLORS.text }]}>Location</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  header: { minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerSide: { width: 58, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { flex: 1, color: COLORS.text, textAlign: 'center', fontSize: 16, fontWeight: '800' },
  shareButton: { width: 58, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: COLORS.cyan },
  shareButtonDisabled: { opacity: 0.5 },
  shareText: { color: COLORS.bg, fontSize: 15, fontWeight: '900' },
  shareTextDisabled: { color: COLORS.bg },
  segmentedControl: { flexDirection: 'row', marginHorizontal: 18, marginTop: 16, padding: 4, borderRadius: 16, backgroundColor: COLORS.card },
  segment: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12 },
  segmentSelected: { backgroundColor: COLORS.cyan },
  segmentText: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  segmentTextSelected: { color: COLORS.bg, fontWeight: '900' },
  charCounterRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4, marginRight: 2 },
  charCounterText: { fontSize: 11, fontWeight: '600' },
  privacyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 19, paddingTop: 8, paddingBottom: 6 },
  privacyButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  privacyText: { fontSize: 14, fontWeight: '700' },
  contentArea: { flex: 1, marginTop: 13 },
  contentAreaInner: { flexGrow: 1, paddingHorizontal: 21, paddingBottom: 20 },
  textEditor: { flex: 1, minHeight: 220, color: COLORS.text, fontSize: 20, lineHeight: 29, padding: 0, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12 },
  captionEditor: { minHeight: 90, color: COLORS.text, fontSize: 17, lineHeight: 25, padding: 0, marginBottom: 15, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12 },
  mediaPicker: { minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: 22, borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed', borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.015)' },
  mediaIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: 'rgba(0,229,255,0.09)', marginBottom: 14 },
  mediaTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  mediaHint: { color: COLORS.muted, fontSize: 12, marginTop: 7, textAlign: 'center' },
  mediaPickerActions: { flexDirection: 'row', alignItems: 'center', marginTop: 17 },
  mediaPickerAction: { color: COLORS.cyan, fontSize: 13, fontWeight: '800', paddingVertical: 5, paddingHorizontal: 4 },
  actionSeparator: { width: 1, height: 15, backgroundColor: COLORS.border, marginHorizontal: 12 },
  previewFrame: { width: '100%', height: 390, maxHeight: 490, position: 'relative', overflow: 'hidden', borderRadius: 17, backgroundColor: COLORS.card },
  mediaPreview: { width: '100%', height: '100%' },
  removeMediaButton: { position: 'absolute', top: 11, right: 11, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.7)' },
  videoBadge: { position: 'absolute', left: 11, bottom: 11, flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 9, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.65)' },
  videoBadgeText: { color: COLORS.text, fontSize: 11, fontWeight: '700', marginLeft: 5 },
  statusText: { color: '#4DD994', fontSize: 12, textAlign: 'center', paddingHorizontal: 16, paddingBottom: 7 },
  statusError: { color: '#FF717D' },
  toolbar: { paddingTop: 12, paddingHorizontal: 19, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.card },
  toolbarLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.3, marginBottom: 9 },
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  toolbarButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 12, backgroundColor: COLORS.card },
  toolbarButtonText: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  cameraScreen: { flex: 1, backgroundColor: COLORS.bg },
  cameraControls: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 46 },
  cameraClose: { position: 'absolute', right: 18, width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.45)' },
  recordButton: { width: 74, height: 74, alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: COLORS.border, borderRadius: 37, backgroundColor: COLORS.pink },
  recordingButton: { backgroundColor: COLORS.text },
  stopIcon: { width: 23, height: 23, borderRadius: 5, backgroundColor: COLORS.pink },
});

