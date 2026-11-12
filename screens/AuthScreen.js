import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { account, ID } from '../config/appwrite';
import { COLORS } from '../config/constants';
import { ensureUserDoc } from '../config/helpers';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMEMBERED_EMAIL_KEY = '@mzansireels/remembered-login-email';

export default function AuthScreen({ navigation }) {
  const { setUser } = useAuth();
  const [activeTab, setActiveTab] = useState('login'); 
  const [focusedInput, setFocusedInput] = useState(null);
  const [subtitleIndex, setSubtitleIndex] = useState(0);
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const subtitleOpacity = useRef(new Animated.Value(1)).current;
  const tabIndicatorX = useRef(new Animated.Value(0)).current;
  const subtitles = ['Discover Mzansi talent', 'Scroll. Laugh. Repeat.'];
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [tabWidth, setTabWidth] = useState(0);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingAccount, setPendingAccount] = useState(null);
  const welcomeOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!pendingAccount) return undefined;

    welcomeOpacity.setValue(0);
    const animation = Animated.timing(welcomeOpacity, {
      toValue: 1,
      duration: 650,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [pendingAccount, welcomeOpacity]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(REMEMBERED_EMAIL_KEY)
      .then((savedEmail) => {
        if (active && savedEmail) {
          setEmail(savedEmail);
          setRememberMe(true);
        }
      })
      .catch((error) => console.error('Could not load the remembered login email:', error));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const activeTabIndex = ['login', 'signup', 'otp'].indexOf(activeTab);
    Animated.spring(tabIndicatorX, {
      toValue: activeTabIndex * tabWidth,
      useNativeDriver: true,
      speed: 22,
      bounciness: 3,
    }).start();
  }, [activeTab, tabIndicatorX, tabWidth]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoScale, {
        toValue: 0.9,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 3,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();
  }, [logoScale]);

  useEffect(() => {
    let active = true;
    let timer;

    const cycleSubtitle = () => {
      Animated.timing(subtitleOpacity, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || !active) return;
        setSubtitleIndex((index) => (index + 1) % subtitles.length);
        timer = setTimeout(() => {
          if (!active) return;
          Animated.timing(subtitleOpacity, {
            toValue: 1,
            duration: 550,
            useNativeDriver: true,
          }).start(({ finished: fadedIn }) => {
            if (fadedIn && active) timer = setTimeout(cycleSubtitle, 1800);
          });
        }, 120);
      });
    };

    timer = setTimeout(cycleSubtitle, 1800);
    return () => {
      active = false;
      clearTimeout(timer);
      subtitleOpacity.stopAnimation();
    };
  }, [subtitleOpacity]);

  const inputStyle = (inputName) => [
    styles.input,
    focusedInput === inputName && styles.inputFocused,
  ];

  const handleLogin = async () => {
    if (!email.trim() || !password) return setMessage('Please fill in all fields.');
    setLoading(true);
    setMessage('');
    try {
      await account.createEmailPasswordSession(email.trim(), password);
      try {
        if (rememberMe) {
          await AsyncStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim());
        } else {
          await AsyncStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
      } catch (storageError) {
        console.error('Could not save the remember-me preference:', storageError);
      }
      const user = await account.get();
      const profile = await ensureUserDoc(user);
      setPendingAccount({ user, profile });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password || !confirmPassword) {
      setMessage('Please fill in all fields.');
      return;
    }
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setMessage('Please enter a valid email address.');
      return;
    }
    if (password.length < 8) {
      setMessage('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      try {
        await account.create(ID.unique(), normalizedEmail, password);
      } catch (error) {
        if (error.code === 409 || error.type === 'user_already_exists') {
          setMessage('An account with this email already exists. Please log in or use another email.');
          return;
        }
        throw error;
      }

      await account.createEmailPasswordSession(normalizedEmail, password);
      const signupUser = await account.get();
      await setUser({ ...signupUser, profileSetupComplete: false, interests: [] });
    } catch (error) {
      console.error('Could not complete account registration:', error);
      setMessage(error.message || 'Could not create your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setFocusedInput(null);
    setMessage('');
    setPassword('');
    setConfirmPassword('');
  };

  const handleContinue = () => {
    if (pendingAccount?.user) {
      setUser(pendingAccount.user, {
        skipOnboarding: pendingAccount.profile.profileSetupComplete === true,
      });
    }
  };

  const handleSwitchAccount = async () => {
    setLoading(true);
    setMessage('');
    try {
      await account.deleteSession('current');
      setUser(null);
      setPendingAccount(null);
      setActiveTab('login');
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setFocusedInput(null);
    } catch (error) {
      console.error('Could not sign out before switching accounts:', error);
      setMessage(error.message || 'Could not log out. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (pendingAccount) {
    const { user, profile } = pendingAccount;
    const displayName = profile.username || profile.name || user.name || user.email?.split('@')[0] || 'there';

    return (
      <View style={styles.welcomeRoot}>
        <LinearGradient
          colors={['#111722', '#090A0F', '#001A20']}
          locations={[0, 0.58, 1]}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View style={[styles.welcomeContent, { opacity: welcomeOpacity }]}>
          <View style={styles.welcomeBrand}>
            <Ionicons name="videocam" size={30} color={COLORS.cyan} />
            <Text style={styles.welcomeBrandText}>MzansiReels</Text>
          </View>

          <Avatar
            uri={profile.avatarUrl}
            userId={user.$id}
            name={profile.username || profile.name || user.name}
            size={126}
            bordered
            style={styles.welcomeAvatar}
          />
          <Text style={styles.welcomeTitle}>Welcome back, {displayName}!</Text>
          <Text style={styles.welcomeEmail}>{user.email}</Text>

          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinue}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={styles.continueButtonText}>Continue as {displayName}</Text>
            <Ionicons name="arrow-forward" size={20} color="#001014" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchAccountButton}
            onPress={handleSwitchAccount}
            disabled={loading}
            accessibilityRole="button"
          >
            {loading ? (
              <ActivityIndicator size="small" color={COLORS.cyan} />
            ) : (
              <Text style={styles.switchAccountText}>Not you? Log in to a different account</Text>
            )}
          </TouchableOpacity>
          {!!message && <Text style={styles.message}>{message}</Text>}
        </Animated.View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.authRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient
        colors={['#080A10', '#101820', '#08090E']}
        locations={[0, 0.48, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.backgroundGlowTop} pointerEvents="none" />
      <View style={styles.backgroundGlowBottom} pointerEvents="none" />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
          <Ionicons name="videocam" size={60} color={COLORS.cyan} />
          <Text style={styles.logoText}>MzansiReels</Text>
          <Animated.Text style={[styles.brandSubtitle, { opacity: subtitleOpacity }]}>
            {subtitles[subtitleIndex]}
          </Animated.Text>
        </Animated.View>

        <View style={styles.authCard}>
          <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.authCardContent}>
            <View
              style={styles.tabContainer}
              onLayout={(event) => setTabWidth(event.nativeEvent.layout.width / 3)}
            >
              <Animated.View
                pointerEvents="none"
                style={[styles.tabIndicator, { width: tabWidth, transform: [{ translateX: tabIndicatorX }] }]}
              />
              <TouchableOpacity
                style={styles.tab}
                onPress={() => switchTab('login')}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === 'login' }}
              >
                <Text style={[styles.tabText, activeTab === 'login' && styles.activeTabText]}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tab}
                onPress={() => switchTab('signup')}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === 'signup' }}
              >
                <Text style={[styles.tabText, activeTab === 'signup' && styles.activeTabText]}>Sign Up</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.tab}
                onPress={() => switchTab('otp')}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === 'otp' }}
              >
                <Text style={[styles.tabText, activeTab === 'otp' && styles.activeTabText]}>Email OTP</Text>
              </TouchableOpacity>
            </View>

        {activeTab === 'login' && (
          <>
            <View style={[styles.iconInputRow, focusedInput === 'loginEmail' && styles.inputFocused]}>
              <Ionicons name="mail-outline" size={19} color="#8C969E" style={styles.inputLeadingIcon} />
              <TextInput
                style={styles.iconInput}
                placeholder="Email"
                placeholderTextColor="#888"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedInput('loginEmail')}
                onBlur={() => setFocusedInput(null)}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>
            <View style={[styles.iconInputRow, styles.loginPasswordInputRow, focusedInput === 'loginPassword' && styles.inputFocused]}>
              <Ionicons name="lock-closed-outline" size={19} color="#8C969E" style={styles.inputLeadingIcon} />
              <TextInput
                style={styles.iconInput}
                placeholder="Password"
                placeholderTextColor="#888"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedInput('loginPassword')}
                onBlur={() => setFocusedInput(null)}
                secureTextEntry={!showPassword}
                autoComplete="current-password"
              />
              <TouchableOpacity
                style={styles.inlineEye}
                onPress={() => setShowPassword(!showPassword)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={21} color="#8C969E" />
              </TouchableOpacity>
            </View>
            <View style={styles.loginOptionsRow}>
              <TouchableOpacity
                style={styles.rememberMe}
                onPress={() => setRememberMe((remembering) => !remembering)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberMe }}
              >
                <View style={[styles.checkbox, rememberMe && styles.checkboxSelected]}>
                  {rememberMe && <Ionicons name="checkmark" size={14} color="#001014" />}
                </View>
                <Text style={styles.rememberMeText}>Remember Me</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.forgotPasswordLink}
                onPress={() => navigation.navigate('ForgotPassword')}
                accessibilityRole="button"
              >
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonLoading]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color={COLORS.cyan} /> : <Text style={styles.buttonText}>Login</Text>}
            </TouchableOpacity>
          </>
        )}

        {activeTab === 'signup' && (
          <>
            <View style={styles.signupStepHeader}>
              <Text style={styles.signupStepLabel}>CREATE YOUR ACCOUNT</Text>
              <Text style={styles.signupStepTitle}>Start scrolling with Mzansi.</Text>
              <Text style={styles.signupStepSubtitle}>A few details now. Your profile comes next.</Text>
            </View>
            <View style={[styles.iconInputRow, focusedInput === 'signupEmail' && styles.inputFocused]}>
              <Ionicons name="mail-outline" size={19} color="#8C969E" style={styles.inputLeadingIcon} />
              <TextInput
                style={styles.iconInput}
                placeholder="Email"
                placeholderTextColor="#888"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedInput('signupEmail')}
                onBlur={() => setFocusedInput(null)}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>
            <View style={[styles.iconInputRow, focusedInput === 'signupPassword' && styles.inputFocused]}>
              <Ionicons name="lock-closed-outline" size={19} color="#8C969E" style={styles.inputLeadingIcon} />
              <TextInput
                style={styles.iconInput}
                placeholder="Password (min 8 characters)"
                placeholderTextColor="#888"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedInput('signupPassword')}
                onBlur={() => setFocusedInput(null)}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
              />
              <TouchableOpacity
                style={styles.inlineEye}
                onPress={() => setShowPassword((visible) => !visible)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              >
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={21} color="#8C969E" />
              </TouchableOpacity>
            </View>
            <View style={[styles.iconInputRow, focusedInput === 'signupConfirmPassword' && styles.inputFocused]}>
              <Ionicons name="lock-closed-outline" size={19} color="#8C969E" style={styles.inputLeadingIcon} />
              <TextInput
                style={styles.iconInput}
                placeholder="Confirm Password"
                placeholderTextColor="#888"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onFocus={() => setFocusedInput('signupConfirmPassword')}
                onBlur={() => setFocusedInput(null)}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
              />
            </View>
            <TouchableOpacity
              style={[styles.button, loading && styles.buttonLoading]}
              onPress={handleSignup}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Create Account</Text>}
            </TouchableOpacity>
          </>
        )}

        {activeTab === 'otp' && (
          <>
            <Text style={styles.subtitle}>Sign in or create an account with a one-time email code.</Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => navigation.navigate('EmailOTP')}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>Continue with Email OTP</Text>
            </TouchableOpacity>
          </>
        )}

        {!!message && <Text style={styles.message}>{message}</Text>}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  authRoot: { flex: 1, backgroundColor: COLORS.bg },
  backgroundGlowTop: {
    position: 'absolute',
    top: '8%',
    right: 0,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(0, 229, 255, 0.045)',
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: '4%',
    left: 0,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(24, 42, 68, 0.22)',
  },
  welcomeRoot: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center' },
  welcomeContent: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 36,
  },
  welcomeBrand: { flexDirection: 'row', alignItems: 'center', marginBottom: 52 },
  welcomeBrandText: { color: '#fff', fontSize: 20, fontWeight: '700', marginLeft: 9, letterSpacing: 0.3 },
  welcomeAvatar: {
    borderWidth: 3,
    borderColor: COLORS.cyan,
    marginBottom: 28,
    shadowColor: COLORS.cyan,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  welcomeTitle: { color: '#fff', fontSize: 27, fontWeight: '800', textAlign: 'center' },
  welcomeEmail: { color: COLORS.muted, fontSize: 15, marginTop: 10, marginBottom: 34 },
  continueButton: {
    width: '100%',
    minHeight: 58,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cyan,
    borderRadius: 16,
    paddingHorizontal: 20,
  },
  continueButtonText: { color: '#001014', fontSize: 16, fontWeight: '800', marginRight: 10 },
  switchAccountButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 14, paddingHorizontal: 8 },
  switchAccountText: { color: '#B8C2C8', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 34 },
  logoContainer: { alignItems: 'center', marginBottom: 26 },
  logoText: { color: '#fff', fontSize: 32, fontWeight: 'bold', marginTop: 10, letterSpacing: -0.5 },
  brandSubtitle: { color: '#9299A3', fontSize: 14, marginTop: 8, textAlign: 'center' },
  authCard: {
    width: '100%',
    maxWidth: 470,
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(26,26,30,0.82)',
    shadowColor: '#000',
    shadowOpacity: 0.42,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 12,
  },
  authCardContent: { padding: 25, zIndex: 1 },
  tabContainer: { position: 'relative', flexDirection: 'row', marginBottom: 27, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.09)' },
  tabIndicator: { position: 'absolute', bottom: -1, left: 0, height: 2, backgroundColor: COLORS.cyan, borderRadius: 2, zIndex: 1 },
  tab: { flex: 1, minHeight: 46, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  tabText: { color: '#858B95', fontWeight: '700', fontSize: 13 },
  activeTabText: { color: '#F7FCFD' },
  subtitle: { color: COLORS.muted, fontSize: 14, textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: 'rgba(12,14,18,0.78)', color: '#fff', borderRadius: 12, padding: 18, marginBottom: 15, fontSize: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' },
  inputFocused: {
    borderColor: COLORS.cyan,
    shadowColor: '#00E5FF',
    shadowOpacity: 0.18,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  otpInput: { textAlign: 'center', fontSize: 28, letterSpacing: 10, fontWeight: 'bold', paddingVertical: 20 },
  iconInputRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(12,14,18,0.78)',
  },
  loginPasswordInputRow: { marginBottom: 10 },
  inputLeadingIcon: { marginRight: 12 },
  iconInput: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 15 },
  inlineEye: { padding: 6, marginLeft: 8 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  loginOptionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  rememberMe: { minHeight: 34, flexDirection: 'row', alignItems: 'center' },
  rememberMeText: { color: '#A7ADB5', fontSize: 12, fontWeight: '600' },
  forgotPasswordLink: { paddingVertical: 7, paddingLeft: 8 },
  forgotPasswordText: { color: COLORS.cyan, fontSize: 13, fontWeight: '600' },
  eye: { position: 'absolute', right: 15 },
  button: { minHeight: 54, flexDirection: 'row', justifyContent: 'center', backgroundColor: COLORS.cyan, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  buttonLoading: { backgroundColor: '#12343A' },
  buttonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
  message: { color: COLORS.pink, textAlign: 'center', marginTop: 20, fontWeight: 'bold', fontSize: 15 },
  signupStepHeader: { marginBottom: 20 },
  signupStepLabel: { color: COLORS.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  signupStepTitle: { color: '#fff', fontSize: 23, fontWeight: '800' },
  signupStepSubtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  checkbox: { width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderRadius: 5, borderWidth: 1.5, borderColor: '#737780', marginRight: 10 },
  checkboxSelected: { borderColor: COLORS.cyan, backgroundColor: COLORS.cyan },
});