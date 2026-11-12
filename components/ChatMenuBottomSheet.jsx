import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../config/constants';
import Avatar from './Avatar';

const MUTE_OPTIONS = [
  { label: '8h', duration: 8 * 60 * 60 * 1000 },
  { label: '1w', duration: 7 * 24 * 60 * 60 * 1000 },
  { label: 'Always', duration: -1 },
];

export default function ChatMenuBottomSheet({
  visible,
  onClose,
  userId,
  name,
  username,
  avatarUrl,
  isMuted,
  isPinned,
  isBlocked,
  actionBusy = false,
  onViewProfile,
  onSearchMessages,
  onViewMedia,
  onExportChat,
  onMute,
  onPin,
  onTheme,
  onClearChat,
  onBlock,
  onReport,
  onDisappearingMessages,
  onLockChat,
  onAudioCall,
  onVideoCall,
}) {
  const insets = useSafeAreaInsets();
  const [muteOptionsVisible, setMuteOptionsVisible] = useState(false);

  useEffect(() => {
    if (!visible) setMuteOptionsVisible(false);
  }, [visible]);

  const pressAction = (action) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error) => {
      console.warn('Could not trigger menu haptics:', error);
    });
    action?.();
  };

  const close = () => {
    setMuteOptionsVisible(false);
    pressAction(onClose);
  };

  const renderItem = ({ label, icon, tone = 'default', onPress, expandable = false }) => (
    <TouchableOpacity
      key={label}
      style={styles.menuItem}
      onPress={() => pressAction(onPress)}
      disabled={actionBusy}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons
        name={icon}
        size={20}
        color={tone === 'danger' ? COLORS.pink : tone === 'setting' ? COLORS.cyan : '#F3F5F7'}
        style={styles.itemIcon}
      />
      <Text style={[
        styles.menuItemText,
        tone === 'setting' && styles.settingText,
        tone === 'danger' && styles.dangerText,
      ]}>
        {label}
      </Text>
      {expandable ? (
        <Ionicons
          name={muteOptionsVisible ? 'chevron-up' : 'chevron-down'}
          size={17}
          color={COLORS.cyan}
        />
      ) : null}
    </TouchableOpacity>
  );

  const standardItems = [
    { label: 'View profile', icon: 'person-outline', onPress: onViewProfile },
    { label: 'Search messages', icon: 'search-outline', onPress: onSearchMessages },
    { label: 'Media & links', icon: 'images-outline', onPress: onViewMedia },
    { label: 'Export chat', icon: 'share-outline', onPress: onExportChat },
  ];

  const settingItems = [
    {
      label: isMuted ? 'Mute notifications (on)' : 'Mute notifications',
      icon: 'notifications-off-outline',
      tone: 'setting',
      onPress: () => setMuteOptionsVisible((current) => !current),
      expandable: true,
    },
    {
      label: isPinned ? 'Unpin chat' : 'Pin chat',
      icon: isPinned ? 'pin' : 'pin-outline',
      tone: 'setting',
      onPress: onPin,
    },
    { label: 'Chat theme', icon: 'color-palette-outline', tone: 'setting', onPress: onTheme },
    { label: 'Disappearing messages', icon: 'timer-outline', tone: 'setting', onPress: onDisappearingMessages },
    { label: 'Chat lock', icon: 'lock-closed-outline', tone: 'setting', onPress: onLockChat },
  ];

  const destructiveItems = [
    { label: 'Clear chat', icon: 'trash-outline', tone: 'danger', onPress: onClearChat },
    {
      label: isBlocked ? 'Unblock user' : 'Block user',
      icon: 'ban-outline',
      tone: isBlocked ? 'setting' : 'danger',
      onPress: onBlock,
    },
    { label: 'Report user', icon: 'flag-outline', tone: 'danger', onPress: onReport },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={close}
    >
      <View style={styles.overlay}>
        <BlurView intensity={42} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel="Close chat menu"
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.handle} />
          <View style={styles.profileHeader}>
            <Avatar uri={avatarUrl} userId={userId} name={name} size={60} />
            <View style={styles.profileCopy}>
              <Text style={styles.profileName} numberOfLines={1}>{name || 'User'}</Text>
              <Text style={styles.profileUsername} numberOfLines={1}>
                @{(username || 'user').replace(/^@/, '')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close chat menu"
            >
              <Ionicons name="close" size={20} color="#C8CED8" />
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />

          <ScrollView
            style={styles.menuScroll}
            contentContainerStyle={styles.menuContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionLabel}>CHAT</Text>
            {standardItems.map((item) => renderItem(item))}

            <Text style={styles.sectionLabel}>SETTINGS</Text>
            {settingItems.map((item) => renderItem(item))}
            {muteOptionsVisible ? (
              <View style={styles.muteOptions}>
                {isMuted ? (
                  <TouchableOpacity
                    style={styles.muteOption}
                    onPress={() => pressAction(() => onMute?.(null))}
                    disabled={actionBusy}
                  >
                    <Text style={styles.muteOptionText}>Unmute</Text>
                    <Ionicons name="notifications-outline" size={17} color={COLORS.cyan} />
                  </TouchableOpacity>
                ) : null}
                {MUTE_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.label}
                    style={styles.muteOption}
                    onPress={() => pressAction(() => onMute?.(option.duration))}
                    disabled={actionBusy}
                  >
                    <Text style={styles.muteOptionText}>{option.label}</Text>
                    <Ionicons name="chevron-forward" size={16} color="#707B8B" />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>MORE</Text>
            {destructiveItems.map((item) => renderItem(item))}
          </ScrollView>

          <View style={styles.quickActions}>
            <QuickAction
              icon="call-outline"
              label="Call"
              onPress={() => pressAction(onAudioCall)}
            />
            <QuickAction
              icon="videocam-outline"
              label="Video"
              onPress={() => pressAction(onVideoCall)}
            />
            <QuickAction
              icon="person-outline"
              label="Profile"
              onPress={() => pressAction(onViewProfile)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function QuickAction({ icon, label, onPress }) {
  return (
    <TouchableOpacity
      style={styles.quickAction}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.quickActionCircle}>
        <Ionicons name={icon} size={22} color={COLORS.cyan} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.42)' },
  sheet: {
    maxHeight: '90%',
    paddingTop: 10,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(15,18,25,0.96)',
    overflow: 'hidden',
  },
  handle: { width: 38, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: '#5D6674' },
  profileHeader: { minHeight: 88, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 9 },
  profileCopy: { flex: 1, marginLeft: 14 },
  profileName: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  profileUsername: { color: '#8B95A7', fontSize: 13, marginTop: 4 },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#252A35' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 18, marginBottom: 5, backgroundColor: '#39414E' },
  menuScroll: { flexShrink: 1 },
  menuContent: { paddingBottom: 6 },
  sectionLabel: { color: '#778293', fontSize: 10, fontWeight: '800', letterSpacing: 1.1, paddingHorizontal: 21, paddingTop: 13, paddingBottom: 4 },
  menuItem: { minHeight: 47, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 21 },
  itemIcon: { width: 31 },
  menuItemText: { flex: 1, color: '#F3F5F7', fontSize: 14, fontWeight: '600' },
  settingText: { color: COLORS.cyan },
  dangerText: { color: COLORS.pink },
  muteOptions: { marginHorizontal: 19, marginVertical: 3, paddingHorizontal: 13, borderRadius: 14, backgroundColor: 'rgba(0,229,255,0.07)' },
  muteOption: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(139,149,167,0.2)' },
  muteOptionText: { color: '#DDE4EC', fontSize: 13, fontWeight: '600' },
  quickActions: { flexDirection: 'row', justifyContent: 'space-evenly', paddingTop: 11, paddingBottom: 3, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#343B47' },
  quickAction: { alignItems: 'center', justifyContent: 'center', minWidth: 75, paddingVertical: 5 },
  quickActionCircle: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 25, borderWidth: 1, borderColor: 'rgba(0,229,255,0.28)', backgroundColor: 'rgba(0,229,255,0.1)' },
  quickActionLabel: { color: '#C4CBD5', fontSize: 11, fontWeight: '600', marginTop: 6 },
});
