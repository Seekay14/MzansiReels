import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../config/constants';

const CONTENT = {
  terms: {
    title: 'Terms of Service',
    subtitle: 'The rules for using MzansiReels.',
    icon: 'document-text-outline',
    sections: [
      {
        heading: '1. Acceptance of Terms',
        body: 'By creating an account or using MzansiReels, you agree to these Terms of Service and our Community Guidelines. If you do not agree, do not use the service.',
      },
      {
        heading: '2. User Conduct & Community Guidelines',
        body: 'You may not post or share hate speech, harassment, cyberbullying, nudity, sexually exploitative material, illegal content, or content that violates another person’s rights. Threats, targeted abuse, and bullying are not tolerated. We may remove content that violates these rules.',
      },
      {
        heading: '3. Content Ownership & License',
        body: 'You retain ownership of the videos and other content you create and upload. By uploading content, you give MzansiReels a non-exclusive, worldwide, royalty-free license to host, store, reproduce, display, and distribute that content as needed to operate and promote the service. This license ends when your content is removed, except where copies remain temporarily in backups or are required for legal or safety reasons.',
      },
      {
        heading: '4. Privacy & Data Protection',
        body: 'We use your email and account information to provide and protect your account, and use app activity to operate features such as your feed. Account data is stored with our service providers and protected using access controls and other reasonable safeguards. We do not sell your personal information to third parties. We may share limited information with service providers that help us run MzansiReels, or when required by law.',
      },
      {
        heading: '5. Age Requirement',
        body: 'You must be at least 13 years old to create an account. Some features or activities may require you to be 18 or older. Do not use age-restricted features unless you meet their requirements.',
      },
      {
        heading: '6. Account Termination',
        body: 'You are responsible for activity on your account. We may remove content, restrict features, suspend, or terminate accounts that violate these Terms, our Community Guidelines, or applicable law. Where appropriate, we may provide notice and an opportunity to appeal.',
      },
      {
        heading: '7. Changes and Availability',
        body: 'We may update these terms or change parts of the service. Continued use after updated terms take effect means you accept the revised terms. We work to keep MzansiReels available, but cannot guarantee uninterrupted service.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    subtitle: 'How we handle your information.',
    icon: 'shield-checkmark-outline',
    sections: [
      {
        heading: '1. Information We Collect',
        body: 'We collect information you provide, such as your email, username, profile details, and content you upload. We also receive service usage information, such as interactions with videos and features, to operate and improve MzansiReels.',
      },
      {
        heading: '2. How We Use Information',
        body: 'We use information to create and secure accounts, provide the feed and social features, personalize your experience, respond to support requests, prevent abuse, and maintain the service.',
      },
      {
        heading: '3. Storage and Protection',
        body: 'Account and app data is stored using our infrastructure and service providers, including Appwrite. We use reasonable technical and organizational safeguards to help protect data. No online service can guarantee absolute security.',
      },
      {
        heading: '4. Sharing and Sale of Data',
        body: 'We do not sell your personal information to third parties. We share information only as needed with providers that support the app, to protect users and the service, or when required by law.',
      },
      {
        heading: '5. Your Choices and Rights',
        body: 'You can review and update some profile information in the app. You may request access to, correction of, or deletion of your personal information, subject to applicable law and legitimate record-retention needs. Contact us to make a privacy request.',
      },
      {
        heading: '6. Children and Age Limits',
        body: 'MzansiReels is not intended for children under 13. Some features may be restricted to people aged 18 or older. If you believe a child has provided personal information, contact us so we can review the request.',
      },
      {
        heading: '7. Contact',
        body: 'For questions about this Privacy Policy or your personal information, contact sectionfellas@gmail.com.',
      },
    ],
  },
  guidelines: {
    title: 'Community Guidelines',
    subtitle: 'Help keep MzansiReels welcoming and safe.',
    icon: 'people-outline',
    sections: [
      {
        heading: 'Respect the community',
        body: 'Do not post hate speech, targeted harassment, threats, or cyberbullying. Treat other people with dignity, even when you disagree.',
      },
      {
        heading: 'Share safe, lawful content',
        body: 'Do not upload illegal content, nudity, exploitation, or material that encourages violence or puts others at risk.',
      },
      {
        heading: 'Protect privacy',
        body: 'Do not share someone else’s private information, images, or personal details without permission.',
      },
      {
        heading: 'Celebrate Mzansi',
        body: 'Share your creativity, culture, talent, and everyday stories. Report content that you believe violates these guidelines.',
      },
    ],
  },
};

export default function LegalScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const data = CONTENT[route.params?.type] || CONTENT.terms;

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
        <Text numberOfLines={1} style={styles.headerTitle}>{data.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name={data.icon} size={26} color={COLORS.cyan} />
          </View>
          <Text style={styles.title}>{data.title}</Text>
          <Text style={styles.subtitle}>{data.subtitle}</Text>
          <Text style={styles.updated}>Last updated: November 2026</Text>
        </View>

        {data.sections.map((section) => (
          <View key={section.heading} style={styles.section}>
            <Text style={styles.sectionHeading}>{section.heading}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}

        <View style={styles.contactNote}>
          <Ionicons name="mail-outline" size={17} color={COLORS.cyan} />
          <Text style={styles.contactText}>
            Questions? Contact us at <Text style={styles.email}>sectionfellas@gmail.com</Text>.
          </Text>
        </View>
        <Text style={styles.footer}>© {new Date().getFullYear()} MzansiReels</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { minHeight: 55, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, color: '#F6F8FA', fontSize: 16, fontWeight: '800', textAlign: 'center', marginHorizontal: 8 },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', paddingHorizontal: 22, paddingTop: 25, paddingBottom: 42 },
  hero: { alignItems: 'center', paddingBottom: 25 },
  heroIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(0,229,255,0.2)', backgroundColor: 'rgba(0,229,255,0.09)' },
  title: { color: '#F6F8FA', fontSize: 26, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5 },
  subtitle: { color: '#A3ABB5', fontSize: 14, textAlign: 'center', marginTop: 7 },
  updated: { color: '#727B86', fontSize: 11, marginTop: 12 },
  section: { padding: 18, marginBottom: 11, borderRadius: 15, borderWidth: 1, borderColor: '#292E37', backgroundColor: '#14171E' },
  sectionHeading: { color: '#F4F6F8', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  sectionBody: { color: '#B9C0C8', fontSize: 13, lineHeight: 21 },
  contactNote: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, padding: 15, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,229,255,0.18)', backgroundColor: 'rgba(0,229,255,0.05)' },
  contactText: { flex: 1, color: '#AEB6BF', fontSize: 12, lineHeight: 19, marginLeft: 10 },
  email: { color: COLORS.cyan, fontWeight: '700' },
  footer: { color: '#626A75', fontSize: 10, textAlign: 'center', marginTop: 24 },
});
