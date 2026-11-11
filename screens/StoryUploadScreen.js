import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, ID } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import { getFileViewUrl } from '../config/helpers';
import { uploadMediaFile } from '../config/mediaUpload';
import { useAuth } from '../context/AuthContext';

const MAX_STORY_VIDEO_MS = 45 * 1000;
const STORY_TYPES = [
  { type: 'text', label: 'Text', icon: 'text-outline' },
  { type: 'image', label: 'Photo', icon: 'image-outline' },
  { type: 'video', label: 'Video', icon: 'videocam-outline' },
];

function VideoDurationProbe({ uri, onDuration, onError }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.pause();
  });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const onDurationRef = useRef(onDuration);
  const onErrorRef = useRef(onError);
  onDurationRef.current = onDuration;
  onErrorRef.current = onError;

  useEffect(() => {
    if (status === 'readyToPlay') {
      const durationMs = player.duration * 1000;
      if (Number.isFinite(durationMs) && durationMs > 0) {
        onDurationRef.current(durationMs);
      }
    } else if (status === 'error') {
      onErrorRef.current(new Error('Could not read the selected video duration.'));
    }
  }, [player, status]);

  return null;
}

export default function StoryUploadScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [storyType, setStoryType] = useState('text');
  const [content, setContent] = useState('');
  const [asset, setAsset] = useState(null);
  const [videoDurationVerified, setVideoDurationVerified] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');

  const closeScreen = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Feed');
  };

  const rejectLongVideo = useCallback(() => {
    setAsset(null);
    setVideoDurationVerified(false);
    Alert.alert(
      'Video Too Long',
      'Stories must be 45 seconds or less. Please select a shorter video.',
    );
  }, []);

  const acceptVideoDuration = useCallback((durationMs) => {
    if (durationMs > MAX_STORY_VIDEO_MS) {
      rejectLongVideo();
      return;
    }
    setVideoDurationVerified(true);
  }, [rejectLongVideo]);

  const pickMedia = async (type) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted && Platform.OS !== 'web') {
        Alert.alert('Permission needed', 'Allow photo library access to choose media.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: type === 'image' ? ['images'] : ['videos'],
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const selected = result.assets[0];
      if (type === 'video' && typeof selected.duration === 'number') {
        if (selected.duration > MAX_STORY_VIDEO_MS) {
          rejectLongVideo();
          return;
        }
        setVideoDurationVerified(false);
      } else {
        setVideoDurationVerified(type !== 'video');
      }
      setAsset(selected);
      setStoryType(type);
      setUploadMessage('');
    } catch (error) {
      console.error('Could not select story media:', error);
      Alert.alert('Could not open library', error.message || 'Please try again.');
    }
  };

  const handleShare = async () => {
    if (uploading) return;
    if (!user?.$id) {
      Alert.alert('Sign in required', 'Sign in before sharing a story.');
      return;
    }
    if (storyType === 'text' && !content.trim()) {
      Alert.alert('Add some text', 'Write something before sharing your story.');
      return;
    }
    if (storyType !== 'text' && !asset?.uri) {
      Alert.alert('Choose media', `Select a ${storyType} before sharing your story.`);
      return;
    }
    if (storyType === 'video' && !videoDurationVerified) {
      Alert.alert('Checking video', 'Wait until the video duration has been verified.');
      return;
    }

    setUploading(true);
    setUploadMessage('');
    try {
      let mediaUrl = '';
      if (storyType !== 'text') {
        const fileId = await uploadMediaFile(asset, {
          userId: user.$id,
          kind: storyType,
          publicRead: true,
          folder: `stories/${user.$id}`,
          onStatusChange: ({ message }) => setUploadMessage(message || ''),
        });
        mediaUrl = getFileViewUrl(fileId);
      }

      await databases.createDocument(DATABASE_ID, COLLECTIONS.stories, ID.unique(), {
        userId: user.$id,
        userName: user.name || '',
        avatarUrl: user.avatarUrl || '',
        createdAt: new Date().toISOString(),
        mediaType: storyType,
        mediaUrl,
        content: content.trim(),
      });

      Alert.alert('Story shared', 'Your story is available for the next 24 hours.');
      navigation.goBack();
    } catch (error) {
      console.error('Could not share story:', error);
      setUploadMessage('');
      Alert.alert('Upload failed', error.message || 'Your story could not be shared.');
    } finally {
      setUploading(false);
    }
  };

  const canShare = !uploading && (
    storyType === 'text'
      ? Boolean(content.trim())
      : Boolean(asset?.uri) && (storyType !== 'video' || videoDurationVerified)
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={closeScreen}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel="Close story upload"
        >
          <Ionicons name="close" size={26} color="#F1F4F7" />
        </TouchableOpacity>
        <Text style={styles.title}>Create Story</Text>
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
          disabled={!canShare}
          accessibilityRole="button"
          accessibilityLabel="Share story"
        >
          {uploading
            ? <ActivityIndicator size="small" color={COLORS.cyan} />
            : <Text style={[styles.shareText, !canShare && styles.disabledShare]}>Share</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.typeRow}>
        {STORY_TYPES.map((option) => (
          <TouchableOpacity
            key={option.type}
            style={[styles.typeButton, storyType === option.type && styles.typeButtonActive]}
            onPress={() => {
              if (uploading) return;
              setStoryType(option.type);
              setAsset(null);
              setVideoDurationVerified(false);
              setUploadMessage('');
            }}
            disabled={uploading}
            accessibilityRole="tab"
            accessibilityState={{ selected: storyType === option.type }}
          >
            <Ionicons
              name={option.icon}
              size={18}
              color={storyType === option.type ? '#071014' : '#9AA2AD'}
            />
            <Text style={[styles.typeText, storyType === option.type && styles.typeTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {storyType === 'text' ? (
          <TextInput
            style={styles.textEditor}
            placeholder="Write a story..."
            placeholderTextColor="#7D8793"
            value={content}
            onChangeText={setContent}
            multiline
            maxLength={500}
            textAlignVertical="center"
            accessibilityLabel="Story text"
          />
        ) : asset ? (
          <View style={styles.preview}>
            {storyType === 'image' ? (
              <Image source={{ uri: asset.uri }} style={styles.previewMedia} resizeMode="contain" />
            ) : (
              <>
                <VideoPreview uri={asset.uri} />
                {!videoDurationVerified ? (
                  <View style={styles.checkingOverlay}>
                    <ActivityIndicator color={COLORS.cyan} />
                    <Text style={styles.checkingText}>Checking video duration…</Text>
                  </View>
                ) : null}
                <VideoDurationProbe
                  uri={asset.uri}
                  onDuration={acceptVideoDuration}
                  onError={(error) => {
                    if (typeof asset.duration === 'number') {
                      acceptVideoDuration(asset.duration);
                    } else {
                      console.error('Could not verify story video duration:', error);
                      setVideoDurationVerified(false);
                      Alert.alert('Could not verify video', 'Please select a different video.');
                    }
                  }}
                />
              </>
            )}
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => {
                setAsset(null);
                setVideoDurationVerified(false);
              }}
              accessibilityRole="button"
              accessibilityLabel="Remove selected media"
            >
              <Ionicons name="close" size={19} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.picker}
            onPress={() => pickMedia(storyType)}
            accessibilityRole="button"
            accessibilityLabel={`Select story ${storyType}`}
          >
            <Ionicons
              name={storyType === 'image' ? 'image-outline' : 'videocam-outline'}
              size={40}
              color={COLORS.cyan}
            />
            <Text style={styles.pickerText}>Choose a {storyType}</Text>
            {storyType === 'video' ? (
              <Text style={styles.helperText}>Videos can be up to 45 seconds.</Text>
            ) : null}
          </TouchableOpacity>
        )}
        {storyType !== 'text' && asset ? (
          <TouchableOpacity
            style={styles.chooseAnother}
            onPress={() => pickMedia(storyType)}
            disabled={uploading}
          >
            <Text style={styles.chooseAnotherText}>Choose another {storyType}</Text>
          </TouchableOpacity>
        ) : null}
        {storyType !== 'text' ? (
          <TextInput
            style={styles.caption}
            placeholder="Add text (optional)"
            placeholderTextColor="#7D8793"
            value={content}
            onChangeText={setContent}
            maxLength={500}
            accessibilityLabel="Optional story caption"
          />
        ) : null}
        {uploadMessage ? <Text style={styles.status}>{uploadMessage}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function VideoPreview({ uri }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });

  return <VideoView player={player} style={styles.previewMedia} contentFit="contain" nativeControls />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingHorizontal: 13,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerButton: {
    width: 42,
    height: 42,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: '#F1F4F7',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  shareButton: {
    minWidth: 52,
    height: 42,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  shareText: {
    color: COLORS.cyan,
    fontSize: 14,
    fontWeight: '800',
  },
  disabledShare: {
    opacity: 0.4,
  },
  typeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 15,
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: '#171A21',
  },
  typeButtonActive: {
    backgroundColor: COLORS.cyan,
  },
  typeText: {
    color: '#B1B8C2',
    fontSize: 13,
    fontWeight: '700',
  },
  typeTextActive: {
    color: '#071014',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 30,
  },
  textEditor: {
    width: '100%',
    minHeight: 300,
    padding: 22,
    borderRadius: 18,
    backgroundColor: '#162B36',
    color: '#fff',
    fontSize: 25,
    fontWeight: '700',
    textAlign: 'center',
  },
  picker: {
    width: '100%',
    minHeight: 300,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  pickerText: {
    marginTop: 13,
    color: '#E8EAED',
    fontSize: 16,
    fontWeight: '700',
  },
  helperText: {
    marginTop: 7,
    color: '#929AA5',
    fontSize: 13,
  },
  preview: {
    position: 'relative',
    width: '100%',
    height: 430,
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: '#050505',
  },
  previewMedia: {
    width: '100%',
    height: '100%',
  },
  checkingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  checkingText: {
    marginTop: 9,
    color: '#fff',
  },
  removeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  chooseAnother: {
    marginTop: 12,
    padding: 10,
  },
  chooseAnotherText: {
    color: COLORS.cyan,
    fontWeight: '700',
  },
  caption: {
    width: '100%',
    marginTop: 14,
    padding: 14,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    color: '#fff',
  },
  status: {
    marginTop: 12,
    color: COLORS.cyan,
  },
});
