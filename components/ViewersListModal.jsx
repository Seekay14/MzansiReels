import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Avatar from './Avatar';
import { COLORS } from '../config/constants';
import { fetchStoryViewers } from '../config/storyViewService';

function formatViewedAt(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Viewed recently';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function ViewersListModal({ visible, storyId, onClose }) {
  const [viewers, setViewers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let active = true;
    if (!visible || !storyId) return () => { active = false; };

    setLoading(true);
    setErrorMessage('');
    fetchStoryViewers(storyId)
      .then((result) => {
        if (active) setViewers(result);
      })
      .catch((error) => {
        console.error('Could not load story viewers:', error);
        if (active) setErrorMessage(error.message || 'Could not load viewers.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [storyId, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close viewers"
        />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Viewers</Text>
              <Text style={styles.subtitle}>
                {viewers.length} {viewers.length === 1 ? 'person' : 'people'} viewed this update
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close viewers"
            >
              <Ionicons name="close" size={21} color="#E8EDF3" />
            </TouchableOpacity>
          </View>
          {loading ? (
            <ActivityIndicator size="large" color={COLORS.cyan} style={styles.loading} />
          ) : errorMessage ? (
            <View style={styles.empty}>
              <Ionicons name="alert-circle-outline" size={28} color={COLORS.pink} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : (
            <FlatList
              data={viewers}
              keyExtractor={(item) => item.$id}
              renderItem={({ item }) => (
                <View style={styles.viewerRow}>
                  <Avatar
                    uri={item.viewerAvatar}
                    userId={item.viewerId}
                    name={item.viewerName}
                    size={44}
                  />
                  <View style={styles.viewerDetails}>
                    <Text style={styles.viewerName} numberOfLines={1}>
                      {item.viewerName || 'Mzansi User'}
                    </Text>
                    <Text style={styles.viewedTime}>
                      {item.viewerUsername ? `@${item.viewerUsername} · ` : ''}{formatViewedAt(item.viewedAt)}
                    </Text>
                  </View>
                  <Ionicons name="eye-outline" size={17} color="#748093" />
                </View>
              )}
              ListEmptyComponent={(
                <View style={styles.empty}>
                  <Ionicons name="eye-off-outline" size={29} color="#707B8B" />
                  <Text style={styles.emptyText}>No one has viewed this update yet.</Text>
                </View>
              )}
              contentContainerStyle={viewers.length ? styles.list : styles.emptyList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheet: {
    height: '68%',
    paddingTop: 10,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: '#29313D',
    backgroundColor: '#11151D',
    overflow: 'hidden',
  },
  handle: { width: 38, height: 4, alignSelf: 'center', borderRadius: 2, backgroundColor: '#5D6674' },
  header: { minHeight: 73, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: '#252A35' },
  title: { color: '#F3F5F7', fontSize: 17, fontWeight: '800' },
  subtitle: { color: '#8B95A7', fontSize: 12, marginTop: 4 },
  closeButton: { width: 37, height: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#202631' },
  list: { paddingBottom: 22 },
  viewerRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 19, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#252A35' },
  viewerDetails: { flex: 1, marginLeft: 12 },
  viewerName: { color: '#F3F5F7', fontSize: 14, fontWeight: '700' },
  viewedTime: { color: '#8B95A7', fontSize: 11, marginTop: 4 },
  loading: { marginTop: 35 },
  emptyList: { flexGrow: 1 },
  empty: { flex: 1, minHeight: 160, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  emptyText: { color: '#8B95A7', fontSize: 13, marginTop: 11, textAlign: 'center' },
  errorText: { color: '#F3F5F7', fontSize: 13, lineHeight: 19, marginTop: 10, textAlign: 'center' },
});
