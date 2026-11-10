import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform, Animated, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { account, databases, ID } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import { ensureUserDoc } from '../config/helpers';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import Avatar from '../components/Avatar';

export default function AuthScreen({ navigation }) {
  const { setUser } = useAuth();
  const [activeTab, setActiveTab] = useState('login'); 
  const [focusedInput, setFocusedInput] = useState(null);
  const [subtitleIndex, setSubtitleIndex] = useState(0);
  const logoScale = useRef(new Animated.Value(0.82)).current;
  const subtitleOpacity = useRef(new Animated.Value(1)).current;
  const subtitles = ['Discover Mzansi talent', 'Scroll. Laugh. Repeat.'];
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [otp, setOtp] = useState('');
  const [userId, setUserId] = useState(null);
  const [isOtpSent, setIsOtpSent] = useState(false);
  
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
      const user = await account.get();
      const profile = await ensureUserDoc(user);
      setPendingAccount({ user, profile });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!name.trim() || !email.trim() || !password) return setMessage('Please fill in all fields.');
    if (password.length < 8) return setMessage('Password must be at least 8 characters.');
    
    setLoading(true);
    setMessage('');
    try {
      await account.create(ID.unique(), email.trim(), password, name.trim());
      await account.createEmailPasswordSession(email.trim(), password);
      const user = await account.get();
      
      await databases.createDocument(DATABASE_ID, COLLECTIONS.users, ID.unique(), {
        userId: user.$id,
        name: name.trim(),
        username: name.trim().toLowerCase().replace(/\s+/g, ''),
        followers: 0,
        following: 0,
        isVerified: false,
        isPrivate: false,
        pushNotifications: true,
        interests: ""
      });

      setUser(user);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    if (!email.trim()) return setMessage('Please enter your email.');
    setLoading(true);
    setMessage('');
    try {
      const token = await account.createEmailToken(ID.unique(), email.trim());
      setUserId(token.userId);
      setIsOtpSent(true);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 6) return setMessage('Please enter the 6-digit code.');
    setLoading(true);
    setMessage('');
    try {
      await account.createSession(userId, otp);
      const user = await account.get();
      ensureUserDoc(user).catch(() => {});
      setUser(user);
    } catch (error) {
      setMessage('Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setFocusedInput(null);
    setMessage('');
    setIsOtpSent(false);
    setName('');
    setPassword('');
    setOtp('');
  };

  const handleContinue = () => {
    if (pendingAccount?.user) setUser(pendingAccount.user);
  };

  const handleSwitchAccount = async () => {
    setLoading(true);
    setMessage('');
    try {
      await account.deleteSession('current');
      setUser(null);
      setPendingAccount(null);
      setActiveTab('login');
      setName('');
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setOtp('');
      setUserId(null);
      setIsOtpSent(false);
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        
        <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
          <Ionicons name="videocam" size={60} color={COLORS.cyan} />
          <Text style={styles.logoText}>MzansiReels</Text>
          <Animated.Text style={[styles.brandSubtitle, { opacity: subtitleOpacity }]}>
            {subtitles[subtitleIndex]}
          </Animated.Text>
        </Animated.View>

        <View style={styles.tabContainer}>
          <TouchableOpacity style={[styles.tab, activeTab === 'login' && styles.activeTab]} onPress={() => switchTab('login')}>
            <Text style={[styles.tabText, activeTab === 'login' && styles.activeTabText]}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'signup' && styles.activeTab]} onPress={() => switchTab('signup')}>
            <Text style={[styles.tabText, activeTab === 'signup' && styles.activeTabText]}>Sign Up</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 'otp' && styles.activeTab]} onPress={() => switchTab('otp')}>
            <Text style={[styles.tabText, activeTab === 'otp' && styles.activeTabText]}>Email OTP</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'login' && (
          <>
            <TextInput
              style={inputStyle('loginEmail')}
              placeholder="Email"
              placeholderTextColor="#888"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocusedInput('loginEmail')}
              onBlur={() => setFocusedInput(null)}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <View style={styles.passwordRow}>
              <TextInput
                style={[inputStyle('loginPassword'), { flex: 1, marginBottom: 0 }]}
                placeholder="Password"
                placeholderTextColor="#888"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedInput('loginPassword')}
                onBlur={() => setFocusedInput(null)}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity style={styles.eye} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color="#888" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.forgotPasswordLink}
              onPress={() => navigation.navigate('ForgotPassword')}
              accessibilityRole="button"
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>
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
            <TextInput
              style={inputStyle('signupName')}
              placeholder="Full Name"
              placeholderTextColor="#888"
              value={name}
              onChangeText={setName}
              onFocus={() => setFocusedInput('signupName')}
              onBlur={() => setFocusedInput(null)}
            />
            <TextInput
              style={inputStyle('signupEmail')}
              placeholder="Email"
              placeholderTextColor="#888"
              value={email}
              onChangeText={setEmail}
              onFocus={() => setFocusedInput('signupEmail')}
              onBlur={() => setFocusedInput(null)}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <View style={styles.passwordRow}>
              <TextInput
                style={[inputStyle('signupPassword'), { flex: 1, marginBottom: 0 }]}
                placeholder="Password (min 8 chars)"
                placeholderTextColor="#888"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setFocusedInput('signupPassword')}
                onBlur={() => setFocusedInput(null)}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity style={styles.eye} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color="#888" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.button} onPress={handleSignUp} disabled={loading}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Create Account</Text>}
            </TouchableOpacity>
          </>
        )}

        {activeTab === 'otp' && (
          <>
            {!isOtpSent ? (
              <>
                <Text style={styles.subtitle}>We will send a 6-digit code to your email</Text>
                <TextInput
                  style={inputStyle('otpEmail')}
                  placeholder="Email"
                  placeholderTextColor="#888"
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedInput('otpEmail')}
                  onBlur={() => setFocusedInput(null)}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TouchableOpacity style={styles.button} onPress={handleSendOtp} disabled={loading}>
                  {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Send Code</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.subtitle}>Enter the code sent to {email}</Text>
                <TextInput
                  style={[inputStyle('otpCode'), styles.otpInput]}
                  placeholder="000000"
                  placeholderTextColor="#555"
                  value={otp}
                  onChangeText={setOtp}
                  onFocus={() => setFocusedInput('otpCode')}
                  onBlur={() => setFocusedInput(null)}
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <TouchableOpacity style={styles.button} onPress={handleVerifyOtp} disabled={loading}>
                  {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Verify & Login</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsOtpSent(false)} style={{ marginTop: 15 }}>
                  <Text style={{ color: COLORS.muted, textAlign: 'center' }}>Change email</Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}

        {!!message && <Text style={styles.message}>{message}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
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
  container: { flexGrow: 1, justifyContent: 'center', padding: 25 },
  logoContainer: { alignItems: 'center', marginBottom: 30 },
  logoText: { color: '#fff', fontSize: 32, fontWeight: 'bold', marginTop: 10 },
  brandSubtitle: { color: COLORS.muted, fontSize: 14, marginTop: 8, textAlign: 'center' },
  tabContainer: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 12, padding: 5, marginBottom: 25 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  activeTab: { backgroundColor: COLORS.cyan },
  tabText: { color: '#888', fontWeight: 'bold', fontSize: 14 },
  activeTabText: { color: '#000' },
  subtitle: { color: COLORS.muted, fontSize: 14, textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: COLORS.card, color: '#fff', borderRadius: 12, padding: 18, marginBottom: 15, fontSize: 16, borderWidth: 1, borderColor: '#333' },
  inputFocused: {
    borderColor: COLORS.cyan,
    shadowColor: COLORS.cyan,
    shadowOpacity: 0.35,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  otpInput: { textAlign: 'center', fontSize: 28, letterSpacing: 10, fontWeight: 'bold', paddingVertical: 20 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  forgotPasswordLink: { alignSelf: 'flex-end', marginTop: -7, marginBottom: 7, paddingVertical: 6 },
  forgotPasswordText: { color: COLORS.cyan, fontSize: 13, fontWeight: '600' },
  eye: { position: 'absolute', right: 15 },
  button: { backgroundColor: COLORS.cyan, padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  buttonLoading: { backgroundColor: '#12343A' },
  buttonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
  message: { color: COLORS.pink, textAlign: 'center', marginTop: 20, fontWeight: 'bold', fontSize: 15 },
});