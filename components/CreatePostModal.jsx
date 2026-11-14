import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
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
import { Video } from 'expo-av';
import { EmojiKeyboard } from 'rn-emoji-keyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../config/constants';
import { createPost } from '../config/posts';
import { useResponsiveLayout } from '../config/responsive';
import Avatar from './Avatar';

const EMOJI_THEME = {
  backdrop: 'transparent',
  knob: '#303642',
  container: '#151820',
  header: '#F3F5F7',
  skinTonesContainer: '#151820',
  category: {
    icon: '#8B95A7',
    iconActive: COLORS.cyan,
    container: '#151820',
    containerActive: '#252A35',
  },
  search: {
    background: '#0B0D12',
    text: '#F3F5F7',
    placeholder: '#8B95A7',
    icon: '#8B95A7',
  },
  customButton: {
    icon: '#8B95A7',
    iconPressed: COLORS.cyan,
    background: '#151820',
    backgroundPressed: '#252A35',
  },
  emoji: { selected: 'rgba(0,229,255,0.2)' },
};

export default function CreatePostModal({
  visible,
  user,
  initialPostType = 'text',
  initialAsset = null,
  initialEmojiOpen = false,
  onClose,
  onPosted,
}) {
  const insets = useSafeAreaInsets();
  const { height, scale, horizontalGutter } = useResponsiveLayout();
  const inputRef = useRef(null);
  const [content, setContent] = useState('');
  const [asset, setAsset] = useState(initialAsset);
  const [postType, setPostType] = useState(initialPostType);
  const [emojiOpen, setEmojiOpen] = useState(initialEmojiOpen);
  const [posting, setPosting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setContent('');
    setAsset(initialAsset);
    setPostType(initialPostType);
    setEmojiOpen(initialEmojiOpen);
    setUploadStatus(null);
    if (initialEmojiOpen) Keyboard.dismiss();
    else if (!initialAsset) {
      const focusTimer = setTimeout(() => inputRef.current?.focus(), 250);
      return () => clearTimeout(focusTimer);
    }
    return undefined;
  }, [initialAsset, initialEmojiOpen, initialPostType, visible]);

  const close = () => {
    if (posting) return;
    Keyboard.dismiss();
    setEmojiOpen(false);
    onClose?.();
  };

  const handlePost = async () => {
    if (posting) return;
    setPosting(true);
    setUploadStatus(null);
    try {
      const post = await createPost({
        currentUser: user,
        textInput: content,
        postType,
        asset,
        onUploadStatus: setUploadStatus,
      });
      setContent('');
      setAsset(null);
      setEmojiOpen(false);
      onPosted?.(post, postType);
      Keyboard.dismiss();
      onClose?.();
      Alert.alert('Posted', 'Your post was shared successfully.');
    } catch (error) {
      setUploadStatus({ status: 'error', message: error.message || 'Your post could not be shared.' });
    } finally {
      setPosting(false);
    }
  };

  const canPost = !posting && (postType === 'text' ? Boolean(content.trim()) : Boolean(asset?.uri));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={close}
            disabled={posting}
            accessibilityRole="button"
            accessibilityLabel="Close create post"
          >
            <Ionicons name="close" size={25} color="#F1F4F7" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create post</Text>
          <TouchableOpacity
            style={styles.postButton}
            onPress={handlePost}
            disabled={!canPost}
            accessibilityRole="button"
            accessibilityLabel="Post"
          >
            {posting
              ? <ActivityIndicator size="small" color={COLORS.cyan} />
              : <Text style={[styles.postButtonText, !canPost && styles.disabledPost]}>Post</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentInner,
            { paddingHorizontal: horizontalGutter, paddingVertical: 16 * scale },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.authorRow}>
            <Avatar uri={user?.avatarUrl} userId={user?.$id} name={user?.name || 'You'} size={42} />
            <View>
              <Text style={styles.authorName}>{user?.name || 'You'}</Text>
              <Text style={styles.audience}>Public · MzansiReels</Text>
            </View>
          </View>
          <TextInput
            ref={inputRef}
            style={[
              styles.textInput,
              { minHeight: 145 * scale, fontSize: 20 * scale, lineHeight: 28 * scale },
            ]}
            placeholder="What's on your mind?"
            placeholderTextColor="#788290"
            value={content}
            onChangeText={setContent}
            multiline
            maxLength={2000}
            textAlignVertical="top"
            onFocus={() => setEmojiOpen(false)}
            accessibilityLabel="Post text"
          />
          {asset?.uri ? (
            <View style={[styles.previewFrame, { height: Math.min(280, Math.max(220, height * 0.35)) }]}>
              {postType === 'image' ? (
                <Image source={{ uri: asset.uri }} style={styles.preview} resizeMode="cover" />
              ) : (
                <Video
                  source={{ uri: asset.uri }}
                  style={styles.preview}
                  shouldPlay={false}
                  isMuted
                  useNativeControls
                />
              )}
              <TouchableOpacity
                style={styles.removeAsset}
                onPress={() => setAsset(null)}
                accessibilityRole="button"
                accessibilityLabel="Remove attached media"
              >
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null}
          {uploadStatus?.message ? (
            <Text style={[styles.uploadStatus, uploadStatus.status === 'error' && styles.uploadError]}>
              {uploadStatus.message}
            </Text>
          ) : null}
        </ScrollView>

        <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Text style={styles.toolbarLabel}>ADD TO YOUR POST</Text>
          <View style={styles.toolbarActions}>
            <TouchableOpacity
              style={styles.toolbarButton}
              onPress={() => {
                if (emojiOpen) {
                  setEmojiOpen(false);
                  setTimeout(() => inputRef.current?.focus(), 50);
                } else {
                  Keyboard.dismiss();
                  setEmojiOpen(true);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={emojiOpen ? 'Close emoji picker' : 'Open emoji picker'}
            >
              <Ionicons name="happy-outline" size={20} color="#FFAA32" />
              <Text style={styles.toolbarText}>Emoji</Text>
            </TouchableOpacity>
            <Text style={styles.characterCount}>{content.length}/2000</Text>
          </View>
        </View>
        {emojiOpen ? (
          <View style={[styles.emojiContainer, { height: Math.min(300, Math.max(220, height * 0.38)) }]}>
            <EmojiKeyboard
              onEmojiSelected={({ emoji }) => setContent((current) => `${current}${emoji}`)}
              theme={EMOJI_THEME}
              categoryPosition="top"
              enableSearchBar
              enableRecentlyUsed
              defaultHeight={300}
            />
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0D12' },
  header: { minHeight: 59, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: '#252A35' },
  headerButton: { width: 42, height: 40, justifyContent: 'center' },
  headerTitle: { color: '#F3F5F7', fontSize: 16, fontWeight: '800' },
  postButton: { minWidth: 42, minHeight: 40, alignItems: 'flex-end', justifyContent: 'center' },
  postButtonText: { color: COLORS.cyan, fontSize: 14, fontWeight: '900' },
  disabledPost: { color: '#52646B' },
  content: { flex: 1 },
  contentInner: { flexGrow: 1, padding: 18 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 18 },
  authorName: { color: '#F3F5F7', fontSize: 14, fontWeight: '800' },
  audience: { color: '#8B95A7', fontSize: 11, marginTop: 3 },
  textInput: { minHeight: 145, color: '#F3F5F7', fontSize: 20, lineHeight: 28, padding: 0 },
  previewFrame: { height: 280, marginTop: 14, borderRadius: 16, overflow: 'hidden', backgroundColor: '#050608' },
  preview: { width: '100%', height: '100%' },
  removeAsset: { position: 'absolute', top: 9, right: 9, width: 33, height: 33, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.7)' },
  uploadStatus: { color: COLORS.cyan, fontSize: 12, marginTop: 12 },
  uploadError: { color: COLORS.pink },
  toolbar: { paddingHorizontal: 17, paddingTop: 11, borderTopWidth: 1, borderTopColor: '#252A35', backgroundColor: '#11151C' },
  toolbarLabel: { color: '#8B95A7', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  toolbarActions: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toolbarButton: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7 },
  toolbarText: { color: '#D9E0E7', fontSize: 12, fontWeight: '700' },
  characterCount: { color: '#7D8795', fontSize: 11 },
  emojiContainer: { height: 300, backgroundColor: '#151820' },
});
