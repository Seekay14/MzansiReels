import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { COLORS } from '../config/constants';
import { fetchActiveStories } from '../config/storyService';
import { formatStoryAge, getStoryCreatedAt, isStoryActive } from '../config/storyUtils';

export default function MyStatusButton({ stories, user, onAddStatus, onOpenStatus }) {
  const [activeStatuses, setActiveStatuses] = useState([]);
  const fallbackStatuses = useMemo(() => {
    if (!user?.$id) return [];
    return stories
      .filter((story) => story.userId === user.$id)
      .filter((story) => isStoryActive(story))
      .sort((a, b) => getStoryCreatedAt(b) - getStoryCreatedAt(a));
  }, [stories, user?.$id]);

  useEffect(() => {
    let active = true;
    if (!user?.$id) {
      setActiveStatuses([]);
      return () => { active = false; };
    }
    setActiveStatuses([]);

    const loadOwnStatuses = async () => {
      try {
        const result = await fetchActiveStories();
        if (active) {
          setActiveStatuses(result
            .filter((story) => story.userId === user.$id)
            .sort((a, b) => getStoryCreatedAt(b) - getStoryCreatedAt(a)));
        }
      } catch (error) {
        console.error('Could not load your active statuses:', error);
      }
    };

    loadOwnStatuses();
    return () => { active = false; };
  }, [stories, user?.$id]);

  const statuses = activeStatuses.length ? activeStatuses : fallbackStatuses;
  const latestStatus = statuses[0];
  const timestamp = latestStatus ? formatStoryAge(latestStatus) : '';
  const openOwnStatus = () => {
    if (latestStatus) onOpenStatus?.(user.$id);
    else onAddStatus?.();
  };

  return (
    <View style={styles.item}>
      <View style={styles.avatarHolder}>
        <TouchableOpacity
          style={[styles.avatarRing, latestStatus && styles.activeRing]}
          onPress={openOwnStatus}
          accessibilityRole="button"
          accessibilityLabel={latestStatus ? 'View your status' : 'Add your status'}
        >
          <Avatar
            uri={latestStatus?.avatarUrl || user?.avatarUrl}
            userId={user?.$id}
            name={user?.name || 'You'}
            size={54}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addBadge}
          onPress={onAddStatus}
          accessibilityRole="button"
          accessibilityLabel="Add status"
        >
          <Ionicons name="add" size={16} color="#071014" />
        </TouchableOpacity>
      </View>
      <Text style={styles.name} numberOfLines={1}>My Status</Text>
      {latestStatus ? (
        <Text style={styles.timestamp} numberOfLines={1}>
          {timestamp}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { width: 70, alignItems: 'center' },
  avatarHolder: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center' },
  avatarRing: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent', borderRadius: 31 },
  activeRing: { borderColor: COLORS.cyan },
  addBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.bg,
    borderRadius: 11,
    backgroundColor: COLORS.cyan,
  },
  name: { width: 70, marginTop: 5, color: '#E8EAED', fontSize: 11, textAlign: 'center' },
  timestamp: { width: 70, marginTop: 2, color: '#8B95A7', fontSize: 9, textAlign: 'center' },
});
