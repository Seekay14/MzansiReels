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
    <View style={[styles.container, desktop && styles.desktopContainer]}>
      <Avatar
        uri={user?.avatarUrl}
        userId={user?.$id}
        name={user?.name || 'You'}
        size={40}
      />
      <TouchableOpacity
        style={styles.promptPill}
        onPress={onPressComposer}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={prompt}
      >
        <Text style={styles.promptText} numberOfLines={1}>{prompt}</Text>
      </TouchableOpacity>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onPickVideo}
          accessibilityRole="button"
          accessibilityLabel="Create a video post"
        >
          <Ionicons name="videocam" size={21} color="#FF4D5E" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onPickImage}
          accessibilityRole="button"
          accessibilityLabel="Create a photo post"
        >
          <Ionicons name="image" size={21} color="#35C976" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onPressEmoji}
          accessibilityRole="button"
          accessibilityLabel="Create a text post"
        >
          <Ionicons name="happy" size={21} color="#FFAA32" />
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
    borderColor: '#252A35',
    borderRadius: 19,
    backgroundColor: '#151820',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  desktopContainer: {
    marginHorizontal: 10,
    borderRadius: 12,
    borderColor: '#3A3B3C',
    backgroundColor: '#242526',
  },
  promptPill: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 13,
    borderRadius: 22,
    backgroundColor: '#20242D',
  },
  promptText: { color: COLORS.muted, fontSize: 13, fontWeight: '500' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionButton: { width: 31, height: 40, alignItems: 'center', justifyContent: 'center' },
});
