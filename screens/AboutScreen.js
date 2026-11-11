import React, { useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../config/constants';

const CONTACT_EMAIL = 'sectionfellas@gmail.com';

export default function AboutScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [openingEmail, setOpeningEmail] = useState(false);

  const emailUs = async () => {
    if (openingEmail) return;
    setOpeningEmail(true);
    try {
      await Linking.openURL(`mailto:${CONTACT_EMAIL}`);
    } catch (error) {
      console.error('Could not open an email app:', error);
      if (Platform.OS === 'web' && typeof globalThis.alert === 'function') {
        globalThis.alert(`Could not open an email app. Contact us at ${CONTACT_EMAIL}.`);
      } else {
        Alert.alert('Email unavailable', `Please email us at ${CONTACT_EMAIL}.`);
      }
    } finally {
      setOpeningEmail(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={23} color="#F6F8FA" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.brandIcon}>
            <Ionicons name="play" size={28} color="#061116" />
          </View>
          <Text style={styles.heroTitle}>About MzansiReels</Text>
          <Text style={styles.heroSubtitle}>
            The home of South African creators. Built with love, for the culture.
          </Text>
          <View style={styles.heroAccent} />
        </View>

        <View style={styles.missionCard}>
          <View style={styles.sectionEyebrow}>
            <Ionicons name="sparkles-outline" size={16} color={COLORS.cyan} />
            <Text style={styles.eyebrowText}>OUR MISSION</Text>
          </View>
          <Text style={styles.missionText}>
            We built MzansiReels to give local creators a platform to share their
            vibe, talent, and everyday stories with the world. From Amapiano
            dances to comedy skits, this is the heartbeat of Mzansi.
          </Text>
        </View>

        <View style={styles.contactCard}>
          <View style={styles.contactIcon}>
            <Ionicons name="mail-outline" size={23} color={COLORS.cyan} />
          </View>
          <Text style={styles.contactTitle}>Get in touch</Text>
          <Text style={styles.contactDescription}>
            Have a question, feedback, or business inquiry? We&apos;d love to hear
            from you.
          </Text>
          <TouchableOpacity
            style={styles.emailButton}
            onPress={emailUs}
            accessibilityRole="button"
            accessibilityLabel={`Email us at ${CONTACT_EMAIL}`}
          >
            <Ionicons name="mail" size={17} color="#061116" />
            <Text style={styles.emailButtonText}>Email Us</Text>
            <Ionicons name="arrow-up-right" size={16} color="#061116" />
          </TouchableOpacity>
          <Text style={styles.emailAddress}>{CONTACT_EMAIL}</Text>
        </View>

        <Text style={styles.linksHeading}>LEGAL & COMMUNITY</Text>
        <View style={styles.linksCard}>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => navigation.navigate('Legal', { type: 'terms' })}
            accessibilityRole="button"
          >
            <View style={styles.linkIcon}>
              <Ionicons name="document-text-outline" size={18} color={COLORS.cyan} />
            </View>
            <Text style={styles.linkText}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={18} color="#737B86" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => navigation.navigate('Legal', { type: 'privacy' })}
            accessibilityRole="button"
          >
            <View style={styles.linkIcon}>
              <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.cyan} />
            </View>
            <Text style={styles.linkText}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={18} color="#737B86" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => navigation.navigate('Legal', { type: 'guidelines' })}
            accessibilityRole="button"
          >
            <View style={styles.linkIcon}>
              <Ionicons name="people-outline" size={18} color={COLORS.cyan} />
            </View>
            <Text style={styles.linkText}>Community Guidelines</Text>
            <Ionicons name="chevron-forward" size={18} color="#737B86" />
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerBrand}>MzansiReels</Text>
          <Text style={styles.footerText}>Made for the culture in South Africa.</Text>
          <Text style={styles.copyright}>© {new Date().getFullYear()} MzansiReels</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#F6F8FA', fontSize: 17, fontWeight: '800' },
  headerSpacer: { width: 40 },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 27, paddingBottom: 42 },
  hero: { alignItems: 'center', paddingTop: 9, paddingBottom: 27 },
  brandIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', marginBottom: 19, borderRadius: 19, backgroundColor: COLORS.cyan, shadowColor: COLORS.cyan, shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  heroTitle: { color: '#F7F9FA', fontSize: 29, lineHeight: 36, fontWeight: '900', letterSpacing: -0.7, textAlign: 'center' },
  heroSubtitle: { maxWidth: 410, color: '#A3ABB5', fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 9 },
  heroAccent: { width: 42, height: 3, borderRadius: 2, backgroundColor: COLORS.cyan, marginTop: 19 },
  missionCard: { padding: 19, borderRadius: 18, borderWidth: 1, borderColor: '#292E37', backgroundColor: '#14171E', marginBottom: 15 },
  sectionEyebrow: { flexDirection: 'row', alignItems: 'center', marginBottom: 11 },
  eyebrowText: { color: COLORS.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginLeft: 8 },
  missionText: { color: '#D5D9DF', fontSize: 14, lineHeight: 22 },
  contactCard: { alignItems: 'center', paddingHorizontal: 21, paddingVertical: 22, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(0,229,255,0.22)', backgroundColor: '#121B21', marginBottom: 25 },
  contactIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: 'rgba(0,229,255,0.1)', marginBottom: 12 },
  contactTitle: { color: '#F7F9FA', fontSize: 20, fontWeight: '800' },
  contactDescription: { maxWidth: 400, color: '#A3ABB5', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 7 },
  emailButton: { minWidth: 145, height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 12, backgroundColor: COLORS.cyan, marginTop: 17, paddingHorizontal: 17 },
  emailButtonText: { color: '#061116', fontSize: 14, fontWeight: '900' },
  emailAddress: { color: '#8E9AA3', fontSize: 11, marginTop: 10 },
  linksHeading: { color: '#89919C', fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 10, marginLeft: 3 },
  linksCard: { paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: '#292E37', backgroundColor: '#14171E' },
  linkRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center' },
  linkIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginRight: 11, borderRadius: 10, backgroundColor: 'rgba(0,229,255,0.08)' },
  linkText: { flex: 1, color: '#E8EAED', fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  footer: { alignItems: 'center', marginTop: 28 },
  footerBrand: { color: '#E9EDF0', fontSize: 13, fontWeight: '800' },
  footerText: { color: '#858D98', fontSize: 11, marginTop: 5 },
  copyright: { color: '#626A75', fontSize: 10, marginTop: 10 },
});
