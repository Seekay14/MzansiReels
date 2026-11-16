import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import { account, databases, ID, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useResponsiveLayout } from '../config/responsive';
import Avatar from '../components/Avatar';
import { SESSION_TYPE_REGISTERED, SESSION_TYPE_ANONYMOUS, SESSION_TYPE_GUEST, SESSION_TYPE_NONE, detectSessionType } from '../App';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMEMBERED_EMAIL_KEY = '@mzansireels/remembered-login-email';

function showLoginError(error) {
  const message = error?.message || 'An unexpected error occurred.';
  if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
    globalThis.alert(`Login Error\n\n${message}`);
    return;
  }
  Alert.alert('Login Error', message);
}

const AUTH_MESSAGES = {
  emptyEmail: 'Please enter your email address.',
  emptyName: 'Please enter your name.',
  emptyPassword: 'Please enter your password.',
  emptyConfirmation: 'Please confirm your password.',
  invalidEmail: 'Please enter a valid email address.',
  duplicateEmail: 'An account with this email already exists.',
  invalidCredentials: 'Incorrect email or password.',
  authenticationFailure: 'Appwrite rejected the sign-in. Verify email/password authentication and the account status.',
  configurationFailure: 'Appwrite project or platform settings rejected the request. Verify the endpoint, project ID, and registered platform.',
  network: 'Unable to connect. Please check your internet connection.',
  loginFailure: 'Could not log in. Please try again.',
  signupFailure: 'Could not create your account. Please try again.',
};

const getAuthErrorCategory = (error) => {
  const errorText = `${error?.message || ''} ${error?.type || ''}`.toLowerCase();
  if (/network request failed|network error|networkerror|fetch failed|failed to fetch|load failed|no internet|offline|connection (?:refused|timed out|reset)|timed out|socket hang up/.test(errorText)) {
    return 'network';
  }
  if (/project|platform|origin|endpoint/.test(errorText) || [403, 404].includes(Number(error?.code))) {
    return 'configuration_or_permission';
  }
  if (Number(error?.code) === 401 || error?.type === 'user_invalid_credentials') {
    return 'authentication';
  }
  return 'unknown';
};

const getAuthErrorMessage = (error, action) => {
  if (error?.type === 'user_already_exists' || (action === 'signup' && error?.code === 409)) {
    return AUTH_MESSAGES.duplicateEmail;
  }
  if (error?.type === 'user_invalid_credentials') {
    return AUTH_MESSAGES.invalidCredentials;
  }
  if (error?.type === 'user_invalid_email') {
    return AUTH_MESSAGES.invalidEmail;
  }

  const category = getAuthErrorCategory(error);
  if (category === 'network') return AUTH_MESSAGES.network;
  if (category === 'configuration_or_permission') return AUTH_MESSAGES.configurationFailure;
  if (category === 'authentication' && action === 'login') {
    return AUTH_MESSAGES.authenticationFailure;
  }

  return action === 'signup' ? AUTH_MESSAGES.signupFailure : AUTH_MESSAGES.loginFailure;
};

const getSafeAuthErrorResponse = (response) => {
  let details = response;
  if (typeof details === 'string') {
    try {
      details = JSON.parse(details);
    } catch {
      return undefined;
    }
  }
  if (!details || typeof details !== 'object') return undefined;

  return {
    message: typeof details.message === 'string' ? details.message : undefined,
    code: typeof details.code === 'number' ? details.code : undefined,
    type: typeof details.type === 'string' ? details.type : undefined,
  };
};

const logAuthError = (error, stage) => {
  if (!__DEV__) return;
  console.error('Appwrite login failed:', {
    stage,
    category: getAuthErrorCategory(error),
    message: error?.message || String(error),
    code: error?.code ?? null,
    type: error?.type || null,
    response: getSafeAuthErrorResponse(error?.response),
    stack: error?.stack || null,
  });
};

