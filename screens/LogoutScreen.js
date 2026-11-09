import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { account } from '../config/appwrite';
import { COLORS } from '../config/constants';

export default function LogoutScreen() {
  useEffect(() => {
    const performLogout = async () => {
      try {
        await account.deleteSession('current');
      } catch (error) {
        console.log('Logout error:', error);
      }
      
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
      
      if (Platform.OS === 'web') {
        window.location.reload();
      }
    };

    performLogout();
  }, []);

  return (
    <View style={styles.container}>
      <Ionicons name="log-out-outline" size={80} color={COLORS.pink} />
      <Text style={styles.title}>Logging you out...</Text>
      <ActivityIndicator size="large" color={COLORS.cyan} style={{ marginTop: 20 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  title: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: 20 },
});