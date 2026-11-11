import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { databases, ID, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import { timeAgo } from '../config/helpers';

export default function CommentModal({
  visible,
  post,
  user,
  commentCount,
  onClose,
  onCommentAdded,
}) {
  const [comments, setComments] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchComments = useCallback(async (postId) => {
    if (!postId) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.comments, [
        Query.equal('postId', postId),
        Query.orderDesc('createdAt'),
        Query.limit(100),
      ]);
      setComments(result.documents);
      onCommentAdded?.(null, result.total);
    } catch (error) {
      console.error('Could not fetch post comments:', error);
      setErrorMessage('Could not load comments. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [onCommentAdded]);

  useEffect(() => {
    if (visible) fetchComments(post.$id);
  }, [fetchComments, post.$id, visible]);

  const addComment = async (postId, text) => {
    const trimmedText = text.trim();
    if (!trimmedText || !user?.$id || submitting) return;

    setSubmitting(true);
    let commentCreated = false;
    try {
      const createdAt = new Date().toISOString();
      const comment = await databases.createDocument(DATABASE_ID, COLLECTIONS.comments, ID.unique(), {
        postId,
        userId: user.$id,
        userName: user.username || user.name || 'User',
        avatarUrl: user.avatarUrl || '',
        text: trimmedText,
        createdAt,
      });
      commentCreated = true;
      setComments((current) => [comment, ...current]);
      setDraft('');
      onCommentAdded?.(comment, null);

      const [postDocument, commentResult] = await Promise.all([
        databases.getDocument(DATABASE_ID, COLLECTIONS.posts, postId),
        databases.listDocuments(DATABASE_ID, COLLECTIONS.comments, [
          Query.equal('postId', postId),
          Query.limit(1),
        ]),
      ]);
      const updatedPost = await databases.updateDocument(DATABASE_ID, COLLECTIONS.posts, postId, {
        commentCount: Math.max(Number(postDocument.commentCount) || 0, commentResult.total),
      });
      onCommentAdded?.(null, Number(updatedPost.commentCount));
    } catch (error) {
      console.error('Could not add post comment or update its count:', error);
      if (commentCreated) {
        Alert.alert('Comment posted', 'Your comment was saved, but the post count could not be updated.');
        await fetchComments(postId);
      } else {
        Alert.alert('Comment could not be posted', 'Please check the comments collection attributes and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderComment = ({ item }) => {
    const timestamp = item.createdAt || item.$createdAt;
    return (
      <View style={styles.commentRow}>
        <Avatar uri={item.avatarUrl} userId={item.userId} name={item.userName} size={38} />
        <View style={styles.commentBody}>
          <View style={styles.commentMeta}>
            <Text style={styles.commentUser} numberOfLines={1}>{item.userName || 'User'}</Text>
            <Text style={styles.commentTime}>{timestamp ? timeAgo(timestamp) : 'Just now'}</Text>
          </View>
          <Text style={styles.commentText}>{item.text}</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={styles.dismissArea}
          activeOpacity={1}
          onPress={onClose}
          accessibilityLabel="Close comments"
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{commentCount} comments</Text>
              <Text style={styles.postPreview} numberOfLines={2}>
                {post.content?.trim() || 'Comment on this post'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close comments"
            >
              <Ionicons name="close" size={23} color="#E5E9ED" />
            </TouchableOpacity>
          </View>

          {loading && comments.length === 0 ? (
            <View style={styles.listState}>
              <ActivityIndicator color={COLORS.cyan} />
            </View>
          ) : errorMessage && comments.length === 0 ? (
            <TouchableOpacity style={styles.listState} onPress={() => fetchComments(post.$id)}>
              <Text style={styles.stateText}>{errorMessage}</Text>
              <Text style={styles.retryText}>Tap to retry</Text>
            </TouchableOpacity>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.$id}
              renderItem={renderComment}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={comments.length ? styles.commentList : styles.emptyList}
              ListEmptyComponent={(
                <View style={styles.emptyState}>
                  <Ionicons name="chatbubble-ellipses-outline" size={32} color={COLORS.muted} />
                  <Text style={styles.stateText}>Be the first to comment.</Text>
                </View>
              )}
            />
          )}

          <View style={styles.inputRow}>
            <Avatar uri={user?.avatarUrl} userId={user?.$id} name={user?.username || user?.name} size={34} />
            <TextInput
              style={styles.input}
              placeholder="Add a comment..."
              placeholderTextColor="#7F8994"
              value={draft}
              onChangeText={setDraft}
              editable={!submitting}
              multiline
              maxLength={1000}
              returnKeyType="default"
              accessibilityLabel="Write a comment"
            />
            <TouchableOpacity
              style={[styles.sendButton, (!draft.trim() || submitting) && styles.sendDisabled]}
              onPress={() => addComment(post.$id, draft)}
              disabled={!draft.trim() || submitting}
              accessibilityRole="button"
              accessibilityLabel="Send comment"
            >
              {submitting
                ? <ActivityIndicator size="small" color="#061116" />
                : <Ionicons name="arrow-up" size={20} color="#061116" />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.64)' },
  dismissArea: { flex: 1 },
  sheet: { height: '78%', paddingTop: 10, paddingHorizontal: 17, paddingBottom: Platform.OS === 'ios' ? 24 : 14, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: '#292F38', backgroundColor: '#12151B' },
  handle: { width: 40, height: 4, alignSelf: 'center', borderRadius: 3, backgroundColor: '#5D6671', marginBottom: 13 },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: '#252B34' },
  headerCopy: { flex: 1, paddingRight: 12 },
  title: { color: '#F3F5F7', fontSize: 16, fontWeight: '800' },
  postPreview: { color: '#929BA6', fontSize: 12, lineHeight: 17, marginTop: 4 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#20252D' },
  commentList: { paddingVertical: 6 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12 },
  commentBody: { flex: 1, marginLeft: 10 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  commentUser: { maxWidth: '75%', color: '#F1F4F7', fontSize: 12, fontWeight: '800' },
  commentTime: { color: '#7F8994', fontSize: 10, marginLeft: 8 },
  commentText: { color: '#D5DAE0', fontSize: 13, lineHeight: 19 },
  listState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 25 },
  emptyState: { alignItems: 'center', justifyContent: 'center' },
  stateText: { color: '#939DA8', fontSize: 13, textAlign: 'center', marginTop: 8 },
  retryText: { color: COLORS.cyan, fontSize: 12, fontWeight: '700', marginTop: 9 },
  inputRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#252B34' },
  input: { flex: 1, maxHeight: 88, color: '#F1F4F7', fontSize: 13, paddingHorizontal: 12, paddingVertical: 9, marginHorizontal: 8, borderRadius: 20, backgroundColor: '#20252D' },
  sendButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: COLORS.cyan },
  sendDisabled: { opacity: 0.45 },
});
