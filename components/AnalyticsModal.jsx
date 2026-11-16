import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../config/constants';

const STAT_ITEMS = [
  { key: 'views', label: 'Views', icon: 'eye-outline', color: '#67D9FF' },
  { key: 'likes', label: 'Likes', icon: 'heart-outline', color: '#FF6685' },
  { key: 'comments', label: 'Comments', icon: 'chatbubble-outline', color: '#A78BFA' },
  { key: 'shares', label: 'Shares', icon: 'repeat-outline', color: '#55D6A5' },
];

export default function AnalyticsModal({ visible, post, commentCount, onClose }) {
  const stats = {
    views: Number(post?.views) || 0,
    likes: Number(post?.likes) || 0,
    comments: Number(commentCount ?? post?.commentCount) || 0,
    shares: Number(post?.shares) || 0,
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Ionicons name="bar-chart-outline" size={20} color={COLORS.cyan} />
            </View>
            <Text style={[styles.title, { color: COLORS.text }]}>Post Analytics</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close post analytics"
            >
              <Ionicons name="close" size={21} color={COLORS.muted} />
            </TouchableOpacity>
          </View>

          <View style={styles.statsGrid}>
            {STAT_ITEMS.map((item) => (
              <View key={item.key} style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: `${item.color}1A` }]}>
                  <Ionicons name={item.icon} size={20} color={item.color} />
                </View>
                <Text style={[styles.statValue, { color: COLORS.text }]}>{stats[item.key].toLocaleString()}</Text>
                <Text style={[styles.statLabel, { color: COLORS.muted }]}>{item.label}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.note, { color: COLORS.muted }]}>Analytics are updated in real-time.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 22,
    backgroundColor: COLORS.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(0,229,255,0.12)',
  },
  title: {
    flex: 1,
    marginLeft: 11,
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: COLORS.card,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '47%',
    minHeight: 116,
    justifyContent: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    backgroundColor: COLORS.card,
  },
  statIcon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    marginBottom: 8,
  },
  statValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  note: {
    color: COLORS.muted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 18,
  },
});

