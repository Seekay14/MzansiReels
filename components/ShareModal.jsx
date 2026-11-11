import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../config/constants';
import { getVideoThumbnail, sharePost } from '../config/helpers';

function showSuccessAlert() {
  if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
    globalThis.alert('Post shared to your profile.');
    return;
  }
  Alert.alert('Shared!', 'Post shared to your profile.');
}

export default function ShareModal({
  visible,
  originalPost,
  currentUser,
  onClose,
  onShared,
}) {
  const [newCaption, setNewCaption] = useState('');
  const [sharing, setSharing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const postAuthor = originalPost?.sharedFromName || originalPost?.userName || 'Mzansi Creator';

  useEffect(() => {
    setNewCaption('');
  }, [originalPost?.$id, visible]);

  useEffect(() => {
    if (!originalPost) {
      setPreviewUrl('');
      return;
    }
    if (originalPost.imageUrl) {
      setPreviewUrl(originalPost.imageUrl);
      return;
    }
    if (!originalPost.videoUrl) {
      setPreviewUrl('');
      return;
    }
    try {
      setPreviewUrl(getVideoThumbnail(originalPost.videoUrl, originalPost.thumbnailUrl));
    } catch (error) {
      console.error('Could not create post share preview:', error);
      setPreviewUrl('');
    }
  }, [originalPost]);

  const submitShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const { sharedPost, originalShares, originalPostId } = await sharePost(
        originalPost,
        currentUser,
        newCaption,
      );
      onShared?.(sharedPost, originalShares, originalPostId);
      onClose?.();
      showSuccessAlert();
    } catch (error) {
      console.error('Could not share post to profile:', error);
      const message = error.message || 'Could not share this post. Please try again.';
      if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
        globalThis.alert(`Share failed\n\n${message}`);
      } else {
        Alert.alert('Share failed', message);
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
        accessibilityLabel="Close share dialog"
      >
        <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={styles.title}>Share to your profile</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.closeButton}
            >
              <Ionicons name="close" size={21} color="#DCE2E8" />
            </TouchableOpacity>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <TextInput
              style={styles.captionInput}
              value={newCaption}
              onChangeText={setNewCaption}
              placeholder="Add your thoughts…"
              placeholderTextColor="#7F8994"
              multiline
              maxLength={500}
              textAlignVertical="top"
              accessibilityLabel="Add your thoughts"
            />
            <View style={styles.preview}>
              {previewUrl ? (
                <Image source={{ uri: previewUrl }} style={styles.previewImage} resizeMode="cover" />
              ) : (
                <View style={styles.previewPlaceholder}>
                  <Ionicons name="document-text-outline" size={25} color={COLORS.cyan} />
                </View>
              )}
              <View style={styles.previewText}>
                <Text style={styles.previewAuthor} numberOfLines={1}>{postAuthor}</Text>
                <Text style={styles.previewContent} numberOfLines={3}>
                  {originalPost?.content || (originalPost?.postType === 'video' ? 'Video post' : 'Shared post')}
                </Text>
                {originalPost?.postType === 'video' ? (
                  <View style={styles.mediaLabel}>
                    <Ionicons name="videocam-outline" size={13} color="#AAB2BD" />
                    <Text style={styles.mediaLabelText}>Video</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </ScrollView>
          <TouchableOpacity
            style={[styles.shareButton, sharing && styles.disabledButton]}
            onPress={submitShare}
            disabled={sharing}
            accessibilityRole="button"
          >
            {sharing ? (
              <ActivityIndicator color="#071014" />
            ) : (
              <>
                <Ionicons name="repeat-outline" size={20} color="#071014" />
                <Text style={styles.shareButtonText}>Share to your Profile</Text>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.64)' },
  sheet: {
    maxHeight: '82%',
    paddingHorizontal: 20,
    paddingTop: 11,
    paddingBottom: 26,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#2C323B',
    backgroundColor: '#171A21',
  },
  handle: { width: 40, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: '#59616B', marginBottom: 13 },
  titleRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { color: '#F3F5F7', fontSize: 17, fontWeight: '800' },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: '#242932' },
  scrollContent: { paddingBottom: 12 },
  captionInput: {
    minHeight: 94,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#333B45',
    backgroundColor: '#11141A',
    color: '#F3F5F7',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  preview: { minHeight: 112, flexDirection: 'row', overflow: 'hidden', borderRadius: 14, borderWidth: 1, borderColor: '#303640', backgroundColor: '#11141A' },
  previewImage: { width: 104, minHeight: 112, backgroundColor: '#20242C' },
  previewPlaceholder: { width: 104, minHeight: 112, alignItems: 'center', justifyContent: 'center', backgroundColor: '#20242C' },
  previewText: { flex: 1, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 11 },
  previewAuthor: { color: '#E8EDF2', fontSize: 13, fontWeight: '800', marginBottom: 5 },
  previewContent: { color: '#AAB2BD', fontSize: 12, lineHeight: 17 },
  mediaLabel: { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
  mediaLabelText: { color: '#AAB2BD', fontSize: 10, marginLeft: 4 },
  shareButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRadius: 14,
    backgroundColor: COLORS.cyan,
  },
  disabledButton: { opacity: 0.65 },
  shareButtonText: { color: '#071014', fontSize: 14, fontWeight: '900' },
});
