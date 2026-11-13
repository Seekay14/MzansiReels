import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Avatar from './Avatar';
import { COLLECTIONS, COLORS } from '../config/constants';
import { getUserDocs, requireAuth, timeAgo } from '../config/helpers';
import {
  addPostComment,
  addVideoComment,
  fetchLikedCommentIds,
  fetchPostComments,
  fetchVideoComments,
  toggleCommentLike,
  togglePostCommentLike,
} from '../config/postCommentService';

function flattenCommentThreads(comments) {
  const commentsById = new Map(comments.map((comment) => [comment.$id, comment]));
  const childrenByParentId = new Map();
  const roots = [];

  comments.forEach((comment) => {
    if (comment.parentId && commentsById.has(comment.parentId)) {
      const children = childrenByParentId.get(comment.parentId) || [];
      children.push(comment);
      childrenByParentId.set(comment.parentId, children);
    } else {
      roots.push(comment);
    }
  });

  const flattened = [];
  const appendThread = (comment, depth) => {
    flattened.push({ ...comment, replyDepth: depth });
    (childrenByParentId.get(comment.$id) || []).forEach((child) => appendThread(child, depth + 1));
  };
  roots.forEach((comment) => appendThread(comment, 0));
  return flattened;
}

export default function PostCommentModal({
  visible,
  postId,
  videoId,
  user,
  navigation,
  onClose,
  onOpenProfile,
  onCommentAdded,
  onCommentsLoaded,
}) {
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState([]);
  const [likedCommentIds, setLikedCommentIds] = useState(() => new Set());
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [verifiedUserIds, setVerifiedUserIds] = useState(() => new Set());
  const translateY = useRef(new Animated.Value(700)).current;
  const likingCommentIds = useRef(new Set());
  const onCommentsLoadedRef = useRef(onCommentsLoaded);
  onCommentsLoadedRef.current = onCommentsLoaded;
  const isVideoComment = Boolean(videoId);
  const contentId = videoId || postId;

  const loadComments = useCallback(async () => {
    if (!contentId) return;
    setLoading(true);
    setErrorMessage('');
    try {
      const fetchedComments = isVideoComment
        ? await fetchVideoComments(contentId)
        : await fetchPostComments(contentId);
      setComments(fetchedComments);
      setLikedCommentIds(await fetchLikedCommentIds(fetchedComments.map((comment) => comment.$id), user?.$id));
      const authorIds = [...new Set(fetchedComments.map((comment) => comment.userId).filter(Boolean))];
      const profiles = await getUserDocs(authorIds);
      setVerifiedUserIds(new Set(
        profiles.filter((profile) => profile?.isVerified === true).map((profile) => profile.userId),
      ));
      onCommentsLoadedRef.current?.(fetchedComments.length);
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message || 'Could not load comments. Tap to retry.');
    } finally {
      setLoading(false);
    }
  }, [contentId, isVideoComment, user?.$id]);


  useEffect(() => {
    if (!visible) return undefined;
    translateY.setValue(700);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 24,
      stiffness: 220,
    }).start();
    loadComments();
    return undefined;
  }, [loadComments, translateY, visible]);

  const close = () => {
    Animated.timing(translateY, {
      toValue: 700,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose?.();
    });
  };

  const send = async () => {
    const text = draft.trim();
    const actionName = isVideoComment ? 'comment on this Reel' : 'comment on this post';
    if (!requireAuth(actionName, navigation, user) || !text || sending || !contentId) return;
    setSending(true);
    try {
      const comment = isVideoComment
        ? await addVideoComment(contentId, text, user, replyTo?.$id || '')
        : await addPostComment(contentId, text, user, replyTo?.$id || '', (error) => {
          Alert.alert(
            'Comment posted',
            `Your comment was saved, but the post comment count could not be updated: ${error.message || 'Unknown error'}`,
          );
        });
      setComments((current) => [...current, comment]);
      setDraft('');
      setReplyTo(null);
      onCommentAdded?.(comment);
    } catch (error) {
      console.error(error);
      setErrorMessage(error.message || 'Could not post your comment.');
      Alert.alert('Comment failed', error.message || 'Could not post your comment.');
    } finally {
      setSending(false);
    }
  };

  const likeComment = async (comment) => {
    if (!requireAuth('like this comment', navigation, user) || likingCommentIds.current.has(comment.$id)) return;
    likingCommentIds.current.add(comment.$id);
    const wasLiked = likedCommentIds.has(comment.$id);
    const previousLikes = Number(comment.likes) || 0;
    setLikedCommentIds((current) => {
      const next = new Set(current);
      if (wasLiked) next.delete(comment.$id);
      else next.add(comment.$id);
      return next;
    });
    setComments((current) => current.map((item) => (
      item.$id === comment.$id
        ? { ...item, likes: Math.max(0, previousLikes + (wasLiked ? -1 : 1)) }
        : item
    )));

    try {
      const result = isVideoComment
        ? await toggleCommentLike(comment.$id, user.$id, COLLECTIONS.comments, previousLikes)
        : await togglePostCommentLike(comment.$id, user.$id, previousLikes);
      setLikedCommentIds((current) => {
        const next = new Set(current);
        if (result.isLiked) next.add(comment.$id);
        else next.delete(comment.$id);
        return next;
      });
      setComments((current) => current.map((item) => (
        item.$id === comment.$id ? { ...item, likes: result.likes } : item
      )));
    } catch (error) {
      console.error('Could not update comment like:', error);
      setLikedCommentIds((current) => {
        const next = new Set(current);
        if (wasLiked) next.add(comment.$id);
        else next.delete(comment.$id);
        return next;
      });
      setComments((current) => current.map((item) => (
        item.$id === comment.$id ? { ...item, likes: previousLikes } : item
      )));
      Alert.alert('Like failed', error.message || 'Could not update the comment like.');
    } finally {
      likingCommentIds.current.delete(comment.$id);
    }
  };

  const renderComment = ({ item }) => {
    const timestamp = item.createdAt || item.$createdAt;
    const openAuthorProfile = () => onOpenProfile?.(item.userId, item.userName);
    return (
      <View style={[
        styles.commentRow,
        item.replyDepth > 0 && styles.replyRow,
        item.replyDepth > 0 && { marginLeft: Math.min(item.replyDepth * 24, 72) },
      ]}>
        <TouchableOpacity
          onPress={openAuthorProfile}
          disabled={!onOpenProfile || !item.userId}
          accessibilityRole="button"
          accessibilityLabel={`View ${item.userName || 'commenter'} profile`}
        >
          <Avatar
            uri={item.avatarUrl}
            userId={item.userId}
            name={item.userName}
            size={item.replyDepth > 0 ? 30 : 40}
          />
        </TouchableOpacity>
        <View style={[styles.commentBody, item.replyDepth > 0 && styles.replyBody]}>
          <View style={styles.commentMeta}>
            <TouchableOpacity
              style={styles.commentAuthor}
              onPress={openAuthorProfile}
              disabled={!onOpenProfile || !item.userId}
              accessibilityRole="button"
              accessibilityLabel={`View ${item.userName || 'commenter'} profile`}
            >
              <Text style={styles.userName} numberOfLines={1}>{item.userName || 'User'}</Text>
              {verifiedUserIds.has(item.userId) ? (
                <Ionicons name="checkmark-circle" size={14} color={COLORS.cyan} />
              ) : null}
            </TouchableOpacity>
            <Text style={styles.time}>· {timestamp ? timeAgo(timestamp) : 'Just now'}</Text>
          </View>
          <View style={[styles.commentBubble, item.replyDepth > 0 && styles.replyBubble]}>
            <Text style={styles.commentText}>{item.text}</Text>
          </View>
          <View style={styles.commentActions}>
            <TouchableOpacity
              style={styles.commentAction}
              onPress={() => {
                if (requireAuth('reply to this comment', navigation, user)) setReplyTo(item);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Reply to ${item.userName || 'comment'}`}
            >
              <Text style={styles.replyActionText}>Reply</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.commentAction}
              onPress={() => likeComment(item)}
              accessibilityRole="button"
              accessibilityLabel={likedCommentIds.has(item.$id) ? 'Unlike comment' : 'Like comment'}
            >
              <Ionicons
                name={likedCommentIds.has(item.$id) ? 'heart' : 'heart-outline'}
                size={15}
                color={likedCommentIds.has(item.$id) ? COLORS.cyan : '#929AA5'}
              />
              <Text style={styles.likeCount}>{Number(item.likes) || 0}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const displayComments = flattenCommentThreads(comments);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.dismissArea}
          activeOpacity={1}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close comments"
        />
        <KeyboardAvoidingView
          style={styles.keyboardAvoider}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 12), transform: [{ translateY }] },
            ]}
          >
            <View style={styles.header}>
              <View style={styles.headerSpacer} />
              <Text style={styles.title}>Comments</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel="Close comments"
              >
                <Ionicons name="close" size={23} color="#E5E9ED" />
              </TouchableOpacity>
            </View>

            {loading && comments.length === 0 ? (
              <View style={styles.state}>
                <ActivityIndicator color={COLORS.cyan} />
              </View>
            ) : errorMessage && comments.length === 0 ? (
              <TouchableOpacity style={styles.state} onPress={loadComments}>
                <Text style={styles.stateText}>{errorMessage}</Text>
                <Text style={styles.retryText}>Tap to retry</Text>
              </TouchableOpacity>
            ) : (
              <FlatList
                data={displayComments}
                keyExtractor={(item) => item.$id}
                renderItem={renderComment}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={comments.length ? styles.list : styles.emptyList}
                refreshControl={(
                  <RefreshControl
                    refreshing={loading && comments.length > 0}
                    onRefresh={loadComments}
                    tintColor={COLORS.cyan}
                  />
                )}
                ListEmptyComponent={(
                  <View style={styles.emptyState}>
                    <Ionicons name="chatbubble-ellipses-outline" size={32} color={COLORS.muted} />
                    <Text style={styles.stateText}>Be the first to comment.</Text>
                  </View>
                )}
              />
            )}

            {errorMessage && comments.length > 0 ? (
              <Text style={styles.inlineError}>{errorMessage}</Text>
            ) : null}
            {replyTo ? (
              <View style={styles.replyingBanner}>
                <Text style={styles.replyingText}>Replying to {replyTo.userName || 'comment'}</Text>
                <TouchableOpacity
                  onPress={() => setReplyTo(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel reply"
                >
                  <Ionicons name="close" size={18} color={COLORS.muted} />
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={styles.composer}>
              <Avatar uri={user?.avatarUrl} userId={user?.$id} name={user?.name} size={36} />
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder={replyTo ? 'Write a reply...' : 'Add a comment...'}
                placeholderTextColor="#7E8792"
                multiline
                maxLength={2000}
                editable={!sending}
                accessibilityLabel="Write a comment"
              />
              <TouchableOpacity
                style={styles.sendButton}
                onPress={send}
                disabled={!draft.trim() || sending}
                accessibilityRole="button"
                accessibilityLabel="Send comment"
              >
                {sending
                  ? <ActivityIndicator size="small" color={COLORS.cyan} />
                  : <Ionicons name="send" size={20} color={draft.trim() ? COLORS.cyan : '#626C78'} />}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.58)' },
  dismissArea: { ...StyleSheet.absoluteFillObject },
  keyboardAvoider: { flex: 1, justifyContent: 'flex-end' },
  sheet: { height: '78%', backgroundColor: '#11141A', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, borderColor: '#292E37', overflow: 'hidden' },
  header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerSpacer: { width: 44 },
  title: { flex: 1, color: '#F3F5F7', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 10 },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20 },
  replyRow: { marginBottom: 14 },
  commentBody: { flex: 1, marginLeft: 11 },
  replyBody: { marginLeft: 8 },
  commentMeta: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  commentAuthor: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  userName: { color: '#F3F5F7', fontSize: 13, fontWeight: '800' },
  time: { color: '#818B96', fontSize: 12, marginLeft: 6 },
  commentBubble: { paddingVertical: 10, paddingHorizontal: 0, borderRadius: 13, backgroundColor: '#1A1E26' },
  replyBubble: { backgroundColor: '#202630' },
  commentText: { color: '#DCE1E6', fontSize: 14, lineHeight: 20 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 15, marginTop: 7 },
  commentAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 26, paddingHorizontal: 7, borderRadius: 13, backgroundColor: '#1A1E26' },
  replyActionText: { color: '#AAB3BD', fontSize: 11, fontWeight: '700' },
  likeCount: { color: '#929AA5', fontSize: 11 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  stateText: { color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: 9 },
  retryText: { color: COLORS.cyan, fontSize: 12, fontWeight: '700', marginTop: 7 },
  emptyState: { alignItems: 'center', justifyContent: 'center' },
  inlineError: { color: '#FF8A8A', fontSize: 12, paddingHorizontal: 16, paddingBottom: 6 },
  replyingBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 6, borderTopWidth: 1, borderTopColor: COLORS.border },
  replyingText: { color: COLORS.cyan, fontSize: 12 },
  composer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  input: { flex: 1, maxHeight: 90, minHeight: 42, color: '#F3F5F7', backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#30343A', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10, marginLeft: 10, fontSize: 14 },
  sendButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
});
