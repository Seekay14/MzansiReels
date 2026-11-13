import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
import { getUserDocs } from '../config/helpers';
import Avatar from '../components/Avatar';

const PAGE_SIZE = 30;

export default function ProfileFollowListScreen({ route, navigation }) {
  const { userId, username } = route.params || {};
  const isFollowers = route.name === 'FollowersList';
  const relationshipField = isFollowers ? 'followingId' : 'followerId';
  const accountField = isFollowers ? 'followerId' : 'followingId';
  const title = isFollowers ? 'Followers' : 'Following';
  const insets = useSafeAreaInsets();
  const [profiles, setProfiles] = useState([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const offsetRef = useRef(0);

  const loadPage = useCallback(async (reset = false) => {
    if (!userId || pending.current) return;
    pending.current = true;
    const start = reset ? 0 : offsetRef.current;
    if (reset) {
      setLoading(true);
      setProfiles([]);
      setOffset(0);
      offsetRef.current = 0;
    } else {
      setLoadingMore(true);
    }
    setError('');
    try {
      const page = await databases.listDocuments(DATABASE_ID, COLLECTIONS.follows, [
        Query.equal(relationshipField, userId),
        Query.limit(PAGE_SIZE),
        Query.offset(start),
      ]);
      const profileIds = page.documents.map((relationship) => relationship[accountField]).filter(Boolean);
      const profileDocs = await getUserDocs(profileIds);
      const profilesById = new Map(profileDocs.map((profile) => [profile.userId, profile]));
      const pageProfiles = profileIds.map((profileId) => profilesById.get(profileId)).filter(Boolean);
      setProfiles((current) => reset ? pageProfiles : [
        ...current,
        ...pageProfiles.filter((profile) => !current.some((item) => item.userId === profile.userId)),
      ]);
      offsetRef.current = start + page.documents.length;
      setOffset(offsetRef.current);
      setTotal(page.total);
    } catch (loadError) {
      console.error(`Could not load profile ${title.toLowerCase()}:`, loadError);
      setError(`Could not load ${title.toLowerCase()}. Pull down to try again.`);
    } finally {
      pending.current = false;
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [accountField, relationshipField, title, userId]);

  useEffect(() => {
    loadPage(true);
  }, [loadPage]);

  const renderProfile = ({ item }) => {
    const displayName = item.displayName || item.name || item.username || 'Name unavailable';
    const profileUsername = item.username || '';
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => navigation.navigate('UserProfile', {
          userId: item.userId,
          userName: profileUsername || displayName,
        })}
        accessibilityRole="button"
        accessibilityLabel={`View ${displayName}'s profile`}
      >
        <Avatar uri={item.avatarUrl} userId={item.userId} name={displayName} size={48} />
        <View style={styles.profileDetails}>
          <Text style={styles.displayName} numberOfLines={1}>{displayName}</Text>
          {profileUsername ? (
            <Text style={styles.username} numberOfLines={1}>@{profileUsername}</Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color="#89919C" />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {title}{username ? ` · @${username.replace(/^@/, '')}` : ''}
        </Text>
        <View style={styles.backButton} />
      </View>
      {loading && !refreshing ? (
        <ActivityIndicator size="large" color={COLORS.cyan} style={styles.loading} />
      ) : error && profiles.length === 0 ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <FlatList
          data={profiles}
          keyExtractor={(item) => item.userId}
          renderItem={renderProfile}
          contentContainerStyle={profiles.length ? styles.list : styles.emptyList}
          refreshControl={(
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadPage(true);
              }}
              tintColor={COLORS.cyan}
            />
          )}
          onEndReached={() => {
            if (!loadingMore && offset < total) loadPage(false);
          }}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={(
            <Text style={styles.emptyText}>
              {error || `No ${title.toLowerCase()} to show yet.`}
            </Text>
          )}
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator size="small" color={COLORS.cyan} style={styles.loadingMore} />
          ) : null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 20 },
  emptyList: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24 },
  row: { minHeight: 68, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  profileDetails: { flex: 1, marginLeft: 12 },
  displayName: { color: '#fff', fontSize: 14, fontWeight: '700' },
  username: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  loading: { marginTop: 45 },
  loadingMore: { paddingVertical: 16 },
  emptyText: { color: COLORS.muted, textAlign: 'center', fontSize: 14 },
  error: { color: COLORS.muted, textAlign: 'center', marginTop: 30, paddingHorizontal: 24 },
});
