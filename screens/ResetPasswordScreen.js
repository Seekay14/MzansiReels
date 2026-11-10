import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute } from '@react-navigation/native';
import { account } from '../config/appwrite';
import { COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';

export default function ResetPasswordScreen({ navigation }) {
  const route = useRoute();
  const { logout } = useAuth();
  const { userId, secret } = route.params || {};
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const updatePassword = async () => {
    if (!userId || !secret) {
      setErrorMessage('This password reset link is incomplete. Request a new link and try again.');
      return;
    }
    if (!password || !confirmPassword) {
      setErrorMessage('Enter and confirm your new password.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Your passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Your password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      await account.updateRecovery(userId, secret, password, confirmPassword);
      Alert.alert('Success', 'Password updated successfully!');
      await logout();
      navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
    } catch (error) {
      console.error('Could not update password:', error);
      setErrorMessage(error.message || 'Could not update your password. Request a new reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={['#101923', COLORS.bg, '#00161B']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={23} color="#fff" />
        </TouchableOpacity>

        <View style={styles.iconWrap}>
          <Ionicons name="key-outline" size={30} color={COLORS.cyan} />
        </View>
        <Text style={styles.title}>Create New Password</Text>
        <Text style={styles.subtitle}>Enter your new password below.</Text>

        <View style={styles.inputWrap}>
          <Ionicons name="lock-closed-outline" size={20} color={COLORS.muted} />
          <TextInput
            style={styles.input}
            placeholder="New Password"
            placeholderTextColor="#737B86"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!loading}
          />
          <TouchableOpacity
            onPress={() => setShowPassword((visible) => !visible)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={COLORS.muted} />
          </TouchableOpacity>
        </View>

        <View style={styles.inputWrap}>
          <Ionicons name="lock-closed-outline" size={20} color={COLORS.muted} />
          <TextInput
            style={styles.input}
            placeholder="Confirm New Password"
            placeholderTextColor="#737B86"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            editable={!loading}
          />
          <TouchableOpacity
            onPress={() => setShowConfirmPassword((visible) => !visible)}
            accessibilityRole="button"
            accessibilityLabel={showConfirmPassword ? 'Hide password' : 'Show password'}
          >
            <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={COLORS.muted} />
          </TouchableOpacity>
        </View>

        {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonLoading]}
          onPress={updatePassword}
          disabled={loading}
          accessibilityRole="button"
        >
          {loading
            ? <ActivityIndicator color="#071014" />
            : <Text style={styles.submitButtonText}>Update Password</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: 26 },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 22 : 54,
    left: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(0,229,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 22,
  },
  title: { color: '#fff', fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: '#A0A8B1', fontSize: 15, lineHeight: 23, marginTop: 10, marginBottom: 28 },
  inputWrap: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#303640',
    backgroundColor: '#171A21',
    marginBottom: 14,
  },
  input: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 15, marginLeft: 11 },
  submitButton: {
    minHeight: 58,
    borderRadius: 15,
    backgroundColor: COLORS.cyan,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 5,
  },
  submitButtonLoading: { opacity: 0.75 },
  submitButtonText: { color: '#071014', fontSize: 16, fontWeight: '800' },
  errorText: { color: COLORS.pink, fontSize: 13, marginTop: 2, marginBottom: 8 },
});
