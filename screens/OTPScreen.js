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
import { account, ID } from '../config/appwrite';
import { COLORS } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OTPScreen({ navigation, route }) {
  const { setUser } = useAuth();
  const insets = useSafeAreaInsets();
  const { otpUserId, otpEmail } = route?.params || {};

const [otpCode, setOtpCode] = useState('');
const [loading, setLoading] = useState(false);
const [resendTime, setResendTime] = useState(0);
const resendCountdownRef = useRef(null);
const secondsLeftRef = useRef(30);

  useEffect(() => {
    return () => {
      if (resendCountdownRef.current) clearInterval(resendCountdownRef.current);
    };
  }, []);

  const startResendCountdown = useCallback(() => {
    secondsLeftRef.current = 30;
    if (resendCountdownRef.current) clearInterval(resendCountdownRef.current);
    resendCountdownRef.current = setInterval(() => {
      secondsLeftRef.current -= 1;
      setResendTime(secondsLeftRef.current);
      if (secondsLeftRef.current <= 0) {
        clearInterval(resendCountdownRef.current);
        resendCountdownRef.current = null;
      }
    }, 1000);
  }, []);

  useEffect(() => {
    startResendCountdown();
  }, [startResendCountdown]);

  const canResend = secondsLeftRef.current <= 0;

  const handleOTPChange = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setOtpCode(digits);
    if (digits.length === 6) {
      setTimeout(() => {
        verifyOtp();
      }, 300);
    }
  };

  const handleKeyPress = (event) => {
    if (event.nativeEvent.key === 'Backspace' && otpCode.length === 0) {
      // Nothing to delete
    }
  };

  const verifyOtp = async () => {
    if (!otpUserId) {
      Alert.alert('Session expired', 'Please try logging in again.');
      return;
    }
    if (!otpCode || otpCode.length !== 6) {
      Alert.alert('Invalid code', 'Please enter a valid 6-digit code.');
      return;
    }
    setLoading(true);
    try {
      await account.createSession(otpUserId, otpCode);
      const currentUser = await account.get();
      const authUser = {
        $id: currentUser.$id,
        email: currentUser.email || otpEmail,
        name: currentUser.name || '',
        status: true,
      };
      await setUser(authUser);
      navigation.navigate('Home');
    } catch (error) {
      console.error('OTP verification failed:', error);
      Alert.alert('Invalid or expired code', error?.message || 'The verification code is incorrect or has expired. Please request a new one.');
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    if (!canResend || !otpEmail) return;
    setLoading(true);
    try {
      await account.deleteSession('current');
      await account.createEmailPasswordSession(otpEmail, '');
      await account.deleteSession('current');
      const token = await account.createEmailToken(ID.unique(), otpEmail);
      if (token?.$id) {
        startResendCountdown();
      }
    } catch (error) {
      console.error('Resend failed:', error);
      Alert.alert('Could not resend code', error?.message || 'Unable to resend the verification code. Please try again.');
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
            <Text style={styles.headerTitle}>Verify your email</Text>
          </View>
          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to{' '}
            <Text style={styles.subtitleBold}>{otpEmail}</Text>
          </Text>
          <Text style={styles.subtitleDim}>If you don’t see it, check your spam folder.</Text>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ marginBottom: Math.max(insets.bottom, 20) }}>
          <View style={styles.inputs}>
            <TextInput
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

          <View style={styles.errorRow}>
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.cyan} style={{ marginRight: 8 }} />
            ) : null}
            <Text style={styles.errorText}>Enter the 6-digit code to continue.</Text>
          </View>

          <TouchableOpacity
            style={[styles.verifyBtn, loading && styles.verifyBtnDisabled]}
            onPress={verifyOtp}
            disabled={loading || otpCode.length !== 6}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.bg} />
            ) : (
              <Text style={styles.verifyBtnText}>Verify Code</Text>
            )}
          </TouchableOpacity>

          <View style={styles.resendRow}>
            <Text style={styles.resendText}>Didn’t receive the code?</Text>
            <TouchableOpacity
              style={styles.resendBtn}
              onPress={resendCode}
              disabled={!canResend}
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
