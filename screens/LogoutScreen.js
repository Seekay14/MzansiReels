import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';

export default function LogoutScreen() {
  const { user, logout } = useAuth();
  const logoutStarted = useRef(false);

  useEffect(() => {
    if (logoutStarted.current) return;
    logoutStarted.current = true;
    logout(user?.$id);
  }, [logout, user?.$id]);

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