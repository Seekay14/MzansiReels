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

export default function CreatePostComposer({
  user,
  onPressComposer,
  onPickImage,
  onPickVideo,
  onPressEmoji,
  desktop = false,
}) {
  const prompt = user?.name
    ? `What's on your mind, ${user.name}?`
    : "What's on your mind?";

  return (
    <View style={[
      styles.container,
      { backgroundColor: COLORS.card, borderColor: COLORS.border },
      desktop && styles.desktopContainer,
      desktop && { backgroundColor: COLORS.card, borderColor: COLORS.border },
    ]}>
      <Avatar
        uri={user?.avatarUrl}
        userId={user?.$id}
        name={user?.name || 'You'}
        size={40}
      />
      <TouchableOpacity
        style={[styles.promptPill, { backgroundColor: COLORS.input }]}
        onPress={onPressComposer}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={prompt}
      >
        <Text style={[styles.promptText, { color: COLORS.muted }]} numberOfLines={1}>{prompt}</Text>
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onPickVideo}
          accessibilityRole="button"
          accessibilityLabel="Create a video post"
        >
          <Ionicons name="videocam" size={22} color={COLORS.pink} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onPickImage}
          accessibilityRole="button"
          accessibilityLabel="Create a photo post"
        >
          <Ionicons name="image" size={22} color={COLORS.cyan} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onPressEmoji}
          accessibilityRole="button"
          accessibilityLabel="Create a text post"
        >
          <Ionicons name="happy" size={22} color="#FFD700" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 13,
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 19,
    backgroundColor: COLORS.card,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  desktopContainer: {
    marginHorizontal: 10,
    borderRadius: 12,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  promptPill: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 22,
    backgroundColor: COLORS.card,
  },
  promptText: { color: COLORS.muted, fontSize: 13, fontWeight: '500' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 15, justifyContent: 'space-around' },
  actionButton: { width: 31, height: 40, alignItems: 'center', justifyContent: 'center' },
});

