import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { databases, ID, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import { getUserDoc, requireAuth, timeAgo, togglePostLike } from '../config/helpers';
import Avatar from './Avatar';
import AnalyticsModal from './AnalyticsModal';
import PostCommentModal from './PostCommentModal';
import ShareModal from './ShareModal';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTheme } from '../context/ThemeContext';

function InlinePostVideo({ uri }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.muted = true;
  });

  return (
    <VideoView
      player={player}
      style={styles.postVideo}
      contentFit="contain"
      nativeControls
    />
  );
}

function findUrl(content) {
  const match = content?.match(/https?:\/\/[^\s<]+/i);
  if (!match) return null;
  return match[0].replace(/[),.!?]+$/, '');
}

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatNumber(value) {
  const count = Number(value) || 0;
  if (count < 1000) return String(count);
  const units = [
    { value: 1e9, suffix: 'b' },
    { value: 1e6, suffix: 'm' },
    { value: 1e3, suffix: 'k' },
  ];
  const unit = units.find(({ value: threshold }) => count >= threshold);
  return `${Number((count / unit.value).toFixed(1))}${unit.suffix}`;
}

export default function TextPostCard({ post, user, navigation, onHide, onDelete, onShared, desktop = false }) {
  const { colors } = useTheme();
  const [likes, setLikes] = useState(Number(post.likes) || 0);
  const [views, setViews] = useState(Number(post.views) || 0);
  const [shares, setShares] = useState(Number(post.shares) || 0);
  const [liked, setLiked] = useState(false);
  const [liking, setLiking] = useState(false);
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [analyticsModalVisible, setAnalyticsModalVisible] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [commentCount, setCommentCount] = useState(Number(post.commentCount) || 0);
  const [authorVerified, setAuthorVerified] = useState(post.isVerified === true);
  const link = findUrl(post.content || '');
  const isOwner = user?.$id === post.userId;
  const postedAt = post.uploadedAt || post.$createdAt;

  useEffect(() => {
    setLikes(Number(post.likes) || 0);
  }, [post.likes]);

  useEffect(() => {
    setViews(Number(post.views) || 0);
  }, [post.views]);

  useEffect(() => {
    setShares(Number(post.shares) || 0);
  }, [post.shares]);

  useEffect(() => {
    let active = true;
    if (!user?.$id) {
      setLiked(false);
      return undefined;
    }
    databases.listDocuments(DATABASE_ID, COLLECTIONS.postLikes, [
      Query.equal('postId', post.$id),
      Query.equal('userId', user.$id),
      Query.limit(1),
    ]).then((result) => {
      if (active) setLiked(Boolean(result.documents[0]));
    }).catch((error) => {
      console.error('Could not load post like status:', error);
    });
    return () => {
      active = false;
    };
  }, [post.$id, user?.$id]);

  useEffect(() => {
    let active = true;
    databases.listDocuments(DATABASE_ID, COLLECTIONS.postComments, [
      Query.equal('postId', post.$id),
      Query.limit(1),
    ]).then((result) => {
      if (active) setCommentCount(result.total);
    }).catch((error) => {
      console.error('Could not load post comment count:', error);
    });
    return () => {
      active = false;
    };
  }, [post.$id]);

  useEffect(() => {
    let active = true;
    if (!post.userId) {
      setAuthorVerified(false);
      return undefined;
    }
    getUserDoc(post.userId).then((profile) => {
      if (active) setAuthorVerified(profile?.isVerified === true);
    }).catch((error) => {
      console.error('Could not load post author verification status:', error);
    });
    return () => {
      active = false;
    };
  }, [post.userId]);

  const handleLike = async () => {
    if (!requireAuth('like this post', navigation, user) || liking) return;
    const previousLiked = liked;
    const previousLikes = likes;
    const nextLiked = !previousLiked;
    setLiking(true);
    setLiked(nextLiked);
    setLikes(Math.max(0, previousLikes + (nextLiked ? 1 : -1)));
    try {
      const result = await togglePostLike(post.$id, user.$id, previousLikes, user.name, user.avatarUrl);
      setLikes(result.likes);
      setLiked(result.isLiked);
    } catch (error) {
      setLiked(previousLiked);
      setLikes(previousLikes);
      console.error('Could not update post like:', error);
      Alert.alert('Like failed', error.message || 'Could not update your like.');
    } finally {
      setLiking(false);
    }
  };

  const copyLink = async () => {
    if (!requireAuth('share this post', navigation, user)) return;
    try {
      const shareUrl = post.imageUrl || post.videoUrl || `mzansireels://post/${post.$id}`;
      await Clipboard.setStringAsync(shareUrl);
      setOptionsVisible(false);
      Alert.alert('Link copied', 'The post link has been copied.');
    } catch (error) {
      console.error('Could not copy post link:', error);
      Alert.alert('Copy failed', error.message || 'Could not copy the post link.');
    }
  };

  const savePost = async () => {
    if (!requireAuth('bookmark this post', navigation, user) || saving) return;
    setSaving(true);
    try {
      const existing = await databases.listDocuments(DATABASE_ID, COLLECTIONS.bookmarks, [
        Query.equal('postId', post.$id),
        Query.equal('userId', user.$id),
        Query.limit(1),
      ]);
      if (!existing.documents[0]) {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.bookmarks, ID.unique(), {
          postId: post.$id,
          userId: user.$id,
        });
      }
      setOptionsVisible(false);
      Alert.alert('Post saved', 'You can find this post in your saved items.');
    } catch (error) {
      console.error('Could not save post:', error);
      Alert.alert('Save failed', error.message || 'Could not save this post.');
    } finally {
      setSaving(false);
    }
  };

  const deletePost = () => {
    setOptionsVisible(false);
    Alert.alert('Delete post?', 'This post will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete Post',
        style: 'destructive',
        onPress: async () => {
          try {
            await databases.deleteDocument(DATABASE_ID, COLLECTIONS.posts, post.$id);
            onDelete?.(post.$id);
          } catch (error) {
            console.error('Could not delete post:', error);
            Alert.alert('Delete failed', error.message || 'Could not delete this post.');
          }
        },
      },
    ]);
  };

  const openLink = async () => {
    if (!link) return;
    try {
      await Linking.openURL(link);
    } catch (error) {
      console.error('Could not open post link:', error);
      Alert.alert('Could not open link', error.message || link);
    }
  };

  const domain = link ? getDomain(link) : '';

  const handleCommentUpdate = useCallback((comment, count) => {
    if (typeof count === 'number') {
      setCommentCount(count);
    } else if (comment) {
      setCommentCount((current) => current + 1);
    }
  }, []);
  const openProfile = (userId, userName) => {
    if (!userId) return;
    navigation.navigate('UserProfile', { userId, userName });
  };

  return (
    <>
      <View style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        desktop && styles.desktopCard,
        desktop && { backgroundColor: colors.card, borderColor: colors.border },
      ]}>
        <View style={styles.postHeader}>
          <TouchableOpacity
            onPress={() => openProfile(post.userId, post.userName)}
            accessibilityRole="button"
            accessibilityLabel={`View ${post.userName || 'creator'} profile`}
          >
            <Avatar
              userId={post.userId}
              fallbackUrl={post.avatarUrl}
              name={post.userName}
              size={44}
            />
          </TouchableOpacity>
          <View style={styles.authorInfo}>
            <TouchableOpacity
              style={styles.authorNameRow}
              onPress={() => openProfile(post.userId, post.userName)}
              disabled={!post.userId}
              accessibilityRole="button"
              accessibilityLabel={`View ${post.userName || 'creator'} profile`}
            >
              <Text style={[styles.authorName, { color: colors.text }]}>{post.userName || 'Mzansi Creator'}</Text>
              {authorVerified ? (
                <Ionicons name="checkmark-circle" size={15} color={COLORS.cyan} />
              ) : null}
            </TouchableOpacity>
            <View style={styles.postMeta}>
              <Text style={[styles.postTime, { color: colors.muted }]}>{postedAt ? timeAgo(postedAt) : 'Recently'}</Text>
              {isOwner ? (
                <>
                  <TouchableOpacity
                    style={styles.analyticsButton}
                    onPress={() => setAnalyticsModalVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="View post analytics"
                  >
                    <Ionicons name="bar-chart-outline" size={14} color={COLORS.cyan} />
                  </TouchableOpacity>
                  <Text style={[styles.postTime, { color: colors.muted }]}> · {formatNumber(views)} Views</Text>
                </>
              ) : null}
            </View>
          </View>
          <TouchableOpacity
            style={styles.optionsButton}
            onPress={() => setOptionsVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Post options"
          >
            <Ionicons name="ellipsis-horizontal" size={20} color="#AAB1BA" />
          </TouchableOpacity>
        </View>

        {post.sharedFromName ? (
          <View style={styles.sharedFromBanner}>
            <Ionicons name="repeat-outline" size={16} color={COLORS.cyan} />
            <Text style={styles.sharedFromPrefix}>Shared from </Text>
            <TouchableOpacity
              onPress={() => openProfile(post.sharedFromUserId || post.userId, post.sharedFromName)}
              disabled={!post.sharedFromUserId && !post.userId}
              accessibilityRole="button"
              accessibilityLabel={`View ${post.sharedFromName} profile`}
            >
              <Text style={styles.sharedFromName} numberOfLines={1}>
                @{String(post.sharedFromName).replace(/^@+/, '')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {post.content ? <Text style={[styles.postContent, { color: colors.text }]}>{post.content}</Text> : null}
        {post.postType === 'image' && post.imageUrl ? (
          <Image source={{ uri: post.imageUrl }} style={styles.postImage} resizeMode="cover" />
        ) : null}
        {post.postType === 'video' && post.videoUrl ? <InlinePostVideo uri={post.videoUrl} /> : null}

        {link ? (
          <TouchableOpacity style={styles.linkPreview} onPress={openLink} accessibilityRole="button">
            <View style={styles.linkPreviewImage}>
              <Ionicons name="link-outline" size={24} color={COLORS.cyan} />
            </View>
            <View style={styles.linkCopy}>
              <Text style={styles.linkDomain} numberOfLines={1}>{domain}</Text>
              <Text style={styles.linkUrl} numberOfLines={1}>{link}</Text>
            </View>
            <Text style={styles.visitLink}>Visit Link</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.actions}>
          <View style={styles.engagementActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleLike}
              disabled={liking}
              accessibilityRole="button"
              accessibilityLabel={liked ? 'Unlike post' : 'Like post'}
            >
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? COLORS.cyan : '#AAB1BA'} />
              <Text style={[styles.actionCount, liked && styles.likedCount]}>{formatNumber(likes)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.commentButton}
              onPress={() => {
                if (requireAuth('comment on this post', navigation, user)) setCommentModalVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`View ${commentCount} comments`}
            >
              <Ionicons name="chatbubble-outline" size={19} color="#AAB1BA" />
              <Text style={styles.actionCount}>{formatNumber(commentCount)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                if (requireAuth('share this post', navigation, user)) setShareModalVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Share post, ${shares} shares`}
            >
              <Ionicons name="repeat-outline" size={20} color="#AAB1BA" />
              <Text style={styles.actionCount}>{formatNumber(shares)}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {isOwner && commentCount > 0 ? (
          <TouchableOpacity
            style={styles.viewCommentsButton}
            onPress={() => {
              if (requireAuth('comment on this post', navigation, user)) setCommentModalVisible(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={`View ${commentCount} replies`}
          >
            <Text style={styles.viewCommentsText}>View {formatNumber(commentCount)} replies</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <PostCommentModal
        visible={commentModalVisible}
        postId={post.$id}
        user={user}
        navigation={navigation}
        onOpenProfile={openProfile}
        onClose={() => setCommentModalVisible(false)}
        onCommentAdded={handleCommentUpdate}
      />

      <AnalyticsModal
        visible={isOwner && analyticsModalVisible}
        post={{ ...post, likes, views, shares }}
        commentCount={commentCount}
        onClose={() => setAnalyticsModalVisible(false)}
      />

      <ShareModal
        visible={shareModalVisible}
        originalPost={post}
        currentUser={user}
        onClose={() => setShareModalVisible(false)}
        onShared={(sharedPost, originalShares, originalPostId) => {
          setShares(originalShares);
          onShared?.(sharedPost, originalShares, originalPostId);
        }}
      />

      <Modal
        visible={optionsVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOptionsVisible(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setOptionsVisible(false)}
          accessibilityLabel="Close post options"
        >
          <TouchableOpacity activeOpacity={1} style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Post options</Text>
            {isOwner && (
              <TouchableOpacity style={styles.sheetRow} onPress={deletePost} accessibilityRole="button">
                <Ionicons name="trash-outline" size={21} color="#FF5B67" />
                <Text style={styles.deleteText}>Delete Post</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.sheetRow} onPress={copyLink} accessibilityRole="button">
              <Ionicons name="link-outline" size={21} color="#E5E9ED" />
              <Text style={styles.sheetActionText}>Copy Link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sheetRow} onPress={savePost} disabled={saving} accessibilityRole="button">
              {saving
                ? <ActivityIndicator size="small" color={COLORS.cyan} />
                : <Ionicons name="bookmark-outline" size={21} color="#E5E9ED" />}
              <Text style={styles.sheetActionText}>{saving ? 'Saving…' : 'Save Post'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                setOptionsVisible(false);
                onHide?.(post.$id);
              }}
              accessibilityRole="button"
            >
              <Ionicons name="eye-off-outline" size={21} color="#E5E9ED" />
              <Text style={styles.sheetActionText}>Not Interested</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setOptionsVisible(false)} accessibilityRole="button">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: { paddingTop: 14, paddingHorizontal: 15, paddingBottom: 8, marginHorizontal: 10, marginBottom: 11, borderWidth: 1, borderColor: '#252A33', borderRadius: 16, backgroundColor: '#14171E' },
  desktopCard: { width: '100%', maxWidth: 600, alignSelf: 'center', marginHorizontal: 0, marginVertical: 8, borderRadius: 8, borderColor: '#3A3B3C', backgroundColor: '#242526' },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 11 },
  authorInfo: { flex: 1, marginLeft: 10 },
  authorNameRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5 },
  authorName: { color: '#F2F4F6', fontSize: 14, fontWeight: '800' },
  postMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  postTime: { color: '#858E99', fontSize: 10 },
  analyticsButton: { width: 23, height: 20, alignItems: 'center', justifyContent: 'center', marginLeft: 5 },
  optionsButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  postContent: { color: '#E1E5E9', fontSize: 14, lineHeight: 21, marginBottom: 11 },
  sharedFromBanner: { flexDirection: 'row', alignItems: 'center', marginBottom: 9, paddingVertical: 5 },
  sharedFromPrefix: { color: '#9BA4AE', fontSize: 12, marginLeft: 7 },
  sharedFromName: { color: COLORS.cyan, fontSize: 12, fontWeight: '800', maxWidth: 180 },
  postImage: { width: '100%', aspectRatio: 1, maxHeight: 440, borderRadius: 12, backgroundColor: '#0A0A0F', marginBottom: 9 },
  postVideo: { width: '100%', height: 300, borderRadius: 12, overflow: 'hidden', backgroundColor: '#050506', marginBottom: 9 },
  linkPreview: { minHeight: 69, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: '#2A303A', backgroundColor: '#1A1E26', marginBottom: 9 },
  linkPreviewImage: { width: 64, height: 68, alignItems: 'center', justifyContent: 'center', backgroundColor: '#202A33' },
  linkCopy: { flex: 1, marginHorizontal: 10 },
  linkDomain: { color: '#E5E9ED', fontSize: 12, fontWeight: '800' },
  linkUrl: { color: '#89929D', fontSize: 10, marginTop: 4 },
  visitLink: { color: COLORS.cyan, fontSize: 11, fontWeight: '800', marginRight: 10 },
  actions: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', marginTop: 2 },
  engagementActions: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actionButton: { minWidth: 48, flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  commentButton: { minWidth: 50, flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  actionCount: { color: '#AAB1BA', fontSize: 11, fontWeight: '600', marginLeft: 5 },
  likedCount: { color: COLORS.cyan },
  viewCommentsButton: { paddingTop: 2, paddingBottom: 7 },
  viewCommentsText: { color: '#858E99', fontSize: 12, fontWeight: '600' },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.58)' },
  sheet: { paddingHorizontal: 20, paddingTop: 11, paddingBottom: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: '#2C323B', backgroundColor: '#171A21' },
  sheetHandle: { width: 40, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: '#59616B', marginBottom: 15 },
  sheetTitle: { color: '#F3F5F7', fontSize: 16, fontWeight: '800', marginBottom: 9 },
  sheetRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  sheetActionText: { color: '#E5E9ED', fontSize: 14, fontWeight: '600', marginLeft: 13 },
  deleteText: { color: '#FF5B67', fontSize: 14, fontWeight: '800', marginLeft: 13 },
  cancelButton: { minHeight: 45, alignItems: 'center', justifyContent: 'center', marginTop: 10, borderRadius: 12, backgroundColor: '#242932' },
  cancelText: { color: '#F1F4F7', fontSize: 14, fontWeight: '800' },
});
