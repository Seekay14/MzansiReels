import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import * as Linking from 'expo-linking';
import { account } from '../config/appwrite';
import { COLORS } from '../config/constants';

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [sentTo, setSentTo] = useState('');

  const sendResetLink = async () => {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setErrorMessage('Enter the email address associated with your account.');
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const recoveryUrl = Platform.OS === 'web' && typeof window !== 'undefined'
        ? `${window.location.origin}/reset-password`
        : Linking.createURL('reset-password', { scheme: 'mzansireels' });
      await account.createRecovery(normalizedEmail, recoveryUrl);
      setSentTo(normalizedEmail);
    } catch (error) {
      console.error('Could not send password recovery email:', error);
      setErrorMessage(error.message || 'Could not send the reset link. Please try again.');
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
          accessibilityLabel="Back to login"
        >
          <Ionicons name="arrow-back" size={23} color="#fff" />
        </TouchableOpacity>

        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed-outline" size={30} color={COLORS.cyan} />
        </View>
        <Text style={styles.title}>Reset Password</Text>
        <Text style={styles.subtitle}>
          Enter your email address and we&apos;ll send you a link to reset your password.
        </Text>

        {sentTo ? (
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={28} color={COLORS.cyan} />
            <Text style={styles.successText}>
              Check your email! We&apos;ve sent a recovery link to {sentTo}.
            </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Auth')} style={styles.backToLogin}>
              <Text style={styles.backToLoginText}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={20} color={COLORS.muted} />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor="#737B86"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                editable={!loading}
              />
            </View>
            {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonLoading]}
              onPress={sendResetLink}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading
                ? <ActivityIndicator color="#071014" />
                : <Text style={styles.submitButtonText}>Send Reset Link</Text>}
            </TouchableOpacity>
          </>
        )}
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
  subtitle: { color: '#A0A8B1', fontSize: 15, lineHeight: 23, marginTop: 10, marginBottom: 30 },
  inputWrap: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#303640',
    backgroundColor: '#171A21',
  },
  input: { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 15, marginLeft: 11 },
  submitButton: {
    minHeight: 58,
    borderRadius: 15,
    backgroundColor: COLORS.cyan,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
  },
  submitButtonLoading: { opacity: 0.75 },
  submitButtonText: { color: '#071014', fontSize: 16, fontWeight: '800' },
  errorText: { color: COLORS.pink, fontSize: 13, marginTop: 12 },
  successCard: {
    padding: 22,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.25)',
    backgroundColor: 'rgba(0,229,255,0.07)',
    alignItems: 'center',
  },
  successText: { color: '#E8F0F2', fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 12 },
  backToLogin: { paddingVertical: 12, paddingHorizontal: 16, marginTop: 8 },
  backToLoginText: { color: COLORS.cyan, fontWeight: '700', fontSize: 14 },
});
