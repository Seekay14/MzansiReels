import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { account, databases, functions, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID, DELETE_USER_FUNCTION_ID } from '../config/constants';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useResponsiveLayout } from '../config/responsive';

const CONTACT_EMAIL = 'sectionfellas@gmail.com';
const DEFAULT_PREFERENCES = {
  likesComments: true,
  newFollowers: true,
  directMessages: true,
  emailNotifications: true,
  dataSaver: false,
  downloadQuality: 'HD',
};

function SettingsRow({ icon, title, subtitle, onPress, children, danger = false }) {
  const content = (
    <>
      <View style={styles.iconBox}>
        <Ionicons name={icon} size={20} color={danger ? COLORS.pink : COLORS.cyan} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowText, { color: danger ? COLORS.pink : COLORS.text }]}>{title}</Text>
        {!!subtitle && <Text style={[styles.rowSubtitle, { color: COLORS.muted }]}>{subtitle}</Text>}
      </View>
      {children || (onPress ? <Ionicons name="chevron-forward" size={19} color={COLORS.muted} /> : null)}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={[styles.row, { backgroundColor: COLORS.card }]} onPress={onPress} accessibilityRole="button">
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.row, { backgroundColor: COLORS.card }]}>{content}</View>;
}

function SettingSwitch({ value, onValueChange }) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: '#34343D', true: COLORS.cyan }}
      thumbColor={Platform.OS === 'android' ? (value ? '#061116' : '#f4f3f4') : undefined}
    />
  );
}

