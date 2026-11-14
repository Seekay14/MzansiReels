import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import LoadingDots from '../components/LoadingDots';

export default function LandingScreen() {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <Ionicons
          name="videocam"
          size={76}
          color="#00E5FF"
          accessibilityLabel="MzansiReels"
        />
        <Text style={styles.brand}>MzansiReels</Text>
        <Text style={styles.tagline}>Scroll. Laugh. Repeat.</Text>
        <View style={styles.loading}>
          <LoadingDots />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginTop: 12,
  },
  tagline: {
    color: '#8B9098',
    fontSize: 15,
    marginTop: 8,
  },
  loading: {
    marginTop: 30,
    minHeight: 18,
    justifyContent: 'center',
  },
});
