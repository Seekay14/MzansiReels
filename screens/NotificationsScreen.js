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
};

export default function NotificationsScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.notifications, [
        Query.equal('userId', user.$id), Query.orderDesc('$createdAt'), Query.limit(50),
      ]);
      setNotifications(res.documents);
    } catch (error) {
      console.log('Error fetching notifications', error);
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

      {loading ? <ActivityIndicator size="large" color={COLORS.cyan} style={{ marginTop: 50 }} /> : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.$id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchNotifications(); }} tintColor={COLORS.cyan} />}
          renderItem={({ item }) => {
            const meta = META[item.type] || META.like;
            return (
              <View style={styles.item}>
                <View style={styles.iconCircle}><Ionicons name={meta.icon} size={20} color={meta.color} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.text}><Text style={styles.bold}>{item.senderName}</Text> {meta.text}</Text>
                  <Text style={styles.time}>{timeAgo(item.$createdAt)}</Text>
                </View>
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
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  text: { color: '#fff', fontSize: 15 },
  bold: { fontWeight: 'bold' },
  time: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  empty: { color: COLORS.muted, textAlign: 'center', marginTop: 50 },
});
