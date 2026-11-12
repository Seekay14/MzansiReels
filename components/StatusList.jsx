import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { COLORS } from '../config/constants';
import { formatStoryAge } from '../config/storyUtils';

function StatusUpdateRow({ group, viewed, onPress }) {
  const latest = group.latest;
  const name = latest.userName || 'Mzansi User';
  const updateCount = group.stories.length;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${name}'s ${updateCount} ${updateCount === 1 ? 'status update' : 'status updates'}`}
    >
      <View style={[styles.ring, viewed ? styles.viewedRing : styles.unviewedRing]}>
        <Avatar
          uri={latest.avatarUrl}
          userId={group.userId}
          name={name}
          size={52}
        />
      </View>
      <View style={styles.details}>
        <Text style={styles.name} numberOfLines={1}>
          {name}{updateCount > 1 ? ` · ${updateCount} updates` : ''}
        </Text>
        <Text style={styles.time} numberOfLines={1}>{formatStoryAge(latest)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color="#596271" />
    </TouchableOpacity>
  );
}

function MyUpdateRow({ group, onPress }) {
  const latest = group.latest;

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Tap to view your status"
    >
      <View style={[styles.ring, styles.unviewedRing]}>
        <Avatar
          uri={latest.avatarUrl}
          userId={group.userId}
          name={latest.userName || 'You'}
          size={52}
        />
      </View>
      <View style={styles.details}>
        <Text style={styles.name}>
          My status{group.stories.length > 1 ? ` · ${group.stories.length} updates` : ''}
        </Text>
        <Text style={styles.time} numberOfLines={1}>
          {formatStoryAge(latest)} · Tap to view your status
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={17} color="#596271" />
    </TouchableOpacity>
  );
}

export default function StatusList({
  storyGroups = [],
  user,
  viewedStatusIds = [],
  onAddStatus,
  onOpenStatus,
}) {
  const myGroupIndex = storyGroups.findIndex((group) => group.userId === user?.$id);
  const myGroup = myGroupIndex >= 0 ? storyGroups[myGroupIndex] : null;
  const otherGroups = storyGroups
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => group.userId !== user?.$id);
  const hasUnviewed = ({ group }) => group.stories.some(
    (story) => !viewedStatusIds.includes(story.$id),
  );
  const recent = otherGroups.filter(hasUnviewed);
  const viewed = otherGroups.filter(({ group }) => !hasUnviewed({ group }));

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.row}
        onPress={onAddStatus}
        accessibilityRole="button"
        accessibilityLabel="Add a status update"
      >
        <View style={styles.myAvatar}>
          <Avatar
            uri={user?.avatarUrl}
            userId={user?.$id}
            name={user?.name || 'You'}
            size={52}
          />
          <TouchableOpacity
            style={styles.addBadge}
            onPress={onAddStatus}
            accessibilityRole="button"
            accessibilityLabel="Add status update"
          >
            <Ionicons name="add" size={17} color="#071014" />
          </TouchableOpacity>
        </View>
        <View style={styles.details}>
          <Text style={styles.name}>My status</Text>
          <Text style={styles.time} numberOfLines={1}>
            Tap to add status update
          </Text>
        </View>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>My Updates</Text>
      {myGroup ? (
        <MyUpdateRow group={myGroup} onPress={() => onOpenStatus?.(myGroupIndex)} />
      ) : (
        <Text style={styles.noUpdates}>Your active status updates will appear here.</Text>
      )}

      {recent.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Recent updates</Text>
          {recent.map(({ group, index }) => (
            <StatusUpdateRow
              key={group.userId}
              group={group}
              viewed={false}
              onPress={() => onOpenStatus?.(index)}
            />
          ))}
        </>
      ) : null}

      {viewed.length > 0 ? (
        <>
          <Text style={[styles.sectionTitle, styles.viewedTitle]}>Viewed updates</Text>
          {viewed.map(({ group, index }) => (
            <StatusUpdateRow
              key={group.userId}
              group={group}
              viewed
              onPress={() => onOpenStatus?.(index)}
            />
          ))}
        </>
      ) : null}

      {!recent.length && !viewed.length ? (
        <Text style={styles.noUpdates}>No recent status updates.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  row: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 17,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  myAvatar: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.bg,
    borderRadius: 11,
    backgroundColor: COLORS.cyan,
  },
  ring: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderRadius: 29,
  },
  viewedRing: { borderColor: '#555E6B' },
  unviewedRing: { borderColor: COLORS.pink },
  details: { flex: 1, marginLeft: 13 },
  name: { color: '#F3F5F7', fontSize: 14, fontWeight: '700' },
  time: { color: '#8B95A7', fontSize: 11, marginTop: 4 },
  sectionTitle: {
    marginHorizontal: 17,
    marginTop: 14,
    marginBottom: 4,
    color: '#8B95A7',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  viewedTitle: { color: '#6E7785' },
  noUpdates: {
    paddingHorizontal: 17,
    paddingTop: 12,
    paddingBottom: 16,
    color: '#8B95A7',
    fontSize: 12,
  },
});
