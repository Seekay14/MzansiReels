import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { account, databases, Query } from '../config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from '../config/constants';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = [
  'Comedy', 'Music', 'Dance', 'Sports', 'Tech',
  'Fashion', 'Food', 'Travel', 'Gaming', 'Vlogs',
];

export default function InterestsScreen() {
  const { user, setUser } = useAuth();
  const insets = useSafeAreaInsets();
  const [selectedInterests, setSelectedInterests] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  const toggleInterest = (interest) => {
    setSelectedInterests((current) => (
      current.includes(interest)
        ? current.filter((value) => value !== interest)
        : [...current, interest]
    ));
  };

  const completeOnboarding = async (interests) => {
    if (saving) return;
    if (!user?.$id) {
      Alert.alert('Sign-in required', 'Please sign in again to save your interests.');
      return;
    }

    setSaving(true);
    let profileDocumentId = user.profileDocumentId;
    const savedInterests = interests.length ? JSON.stringify(interests) : '';
    try {
      if (!profileDocumentId) {
        const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
          Query.equal('userId', user.$id),
          Query.limit(1),
        ]);
        profileDocumentId = result.documents[0]?.$id;
      }

      if (!profileDocumentId) {
        throw new Error('Your profile could not be found. Please sign out and try again.');
      }

      // The existing Appwrite schema stores interests as a string; JSON preserves selected topics.
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, profileDocumentId, {
        interests: savedInterests,
        onboardingComplete: true,
      });
    } catch (error) {
      console.error('Appwrite failed, but continuing locally to prevent onboarding lockout:', error);
      Alert.alert(
        'Could not continue',
        'Something went wrong. Please try again or skip for now.',
      );
    } finally {
      setUser({
        ...user,
        ...(profileDocumentId ? { profileDocumentId } : {}),
        interests: savedInterests,
        onboardingComplete: true,
      });
      setSaving(false);
    }
  };

  const handleContinue = () => {
    if (selectedInterests.length < 3) return;
    return completeOnboarding(selectedInterests);
  };

  const handleSkip = () => completeOnboarding([]);

  const handleLogout = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await account.deleteSession('current');
      setUser(null);
    } catch (error) {
      console.error('Could not log out from onboarding:', error);
      Alert.alert('Could not log out', 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const canContinue = selectedInterests.length >= 3 && !saving;

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#101923', COLORS.bg, '#00161B']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 34, paddingBottom: insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.eyebrow}>
            <Ionicons name="sparkles" size={15} color={COLORS.cyan} />
            <Text style={styles.eyebrowText}>YOUR PERSONALIZED FEED</Text>
          </View>
          <Text style={styles.title}>What are you into?</Text>
          <Text style={styles.description}>
            Select at least 3 topics to personalize your For You feed.
          </Text>
        </View>

        <View style={styles.grid}>
          {CATEGORIES.map((category) => {
            const selected = selectedInterests.includes(category);
            return (
              <TouchableOpacity
                key={category}
                style={[
                  styles.category,
                  selected && styles.categorySelected,
                ]}
                onPress={() => toggleInterest(category)}
                disabled={saving}
                activeOpacity={0.8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
              >
                <Text style={[styles.categoryText, selected && styles.categoryTextSelected]}>
                  {category}
                </Text>
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'add-circle-outline'}
                  size={21}
                  color={selected ? '#071014' : COLORS.cyan}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            disabled={saving}
            accessibilityRole="button"
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
          <Text style={styles.selectionHint}>
            {selectedInterests.length < 3
              ? `Choose ${3 - selectedInterests.length} more to continue`
              : `${selectedInterests.length} topics selected`}
          </Text>
          <TouchableOpacity
            style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={!canContinue || saving}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color="#071014" />
            ) : (
              <>
                <Text style={styles.continueText}>Continue</Text>
                <Ionicons name="arrow-forward" size={20} color={canContinue ? '#071014' : '#777'} />
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            disabled={saving}
            accessibilityRole="button"
          >
            <Ionicons name="log-out-outline" size={17} color="#A0A8B1" />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { flexGrow: 1, paddingHorizontal: 24 },
  header: { marginBottom: 30 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  eyebrowText: { color: COLORS.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, marginLeft: 7 },
  title: { color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  description: { color: '#A0A8B1', fontSize: 15, lineHeight: 22, marginTop: 10, maxWidth: 340 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 },
  category: {
    width: '48%',
    minHeight: 64,
    marginHorizontal: '1%',
    marginBottom: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#292E37',
    backgroundColor: '#171A21',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categorySelected: { backgroundColor: COLORS.cyan, borderColor: COLORS.cyan },
  categoryText: { color: '#F4F6F8', fontSize: 15, fontWeight: '600' },
  categoryTextSelected: { color: '#071014', fontWeight: '800' },
  footer: { marginTop: 'auto', paddingTop: 24 },
  skipButton: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16, marginBottom: 8 },
  skipText: { color: COLORS.cyan, fontSize: 14, fontWeight: '700' },
  selectionHint: { color: '#A0A8B1', textAlign: 'center', fontSize: 13, marginBottom: 12 },
  continueButton: {
    minHeight: 58,
    borderRadius: 16,
    backgroundColor: COLORS.cyan,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  continueButtonDisabled: { backgroundColor: '#30343A' },
  continueText: { color: '#071014', fontSize: 16, fontWeight: '800' },
  logoutButton: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', padding: 12, marginTop: 8 },
  logoutText: { color: '#A0A8B1', fontSize: 13, fontWeight: '600', marginLeft: 6 },
});