function AppwriteAuthScreen({ navigation, initialTab = 'login' }) {
  const { setUser } = useAuth();
  const { scale, horizontalGutter } = useResponsiveLayout();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [focusedInput, setFocusedInput] = useState(null);
  const [subtitleIndex, setSubtitleIndex] = useState(0);
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const subtitleOpacity = useRef(new Animated.Value(1)).current;
  const tabIndicatorX = useRef(new Animated.Value(0)).current;
  const subtitles = ['Discover Mzansi talent', 'Scroll. Laugh. Repeat.'];
  
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [tabWidth, setTabWidth] = useState(0);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingAccount, setPendingAccount] = useState(null);
  const [otpUserId, setOtpUserId] = useState('');
  const [otpEmail, setOtpEmail] = useState('');
  const welcomeOpacity = useRef(new Animated.Value(0)).current;
  const signupOpacity = useRef(new Animated.Value(0)).current;
  const signupTranslate = useRef(new Animated.Value(30)).current;

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
    if (activeTab !== 'signup') return undefined;
    signupOpacity.setValue(0);
    signupTranslate.setValue(30);
    Animated.parallel([
      Animated.timing(signupOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(signupTranslate, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
    return undefined;
  }, [activeTab, signupOpacity, signupTranslate]);

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

  const loginUser = async (loginEmail, loginPassword) => {
    const normalizedEmail = loginEmail.trim();
    if (!normalizedEmail) return setMessage(AUTH_MESSAGES.emptyEmail);
    if (!EMAIL_PATTERN.test(normalizedEmail)) return setMessage(AUTH_MESSAGES.invalidEmail);
    if (!loginPassword) return setMessage(AUTH_MESSAGES.emptyPassword);
    setLoading(true);
    setMessage('');
    try {
      // STEP 1: Verify password by creating a session, then immediately logging out.
      console.log('OTP LOGIN STEP 1: Creating email/password session');
      await account.createEmailPasswordSession(normalizedEmail, loginPassword);
      console.log('OTP LOGIN STEP 1: Deleting session');
      await account.deleteSession('current');

      // STEP 2: Send a 6-digit OTP code to the email.
      console.log('OTP LOGIN STEP 2: Creating email token');
      const token = await account.createEmailToken(ID.unique(), normalizedEmail);
      if (!token?.$id) {
        throw new Error('Appwrite did not return an email token.');
      }
      setOtpUserId(token.userId);
      setOtpEmail(normalizedEmail);
      navigation.navigate('OTPScreen', { otpUserId: token.userId, otpEmail: normalizedEmail });
      console.log('OTP LOGIN STEP 2: OTP sent to', normalizedEmail);
    } catch (error) {
      logAuthError(error, 'otp login');
      const errorMessage = error?.message || 'An unexpected error occurred.';
      showLoginError({ message: errorMessage });
      setMessage(`Login Failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (otpCode) => {
    if (!otpUserId) return setMessage('Session expired. Please try logging in again.');
    if (!otpCode || otpCode.length !== 6) return setMessage('Please enter a valid 6-digit code.');
    setLoading(true);
    setMessage('');
    try {
      // STEP 3: Verify the OTP code and create the authenticated session.
      console.log('OTP LOGIN STEP 3: Verifying OTP');
      await account.createSession(otpUserId, otpCode);
      console.log('OTP LOGIN STEP 3: Session created, fetching user');

      // Fetch the authenticated user profile.
      const currentUser = await account.get();
      const authUser = {
        $id: currentUser.$id,
        email: currentUser.email || otpEmail,
        name: currentUser.name || '',
        status: true,
      };

      // Save user to Auth Context and navigate to Home.
      await setUser(authUser);
      console.log('OTP LOGIN STEP 3 COMPLETE: User saved and navigating home');
      navigation.navigate('Home');
    } catch (error) {
      logAuthError(error, 'otp verification');
      const errorMessage = error?.message || 'An unexpected error occurred.';
      showLoginError({ message: errorMessage });
      setMessage(`OTP Verification Failed: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const registerUser = async (signupEmail, signupPassword, signupName) => {
    const normalizedEmail = signupEmail.trim().toLowerCase();
    const normalizedName = signupName.trim();
    if (!normalizedEmail) return setMessage(AUTH_MESSAGES.emptyEmail);
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setMessage(AUTH_MESSAGES.invalidEmail);
      return;
    }
    if (!normalizedName) return setMessage(AUTH_MESSAGES.emptyName);
    if (!signupPassword) return setMessage(AUTH_MESSAGES.emptyPassword);
    if (!confirmPassword) return setMessage(AUTH_MESSAGES.emptyConfirmation);
    if (signupPassword.length < 8) {
      setMessage('Password must be at least 8 characters.');
      return;
    }
    if (signupPassword !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      // Create the user account in Appwrite (does NOT create a session).
      await account.create(ID.unique(), normalizedEmail, signupPassword, normalizedName);

      // Create an email/password session for the newly registered user.
      const session = await account.createEmailPasswordSession(normalizedEmail, signupPassword);
      if (!session?.$id || !session?.userId) {
        throw new Error('Appwrite returned a session without its session ID or user ID.');
      }
      console.log('SESSION CREATED:', {
        sessionId: session.$id,
        userId: session.userId,
      });

      // Verify the session type is 'registered' before treating the user as
      // signed in. Anonymous/guest sessions are not treated as authenticated.
      const sessionType = await detectSessionType();
      if (sessionType !== SESSION_TYPE_REGISTERED) {
        throw new Error('Registration failed: expected a registered-user session.');
      }

      // Fetch the verified Appwrite user record.
      const currentUser = await account.get();

      // Create the user profile document in the database.
      await databases.createDocument(DATABASE_ID, COLLECTIONS.users, ID.unique(), {
        userId: currentUser.$id,
        name: normalizedName,
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

      // Update the application auth state with the verified user.
      await setUser(currentUser, { skipOnboarding: false });

      console.log('REGISTRATION STEP COMPLETE: User registered and session verified');
    } catch (error) {
      console.error('Could not complete account registration:', error);
      showLoginError(error);
      setMessage(getAuthErrorMessage(error, 'signup'));
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
            <Text style={[styles.welcomeBrandText, { color: COLORS.text }]}>MzansiReels</Text>
          </View>

          <Avatar
            uri={profile.avatarUrl}
            userId={user.$id}
            name={profile.username || profile.name || user.name}
            size={126}
            bordered
            style={styles.welcomeAvatar}
          />
          <Text style={[styles.welcomeTitle, { color: COLORS.text }]}>Welcome back, {displayName}!</Text>
          <Text style={styles.welcomeEmail}>{user.email}</Text>

          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleContinue}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={[styles.continueButtonText, { color: COLORS.text }]}>Continue as {displayName}</Text>
            <Ionicons name="arrow-forward" size={20} color={COLORS.text} />
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
              <Text style={[styles.switchAccountText, { color: COLORS.muted }]}>Not you? Log in to a different account</Text>
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
        contentContainerStyle={[
          styles.container,
          { paddingHorizontal: horizontalGutter, paddingVertical: 28 * scale },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.logoContainer, { marginBottom: 22 * scale, transform: [{ scale: logoScale }] }]}>
          <Ionicons name="videocam" size={60 * scale} color={COLORS.cyan} />
          <Text style={[styles.logoText, { color: COLORS.text, fontSize: 32 * scale }]}>MzansiReels</Text>
          <Animated.Text style={[styles.brandSubtitle, { opacity: subtitleOpacity, color: COLORS.muted }]}>
            {subtitles[subtitleIndex]}
          </Animated.Text>
        </Animated.View>

        <View style={styles.authCard}>
          <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={[styles.authCardContent, { padding: 25 * scale }]}>
            <View
              style={[styles.tabContainer, { borderBottomColor: COLORS.border }]}
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
            <View style={[styles.iconInputRow, { borderColor: COLORS.border, backgroundColor: COLORS.card },focusedInput === 'loginEmail' && styles.inputFocused]}>
              <Ionicons name="mail-outline" size={19} color={COLORS.muted} style={styles.inputLeadingIcon} />
              <TextInput
                style={[styles.iconInput, { color: COLORS.text }]}
                placeholder="Email"
                placeholderTextColor={COLORS.muted}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedInput('loginEmail')}
                onBlur={() => setFocusedInput(null)}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>
            <View style={[styles.iconInputRow, { borderColor: COLORS.border, backgroundColor: COLORS.card },styles.loginPasswordInputRow, focusedInput === 'loginPassword' && styles.inputFocused]}>
              <Ionicons name="lock-closed-outline" size={19} color={COLORS.muted} style={styles.inputLeadingIcon} />
              <TextInput
                style={[styles.iconInput, { color: COLORS.text }]}
                placeholder="Password"
                placeholderTextColor={COLORS.muted}
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
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={21} color={COLORS.muted} />
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
                  {rememberMe && <Ionicons name="checkmark" size={14} color={COLORS.text} />}
                </View>
                <Text style={[styles.rememberMeText, { color: COLORS.muted }]}>Remember Me</Text>
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
              onPress={() => loginUser(email, password)}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color={COLORS.cyan} /> : <Text style={styles.buttonText}>Login</Text>}
            </TouchableOpacity>
          </>
        )}

        {activeTab === 'signup' && (
          <Animated.View style={[styles.signupWrapper, { opacity: signupOpacity, transform: [{ translateY: signupTranslate }] }]}>
            <LinearGradient
              colors={['#0B0E14', '#111827', '#0B0E14']}
              locations={[0, 0.58, 1]}
              style={styles.signupGradient}
            />
            <View style={styles.signupOrbTop} pointerEvents="none" />
            <View style={styles.signupOrbBottom} pointerEvents="none" />
            <View style={styles.signupStepHeader}>
              <Text style={styles.signupStepLabel}>JOIN THE MZANSI</Text>
              <Text style={[styles.signupStepTitle, { color: COLORS.text }]}>Create your account</Text>
              <Text style={styles.signupStepSubtitle}>Your next favorite creator is one tap away.</Text>
            </View>
            <View style={[styles.signupIconInputRow, { borderColor: COLORS.border, backgroundColor: 'rgba(255,255,255,0.03)' }, focusedInput === 'signupName' && styles.signupInputFocused]}>
              <Ionicons name="person-outline" size={19} color={focusedInput === 'signupName' ? COLORS.cyan : '#8C969E'} style={styles.inputLeadingIcon} />
              <TextInput
                style={[styles.signupIconInput, { color: COLORS.text }]}
                placeholder="Full name"
                placeholderTextColor={COLORS.muted}
                value={fullName}
                onChangeText={setFullName}
                onFocus={() => setFocusedInput('signupName')}
                onBlur={() => setFocusedInput(null)}
                autoCapitalize="words"
                autoComplete="name"
              />
            </View>
            <View style={[styles.signupIconInputRow, { borderColor: COLORS.border, backgroundColor: 'rgba(255,255,255,0.03)' }, focusedInput === 'signupEmail' && styles.signupInputFocused]}>
              <Ionicons name="mail-outline" size={19} color={focusedInput === 'signupEmail' ? COLORS.cyan : '#8C969E'} style={styles.inputLeadingIcon} />
              <TextInput
                style={[styles.signupIconInput, { color: COLORS.text }]}
                placeholder="Email"
                placeholderTextColor={COLORS.muted}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedInput('signupEmail')}
                onBlur={() => setFocusedInput(null)}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>
            <View style={[styles.signupIconInputRow, { borderColor: COLORS.border, backgroundColor: 'rgba(255,255,255,0.03)' }, focusedInput === 'signupPassword' && styles.signupInputFocused]}>
              <Ionicons name="lock-closed-outline" size={19} color={focusedInput === 'signupPassword' ? COLORS.cyan : '#8C969E'} style={styles.inputLeadingIcon} />
              <TextInput
                style={[styles.signupIconInput, { color: COLORS.text }]}
                placeholder="Password (min 8 characters)"
                placeholderTextColor={COLORS.muted}
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
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={21} color={focusedInput === 'signupPassword' ? COLORS.cyan : COLORS.muted} />
              </TouchableOpacity>
            </View>
            <View style={[styles.signupIconInputRow, { borderColor: COLORS.border, backgroundColor: 'rgba(255,255,255,0.03)' }, focusedInput === 'signupConfirmPassword' && styles.signupInputFocused]}>
              <Ionicons name="lock-closed-outline" size={19} color={focusedInput === 'signupConfirmPassword' ? COLORS.cyan : '#8C969E'} style={styles.inputLeadingIcon} />
              <TextInput
                style={[styles.signupIconInput, { color: COLORS.text }]}
                placeholder="Confirm Password"
                placeholderTextColor={COLORS.muted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onFocus={() => setFocusedInput('signupConfirmPassword')}
                onBlur={() => setFocusedInput(null)}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
              />
            </View>
            <TouchableOpacity
              style={[styles.signupButton, { backgroundColor: COLORS.cyan }]}
              onPress={() => registerUser(email, password, fullName)}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading ? <ActivityIndicator color={COLORS.bg} /> : <Text style={[styles.signupButtonText, { color: COLORS.bg }]}>Create Account</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.signupLoginLink} onPress={() => switchTab('login')}>
              <Text style={[styles.signupLoginLinkText, { color: COLORS.text }]}>Already have an account?</Text>
              <Text style={[styles.signupLoginLinkText, { color: COLORS.cyan, fontWeight: '800' }]}> Log In</Text>
            </TouchableOpacity>
          </Animated.View>
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

export default function AuthScreen(props) {
  return <AppwriteAuthScreen {...props} />;
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
  brandSubtitle: { color: COLORS.muted, fontSize: 14, marginTop: 8, textAlign: 'center' },
  authCard: {
    width: '100%',
    maxWidth: 470,
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    shadowColor: COLORS.bg,
    shadowOpacity: 0.42,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 12,
  },
  authCardContent: { padding: 25, zIndex: 1 },
  tabContainer: { position: 'relative', flexDirection: 'row', marginBottom: 27, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabIndicator: { position: 'absolute', bottom: -1, left: 0, height: 2, backgroundColor: COLORS.cyan, borderRadius: 2, zIndex: 1 },
  tab: { flex: 1, minHeight: 46, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3 },
  tabText: { color: COLORS.muted, fontWeight: '700', fontSize: 13 },
  activeTabText: { color: COLORS.text },
  subtitle: { color: COLORS.muted, fontSize: 14, textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: COLORS.card, color: COLORS.text, borderRadius: 12, padding: 18, marginBottom: 15, fontSize: 16, borderWidth: 1, borderColor: COLORS.border },
  inputFocused: {
    borderColor: COLORS.cyan,
    shadowColor: COLORS.cyan,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
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
  buttonLoading: { backgroundColor: COLORS.bg },
  buttonText: { color: COLORS.bg, fontSize: 18, fontWeight: 'bold' },
  message: { color: COLORS.pink, textAlign: 'center', marginTop: 20, fontWeight: 'bold', fontSize: 15 },
  signupStepHeader: { marginBottom: 22 },
  signupStepLabel: { color: COLORS.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
  signupStepTitle: { color: COLORS.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  signupStepSubtitle: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  signupWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 24 },
  signupGradient: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  signupOrbTop: { position: 'absolute', top: '6%', right: -40, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(0,229,255,0.08)', blurRadius: 40 },
  signupOrbBottom: { position: 'absolute', bottom: '8%', left: -40, width: 340, height: 340, borderRadius: 170, backgroundColor: 'rgba(255,0,85,0.06)', blurRadius: 40 },
  signupIconInputRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  signupIconInput: { flex: 1, color: COLORS.text, fontSize: 15, paddingVertical: 16 },
  signupInputFocused: {
    borderColor: COLORS.cyan,
    shadowColor: COLORS.cyan,
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  signupButton: { minHeight: 58, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', borderRadius: 18, marginTop: 20, overflow: 'hidden' },
  signupButtonText: { color: COLORS.bg, fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
  signupLoginLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  signupLoginLinkText: { fontSize: 13, fontWeight: '600' },
  checkbox: { width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderRadius: 5, borderWidth: 1.5, borderColor: COLORS.muted, marginRight: 10 },
  checkboxSelected: { borderColor: COLORS.cyan, backgroundColor: COLORS.cyan },
});
