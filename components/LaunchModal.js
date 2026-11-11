import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAUNCH_MESSAGE_SEEN_KEY = '@mzansireels/launch-message-seen';

export default function LaunchModal() {
  const [visible, setVisible] = useState(false);
  const [checkingStorage, setCheckingStorage] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    let active = true;

    const checkLaunchMessage = async () => {
      try {
        const hasSeenMessage = await AsyncStorage.getItem(LAUNCH_MESSAGE_SEEN_KEY);
        if (active) setVisible(hasSeenMessage !== 'true');
      } catch (error) {
        console.error('Could not check whether the launch message was seen:', error);
        if (active) {
          setStorageError('We could not save your response. Please try again.');
          setVisible(true);
        }
      } finally {
        if (active) setCheckingStorage(false);
      }
    };

    checkLaunchMessage();
    return () => {
      active = false;
    };
  }, []);

  const handleGetStarted = async () => {
    if (saving || checkingStorage) return;

    setSaving(true);
    setStorageError('');
    try {
      await AsyncStorage.setItem(LAUNCH_MESSAGE_SEEN_KEY, 'true');
      setVisible(false);
    } catch (error) {
      console.error('Could not save that the launch message was seen:', error);
      setStorageError('We could not save your response. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleGetStarted}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.celebration}>
            <Text style={styles.emoji} accessibilityLabel="Celebration">🎉</Text>
          </View>
          <Text style={styles.title}>MzansiReels is LIVE!</Text>
          <Text style={styles.subtitle}>
            Discover the heartbeat of Mzansi. Watch, share, and upload your first reel today.
          </Text>

          {storageError ? (
            <Text style={styles.error} accessibilityRole="alert">{storageError}</Text>
          ) : null}

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Get started"
            disabled={saving || checkingStorage}
            onPress={handleGetStarted}
            style={[styles.button, (saving || checkingStorage) && styles.buttonDisabled]}
          >
            {saving ? (
              <ActivityIndicator color="#08110B" />
            ) : (
              <Text style={styles.buttonText}>Get Started</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    padding: 28,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#292932',
    backgroundColor: '#111118',
  },
  celebration: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
    borderRadius: 44,
    backgroundColor: '#202018',
  },
  emoji: {
    fontSize: 48,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    color: '#B8B8C2',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  error: {
    marginTop: 16,
    color: '#FF8A8A',
    fontSize: 14,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 26,
    borderRadius: 14,
    backgroundColor: '#21C55D',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#08110B',
    fontSize: 16,
    fontWeight: '800',
  },
});
