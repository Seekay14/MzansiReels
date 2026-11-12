import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import { useAuth } from '../context/AuthContext';

export default function BlockedUsersScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unblockingId, setUnblockingId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadBlockedUsers = useCallback(async () => {
    if (!user?.$id) {
      setLoading(false);
      setErrorMessage('Sign in to view blocked users.');
      return;
    }

    setErrorMessage('');
    try {
      const blocks = await databases.listDocuments(DATABASE_ID, COLLECTIONS.blocks, [
        Query.equal('blockerId', user.$id),
        Query.limit(100),
      ]);
      const rows = await Promise.all(blocks.documents.map(async (block) => {
        const profiles = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
          Query.equal('userId', block.blockedId),
          Query.limit(1),
        ]);
        return { block, profile: profiles.documents[0] || null };
      }));
      setBlockedUsers(rows);
    } catch (error) {
      console.error('Could not load blocked users:', error);
      setErrorMessage(error.message || 'Could not load blocked users.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.$id]);

  useEffect(() => {
    loadBlockedUsers();
  }, [loadBlockedUsers]);

  const unblockUser = async (entry) => {
    if (unblockingId) return;
    setUnblockingId(entry.block.$id);
    try {
      await databases.deleteDocument(DATABASE_ID, COLLECTIONS.blocks, entry.block.$id);
      setBlockedUsers((current) => current.filter((item) => item.block.$id !== entry.block.$id));
    } catch (error) {
      console.error('Could not unblock user:', error);
      Alert.alert('Could not unblock user', error.message || 'Please try again.');
    } finally {
      setUnblockingId('');
    }
  };

  const renderBlockedUser = ({ item }) => {
    const displayName = item.profile?.name || item.profile?.username || 'Unknown user';
    const initial = displayName.charAt(0).toUpperCase() || '?';
    return (
      <View style={styles.row}>
        {item.profile?.avatarUrl ? (
          <Image source={{ uri: item.profile.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
        <View style={styles.userCopy}>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          {!!item.profile?.username && (
            <Text style={styles.username} numberOfLines={1}>@{item.profile.username}</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.unblockButton}
          onPress={() => unblockUser(item)}
          disabled={Boolean(unblockingId)}
          accessibilityRole="button"
          accessibilityLabel={`Unblock ${displayName}`}
        >
          {unblockingId === item.block.$id ? (
            <ActivityIndicator size="small" color={COLORS.cyan} />
          ) : (
            <Text style={styles.unblockText}>Unblock</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={23} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked Users</Text>
        <View style={styles.headerSpacer} />
      </View>
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.cyan} style={styles.loader} />
      ) : errorMessage ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{errorMessage}</Text>
          <TouchableOpacity onPress={loadBlockedUsers} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={blockedUsers}
          keyExtractor={(item) => item.block.$id}
          renderItem={renderBlockedUser}
          contentContainerStyle={blockedUsers.length ? styles.list : styles.emptyState}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadBlockedUsers();
              }}
              tintColor={COLORS.cyan}
            />
          )}
          ListEmptyComponent={(
            <View style={styles.emptyCopy}>
              <Ionicons name="ban-outline" size={35} color={COLORS.cyan} />
              <Text style={styles.emptyText}>You haven’t blocked anyone.</Text>
            </View>
          )}
        />
      )}
    </View>
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
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSpacer: { width: 40 },
  list: { paddingHorizontal: 17, paddingTop: 8, paddingBottom: 30 },
  row: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, marginRight: 12, backgroundColor: COLORS.card },
  avatarPlaceholder: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    marginRight: 12,
    backgroundColor: COLORS.cyan,
  },
  avatarInitial: { color: '#061116', fontSize: 16, fontWeight: '800' },
  userCopy: { flex: 1, paddingRight: 8 },
  name: { color: '#fff', fontSize: 14, fontWeight: '700' },
  username: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  unblockButton: { minWidth: 78, minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderRadius: 9, backgroundColor: COLORS.card },
  unblockText: { color: COLORS.cyan, fontSize: 12, fontWeight: '700' },
  loader: { flex: 1 },
  emptyState: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 28 },
  emptyCopy: { alignItems: 'center' },
  emptyText: { color: COLORS.muted, fontSize: 14, textAlign: 'center', marginTop: 12 },
  retryButton: { padding: 12 },
  retryText: { color: COLORS.cyan, fontWeight: '700' },
});
