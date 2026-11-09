import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../config/constants';

const CONTENT = {
  privacy: {
    title: 'Privacy Policy',
    lastUpdated: 'Last Updated: November 2026',
    body: `1. Information We Collect\nWe collect information you provide directly to us, such as when you create an account, upload videos, or communicate with other users.\n\n2. How We Use Your Information\nWe use the information to operate, maintain, and provide the features of MzansiReels. This includes personalizing your feed and facilitating communication.\n\n3. Data Storage and Security\nYour data is securely stored using Appwrite. We implement industry-standard security measures to protect your personal information.\n\n4. Your Rights (POPIA Compliance)\nIn accordance with POPIA in South Africa, you have the right to access, correct, or delete your personal information through your account settings.\n\n5. Contact Us\nIf you have any questions, please contact us at privacy@mzansireels.com.`
  },
  terms: {
    title: 'Terms of Service',
    lastUpdated: 'Last Updated: November 2026',
    body: `1. Acceptance of Terms\nBy accessing or using MzansiReels, you agree to be bound by these Terms of Service.\n\n2. User Content\nYou retain ownership of the videos you post. By posting, you grant us a non-exclusive license to host and display your content within the app.\n\n3. Prohibited Conduct\nYou agree not to post content that is illegal, harmful, or violates the rights of others. We reserve the right to remove violating content.\n\n4. Account Termination\nWe reserve the right to suspend or terminate your account if you violate these Terms.\n\n5. Limitation of Liability\nMzansiReels is provided "as is" without warranties of any kind.`
  },
  guidelines: {
    title: 'Community Guidelines',
    lastUpdated: 'Welcome to the MzansiReels Community',
    body: `Our mission is to foster a safe, creative, and vibrant space for South African voices.\n\n1. Be Respectful\nHarassment, hate speech, and bullying are strictly prohibited.\n\n2. Keep It Real\nDo not post misleading content, spam, or engage in deceptive practices.\n\n3. Safety First\nDo not post content that promotes self-harm, violence, or illegal activities.\n\n4. Protect Privacy\nDo not share other people's personal information without their consent.\n\n5. Celebrate Mzansi Culture\nShare your talent, your culture, and your stories. Let's showcase the best of South Africa to the world!`
  }
};

export default function LegalScreen({ route, navigation }) {
  const { type } = route.params; 
  const insets = useSafeAreaInsets();
  const data = CONTENT[type] || CONTENT.privacy;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{data.title}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.titleContainer}>
          <View style={styles.iconBox}>
            <Ionicons 
              name={type === 'privacy' ? 'shield-checkmark' : type === 'terms' ? 'document-text' : 'people'} 
              size={40} 
              color={COLORS.cyan} 
            />
          </View>
          <Text style={styles.title}>{data.title}</Text>
          <Text style={styles.lastUpdated}>{data.lastUpdated}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.bodyText}>{data.body}</Text>
        </View>

        <Text style={styles.footerText}>
          © {new Date().getFullYear()} MzansiReels. All rights reserved.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 5 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  content: { padding: 20, paddingBottom: 40 },
  titleContainer: { alignItems: 'center', marginBottom: 30, marginTop: 10 },
  iconBox: { width: 80, height: 80, borderRadius: 20, backgroundColor: 'rgba(0, 229, 255, 0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
  lastUpdated: { color: COLORS.muted, fontSize: 13, marginTop: 8, fontWeight: '500' },
  card: { backgroundColor: COLORS.card, padding: 20, borderRadius: 15, borderWidth: 1, borderColor: '#2A2A35' },
  bodyText: { color: '#ccc', fontSize: 15, lineHeight: 24, textAlign: 'left' },
  footerText: { color: '#444', fontSize: 12, textAlign: 'center', marginTop: 30, marginBottom: 10 }
});