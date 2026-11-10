import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { timeAgo } from '../config/helpers';

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

  const fetchNotifications = useCallback(async () => {
    setLoadError('');
    try {
      const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.notifications, [
        Query.equal('userId', user.$id), Query.orderDesc('$createdAt'), Query.limit(50),
      ]);
      setNotifications(res.documents);
      const unread = res.documents.filter((notification) => notification.isRead === false);
      const results = await Promise.allSettled(unread.map((notification) => (
        databases.updateDocument(DATABASE_ID, COLLECTIONS.notifications, notification.$id, { isRead: true })
      )));
      const updatedIds = new Set();
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error('Could not mark notification as read:', result.reason);
        } else {
          updatedIds.add(unread[index].$id);
        }
      });
      setNotifications((current) => current.map((notification) => (
        updatedIds.has(notification.$id) ? { ...notification, isRead: true } : notification
      )));
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setLoadError('Activity could not be loaded. Check your connection and try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="arrow-back" size={24} color="#fff" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Activity</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? <ActivityIndicator size="large" color={COLORS.cyan} style={{ marginTop: 50 }} /> : loadError ? (
        <View style={styles.errorState}>
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchNotifications}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.$id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchNotifications(); }} tintColor={COLORS.cyan} />}
          renderItem={({ item }) => {
            const meta = META[item.type] || { icon: 'notifications', color: COLORS.muted, text: 'had activity on your account.' };
            return (
              <View style={[styles.item, item.isRead === false && styles.unreadItem]}>
                <View style={styles.iconCircle}><Ionicons name={meta.icon} size={20} color={meta.color} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.text}><Text style={styles.bold}>{item.senderName}</Text> {meta.text}</Text>
                  <Text style={styles.time}>{timeAgo(item.$createdAt)}</Text>
                </View>
                {item.isRead === false && <View style={styles.unreadDot} />}
              </View>
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
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  item: { flexDirection: 'row', padding: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border, alignItems: 'center' },
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
});
