import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { databases, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { timeAgo } from '../config/helpers';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'like', label: 'Likes' },
  { key: 'comment', label: 'Comments' },
  { key: 'follow', label: 'Follows' },
];

const META = {
  like: { icon: 'heart', color: COLORS.pink, text: 'liked your video.' },
  comment: { icon: 'chatbubble', color: '#FFC107', text: 'commented on your video.' },
  follow: { icon: 'person-add', color: COLORS.cyan, text: 'started following you.' },
  mention: { icon: 'at', color: COLORS.cyan, text: 'mentioned you.' },
  message: { icon: 'chatbubbles', color: COLORS.cyan, text: 'sent you a message.' },
};

export default function NotificationsScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [deletedIds, setDeletedIds] = useState(new Set());

  const fetchNotifications = useCallback(async () => {
    if (!user?.$id) return;
    setLoadError('');
    try {
      const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.notifications, [
        Query.equal('userId', user.$id), Query.orderDesc('$createdAt'), Query.limit(100),
      ]);
      setNotifications(res.documents);
      const unread = res.documents.filter((notification) => notification.isRead === false);
      if (unread.length) {
        await Promise.allSettled(unread.map((notification) => (
          databases.updateDocument(DATABASE_ID, COLLECTIONS.notifications, notification.$id, { isRead: true })
        )));
        setNotifications((current) => current.map((n) =>
          unread.some((u) => u.$id === n.$id) ? { ...n, isRead: true } : n
        ));
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setLoadError('Activity could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(useCallback(() => {
    fetchNotifications();
    return () => {};
  }, [fetchNotifications]));

  const markAllAsRead = async () => {
    if (!user?.$id) return;
    const unread = notifications.filter((n) => !n.isRead);
    if (!unread.length) return;
    try {
      await Promise.allSettled(unread.map((n) =>
        databases.updateDocument(DATABASE_ID, COLLECTIONS.notifications, n.$id, { isRead: true })
      ));
      setNotifications(notifications.map((n) => n.isRead ? n : { ...n, isRead: true }));
    } catch (error) {
      console.error('Could not mark all as read:', error);
    }
  };

  const deleteNotification = async (notificationId) => {
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.notifications, notificationId);
      setNotifications((current) => current.filter((n) => n.$id !== notificationId));
      setDeletedIds((prev) => {
        const next = new Set(prev);
        next.add(notificationId);
        return next;
      });
    } catch (error) {
      console.error('Could not delete notification:', error);
      Alert.alert('Delete failed', error.message || 'Could not delete this notification.');
    }
  };

  const openNotification = (notification) => {
    if (!notification) return;
    if (!notification.isRead) {
      databases.updateDocument(DATABASE_ID, COLLECTIONS.notifications, notification.$id, { isRead: true })
        .catch((error) => console.error('Could not mark notification as read:', error));
      setNotifications((current) => current.map((n) =>
        n.$id === notification.$id ? { ...n, isRead: true } : n
      ));
    }

    if (notification.targetType === 'message') {
      navigation.navigate('Chat', {
        otherUserId: notification.senderId,
        otherUserName: notification.senderName || 'User',
        otherUserAvatar: notification.senderAvatar || null,
      });
    } else if (notification.targetType === 'post' || notification.targetType === 'reel') {
      navigation.navigate('Feed', { screen: 'Video', params: { videoId: notification.targetId } });
    } else if (notification.targetType === 'profile' || notification.targetType === 'follow') {
      navigation.navigate('UserProfile', { userId: notification.senderId });
    }
  };

  const filteredAndGrouped = useMemo(() => {
    let filtered = notifications.filter((n) => !deletedIds.has(n.$id));
    if (activeFilter !== 'all') {
      filtered = filtered.filter((n) => n.type === activeFilter);
    }

    const groups = new Map();
    const ungrouped = [];

    filtered.forEach((n) => {
      if (n.type === 'like' || n.type === 'comment') {
        const key = `${n.type}:${n.targetId}`;
        if (!groups.has(key)) {
          groups.set(key, {
            ...n,
            memberIds: [n.$id],
            senders: [n.senderName || 'User'],
            latestDate: n.$createdAt,
          });
        } else {
          const group = groups.get(key);
          group.memberIds.push(n.$id);
          group.senders.push(n.senderName || 'User');
          if (n.$createdAt > group.latestDate) group.latestDate = n.$createdAt;
        }
      } else {
        ungrouped.push(n);
      }
    });

    const grouped = [];
    groups.forEach((group) => {
      const count = group.senders.length;
      const showSenders = group.senders.slice(0, 2);
      let senderText;
      if (count === 1) {
        senderText = showSenders[0];
      } else if (count === 2) {
        senderText = `${showSenders[0]} and ${showSenders[1]}`;
      } else {
        senderText = `${showSenders[0]}, ${showSenders[1]}, and ${count - 2} others`;
      }
      const meta = META[group.type] || { icon: 'notifications', color: COLORS.muted, text: 'had activity on your account.' };
      const message = group.message || `${senderText} ${meta.text}`;
      grouped.push({
        ...group,
        senderName: senderText,
        message,
        isGrouped: true,
        type: group.type,
        $createdAt: group.latestDate,
      });
    });

    return [...ungrouped, ...grouped].sort((a, b) => new Date(b.$createdAt) - new Date(a.$createdAt));
  }, [notifications, activeFilter, deletedIds]);

  const unreadCount = notifications.filter((n) => !n.isRead && !deletedIds.has(n.$id)).length;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: COLORS.text }]}>Activity</Text>
        <View style={styles.headerRight}>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllAsRead} activeOpacity={0.75}>
              <Text style={[styles.markAllText, { color: COLORS.cyan }]}>Mark all as read</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.key}
            style={[styles.filterTab, activeFilter === filter.key && styles.filterTabActive]}
            onPress={() => setActiveFilter(filter.key)}
          >
            <Text style={[styles.filterTabText, activeFilter === filter.key && styles.filterTabTextActive]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.cyan} style={{ marginTop: 50 }} />
      ) : loadError ? (
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchNotifications}>
            <Text style={[styles.retryText, { color: COLORS.text }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={filteredAndGrouped}
          keyExtractor={(item) => item.$id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchNotifications(); }} tintColor={COLORS.cyan} />
          }
          renderItem={({ item }) => {
            const meta = META[item.type] || { icon: 'notifications', color: COLORS.muted, text: 'had activity on your account.' };
            const message = item.message || meta.text;
            const isUnread = !item.isRead;
            return (
              <ReanimatedSwipeable
                renderRightActions={() => (
                  <View style={styles.swipeActions}>
                    <TouchableOpacity
                      style={[styles.swipeAction, styles.deleteAction]}
                      onPress={() => deleteNotification(item.$id)}
                      accessibilityRole="button"
                      accessibilityLabel="Delete notification"
                    >
                      <Ionicons name="trash-outline" size={19} color={COLORS.text} />
                    </TouchableOpacity>
                  </View>
                )}
                overshootRight={false}
                friction={1.8}
                rightThreshold={42}
              >
                <TouchableOpacity
                  style={[styles.item, isUnread && styles.unreadItem]}
                  onPress={() => openNotification(item)}
                >
                  <View style={styles.iconCircle}>
                    <Ionicons name={meta.icon} size={20} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.text, { color: COLORS.text }]}>
                      <Text style={[styles.bold, { color: COLORS.text }]}>{item.senderName}</Text> {message}
                    </Text>
                    <Text style={styles.time}>{timeAgo(item.$createdAt)}</Text>
                  </View>
                  {isUnread && <View style={styles.unreadDot} />}
                </TouchableOpacity>
              </ReanimatedSwipeable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>No new activity yet.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 15 },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  markAllText: { fontSize: 13, fontWeight: '600' },
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  filterTab: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, backgroundColor: 'transparent' },
  filterTabActive: { backgroundColor: 'rgba(0,229,255,0.12)', borderWidth: 1, borderColor: 'rgba(0,229,255,0.35)' },
  filterTabText: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  filterTabTextActive: { color: COLORS.cyan },
  item: { flexDirection: 'row', padding: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center', backgroundColor: COLORS.card },
  unreadItem: { backgroundColor: 'rgba(0,229,255,0.035)' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.cyan, marginLeft: 12 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  text: { color: '#fff', fontSize: 15 },
  bold: { fontWeight: 'bold' },
  time: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  empty: { color: COLORS.muted, textAlign: 'center', marginTop: 50 },
  errorState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
  errorText: { color: COLORS.muted, textAlign: 'center', lineHeight: 21 },
  retryButton: { backgroundColor: COLORS.cyan, borderRadius: 20, paddingHorizontal: 22, paddingVertical: 10, marginTop: 16 },
  retryText: { color: '#000', fontWeight: '700' },
  swipeActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, marginBottom: 8, backgroundColor: COLORS.bg },
  swipeAction: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  deleteAction: { backgroundColor: '#D93A55' },
});
