import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../config/constants';
import { uploadStory } from '../config/storyService';

const MAX_STORY_VIDEO_MS = 45_000;

export default function StoryUploadModal({ visible, user, onClose, onUploaded }) {
  const [asset, setAsset] = useState(null);
  const [mediaType, setMediaType] = useState('');
  const [durationVerified, setDurationVerified] = useState(false);
  const [uploading, setUploading] = useState(false);

  const clearSelection = () => {
    setAsset(null);
    setMediaType('');
    setDurationVerified(false);
  };

  const rejectLongVideo = () => {
    clearSelection();
    Alert.alert(
      'Video Too Long',
      'Stories must be 45 seconds or less. Please select a shorter video.',
    );
  };

  const pickMedia = async (type) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted && Platform.OS !== 'web') {
        Alert.alert('Permission needed', 'Allow photo library access to choose media.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: type === 'video' ? ['videos'] : ['images'],
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const selected = result.assets[0];
      if (type === 'video' && Number.isFinite(selected.duration) && selected.duration > MAX_STORY_VIDEO_MS) {
        rejectLongVideo();
        return;
      }

      setAsset({ ...selected, type });
      setMediaType(type);
      setDurationVerified(type === 'image');
    } catch (error) {
      console.error('Could not select story media:', error);
      Alert.alert('Could not open library', error.message || 'Please try again.');
    }
  };

  const verifyVideoDuration = (status) => {
    if (!status?.isLoaded || !Number.isFinite(status.durationMillis)) {
      clearSelection();
      Alert.alert('Could not verify video', 'Please select a different video.');
      return;
    }
    if (status.durationMillis > MAX_STORY_VIDEO_MS) {
      rejectLongVideo();
      return;
    }
    setDurationVerified(true);
  };

  const shareStory = async () => {
    if (!user?.$id || !asset?.uri || uploading || (mediaType === 'video' && !durationVerified)) return;
    setUploading(true);
    try {
      const story = await uploadStory(asset, user);
      onUploaded?.(story);
      clearSelection();
      Alert.alert('Story uploaded!', 'Your story is available for the next 24 hours.', [
        { text: 'OK', onPress: onClose },
      ]);
    } catch (error) {
      console.error('Could not upload story:', error);
      if (error.code === 'STORY_VIDEO_TOO_LONG') {
        clearSelection();
        Alert.alert('Video too long. Stories must be 45 seconds or less.');
      } else {
        Alert.alert('Upload failed', error.message || 'Your story could not be shared.');
      }
    } finally {
      setUploading(false);
    }
  };

  const close = () => {
    if (uploading) return;
    clearSelection();
    onClose?.();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={close}
    >
      <View style={styles.screen}>
        <View style={styles.header}>
          <TouchableOpacity onPress={close} disabled={uploading} accessibilityLabel="Close story upload">
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>Add to your story</Text>
          <TouchableOpacity
            onPress={shareStory}
            disabled={!asset || uploading || (mediaType === 'video' && !durationVerified)}
            accessibilityRole="button"
            accessibilityLabel="Share story"
          >
            {uploading
              ? <ActivityIndicator size="small" color={COLORS.cyan} />
              : <Text style={[styles.share, (!asset || (mediaType === 'video' && !durationVerified)) && styles.disabled]}>Share</Text>}
          </TouchableOpacity>
        </View>

        {asset ? (
          <View style={styles.preview}>
            {mediaType === 'image' ? (
              <Image source={{ uri: asset.uri }} style={styles.media} resizeMode="contain" />
            ) : (
              <>
                <Video
                  key={asset.uri}
                  source={{ uri: asset.uri }}
                  style={styles.durationProbe}
                  shouldPlay={false}
                  isMuted
                  onLoad={verifyVideoDuration}
                  onError={() => {
                    clearSelection();
                    Alert.alert('Could not verify video', 'Please select a different video.');
                  }}
                />
                <Text style={styles.verification}>
                  {durationVerified ? 'Video ready to share' : 'Checking video duration…'}
                </Text>
              </>
            )}
            <TouchableOpacity
              style={styles.remove}
              onPress={clearSelection}
              disabled={uploading}
              accessibilityLabel="Remove selected media"
            >
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.choices}>
            <TouchableOpacity style={styles.choice} onPress={() => pickMedia('image')} disabled={uploading}>
              <Ionicons name="image-outline" size={32} color={COLORS.cyan} />
              <Text style={styles.choiceText}>Choose image</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.choice} onPress={() => pickMedia('video')} disabled={uploading}>
              <Ionicons name="videocam-outline" size={32} color={COLORS.cyan} />
              <Text style={styles.choiceText}>Choose video (45s max)</Text>
            </TouchableOpacity>
          </View>
        )}
        {uploading ? (
          <View style={styles.uploading}>
            <ActivityIndicator color={COLORS.cyan} />
            <Text style={styles.verification}>Uploading your story…</Text>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: { color: '#F3F5F7', fontSize: 17, fontWeight: '800' },
  share: { color: COLORS.cyan, fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.4 },
  choices: { flex: 1, justifyContent: 'center', gap: 14, paddingHorizontal: 24 },
  choice: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: COLORS.card,
  },
  choiceText: { color: '#F3F5F7', fontSize: 15, fontWeight: '700' },
  preview: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  media: { width: '100%', height: '85%' },
  durationProbe: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  verification: { marginTop: 16, color: '#B8C0CA', fontSize: 13 },
  remove: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  uploading: { position: 'absolute', bottom: 32, alignSelf: 'center', alignItems: 'center' },
});
