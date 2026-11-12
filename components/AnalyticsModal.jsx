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
            <Text style={styles.title}>Post Analytics</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close post analytics"
            >
              <Ionicons name="close" size={21} color="#AAB1BA" />
            </TouchableOpacity>
          </View>

          <View style={styles.statsGrid}>
            {STAT_ITEMS.map((item) => (
              <View key={item.key} style={styles.statCard}>
                <View style={[styles.statIcon, { backgroundColor: `${item.color}1A` }]}>
                  <Ionicons name={item.icon} size={20} color={item.color} />
                </View>
                <Text style={styles.statValue}>{stats[item.key].toLocaleString()}</Text>
                <Text style={styles.statLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.note}>Analytics are updated in real-time.</Text>
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
    borderColor: '#2A3038',
    borderRadius: 22,
    backgroundColor: '#12151B',
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
    color: '#F3F5F7',
    fontSize: 18,
    fontWeight: '800',
  },
  closeButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: '#20242C',
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
    borderColor: '#282D35',
    borderRadius: 16,
    backgroundColor: '#191D24',
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
    color: '#F5F7F9',
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    color: '#939DA8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  note: {
    color: '#7D8792',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 18,
  },
});
