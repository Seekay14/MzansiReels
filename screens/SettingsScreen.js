import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { account, databases, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';

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
        <Text style={[styles.rowText, danger && styles.dangerText]}>{title}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {children || (onPress ? <Ionicons name="chevron-forward" size={19} color="#626773" /> : null)}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.row} onPress={onPress} accessibilityRole="button">
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={styles.row}>{content}</View>;
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
  const insets = useSafeAreaInsets();
  const [user, setUser] = useState(null);
  const [userDoc, setUserDoc] = useState(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [blockedVisible, setBlockedVisible] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [sessionsVisible, setSessionsVisible] = useState(false);
  const [sessions, setSessions] = useState([]);

  const preferenceKey = user ? `@mzansireels/settings/${user.$id}` : null;

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
      setMfaEnabled(currentUser.mfa === true);
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

  const togglePrivate = async (value) => {
    if (!userDoc) {
      Alert.alert('Unavailable', 'A profile record is required to update this setting.');
      return;
    }
    setIsPrivate(value);
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, userDoc.$id, { isPrivate: value });
    } catch (error) {
      setIsPrivate(!value);
      console.error('Could not update private-account setting:', error);
      Alert.alert('Could not update setting', error.message || 'Please try again.');
    }
  };

  const togglePush = async (value) => {
    if (!userDoc) {
      Alert.alert('Unavailable', 'A profile record is required to update this setting.');
      return;
    }
    setPushEnabled(value);
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, userDoc.$id, { pushNotifications: value });
    } catch (error) {
      setPushEnabled(!value);
      console.error('Could not update push-notification setting:', error);
      Alert.alert('Could not update setting', error.message || 'Please try again.');
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
    if (!user) return;
    setBlockedVisible(true);
    setBusy('blocked');
    try {
      const blocks = await databases.listDocuments(DATABASE_ID, COLLECTIONS.blocks, [
        Query.equal('blockerId', user.$id),
        Query.limit(100),
      ]);
      const rows = await Promise.all(blocks.documents.map(async (block) => {
        const profiles = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
          Query.equal('userId', block.blockedId),
          Query.limit(1),
        ]);
        return { block, profile: profiles.documents[0] || null };
      }));
      setBlockedUsers(rows);
    } catch (error) {
      console.error('Could not load blocked users:', error);
      Alert.alert('Could not load blocked users', error.message || 'Please try again.');
    } finally {
      setBusy('');
    }
  };

  const unblockUser = (entry) => {
    const displayName = entry.profile?.name || entry.profile?.username || 'this user';
    Alert.alert('Unblock user?', `Allow ${displayName} to interact with you again?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          try {
            await databases.deleteDocument(DATABASE_ID, COLLECTIONS.blocks, entry.block.$id);
            setBlockedUsers((current) => current.filter((item) => item.block.$id !== entry.block.$id));
          } catch (error) {
            console.error('Could not unblock user:', error);
            Alert.alert('Could not unblock user', error.message || 'Please try again.');
          }
        },
      },
    ]);
  };

  const openSessions = async () => {
    setSessionsVisible(true);
    setBusy('sessions');
    try {
      const result = await account.listSessions();
      setSessions(result.sessions || []);
    } catch (error) {
      console.error('Could not load active sessions:', error);
      Alert.alert('Could not load sessions', error.message || 'Please try again.');
    } finally {
      setBusy('');
    }
  };

  const revokeSession = (session) => {
    Alert.alert('Sign out this device?', 'That device will need to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            await account.deleteSession(session.$id);
            setSessions((current) => current.filter((item) => item.$id !== session.$id));
          } catch (error) {
            console.error('Could not revoke session:', error);
            Alert.alert('Could not revoke session', error.message || 'Please try again.');
          }
        },
      },
    ]);
  };

  const toggleMfa = async () => {
    setBusy('mfa');
    try {
      if (mfaEnabled) {
        Alert.alert('Turn off two-factor authentication?', 'Your account will no longer require a second factor at sign-in.', [
          { text: 'Cancel', style: 'cancel', onPress: () => setBusy('') },
          {
            text: 'Turn Off',
            style: 'destructive',
            onPress: async () => {
              try {
                await account.updateMFA({ mfa: false });
                setMfaEnabled(false);
              } catch (error) {
                console.error('Could not disable MFA:', error);
                Alert.alert('Could not update two-factor authentication', error.message || 'Please try again.');
              } finally {
                setBusy('');
              }
            },
          },
        ]);
        return;
      }

      const factor = await account.createMFAAuthenticator({ type: 'totp' });
      setMfaSetup(factor);
      setOtp('');
    } catch (error) {
      console.error('Could not start authenticator setup:', error);
      Alert.alert('Could not set up two-factor authentication', error.message || 'Please try again.');
    } finally {
      if (mfaEnabled) return;
      setBusy('');
    }
  };

  const verifyAuthenticator = async () => {
    if (!/^\d{6}$/.test(otp)) {
      Alert.alert('Invalid code', 'Enter the six-digit code from your authenticator app.');
      return;
    }
    setBusy('mfa-verify');
    try {
      await account.updateMFAAuthenticator({ type: 'totp', otp });
      await account.updateMFA({ mfa: true });
      setMfaEnabled(true);
      setMfaSetup(null);
      setOtp('');
      Alert.alert('Two-factor authentication enabled', 'Your authenticator app is now linked to your account.');
    } catch (error) {
      console.error('Could not verify authenticator:', error);
      Alert.alert('Could not verify code', error.message || 'Check the code and try again.');
    } finally {
      setBusy('');
    }
  };

  const getAllDocuments = async (collectionId, filters) => {
    const documents = [];
    let offset = 0;
    while (true) {
      const page = await databases.listDocuments(DATABASE_ID, collectionId, [
        ...filters,
        Query.limit(100),
        Query.offset(offset),
      ]);
      documents.push(...page.documents);
      if (page.documents.length < 100) return documents;
      offset += page.documents.length;
    }
  };

  const downloadData = async () => {
    if (!user) return;
    setBusy('export');
    try {
      const own = (field) => [Query.equal(field, user.$id)];
      const [
        posts, videos, postComments, comments, likes, postLikes, bookmarks,
        follows, followedBy, blocks, blockedBy, chats, sentMessages, receivedMessages,
      ] = await Promise.all([
        getAllDocuments(COLLECTIONS.posts, own('userId')),
        getAllDocuments(COLLECTIONS.videos, own('userId')),
        getAllDocuments(COLLECTIONS.postComments, own('userId')),
        getAllDocuments(COLLECTIONS.comments, own('userId')),
        getAllDocuments(COLLECTIONS.videoLikes, own('userId')),
        getAllDocuments(COLLECTIONS.postLikes, own('userId')),
        getAllDocuments(COLLECTIONS.bookmarks, own('userId')),
        getAllDocuments(COLLECTIONS.follows, own('followerId')),
        getAllDocuments(COLLECTIONS.follows, own('followingId')),
        getAllDocuments(COLLECTIONS.blocks, own('blockerId')),
        getAllDocuments(COLLECTIONS.blocks, own('blockedId')),
        getAllDocuments(COLLECTIONS.chats, [Query.contains('participants', user.$id)]),
        getAllDocuments(COLLECTIONS.messages, own('senderId')),
        getAllDocuments(COLLECTIONS.messages, own('receiverId')),
      ]);
      const unique = (items) => [...new Map(items.map((item) => [item.$id, item])).values()];
      const exportData = {
        exportedAt: new Date().toISOString(),
        account: user,
        profile: userDoc,
        content: { posts, videos, postComments, comments },
        activity: { likes, postLikes, bookmarks, follows: unique([...follows, ...followedBy]) },
        safety: { blocks: unique([...blocks, ...blockedBy]) },
        messaging: { chats, messages: unique([...sentMessages, ...receivedMessages]) },
      };
      const contents = JSON.stringify(exportData, null, 2);

      if (Platform.OS === 'web' && globalThis.document && globalThis.URL?.createObjectURL) {
        const blob = new Blob([contents], { type: 'application/json' });
        const url = globalThis.URL.createObjectURL(blob);
        const link = globalThis.document.createElement('a');
        link.href = url;
        link.download = `mzansireels-data-${user.$id}.json`;
        link.click();
        globalThis.URL.revokeObjectURL(url);
      } else {
        const directory = FileSystem.documentDirectory;
        if (!directory) throw new Error('A local file directory is unavailable on this device.');
        const fileUri = `${directory}mzansireels-data-${user.$id}.json`;
        await FileSystem.writeAsStringAsync(fileUri, contents);
        const sharingAvailable = await Sharing.isAvailableAsync();
        if (sharingAvailable) {
          await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Download your MzansiReels data' });
        } else {
          await Share.share({ message: contents, title: 'MzansiReels data export' });
        }
      }
    } catch (error) {
      console.error('Could not create data export:', error);
      Alert.alert('Data export failed', error.message || 'Could not prepare your data.');
    } finally {
      setBusy('');
    }
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

  const requestDeactivation = () => {
    Alert.alert(
      'Request account deactivation',
      'Account deactivation is not available directly from the client yet. This will open an email request to support; your account will remain active until it is processed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Email Support', onPress: () => emailSupport('Account deactivation request', `Please deactivate my MzansiReels account.\n\nAccount ID: ${user?.$id || ''}`) },
      ],
    );
  };

  const requestDeletion = () => {
    Alert.alert(
      'Request account deletion',
      'Permanent deletion must be processed securely by the backend. This opens a request to support; no account or data is deleted by this button.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Email Support', style: 'destructive', onPress: () => emailSupport('Account deletion request', `Please permanently delete my MzansiReels account and associated data.\n\nAccount ID: ${user?.$id || ''}`) },
      ],
    );
  };

  const clearCache = async () => {
    setBusy('cache');
    try {
      if (Platform.OS === 'web') {
        if (typeof globalThis.localStorage !== 'undefined') globalThis.localStorage.removeItem('expo-cache');
      }
      Alert.alert('Cache cleared', Platform.OS === 'web'
        ? 'The app cache entry was cleared. Your account and preferences were not changed.'
        : 'No app-specific cache directory is configured. Your account and preferences were not changed.');
    } catch (error) {
      console.error('Could not clear cache:', error);
      Alert.alert('Could not clear cache', error.message || 'Please try again.');
    } finally {
      setBusy('');
    }
  };

  const signOut = () => navigation.navigate('LogoutScreen');
  const localPrefSubtitle = 'Saved on this device';

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={COLORS.cyan} />
        <Text style={styles.loadingText}>Loading settings…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={25} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings & Privacy</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account & privacy</Text>
          <SettingsRow icon="person-outline" title="Edit Profile" onPress={() => navigation.navigate('MyProfile')} />
          <SettingsRow icon="key-outline" title="Change Password" onPress={() => setIsPasswordModalVisible(true)} />
          <SettingsRow icon="lock-closed-outline" title="Private Account" subtitle="Approve followers before they see your posts">
            <SettingSwitch value={isPrivate} onValueChange={togglePrivate} />
          </SettingsRow>
          <SettingsRow icon="ban-outline" title="Blocked Users" onPress={openBlockedUsers} />
          <SettingsRow
            icon="shield-checkmark-outline"
            title="Two-Factor Authentication"
            subtitle={mfaEnabled ? 'Authenticator app enabled' : 'Authenticator app (TOTP); SMS is not configured'}
          >
            {busy === 'mfa' ? <ActivityIndicator color={COLORS.cyan} /> : <SettingSwitch value={mfaEnabled} onValueChange={toggleMfa} />}
          </SettingsRow>
          <SettingsRow icon="phone-portrait-outline" title="Active Sessions" subtitle="View and sign out other devices" onPress={openSessions} />
          <SettingsRow icon="cloud-download-outline" title="Download Your Data" subtitle="Create a JSON export of your account data" onPress={downloadData}>
            {busy === 'export' ? <ActivityIndicator color={COLORS.cyan} /> : null}
          </SettingsRow>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <SettingsRow icon="notifications-outline" title="Push Notifications" subtitle="Master push-notification preference">
            <SettingSwitch value={pushEnabled} onValueChange={togglePush} />
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
          <Text style={styles.note}>Granular notification preferences are stored locally until server-side preference fields are configured.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data & storage</Text>
          <SettingsRow icon="cellular-outline" title="Data Saver" subtitle="Avoid autoplaying video on cellular data">
            <SettingSwitch value={preferences.dataSaver} onValueChange={(value) => updatePreference('dataSaver', value)} />
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
          <Text style={styles.sectionTitle}>Legal & support</Text>
          <SettingsRow icon="document-text-outline" title="Terms of Service" onPress={() => navigation.navigate('Legal', { type: 'terms' })} />
          <SettingsRow icon="shield-checkmark-outline" title="Privacy Policy" onPress={() => navigation.navigate('Legal', { type: 'privacy' })} />
          <SettingsRow icon="people-outline" title="Community Guidelines" onPress={() => navigation.navigate('Legal', { type: 'guidelines' })} />
          <SettingsRow icon="help-circle-outline" title="Help Center" onPress={() => navigation.navigate('HelpCenter')} />
          <SettingsRow icon="mail-outline" title="Report a Problem" subtitle={CONTACT_EMAIL} onPress={() => emailSupport('MzansiReels support request', 'Please describe the issue you are experiencing:\n\n')} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account management</Text>
          <SettingsRow icon="pause-circle-outline" title="Deactivate Account" subtitle="Request temporary deactivation from support" onPress={requestDeactivation} />
          <SettingsRow icon="trash-bin-outline" title="Delete Account" subtitle="Request permanent account and data deletion" danger onPress={requestDeletion} />
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
          <Ionicons name="log-out-outline" size={21} color={COLORS.pink} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
        <Text style={styles.versionText}>MzansiReels v1.0.0</Text>
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

      <Modal visible={blockedVisible} transparent animationType="slide" onRequestClose={() => setBlockedVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.listModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Blocked Users</Text>
              <TouchableOpacity onPress={() => setBlockedVisible(false)}><Ionicons name="close" size={25} color="#fff" /></TouchableOpacity>
            </View>
            {busy === 'blocked' ? <ActivityIndicator color={COLORS.cyan} style={styles.modalLoader} /> : null}
            {!busy && blockedUsers.length === 0 ? <Text style={styles.emptyText}>You haven’t blocked anyone.</Text> : null}
            <ScrollView>
              {blockedUsers.map((entry) => (
                <View style={styles.listRow} key={entry.block.$id}>
                  <View style={styles.userInitial}><Text style={styles.userInitialText}>{(entry.profile?.name || entry.profile?.username || '?').charAt(0).toUpperCase()}</Text></View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowText}>{entry.profile?.name || entry.profile?.username || 'Unknown user'}</Text>
                    {!!entry.profile?.username && <Text style={styles.rowSubtitle}>@{entry.profile.username}</Text>}
                  </View>
                  <TouchableOpacity style={styles.smallButton} onPress={() => unblockUser(entry)}><Text style={styles.smallButtonText}>Unblock</Text></TouchableOpacity>
                </View>
              ))}
            </ScrollView>
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
            {busy === 'sessions' ? <ActivityIndicator color={COLORS.cyan} style={styles.modalLoader} /> : null}
            {!busy && sessions.length === 0 ? <Text style={styles.emptyText}>No active sessions found.</Text> : null}
            <ScrollView>
              {sessions.map((session) => {
                const device = [session.deviceName || session.deviceModel, session.osName].filter(Boolean).join(' · ') || session.clientName || 'Unknown device';
                const location = [session.countryName, session.ip].filter(Boolean).join(' · ');
                return (
                  <View style={styles.listRow} key={session.$id}>
                    <View style={styles.iconBox}><Ionicons name="phone-portrait-outline" size={20} color={COLORS.cyan} /></View>
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowText}>{device}{session.current ? ' · This device' : ''}</Text>
                      <Text style={styles.rowSubtitle}>{location || session.ip || 'Location unavailable'}</Text>
                    </View>
                    {!session.current && <TouchableOpacity style={styles.smallButton} onPress={() => revokeSession(session)}><Text style={styles.smallButtonText}>Sign out</Text></TouchableOpacity>}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={!!mfaSetup} transparent animationType="slide" onRequestClose={() => setMfaSetup(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set up an authenticator</Text>
            <Text style={styles.modalDescription}>Add this account to an authenticator app using the key below, then enter its current six-digit code. Keep the key private.</Text>
            <Text selectable style={styles.secretText}>{mfaSetup?.secret}</Text>
            <TextInput
              style={styles.input}
              placeholder="6-digit authenticator code"
              placeholderTextColor="#777"
              value={otp}
              onChangeText={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setMfaSetup(null)} style={styles.cancelBtn}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={verifyAuthenticator} style={styles.primaryBtn} disabled={busy === 'mfa-verify'}>
                {busy === 'mfa-verify' ? <ActivityIndicator color="#061116" /> : <Text style={styles.primaryText}>Verify & Enable</Text>}
              </TouchableOpacity>
            </View>
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
