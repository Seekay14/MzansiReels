import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { databases, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import { ensureUserDoc, getUserDoc } from '../config/helpers';
import { uploadProfilePicture } from '../config/profilePictureService';
import { useAuth } from '../context/AuthContext';
import { useResponsiveLayout } from '../config/responsive';

const PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'Northern Cape',
  'North West',
  'Western Cape',
];
const USERNAME_PATTERN = /^[a-z0-9._]{3,30}$/;

function showProfileAlert(title, message) {
  if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
    globalThis.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export default function ProfileSetupScreen() {
  const { user, setUser, logout } = useAuth();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { scale, horizontalGutter } = useResponsiveLayout();
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [province, setProvince] = useState(user?.province || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [selectedImage, setSelectedImage] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [focusField, setFocusField] = useState(null);
  const [availability, setAvailability] = useState('idle');
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [provincePickerVisible, setProvincePickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const fadeIn = useRef(new Animated.Value(0)).current;
  const requestId = useRef(0);

  const normalizedUsername = username.trim().replace(/^@+/, '').toLowerCase();
  const usernameValid = USERNAME_PATTERN.test(normalizedUsername);
  const canFinish = Boolean(
    usernameValid &&
    province &&
    termsAccepted &&
    availability === 'available' &&
    !saving,
  );

  useEffect(() => {
    const animation = Animated.timing(fadeIn, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [fadeIn]);

  useEffect(() => {
    const currentRequestId = ++requestId.current;
    if (!normalizedUsername) {
      setAvailability('idle');
      setAvailabilityMessage('');
      return undefined;
    }

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      setAvailability('invalid');
      setAvailabilityMessage('Use 3–30 letters, numbers, dots, or underscores.');
      return undefined;
    }

    setAvailability('checking');
    setAvailabilityMessage('Checking username…');
    const timeout = setTimeout(async () => {
      try {
        const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
          Query.equal('username', normalizedUsername),
          Query.limit(5),
        ]);
        if (requestId.current !== currentRequestId) return;
        const takenByAnotherUser = result.documents.some(
          (document) => document.userId !== user?.$id,
        );
        setAvailability(takenByAnotherUser ? 'taken' : 'available');
        setAvailabilityMessage(
          takenByAnotherUser ? 'That username is already taken.' : 'Username is available.',
        );
      } catch (error) {
        if (requestId.current !== currentRequestId) return;
        console.error('Could not check username availability:', error);
        setAvailability('error');
        setAvailabilityMessage('Could not check username availability. Try again.');
      }
    }, 350);

    return () => {
      clearTimeout(timeout);
      requestId.current += 1;
    };
  }, [normalizedUsername, user?.$id]);

  const chooseProfilePicture = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showProfileAlert(
          'Photo access needed',
          'Allow photo library access to choose a profile picture.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.[0]) {
        setSelectedImage(result.assets[0]);
      }
    } catch (error) {
      console.error('Could not open the profile picture picker:', error);
      showProfileAlert('Could not choose photo', error.message || 'Please try again.');
    }
  };

  const handleFinish = async () => {
    if (!user?.$id) {
      showProfileAlert('Sign-in required', 'Please sign in again to set up your profile.');
      return;
    }
    if (!normalizedUsername) {
      showProfileAlert('Username required', 'Enter a username to continue.');
      return;
    }
    if (!usernameValid) {
      showProfileAlert('Check your username', 'Use 3–30 letters, numbers, dots, or underscores.');
      return;
    }
    if (availability !== 'available') {
      showProfileAlert('Username not ready', availabilityMessage || 'Wait for the username check to finish.');
      return;
    }
    if (!province) {
      showProfileAlert('Choose a province', 'Select your province to continue.');
      return;
    }
    if (!termsAccepted) {
      showProfileAlert('Terms required', 'Please agree to the Terms of Service to continue.');
      return;
    }

    setSaving(true);
    setImageUploading(Boolean(selectedImage));
    try {
      const profileDocument = await getUserDoc(user.$id) || await ensureUserDoc(user);
      const usernameCheck = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
        Query.equal('username', normalizedUsername),
        Query.limit(5),
      ]);
      if (usernameCheck.documents.some((document) => document.userId !== user.$id)) {
        setAvailability('taken');
        setAvailabilityMessage('That username is already taken.');
        showProfileAlert('Username unavailable', 'That username is already taken. Please choose another.');
        return;
      }

      let updatedAvatarUrl = avatarUrl || '';
      if (selectedImage) {
        const uploadedPicture = await uploadProfilePicture(selectedImage, user);
        updatedAvatarUrl = uploadedPicture.url;
        setAvatarUrl(updatedAvatarUrl);
      }

      const updatedProfile = await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.users,
        profileDocument.$id,
        {
          username: normalizedUsername,
          bio: bio.trim(),
          province,
          avatarUrl: updatedAvatarUrl,
          termsAccepted: true,
          profileSetupComplete: true,
          onboardingComplete: false,
        },
      );

      await setUser({
        ...user,
        profileDocumentId: updatedProfile.$id,
        username: updatedProfile.username,
        bio: updatedProfile.bio,
        province: updatedProfile.province,
        avatarUrl: updatedProfile.avatarUrl,
        profileSetupComplete: true,
        onboardingComplete: false,
        interests: updatedProfile.interests,
      });
    } catch (error) {
      console.error('Could not save profile setup:', error);
      if (error.code === 409 || error.type === 'document_already_exists') {
        setAvailability('taken');
        setAvailabilityMessage('That username is already taken.');
        showProfileAlert('Username unavailable', 'That username is already taken. Please choose another.');
      } else {
        showProfileAlert('Could not save profile', error.message || 'Please try again.');
      }
    } finally {
      setImageUploading(false);
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Animated.View style={[styles.animatedScreen, { opacity: fadeIn }]}>
        <View style={styles.glowTop} pointerEvents="none" />
        <View style={styles.glowBottom} pointerEvents="none" />
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingHorizontal: horizontalGutter,
              paddingTop: insets.top + 22 * scale,
              paddingBottom: 20 * scale,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.avatarButton}
              onPress={chooseProfilePicture}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Add a profile photo"
            >
              {selectedImage ? (
                <Image source={{ uri: selectedImage.uri }} style={styles.avatar} />
              ) : avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person-outline" size={38} color={COLORS.cyan} />
                </View>
              )}
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={16} color="#071014" />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={chooseProfilePicture}
              disabled={saving}
              accessibilityRole="button"
            >
              <Text style={styles.photoLink}>Add a profile photo</Text>
            </TouchableOpacity>
            <Text style={[styles.title, { fontSize: 29 * scale }]}>Create your identity</Text>
            <Text style={styles.subtitle}>Let the MzansiReels community know who you are.</Text>
          </View>

          <View style={[styles.fields, { gap: 22 * scale }]}>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Username</Text>
              <View style={[styles.inputShell, focusField === 'username' && styles.inputFocused]}>
                <Ionicons name="at" size={20} color={focusField === 'username' ? COLORS.cyan : '#929AA5'} />
                <TextInput
                  style={styles.textInput}
                  value={username}
                  onChangeText={(value) => setUsername(value.replace(/\s/g, '').replace(/^@+/, ''))}
                  onFocus={() => setFocusField('username')}
                  onBlur={() => setFocusField(null)}
                  placeholder="your_unique_name"
                  placeholderTextColor="#717985"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={31}
                  returnKeyType="next"
                  accessibilityLabel="Username"
                />
                {availability === 'checking' ? (
                  <ActivityIndicator size="small" color={COLORS.cyan} />
                ) : availability === 'available' ? (
                  <Ionicons name="checkmark-circle" size={19} color="#40D98A" />
                ) : ['taken', 'invalid', 'error'].includes(availability) ? (
                  <Ionicons name="alert-circle" size={19} color="#FF6875" />
                ) : null}
              </View>
              {!!availabilityMessage && (
                <Text style={[
                  styles.availabilityText,
                  availability === 'available' && styles.availableText,
                  ['taken', 'invalid', 'error'].includes(availability) && styles.unavailableText,
                ]}>
                  {availabilityMessage}
                </Text>
              )}
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Bio</Text>
              <View style={[
                styles.inputShell,
                styles.bioShell,
                focusField === 'bio' && styles.inputFocused,
              ]}>
                <Ionicons
                  name="create-outline"
                  size={19}
                  color={focusField === 'bio' ? COLORS.cyan : '#929AA5'}
                  style={styles.bioIcon}
                />
                <TextInput
                  style={[styles.textInput, styles.bioInput]}
                  value={bio}
                  onChangeText={setBio}
                  onFocus={() => setFocusField('bio')}
                  onBlur={() => setFocusField(null)}
                  placeholder="Tell people a little about yourself"
                  placeholderTextColor="#717985"
                  multiline
                  maxLength={160}
                  textAlignVertical="top"
                  accessibilityLabel="Bio"
                />
                <Text style={styles.bioCount}>{bio.length}/160</Text>
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Province</Text>
              <TouchableOpacity
                style={[styles.inputShell, focusField === 'province' && styles.inputFocused]}
                onPress={() => {
                  setFocusField('province');
                  setProvincePickerVisible(true);
                }}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Select province"
              >
                <Ionicons
                  name="location-outline"
                  size={20}
                  color={focusField === 'province' ? COLORS.cyan : '#929AA5'}
                />
                <Text style={[styles.provinceValue, !province && styles.placeholder]}>
                  {province || 'Choose your province'}
                </Text>
                <Ionicons name="chevron-down" size={18} color="#929AA5" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.termsRow}>
            <TouchableOpacity
              onPress={() => setTermsAccepted((accepted) => !accepted)}
              disabled={saving}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: termsAccepted }}
              style={styles.termsCheckboxButton}
            >
            <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
              {termsAccepted && <Ionicons name="checkmark" size={14} color="#071014" />}
            </View>
            </TouchableOpacity>
            <Text style={styles.termsText}>
              I agree to the{' '}
              <Text
                style={styles.termsLink}
                onPress={() => navigation.navigate('Legal', { type: 'terms' })}
                accessibilityRole="link"
              >
                Terms of Service
              </Text>
            </Text>
          </View>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={logout}
            disabled={saving}
            accessibilityRole="button"
          >
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <TouchableOpacity
            style={[styles.finishButton, !canFinish && styles.finishButtonDisabled]}
            onPress={handleFinish}
            disabled={!canFinish}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canFinish }}
          >
            {saving ? (
              <ActivityIndicator color="#071014" />
            ) : (
              <>
                <Text style={styles.finishButtonText}>
                  {imageUploading ? 'Uploading photo…' : 'Finish'}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#071014" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Modal
        visible={provincePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setProvincePickerVisible(false);
          setFocusField(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.provinceModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose your province</Text>
              <TouchableOpacity
                onPress={() => {
                  setProvincePickerVisible(false);
                  setFocusField(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={23} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {PROVINCES.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={styles.provinceOption}
                  onPress={() => {
                    setProvince(item);
                    setProvincePickerVisible(false);
                    setFocusField(null);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.provinceOptionText}>{item}</Text>
                  {province === item && <Ionicons name="checkmark" size={18} color={COLORS.cyan} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0A0A0F' },
  animatedScreen: { flex: 1, overflow: 'hidden' },
  glowTop: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(0,229,255,0.07)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(30,52,78,0.24)',
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
  header: { alignItems: 'center', marginBottom: 34 },
  avatarButton: { width: 100, height: 100, marginBottom: 10 },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 50,
    borderWidth: 1,
    borderColor: '#34434B',
    backgroundColor: '#1A1A1A',
  },
  cameraBadge: {
    position: 'absolute',
    right: 1,
    bottom: 1,
    width: 31,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: COLORS.cyan,
    borderWidth: 3,
    borderColor: '#0A0A0F',
  },
  photoLink: { color: COLORS.cyan, fontSize: 13, fontWeight: '700', marginBottom: 23 },
  title: { color: '#fff', fontSize: 29, fontWeight: '900', letterSpacing: -0.5, textAlign: 'center' },
  subtitle: {
    color: '#A5ADB6',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 9,
    textAlign: 'center',
  },
  fields: { gap: 22 },
  fieldGroup: {},
  label: { color: '#F1F4F5', fontSize: 13, fontWeight: '700', marginBottom: 9, marginLeft: 2 },
  inputShell: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1A1A1A',
  },
  inputFocused: { borderColor: COLORS.cyan },
  textInput: { flex: 1, minWidth: 0, color: '#fff', fontSize: 15, paddingVertical: 15, marginLeft: 11 },
  availabilityText: { color: '#9098A2', fontSize: 11, marginTop: 7, marginLeft: 3 },
  availableText: { color: '#40D98A' },
  unavailableText: { color: '#FF6875' },
  bioShell: { minHeight: 112, alignItems: 'flex-start', paddingTop: 14, paddingBottom: 24 },
  bioIcon: { marginTop: 1 },
  bioInput: { minHeight: 72, paddingTop: 0, paddingBottom: 0, marginTop: 0 },
  bioCount: { position: 'absolute', right: 15, bottom: 9, color: '#858D97', fontSize: 11 },
  provinceValue: { flex: 1, color: '#fff', fontSize: 15, marginLeft: 11 },
  placeholder: { color: '#717985' },
  termsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 25, paddingVertical: 8 },
  termsCheckboxButton: { marginRight: 11 },
  checkbox: {
    width: 21,
    height: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#717984',
  },
  checkboxChecked: { borderColor: COLORS.cyan, backgroundColor: COLORS.cyan },
  termsText: { color: '#C6CBD1', fontSize: 13, flexShrink: 1 },
  termsLink: { color: COLORS.cyan, fontWeight: '700' },
  logoutButton: { alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  logoutText: { color: '#A3ABB3', fontSize: 12, fontWeight: '600' },
  footer: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.07)',
    backgroundColor: '#0A0A0F',
  },
  finishButton: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: COLORS.cyan,
  },
  finishButtonDisabled: { opacity: 0.42 },
  finishButtonText: { color: '#071014', fontSize: 15, fontWeight: '900' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 22, backgroundColor: 'rgba(0,0,0,0.74)' },
  provinceModal: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
    alignSelf: 'center',
    paddingHorizontal: 19,
    paddingTop: 19,
    paddingBottom: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#30343D',
    backgroundColor: '#15171D',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#30343D',
  },
  modalTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  provinceOption: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  provinceOptionText: { color: '#E8EAED', fontSize: 14 },
});
