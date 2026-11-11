import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_SECONDS = 60;

export default function EmailOTPScreen({ navigation }) {
  const { setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [tokenUserId, setTokenUserId] = useState('');
  const [step, setStep] = useState('email');
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const otpInput = useRef(null);

  useEffect(() => {
    if (secondsRemaining <= 0) return undefined;
    const timer = setTimeout(() => setSecondsRemaining((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsRemaining]);

  const sendCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setErrorMessage('Enter a valid email address.');
      return;
    }

    setSending(true);
    setErrorMessage('');
    try {
      const token = await account.createEmailToken(ID.unique(), normalizedEmail);
      setTokenUserId(token.userId);
      setEmail(normalizedEmail);
      setOtp('');
      setSecondsRemaining(RESEND_SECONDS);
      setStep('code');
      setTimeout(() => otpInput.current?.focus(), 150);
    } catch (error) {
      console.error('Could not send email OTP:', error);
      setErrorMessage(error.message || 'Could not send a code. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const resetToApp = () => {
    navigation.reset({
      index: 0,
      routes: [{ name: 'App' }],
    });
  };

  const showWelcomeAndContinue = (isNewUser) => {
    const title = isNewUser ? 'Welcome!' : 'Signed in';
    const message = isNewUser
      ? "It looks like you're new here. Let's set up your profile."
      : 'You are now signed in.';
    if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
      globalThis.alert(`${title}\n\n${message}`);
      resetToApp();
      return;
    }
    Alert.alert(title, message, [{ text: 'Continue', onPress: resetToApp }], { cancelable: false });
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(otp) || !tokenUserId) {
      setErrorMessage('Enter the 6-digit code from your email.');
      return;
    }

    Keyboard.dismiss();
    setVerifying(true);
    setErrorMessage('');
    try {
      await account.createSession(tokenUserId, otp);
      const authenticatedUser = await account.get();
      const profileResult = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
        Query.equal('userId', authenticatedUser.$id),
        Query.limit(1),
      ]);
      let profile = profileResult.documents[0];
      const isNewUser = !profile;
      if (!profile) {
        profile = await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.users,
          ID.unique(),
          {
            userId: authenticatedUser.$id,
            name: '',
            username: '',
            profileSetupComplete: false,
            onboardingComplete: false,
          },
        );
      }

      await setUser(authenticatedUser, {
        skipOnboarding: profile.profileSetupComplete === true,
      });
      showWelcomeAndContinue(isNewUser || profile.profileSetupComplete === false);
    } catch (error) {
      console.error('Could not verify email OTP:', error);
      setErrorMessage(
        error.code === 401 || error.type?.includes('user_invalid_token')
          ? 'Invalid or expired code. Request a new one and try again.'
          : error.message || 'Could not verify the code. Please try again.',
      );
    } finally {
      setVerifying(false);
    }
  };

  const changeEmail = () => {
    setStep('email');
    setOtp('');
    setTokenUserId('');
    setSecondsRemaining(0);
    setErrorMessage('');
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back to login"
        >
          <Ionicons name="arrow-back" size={22} color="#F1F4F7" />
        </TouchableOpacity>

        <View style={styles.brandIcon}>
          <Ionicons name="mail" size={28} color={COLORS.cyan} />
        </View>
        <Text style={styles.title}>{step === 'email' ? 'Sign in with email' : 'Check your email'}</Text>
        <Text style={styles.subtitle}>
          {step === 'email'
            ? 'We’ll send you a one-time code to sign in or create your account.'
            : `Enter the 6-digit code sent to ${email}.`}
        </Text>

        {step === 'email' ? (
          <>
            <Text style={styles.label}>Email address</Text>
            <TextInput
              style={styles.emailInput}
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setErrorMessage('');
              }}
              placeholder="you@example.com"
              placeholderTextColor="#7D8793"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              accessibilityLabel="Email address"
              returnKeyType="send"
              onSubmitEditing={sendCode}
            />
            <TouchableOpacity
              style={[styles.primaryButton, sending && styles.buttonDisabled]}
              onPress={sendCode}
              disabled={sending}
              accessibilityRole="button"
            >
              {sending
                ? <ActivityIndicator color="#071014" />
                : <Text style={styles.primaryButtonText}>Send OTP</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Pressable
              style={styles.otpCells}
              onPress={() => otpInput.current?.focus()}
              accessibilityRole="button"
              accessibilityLabel="Enter six-digit verification code"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <View key={index} style={[styles.otpCell, otp.length === index && styles.otpCellActive]}>
                  <Text style={styles.otpDigit}>{otp[index] || ''}</Text>
                </View>
              ))}
              <TextInput
                ref={otpInput}
                style={styles.hiddenOtpInput}
                value={otp}
                onChangeText={(value) => {
                  setOtp(value.replace(/\D/g, '').slice(0, 6));
                  setErrorMessage('');
                }}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
                maxLength={6}
                caretHidden
                accessibilityLabel="6-digit one-time password"
              />
            </Pressable>

            <TouchableOpacity
              style={[styles.primaryButton, verifying && styles.buttonDisabled]}
              onPress={verifyCode}
              disabled={verifying}
              accessibilityRole="button"
            >
              {verifying
                ? <ActivityIndicator color="#071014" />
                : <Text style={styles.primaryButtonText}>Verify &amp; Login</Text>}
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={styles.resendText}>Didn’t get a code?</Text>
              <TouchableOpacity
                onPress={sendCode}
                disabled={sending || secondsRemaining > 0}
                accessibilityRole="button"
                accessibilityLabel="Resend verification code"
              >
                {sending ? (
                  <ActivityIndicator size="small" color={COLORS.cyan} />
                ) : (
                  <Text style={[
                    styles.resendAction,
                    secondsRemaining > 0 && styles.resendDisabled,
                  ]}>
                    {secondsRemaining > 0 ? `Resend in ${secondsRemaining}s` : 'Resend code'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={changeEmail} style={styles.changeEmail}>
              <Text style={styles.changeEmailText}>Change email address</Text>
            </TouchableOpacity>
          </>
        )}

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingHorizontal: 26,
    paddingVertical: 28,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 22,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    backgroundColor: COLORS.card,
  },
  brandIcon: {
    width: 60,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderRadius: 30,
    backgroundColor: 'rgba(0,229,255,0.11)',
  },
  title: { color: '#F3F5F7', fontSize: 26, fontWeight: '900', textAlign: 'center', marginTop: 22 },
  subtitle: { color: '#9BA3AD', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, marginBottom: 30 },
  label: { color: '#DCE1E6', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  emailInput: {
    height: 54,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#343B45',
    borderRadius: 13,
    backgroundColor: '#151923',
    color: '#F3F5F7',
    fontSize: 15,
  },
  primaryButton: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    borderRadius: 14,
    backgroundColor: COLORS.cyan,
  },
  buttonDisabled: { opacity: 0.65 },
  primaryButtonText: { color: '#071014', fontSize: 15, fontWeight: '900' },
  otpCells: { flexDirection: 'row', justifyContent: 'space-between', position: 'relative', marginBottom: 8 },
  otpCell: {
    width: 42,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#343B45',
    borderRadius: 11,
    backgroundColor: '#151923',
  },
  otpCellActive: { borderColor: COLORS.cyan },
  otpDigit: { color: '#F3F5F7', fontSize: 22, fontWeight: '800' },
  hiddenOtpInput: { ...StyleSheet.absoluteFillObject, opacity: 0, color: 'transparent' },
  resendRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 24 },
  resendText: { color: '#9BA3AD', fontSize: 13 },
  resendAction: { color: COLORS.cyan, fontSize: 13, fontWeight: '800' },
  resendDisabled: { color: '#78818C' },
  changeEmail: { alignSelf: 'center', paddingVertical: 14 },
  changeEmailText: { color: '#AAB1BA', fontSize: 13, fontWeight: '600' },
  error: {
    color: '#FF737F',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 18,
  },
});
