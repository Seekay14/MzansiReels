import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const QUICK_REACTIONS = ['❤️', '😂', '👍', '😮', '😢'];

const ACTIONS = [
  { key: 'reply', label: 'Reply', icon: 'arrow-undo-outline' },
  { key: 'copy', label: 'Copy', icon: 'copy-outline' },
  { key: 'forward', label: 'Forward', icon: 'arrow-redo-outline' },
  { key: 'edit', label: 'Edit', icon: 'create-outline', ownTextOnly: true },
  { key: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true },
  { key: 'info', label: 'Info', icon: 'information-circle-outline' },
];

export default function MessageContextMenu({
  visible,
  message,
  anchor,
  senderName,
  senderAvatarUrl,
  isOwnMessage,
  onClose,
  onReact,
  onReply,
  onCopy,
  onForward,
  onEdit,
  onDelete,
}) {
  const [infoVisible, setInfoVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const { width, height } = useWindowDimensions();

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      scale.setValue(0.94);
      return undefined;
    }

    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, speed: 26, bounciness: 2, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, speed: 22, bounciness: 4, useNativeDriver: true }),
    ]).start();
    return undefined;
  }, [opacity, scale, visible]);

  if (!message) return null;

  const messageType = message.attachmentType || message.messageType || 'text';
  const canEdit = isOwnMessage && messageType === 'text' && Boolean(message.text);
  const timestamp = message.$createdAt
    ? message.$createdAt
    : 'Unavailable';
  const menuWidth = Math.min(340, width - 32);
  const menuHeight = 350;
  const anchorX = Number.isFinite(anchor?.pageX) ? anchor.pageX : width / 2;
  const anchorY = Number.isFinite(anchor?.pageY) ? anchor.pageY : height / 2;
  const menuPosition = {
    left: Math.max(16, Math.min(width - menuWidth - 16, anchorX - menuWidth / 2)),
    top: Math.max(16, Math.min(height - menuHeight - 16, anchorY < height / 2
      ? anchorY + 18
      : anchorY - menuHeight - 18)),
  };

  const impact = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error) => {
      console.warn('Could not trigger message menu haptics:', error);
    });
  };

  const runAction = (action) => {
    impact();
    onClose?.();
    if (action === 'reply') onReply?.(message);
    if (action === 'copy') onCopy?.(message);
    if (action === 'forward') onForward?.(message);
    if (action === 'edit' && canEdit) onEdit?.(message);
    if (action === 'delete') onDelete?.(message);
    if (action === 'info') setInfoVisible(true);
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={onClose}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              impact();
              onClose?.();
            }}
            accessibilityLabel="Close message options"
          />
          <Animated.View
            style={[styles.menu, menuPosition, { width: menuWidth, opacity, transform: [{ scale }] }]}
          >
            <View style={styles.reactions}>
              {QUICK_REACTIONS.map((reaction) => (
                <TouchableOpacity
                  key={reaction}
                  style={styles.reactionButton}
                  onPress={() => {
                    impact();
                    onClose?.();
                    onReact?.(message, reaction);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`React ${reaction}`}
                >
                  <Text style={styles.reaction}>{reaction}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.divider} />
            {ACTIONS.filter((action) => (
              (!action.ownTextOnly || canEdit)
              && (action.key !== 'delete' || Boolean(message.$id))
            )).map((action) => (
              <TouchableOpacity
                key={action.key}
                style={styles.action}
                onPress={() => runAction(action.key)}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <Ionicons
                  name={action.icon}
                  size={19}
                  color={action.destructive ? '#FF5B6E' : '#E9EDF2'}
                />
                <Text style={[styles.actionText, action.destructive && styles.destructiveText]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={infoVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoVisible(false)}
      >
        <View style={styles.infoBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              impact();
              setInfoVisible(false);
            }}
          />
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <Text style={styles.infoTitle}>Message info</Text>
              <TouchableOpacity
                onPress={() => {
                  impact();
                  setInfoVisible(false);
                }}
                accessibilityRole="button"
                accessibilityLabel="Close message info"
              >
                <Ionicons name="close" size={22} color="#AAB3BF" />
              </TouchableOpacity>
            </View>
            <View style={styles.senderRow}>
              <View style={styles.senderAvatar}>
                {senderAvatarUrl ? (
                  <Image source={{ uri: senderAvatarUrl }} style={styles.senderAvatarImage} />
                ) : (
                  <Text style={styles.senderInitial}>{(senderName || '?').charAt(0).toUpperCase()}</Text>
                )}
              </View>
              <View style={styles.senderDetails}>
                <Text style={styles.senderName}>{senderName || 'Unknown sender'}</Text>
                <Text style={styles.senderId}>{message.senderId || 'Sender ID unavailable'}</Text>
              </View>
            </View>
            <InfoRow label="Sent" value={timestamp} />
            <InfoRow label="Read" value={message.isRead ? 'Yes' : 'No'} />
            <InfoRow label="Message ID" value={message.$id || 'Unavailable'} />
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => {
                impact();
                setInfoVisible(false);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function InfoRow({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.64)',
  },
  menu: {
    position: 'absolute',
    padding: 10,
    borderWidth: 1,
    borderColor: '#343434',
    borderRadius: 19,
    backgroundColor: '#1A1A1A',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  reactions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 7 },
  reactionButton: { width: 48, height: 45, alignItems: 'center', justifyContent: 'center', borderRadius: 23, backgroundColor: '#262626' },
  reaction: { fontSize: 24 },
  divider: { height: 1, marginVertical: 6, backgroundColor: '#353535' },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 10, borderRadius: 10 },
  actionText: { color: '#E9EDF2', fontSize: 14, fontWeight: '600' },
  destructiveText: { color: '#FF5B6E' },
  infoBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.64)' },
  infoCard: { width: '100%', maxWidth: 360, padding: 18, borderWidth: 1, borderColor: '#343434', borderRadius: 18, backgroundColor: '#1A1A1A' },
  infoHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  infoTitle: { color: '#F3F5F7', fontSize: 17, fontWeight: '800' },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#353535' },
  senderAvatar: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 21, backgroundColor: '#00E5FF' },
  senderAvatarImage: { width: 42, height: 42, borderRadius: 21 },
  senderInitial: { color: '#061116', fontSize: 16, fontWeight: '900' },
  senderDetails: { flex: 1 },
  senderName: { color: '#F3F5F7', fontSize: 14, fontWeight: '700' },
  senderId: { color: '#8993A0', fontSize: 10, marginTop: 3 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 7 },
  infoLabel: { color: '#8993A0', fontSize: 12 },
  infoValue: { flex: 1, color: '#E9EDF2', fontSize: 12, textAlign: 'right' },
  doneButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderRadius: 12, backgroundColor: '#292929' },
  doneText: { color: '#00E5FF', fontSize: 13, fontWeight: '800' },
});
