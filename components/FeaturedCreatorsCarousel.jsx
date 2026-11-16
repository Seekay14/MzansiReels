import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { databases, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import Avatar from './Avatar';

export default function FeaturedCreatorsCarousel({ navigation }) {
  const [creators, setCreators] = useState([]);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const fetchCreators = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    try {
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
        Query.equal('isVerified', true),
        Query.limit(10),
      ]);
      if (request !== requestId.current) return;
      setCreators(result.documents);
    } catch (error) {
      console.error('Could not fetch verified creators:', error);
      setCreators([]);
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCreators();
  }, [fetchCreators]);

  if (loading) {
    return (
      <View style={styles.skeletonSection}>
        <ActivityIndicator color={COLORS.cyan} style={styles.skeletonLoader} />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Featured Verified Creators</Text>
        <TouchableOpacity style={styles.watchAllLink} onPress={() => navigation.navigate('Search')}>
          <Text style={styles.watchAllText}>View all</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={creators}
        keyExtractor={(item) => item.$id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.creatorsList}
        renderItem={({ item }) => {
          const displayName = item.name || item.userName || 'User';
          const username = item.username || item.userName || '';
          return (
            <TouchableOpacity
              key={item.$id}
              style={styles.creatorCard}
              onPress={() => navigation.navigate('UserProfile', { userId: item.$id, userName: displayName })}
              accessibilityRole="button"
              accessibilityLabel={`View ${displayName} profile`}
            >
              <View style={styles.avatarWrapper}>
                <Avatar
                  userId={item.$id}
                  fallbackUrl={item.avatarUrl || ''}
                  name={displayName}
                  size={60}
                />
                {item.isVerified && (
                  <View style={styles.verifyBadge}>
                    <Ionicons name="checkmark-circle" size={16} color={COLORS.cyan} />
                  </View>
                )}
              </View>
              <Text style={styles.creatorName} numberOfLines={1}>
                {username ? `@${username}` : displayName}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginVertical: 10,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderBottomWidth: 8,
    borderBottomColor: COLORS.bg,
    marginBottom: 0,
  },
  skeletonSection: {
    marginVertical: 10,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderBottomWidth: 8,
    borderBottomColor: COLORS.bg,
    marginBottom: 0,
    alignItems: 'center',
    paddingVertical: 20,
  },
  skeletonLoader: { marginVertical: 20 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: COLORS.bg,
  },
  title: { color: COLORS.text, fontSize: 18, fontWeight: '700' },
  watchAllLink: { paddingHorizontal: 4 },
  watchAllText: { color: COLORS.cyan, fontSize: 13, fontWeight: '600' },
  creatorsList: { paddingHorizontal: 15, gap: 14, paddingBottom: 15 },
  creatorCard: { alignItems: 'center', width: 76 },
  avatarWrapper: { position: 'relative', width: 60, height: 60, marginBottom: 6 },
  verifyBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  creatorName: { color: COLORS.text, fontSize: 11, fontWeight: '600', textAlign: 'center', width: 72 },
});