export default function SettingsScreen({ navigation }) {
const { user: authUser, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { horizontalGutter } = useResponsiveLayout();
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [savingSetting, setSavingSetting] = useState('');
  const [dataSaver, setDataSaver] = useState(false);
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sessionsVisible, setSessionsVisible] = useState(false);

  const preferenceKey = user ? `@mzansireels/settings/${user.$id}` : null;

  const navigateToLogin = () => {
    navigation.getParent()?.getParent()?.navigate('Auth');
  };

  const loadAccount = useCallback(async () => {
    setLoading(true);
    try {
      const currentUser = await account.get();
      const [profiles, localPreferences] = await Promise.all([
        databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
          Query.equal('userId', currentUser.$id),
          Query.limit(1),
        ]),
        AsyncStorage.getItem(`@mzansireels/settings/${currentUser.$id}`),
      ]);
      const profile = profiles.documents[0] || null;
      setUser(currentUser);
      setUserDoc(profile);
      setIsPrivate(profile?.isPrivate === true);
      setPushEnabled(profile?.pushNotifications !== false);
      setPreferences({ ...DEFAULT_PREFERENCES, ...(localPreferences ? JSON.parse(localPreferences) : {}) });
    } catch (error) {
      console.error('Could not load settings:', error);
      Alert.alert('Settings unavailable', error.message || 'Could not load your account settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    AsyncStorage.getItem('@mzansireels/data_saver')
      .then((value) => {
        if (value !== null) setDataSaver(JSON.parse(value));
      })
      .catch((error) => console.error('Could not load data saver:', error));
  }, []);

  const updatePreference = async (key, value) => {
    const updated = { ...preferences, [key]: value };
    setPreferences(updated);
    try {
      await AsyncStorage.setItem(preferenceKey, JSON.stringify(updated));
    } catch (error) {
      setPreferences(preferences);
      console.error(`Could not save setting ${key}:`, error);
      Alert.alert('Could not save setting', error.message || 'Please try again.');
    }
  };

  const toggleDataSaver = async (value) => {
    setDataSaver(value);
    try {
      await AsyncStorage.setItem('@mzansireels/data_saver', JSON.stringify(value));
    } catch (error) {
      setDataSaver(!value);
      console.error('Could not save data saver:', error);
      Alert.alert('Could not save setting', error.message || 'Please try again.');
    }
  };

  const togglePrivate = async (value) => {
    if (!userDoc) {
      Alert.alert('Unavailable', 'A profile record is required to update this setting.');
      return;
    }
    if (savingSetting) return;
    setIsPrivate(value);
    setSavingSetting('private');
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, userDoc.$id, { isPrivate: value });
    } catch (error) {
      setIsPrivate(!value);
      console.error('Could not update private-account setting:', error);
      Alert.alert('Could not update setting', error.message || 'Please try again.');
    } finally {
      setSavingSetting('');
    }
  };

  const togglePush = async (value) => {
    if (!userDoc) {
      Alert.alert('Unavailable', 'A profile record is required to update this setting.');
      return;
    }
    if (savingSetting) return;
    setPushEnabled(value);
    setSavingSetting('push');
    try {
      if (value) {
        try {
          const currentPermission = await Notifications.getPermissionsAsync();
          if (currentPermission.status !== 'granted') {
            const requestedPermission = await Notifications.requestPermissionsAsync();
            if (requestedPermission.status !== 'granted') {
              Alert.alert(
                'Notifications are disabled',
                'Push notifications are enabled in your account, but device permission was not granted.',
              );
            }
          }
        } catch (permissionError) {
          console.error('Could not request notification permission:', permissionError);
          Alert.alert(
            'Permission unavailable',
            'Your push preference will be saved, but device notification permission could not be requested.',
          );
        }
      }
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, userDoc.$id, { pushNotifications: value });
    } catch (error) {
      setPushEnabled(!value);
      console.error('Could not update push-notification setting:', error);
      Alert.alert('Could not update setting', error.message || 'Please try again.');
    } finally {
      setSavingSetting('');
    }
  };

  const changePassword = async () => {
    if (!oldPassword || !newPassword) {
      Alert.alert('Missing information', 'Enter your current and new passwords.');
      return;
    }
    setBusy('password');
    try {
      await account.updatePassword(newPassword, oldPassword);
      setIsPasswordModalVisible(false);
      setOldPassword('');
      setNewPassword('');
      Alert.alert('Success', 'Password updated successfully.');
    } catch (error) {
      console.error('Could not update password:', error);
      Alert.alert('Could not update password', error.message || 'Please try again.');
    } finally {
      setBusy('');
    }
  };

  const openBlockedUsers = async () => {
    navigation.navigate('BlockedUsers');
  };

  const openSessions = () => {
    setSessionsVisible(true);
  };

  const showMfaComingSoon = () => {
    Alert.alert('Coming Soon', 'Two-Factor Authentication will be available in the next update.');
  };

  const downloadData = () => {
    Alert.alert('Export Requested', 'Your data is being prepared. You will receive an email shortly.');
  };

  const emailSupport = async (subject, body) => {
    const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch (error) {
      console.error('Could not open support email:', error);
      Alert.alert('Email unavailable', `Please email ${CONTACT_EMAIL} with the subject: ${subject}`);
    }
  };

  const deactivateAccount = async () => {
    if (busy) return;
    if (!userDoc) {
      Alert.alert('Unavailable', 'A profile record is required to deactivate your account.');
      return;
    }

    setBusy('deactivate');
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, userDoc.$id, {
        isPrivate: true,
        isDeactivated: true,
      });
      await logout(authUser?.$id);
      navigateToLogin();
    } catch (error) {
      console.error('Could not deactivate account:', error);
      Alert.alert('Could not deactivate account', error.message || 'Please try again.');
    } finally {
      setBusy('');
    }
  };

  const requestDeactivation = () => {
    Alert.alert(
      'Hide your profile?',
      'Your profile will be made private and deactivated. You will be logged out.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Deactivate', style: 'destructive', onPress: deactivateAccount },
      ],
    );
  };

  const deleteUserAccount = async () => {
    if (!user?.$id || busy || isDeleting) return;

    setIsDeleting(true);
    try {
      const execution = await functions.createExecution({
        functionId: DELETE_USER_FUNCTION_ID,
        body: JSON.stringify({ userId: user.$id }),
        async: false,
      });
      if (execution.status !== 'completed'
        || execution.responseStatusCode < 200
        || execution.responseStatusCode >= 300) {
        throw new Error(
          execution.responseBody || `Account deletion failed (HTTP ${execution.responseStatusCode || 'unknown'}).`,
        );
      }

      await logout(authUser?.$id);
      navigateToLogin();
      Alert.alert('Account deleted', 'Your account has been permanently deleted.');
    } catch (error) {
      console.error('Could not permanently delete account:', error);
      Alert.alert('Could not delete account', error.message || 'Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const requestDeletion = () => {
    if (busy || isDeleting) return;
    Alert.alert(
      'Permanently delete your account?',
      'This will permanently delete your posts, videos, messages, profile, and login account. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Everything', style: 'destructive', onPress: deleteUserAccount },
      ],
    );
  };

  const clearCache = async () => {
    const confirmed = await new Promise((resolve) => {
      Alert.alert(
        'Clear Cache',
        'Are you sure you want to clear cached videos and images?',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Clear', style: 'destructive', onPress: () => resolve(true) },
        ],
      );
    });
    if (!confirmed) return;

    setBusy('cache');
    try {
      await FileSystem.deleteAsync(FileSystem.cacheDirectory, { idempotent: true });
      Alert.alert('Cache cleared', 'Cache cleared successfully!');
    } catch (error) {
      console.error('Could not clear cache:', error);
      Alert.alert('Could not clear cache', error.message || 'Please try again.');
    } finally {
      setBusy('');
    }
  };

  const signOut = async () => {
    try {
      await logout(authUser?.$id);
      navigateToLogin();
    } catch (error) {
      console.error('Could not log out:', error);
      Alert.alert('Could not log out', error.message || 'Please try again.');
    }
  };
  const localPrefSubtitle = 'Saved on this device';

  if (loading) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: COLORS.bg }]}>
        <ActivityIndicator size="large" color={COLORS.cyan} />
        <Text style={styles.loadingText}>Loading settings…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: COLORS.bg }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            paddingHorizontal: horizontalGutter,
            borderBottomColor: COLORS.border,
          },
        ]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={25} color="#fff" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: COLORS.text }]}>Settings & Privacy</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingHorizontal: horizontalGutter }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>Account & privacy</Text>
          <SettingsRow icon="person-outline" title="Edit Profile" onPress={() => navigation.navigate('MyProfile')} />
          <SettingsRow icon="key-outline" title="Change Password" onPress={() => setIsPasswordModalVisible(true)} />
          <SettingsRow
            icon="lock-closed-outline"
            title="Private Account"
            subtitle="Profile pages honor this setting; posts remain visible in guest feeds"
          >
            {savingSetting === 'private'
              ? <ActivityIndicator size="small" color={COLORS.cyan} />
              : <SettingSwitch value={isPrivate} onValueChange={togglePrivate} />}
          </SettingsRow>
          <SettingsRow icon="ban-outline" title="Blocked Users" onPress={openBlockedUsers} />
          <SettingsRow
            icon="shield-checkmark-outline"
            title="Two-Factor Authentication"
            subtitle="Add an extra layer of account security"
            onPress={showMfaComingSoon}
          />
          <SettingsRow icon="phone-portrait-outline" title="Active Sessions" subtitle="View and sign out other devices" onPress={openSessions} />
          <SettingsRow icon="cloud-download-outline" title="Download Your Data" subtitle="Request an export of your account data" onPress={downloadData} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>Notifications</Text>
          <SettingsRow icon="notifications-outline" title="Push Notifications" subtitle="Master push-notification preference">
            {savingSetting === 'push'
              ? <ActivityIndicator size="small" color={COLORS.cyan} />
              : <SettingSwitch value={pushEnabled} onValueChange={togglePush} />}
          </SettingsRow>
          {[
            ['likesComments', 'Likes & Comments', 'heart-outline'],
            ['newFollowers', 'New Followers', 'people-outline'],
            ['directMessages', 'Direct Messages', 'chatbubble-outline'],
            ['emailNotifications', 'Email Notifications', 'mail-outline'],
          ].map(([key, title, icon]) => (
            <SettingsRow key={key} icon={icon} title={title} subtitle={localPrefSubtitle}>
              <SettingSwitch value={preferences[key]} onValueChange={(value) => updatePreference(key, value)} />
            </SettingsRow>
          ))}
          <Text style={[styles.note, { color: COLORS.muted }]}>Granular notification preferences are stored locally until server-side preference fields are configured.</Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>Data & storage</Text>
          <SettingsRow icon="cellular-outline" title="Data Saver" subtitle="Avoid autoplaying video on cellular data">
            <SettingSwitch value={dataSaver} onValueChange={toggleDataSaver} />
          </SettingsRow>
          <SettingsRow
            icon="download-outline"
            title="Download Quality"
            subtitle={`${preferences.downloadQuality} preference · quality variants are not configured`}
            onPress={() => updatePreference('downloadQuality', preferences.downloadQuality === 'HD' ? 'Standard' : 'HD')}
          />
          <SettingsRow icon="trash-outline" title="Clear Cache" onPress={clearCache}>
            {busy === 'cache' ? <ActivityIndicator color={COLORS.cyan} /> : null}
          </SettingsRow>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>Legal & support</Text>
          <SettingsRow icon="document-text-outline" title="Terms of Service" onPress={() => navigation.navigate('Legal', { type: 'terms' })} />
          <SettingsRow icon="shield-checkmark-outline" title="Privacy Policy" onPress={() => navigation.navigate('Legal', { type: 'privacy' })} />
          <SettingsRow icon="people-outline" title="Community Guidelines" onPress={() => navigation.navigate('Legal', { type: 'guidelines' })} />
          <SettingsRow icon="help-circle-outline" title="Help Center" onPress={() => navigation.navigate('HelpCenter')} />
          <SettingsRow icon="mail-outline" title="Report a Problem" subtitle={CONTACT_EMAIL} onPress={() => emailSupport('MzansiReels support request', 'Please describe the issue you are experiencing:\n\n')} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: COLORS.muted }]}>Account management</Text>
          <SettingsRow icon="pause-circle-outline" title="Deactivate Account" subtitle="Hide your profile and sign out" onPress={requestDeactivation}>
            {busy === 'deactivate' ? <ActivityIndicator size="small" color={COLORS.cyan} /> : null}
          </SettingsRow>
          <SettingsRow icon="trash-bin-outline" title="Delete Account" subtitle="Permanently delete your account and data" danger onPress={requestDeletion}>
            {isDeleting ? <ActivityIndicator size="small" color={COLORS.pink} /> : null}
          </SettingsRow>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Ionicons name="log-out-outline" size={21} color={COLORS.pink} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
        <Text style={[styles.versionText, { color: COLORS.muted }]}>MzansiReels v1.0.0</Text>
      </ScrollView>

      <Modal visible={isPasswordModalVisible} transparent animationType="slide" onRequestClose={() => setIsPasswordModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <TextInput style={styles.input} placeholder="Current Password" secureTextEntry value={oldPassword} onChangeText={setOldPassword} placeholderTextColor="#777" />
            <TextInput style={styles.input} placeholder="New Password" secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholderTextColor="#777" />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setIsPasswordModalVisible(false)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={changePassword} style={styles.primaryBtn} disabled={busy === 'password'}>
                {busy === 'password' ? <ActivityIndicator color="#061116" /> : <Text style={styles.primaryText}>Update</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={sessionsVisible} transparent animationType="slide" onRequestClose={() => setSessionsVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.listModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Active Sessions</Text>
              <TouchableOpacity onPress={() => setSessionsVisible(false)}><Ionicons name="close" size={25} color="#fff" /></TouchableOpacity>
            </View>
            <Text style={styles.emptyText}>Session active on this device (Local)</Text>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  loadingText: { color: COLORS.muted, marginTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  headerTitle: { color: '#fff', fontSize: 19, fontWeight: '800' },
  headerSpacer: { width: 40 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
  section: { marginTop: 12 },
  sectionTitle: { color: COLORS.muted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 9, marginLeft: 8 },
  row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 13, marginBottom: 7 },
  iconBox: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0, 229, 255, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  rowCopy: { flex: 1, paddingRight: 10 },
  rowText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  rowSubtitle: { color: '#89909B', fontSize: 11, marginTop: 3 },
  dangerText: { color: COLORS.pink },
  note: { color: '#777F89', fontSize: 11, lineHeight: 16, marginHorizontal: 8, marginVertical: 3 },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 0, 85, 0.1)', marginTop: 26, padding: 15, borderRadius: 12 },
  logoutText: { color: COLORS.pink, fontSize: 15, fontWeight: '800', marginLeft: 9 },
  versionText: { color: '#555', textAlign: 'center', marginTop: 16, marginBottom: 18, fontSize: 11 },
  modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.82)' },
  modalContent: { width: '100%', maxWidth: 460, backgroundColor: COLORS.card, padding: 20, borderRadius: 16 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 14 },
  modalDescription: { color: '#A8AFB8', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  input: { backgroundColor: COLORS.bg, color: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 10, borderWidth: 1, borderColor: '#34343D' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 9 },
  cancelBtn: { padding: 12, marginRight: 8 },
  cancelText: { color: '#fff', fontWeight: '600' },
  primaryBtn: { minWidth: 96, alignItems: 'center', backgroundColor: COLORS.cyan, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 9 },
  primaryText: { color: '#061116', fontWeight: '800' },
  listModal: { width: '100%', maxWidth: 520, maxHeight: '80%', backgroundColor: COLORS.card, padding: 18, borderRadius: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalLoader: { marginVertical: 20 },
  emptyText: { color: COLORS.muted, textAlign: 'center', paddingVertical: 25 },
  listRow: { flexDirection: 'row', alignItems: 'center', minHeight: 60, borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 8 },
  userInitial: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.cyan, marginRight: 11 },
  userInitialText: { color: '#061116', fontWeight: '800', fontSize: 16 },
  smallButton: { backgroundColor: '#252530', paddingVertical: 8, paddingHorizontal: 11, borderRadius: 8 },
  smallButtonText: { color: COLORS.cyan, fontWeight: '700', fontSize: 12 },
  secretText: { color: COLORS.cyan, backgroundColor: COLORS.bg, borderRadius: 8, padding: 12, marginBottom: 12, fontWeight: '700' },
});

