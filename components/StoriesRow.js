import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { COLORS } from '../config/constants';
import { useTheme } from '../context/ThemeContext';
import { getStoryCreatedAt, isStoryActive } from '../config/storyUtils';
import { getUserDocs } from '../config/helpers';

export function groupStories(stories, currentUserId) {
  const grouped = new Map();
  const now = Date.now();
  stories
    .filter((story) => isStoryActive(story, now) && story.userId)
    .forEach((story) => {
      const current = grouped.get(story.userId) || [];
      current.push(story);
      grouped.set(story.userId, current);
    });

  return [...grouped.entries()]
    .map(([userId, userStories]) => ({
      userId,
      stories: userStories.sort((a, b) => (
        getStoryCreatedAt(a) - getStoryCreatedAt(b)
      )),
      latest: userStories.reduce((latest, story) => (
        getStoryCreatedAt(story) > getStoryCreatedAt(latest) ? story : latest
      )),
    }))
    .sort((a, b) => getStoryCreatedAt(b.latest) - getStoryCreatedAt(a.latest));
}

export default function StoriesRow({ stories, user, onOpenStory }) {
  const { colors } = useTheme();
  const [creatorProfiles, setCreatorProfiles] = useState({});
  const groups = useMemo(
    () => groupStories(
      stories.filter((story) => story.userId !== user?.$id),
      user?.$id,
    ),
    [stories, user?.$id],
  );

  useEffect(() => {
    let active = true;
    const loadCreatorProfiles = async () => {
      const userIds = groups.map((group) => group.userId);
      if (!userIds.length) {
        setCreatorProfiles({});
        return;
      }
      try {
        const profiles = await getUserDocs(userIds);
        if (active) {
          setCreatorProfiles(Object.fromEntries(profiles.map((profile) => [profile.userId, profile])));
        }
      } catch (error) {
        console.error('Could not load story creator profiles:', error);
      }
    };
    loadCreatorProfiles();
    return () => { active = false; };
  }, [groups]);

  if (!groups.length) return null;

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {groups.map((group, index) => {
          const story = group.latest;
          const mediaType = story.mediaType || story.type;
          const creatorProfile = creatorProfiles[group.userId];
          const creatorUsername = (creatorProfile?.username || story.username || '').replace(/^@+/, '');
          const creatorName = creatorProfile?.displayName
            || creatorProfile?.name
            || creatorProfile?.username
            || story.username
            || story.userName
            || 'Name unavailable';
          return (
            <TouchableOpacity
              key={group.userId}
              style={styles.item}
              onPress={() => onOpenStory(index)}
              accessibilityRole="button"
              accessibilityLabel={`View ${creatorName}'s story`}
            >
              <View style={styles.ring}>
                <View style={styles.avatarFrame}>
                  <Avatar
                    uri={creatorProfile?.avatarUrl || story.avatarUrl}
                    userId={story.userId}
                    name={creatorName}
                    size={58}
                  />
                  {mediaType === 'video' ? (
                    <View style={styles.videoIcon}>
                      <Ionicons name="play" size={14} color="#fff" />
                    </View>
                  ) : null}
                </View>
              </View>
              <Text numberOfLines={1} style={[styles.name, { color: colors.text }]}>
                {creatorName}
              </Text>
              {creatorUsername ? (
                <Text numberOfLines={1} style={[styles.username, { color: colors.muted }]}>
                  @{creatorUsername}
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  username: {
    width: '100%',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 1,
  },
  list: {
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom: 9,
    gap: 14,
  },
  item: { width: 70, alignItems: 'center' },
  ring: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 33,
    borderWidth: 2,
    borderColor: COLORS.cyan,
  },
  avatarFrame: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 30,
    borderWidth: 2,
    borderColor: COLORS.bg,
    backgroundColor: COLORS.card,
    overflow: 'hidden',
  },
  videoIcon: {
    position: 'absolute',
    right: 2,
    bottom: 1,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  name: { width: 70, marginTop: 5, color: '#E8EAED', fontSize: 11, textAlign: 'center' },
});
