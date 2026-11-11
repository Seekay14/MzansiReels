import React, { useMemo } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Avatar from './Avatar';
import { COLORS } from '../config/constants';

export function groupStories(stories, currentUserId) {
  const grouped = new Map();
  stories.forEach((story) => {
    if (!story.userId) return;
    const current = grouped.get(story.userId) || [];
    current.push(story);
    grouped.set(story.userId, current);
  });

  return [...grouped.entries()]
    .map(([userId, userStories]) => ({
      userId,
      stories: userStories.sort((a, b) => (
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )),
      latest: userStories.reduce((latest, story) => (
        new Date(story.createdAt) > new Date(latest.createdAt) ? story : latest
      )),
    }))
    .sort((a, b) => new Date(b.latest.createdAt) - new Date(a.latest.createdAt));
}

export default function StoriesRow({ stories, user, onAddStory, onOpenStory }) {
  const groups = useMemo(() => groupStories(stories, user?.$id), [stories, user?.$id]);
  const ownGroupIndex = groups.findIndex((group) => group.userId === user?.$id);
  const ownStory = ownGroupIndex >= 0 ? groups[ownGroupIndex].latest : null;
  const ownStoryType = ownStory?.mediaType || ownStory?.type;

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        <View style={styles.item}>
          <View style={styles.ringHolder}>
            <TouchableOpacity
              onPress={() => {
                if (ownStory) onOpenStory(ownGroupIndex);
                else onAddStory();
              }}
              accessibilityRole="button"
              accessibilityLabel={ownStory ? 'View your story' : 'Add your story'}
            >
              <View style={styles.addRing}>
                {ownStoryType !== 'video' && (ownStory?.mediaUrl || ownStory?.imageUrl) ? (
                  <Image
                    source={{ uri: ownStory.mediaUrl || ownStory.imageUrl }}
                    style={styles.ownStoryPreview}
                  />
                ) : (
                  <Avatar
                    uri={ownStory?.avatarUrl || user?.avatarUrl}
                    userId={user?.$id}
                    name={user?.name || 'You'}
                    size={58}
                  />
                )}
                {ownStoryType === 'video' ? (
                  <View style={styles.videoIcon}>
                    <Ionicons name="play" size={14} color="#fff" />
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addBadge}
              onPress={onAddStory}
              accessibilityRole="button"
              accessibilityLabel="Add a story"
            >
              <Ionicons name="add" size={17} color="#071014" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => {
              if (ownStory) onOpenStory(ownGroupIndex);
              else onAddStory();
            }}
            accessibilityRole="button"
            accessibilityLabel={ownStory ? 'View your story' : 'Add your story'}
          >
            <Text numberOfLines={1} style={styles.name}>Your Story</Text>
          </TouchableOpacity>
        </View>
        {groups.map((group, index) => {
          if (group.userId === user?.$id) return null;
          const story = group.latest;
          const mediaType = story.mediaType || story.type;
          const preview = story.imageUrl || story.mediaUrl || '';
          return (
            <TouchableOpacity
              key={group.userId}
              style={styles.item}
              onPress={() => onOpenStory(index)}
              accessibilityRole="button"
              accessibilityLabel={`View ${story.userName || 'creator'}'s story`}
            >
              <LinearGradient
                colors={[COLORS.cyan, '#5B6CFF', '#D946EF']}
                style={styles.gradientRing}
              >
                <View style={styles.avatarFrame}>
                  {preview && mediaType !== 'video' ? (
                    <Image source={{ uri: preview }} style={styles.preview} />
                  ) : (
                    <Avatar
                      uri={story.avatarUrl}
                      userId={story.userId}
                      name={story.userName || 'Creator'}
                      size={58}
                    />
                  )}
                  {mediaType === 'video' ? (
                    <View style={styles.videoIcon}>
                      <Ionicons name="play" size={14} color="#fff" />
                    </View>
                  ) : null}
                </View>
              </LinearGradient>
              <Text numberOfLines={1} style={styles.name}>
                {story.userName || 'Creator'}
              </Text>
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
  list: {
    paddingHorizontal: 13,
    paddingTop: 10,
    paddingBottom: 9,
    gap: 14,
  },
  item: {
    width: 70,
    alignItems: 'center',
  },
  addRing: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 33,
    borderWidth: 2,
    borderColor: COLORS.cyan,
    overflow: 'hidden',
  },
  ownStoryPreview: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  ringHolder: {
    width: 66,
    height: 66,
    position: 'relative',
  },
  addBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 23,
    height: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.bg,
    backgroundColor: COLORS.cyan,
  },
  gradientRing: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 33,
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
  preview: {
    width: 58,
    height: 58,
    borderRadius: 29,
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
  name: {
    width: 70,
    marginTop: 5,
    color: '#E8EAED',
    fontSize: 11,
    textAlign: 'center',
  },
});
