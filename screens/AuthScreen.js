import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { account, databases, ID } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import { ensureUserDoc } from '../config/helpers';

export default function AuthScreen({ onLoginSuccess }) {
  const [activeTab, setActiveTab] = useState('login'); 
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [otp, setOtp] = useState('');
  const [userId, setUserId] = useState(null);
  const [isOtpSent, setIsOtpSent] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password) return setMessage('Please fill in all fields.');
    setLoading(true);
    setMessage('');
    try {
      await account.createEmailPasswordSession(email.trim(), password);
      const user = await account.get();
      ensureUserDoc(user).catch(() => {});
      onLoginSuccess(user);
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

      onLoginSuccess(user);
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
      onLoginSuccess(user);
    } catch (error) {
      setMessage('Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (tab) => {
    setActiveTab(tab);
    setMessage('');
    setIsOtpSent(false);
    setName('');
    setPassword('');
    setOtp('');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        
        <View style={styles.logoContainer}>
          <Ionicons name="videocam" size={60} color={COLORS.cyan} />
          <Text style={styles.logoText}>MzansiReels</Text>
        </View>

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
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#888" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <View style={styles.passwordRow}>
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Password" placeholderTextColor="#888" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
              <TouchableOpacity style={styles.eye} onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={22} color="#888" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Login</Text>}
            </TouchableOpacity>
          </>
        )}

        {activeTab === 'signup' && (
          <>
            <TextInput style={styles.input} placeholder="Full Name" placeholderTextColor="#888" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#888" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <View style={styles.passwordRow}>
              <TextInput style={[styles.input, { flex: 1, marginBottom: 0 }]} placeholder="Password (min 8 chars)" placeholderTextColor="#888" value={password} onChangeText={setPassword} secureTextEntry={!showPassword} />
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
                <TextInput style={styles.input} placeholder="Email" placeholderTextColor="#888" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
                <TouchableOpacity style={styles.button} onPress={handleSendOtp} disabled={loading}>
                  {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Send Code</Text>}
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.subtitle}>Enter the code sent to {email}</Text>
                <TextInput style={[styles.input, styles.otpInput]} placeholder="000000" placeholderTextColor="#555" value={otp} onChangeText={setOtp} keyboardType="number-pad" maxLength={6} />
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
  container: { flexGrow: 1, justifyContent: 'center', padding: 25 },
  logoContainer: { alignItems: 'center', marginBottom: 30 },
  logoText: { color: '#fff', fontSize: 32, fontWeight: 'bold', marginTop: 10 },
  tabContainer: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 12, padding: 5, marginBottom: 25 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 8 },
  activeTab: { backgroundColor: COLORS.cyan },
  tabText: { color: '#888', fontWeight: 'bold', fontSize: 14 },
  activeTabText: { color: '#000' },
  subtitle: { color: COLORS.muted, fontSize: 14, textAlign: 'center', marginBottom: 20 },
  input: { backgroundColor: COLORS.card, color: '#fff', borderRadius: 12, padding: 18, marginBottom: 15, fontSize: 16, borderWidth: 1, borderColor: '#333' },
  otpInput: { textAlign: 'center', fontSize: 28, letterSpacing: 10, fontWeight: 'bold', paddingVertical: 20 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  eye: { position: 'absolute', right: 15 },
  button: { backgroundColor: COLORS.cyan, padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#000', fontSize: 18, fontWeight: 'bold' },
  message: { color: COLORS.pink, textAlign: 'center', marginTop: 20, fontWeight: 'bold', fontSize: 15 },
});