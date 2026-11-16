import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { account, databases, ID, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;
const RESEND_SECONDS = 30;

export default function OTPScreen({ navigation, route }) {
  const { setUser } = useAuth();
  const insets = useSafeAreaInsets();
  const params = route?.params || {};
  const action = params.action || 'login';
  const otpUserId = params.otpUserId || '';
  const otpEmail = params.otpEmail || '';
  const signupName = params.signupName || '';

  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendTime, setResendTime] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const resendCountdownRef = useRef(null);
  const secondsLeftRef = useRef(RESEND_SECONDS);
  const otpInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (resendCountdownRef.current) clearInterval(resendCountdownRef.current);
    };
  }, []);

  const startResendCountdown = useCallback(() => {
    secondsLeftRef.current = RESEND_SECONDS;
    setResendTime(RESEND_SECONDS);
    if (resendCountdownRef.current) clearInterval(resendCountdownRef.current);
    resendCountdownRef.current = setInterval(() => {
      secondsLeftRef.current -= 1;
      setResendTime(secondsLeftRef.current);
      if (secondsLeftRef.current <= 0) {
        clearInterval(resendCountdownRef.current);
        resendCountdownRef.current = null;
        setResendTime(0);
      }
    }, 1000);
  }, []);

  useEffect(() => {
    startResendCountdown();
    otpInputRef.current?.focus();
  }, [startResendCountdown]);

  const canResend = secondsLeftRef.current <= 0;

  const clearError = () => setErrorMessage('');

  const handleOTPChange = (value) => {
    clearError();
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setOtpCode(digits);
    if (digits.length === 6) {
      setTimeout(() => verifyOtp(), 300);
    }
  };

  const verifyOtp = async () => {
    if (!otpUserId) {
      setErrorMessage('Session expired. Please try logging in again.');
      return;
    }
    if (!otpCode || otpCode.length !== 6) {
      setErrorMessage('Please enter a valid 6-digit code.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      await account.createSession(otpUserId, otpCode);

      const currentUser = await account.get();
      const authUser = {
        $id: currentUser.$id,
        email: currentUser.email || otpEmail,
        name: currentUser.name || signupName || '',
        status: true,
      };

      if (action === 'signup') {
        const profile = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
          Query.equal('userId', currentUser.$id),
          Query.limit(1),
        ]);
        if (!profile.documents[0]) {
          await databases.createDocument(DATABASE_ID, COLLECTIONS.users, ID.unique(), {
            userId: currentUser.$id,
            name: signupName || currentUser.name || '',
            username: '',
            avatarUrl: '',
            profileSetupComplete: false,
            onboardingComplete: false,
            followers: 0,
            following: 0,
            interests: [],
            pushNotifications: true,
            isPrivate: false,
            isVerified: false,
          });
        }
      }

      await setUser(authUser);
      navigation.navigate('Home');
    } catch (error) {
      console.error('OTP verification failed:', error);
      const errorText = error?.message || 'Verification failed.';
      if (error?.code === 401 || error?.type?.includes('user_invalid_token') || /invalid|expired|incorrect/i.test(errorText)) {
        setErrorMessage('Invalid or expired code. Please request a new one.');
      } else if (/network|fetch|connection/i.test(errorText)) {
        setErrorMessage('Network error. Please check your connection and try again.');
      } else {
        setErrorMessage(errorText);
      }
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (!canResend || !otpEmail) return;
    if (!EMAIL_PATTERN.test(otpEmail)) {
      setErrorMessage('Invalid email address.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const token = await account.createEmailToken(ID.unique(), otpEmail);
      if (token?.$id) {
        startResendCountdown();
        setErrorMessage('');
      }
    } catch (error) {
      console.error('Resend failed:', error);
      const errorText = error?.message || 'Unable to resend code.';
      if (/network|fetch|connection/i.test(errorText)) {
        setErrorMessage('Network error. Please check your connection and try again.');
      } else {
        setErrorMessage(errorText);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <StatusBar style="light-content" />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.backRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>
              {action === 'signup' ? 'Verify your email' : 'Sign in to MzansiReels'}
            </Text>
          </View>
          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to{' '}
            <Text style={styles.subtitleBold}>{otpEmail}</Text>
          </Text>
          <Text style={styles.subtitleDim}>
            {action === 'signup'
              ? 'This code completes your account creation.'
              : "If you don't see it, check your spam folder."}
          </Text>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ marginBottom: Math.max(insets.bottom, 20) }}
        >
          <View style={styles.inputs}>
            <TextInput
              ref={otpInputRef}
              style={styles.hiddenInput}
              value={otpCode}
              onChangeText={handleOTPChange}
              maxLength={6}
              keyboardType="numeric"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              returnKeyType="done"
              underlineColorAndroid="transparent"
              selectionColor={COLORS.cyan}
            />
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={[styles.inputCell, i === otpCode.length && styles.inputCellActive]}>
                <Text style={[styles.inputDigit, { color: otpCode.length > i ? COLORS.text : 'transparent' }]}>
                  {otpCode[i] || ''}
                </Text>
              </View>
            ))}
          </View>

          {errorMessage ? (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={18} color={COLORS.pink} style={{ marginRight: 8 }} />
              <Text style={[styles.errorText, { color: COLORS.pink }]}>{errorMessage}</Text>
            </View>
          ) : (
            <View style={styles.errorRow}>
              {loading ? (
                <ActivityIndicator size="small" color={COLORS.cyan} style={{ marginRight: 8 }} />
              ) : null}
              <Text style={styles.errorText}>
                {action === 'signup'
                  ? 'Check your email for the 6-digit verification code.'
                  : 'Enter the 6-digit code to continue.'}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.verifyBtn, loading && styles.verifyBtnDisabled]}
            onPress={verifyOtp}
            disabled={loading || otpCode.length !== 6}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.bg} />
            ) : (
              <Text style={styles.verifyBtnText}>
                {action === 'signup' ? 'Verify & Create Account' : 'Verify Code'}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Didn’t receive the code?</Text>
            <TouchableOpacity
              style={styles.resendBtn}
              onPress={resendCode}
              disabled={!canResend || loading}
              activeOpacity={0.8}
            >
              <Text style={[styles.resendCountdown, !canResend && styles.resendCountdownActive]}>
                {canResend ? 'Resend Code' : `Resend in ${secondsLeftRef.current}s`}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  header: {
    marginTop: 20,
    marginBottom: 32,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    padding: 6,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
    marginLeft: 8,
    letterSpacing: -0.5,
  },
  subtitle: {
    color: COLORS.text,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 16,
    textAlign: 'center',
  },
  subtitleBold: {
    fontWeight: '700',
    color: COLORS.cyan,
  },
  subtitleDim: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
    textAlign: 'center',
  },
  inputs: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 32,
    position: 'relative',
  },
  inputCell: {
    width: 48,
    height: 56,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputCellActive: {
    borderColor: COLORS.cyan,
    borderWidth: 2,
  },
  inputDigit: {
    fontSize: 24,
    fontWeight: '700',
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0,
    width: 48,
    height: 56,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
  },
  errorText: {
    color: COLORS.muted,
    fontSize: 13,
  },
  verifyBtn: {
    marginTop: 32,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: COLORS.cyan,
  },
  verifyBtnDisabled: {
    opacity: 0.5,
  },
  verifyBtnText: {
    color: COLORS.bg,
    fontSize: 17,
    fontWeight: '800',
  },
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  resendText: {
    color: COLORS.muted,
    fontSize: 13,
  },
  resendBtn: {
    paddingVertical: 2,
  },
  resendCountdown: {
    color: COLORS.cyan,
    fontSize: 13,
    fontWeight: '700',
  },
  resendCountdownActive: {
    color: COLORS.muted,
  },
});
