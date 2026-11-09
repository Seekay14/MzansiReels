import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../config/constants';

export default function AboutScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>About</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        
        <View style={styles.logoContainer}>
          <View style={styles.logoBox}>
            <Ionicons name="videocam" size={50} color="#000" />
          </View>
          <Text style={styles.appName}>MzansiReels</Text>
          <Text style={styles.tagline}>The Home of South African Creativity</Text>
        </View>

        <Text style={styles.description}>
          MzansiReels is the premier platform for South African creators to share short, engaging videos. Discover the best of local talent, music, and culture.
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="code-slash" size={20} color={COLORS.cyan} style={styles.infoIcon} />
            <View>
              <Text style={styles.infoLabel}>Developer</Text>
              <Text style={styles.infoValue}>Mzansi Tech Team</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Ionicons name="location" size={20} color={COLORS.cyan} style={styles.infoIcon} />
            <View>
              <Text style={styles.infoLabel}>Headquarters</Text>
              <Text style={styles.infoValue}>Johannesburg, South Africa 🇿🇦</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.infoRow} onPress={() => Linking.openURL('mailto:hello@mzansireels.com')}>
            <Ionicons name="mail" size={20} color={COLORS.cyan} style={styles.infoIcon} />
            <View>
              <Text style={styles.infoLabel}>Contact Support</Text>
              <Text style={[styles.infoValue, { color: COLORS.cyan }]}>hello@mzansireels.com</Text>
            </View>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Legal & Policies</Text>
        <View style={styles.linkCard}>
          
          {/* THIS IS THE EQUIVALENT OF HREF, IT OPENS THE IN-APP PAGE */}
          <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('Legal', { type: 'privacy' })}>
            <Text style={styles.linkText}>Privacy Policy</Text>
            <Ionicons name="chevron-forward" size={20} color="#555" />
          </TouchableOpacity>
          
          <View style={styles.divider} />
          
          <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('Legal', { type: 'terms' })}>
            <Text style={styles.linkText}>Terms of Service</Text>
            <Ionicons name="chevron-forward" size={20} color="#555" />
          </TouchableOpacity>
          
          <View style={styles.divider} />
          
          <TouchableOpacity style={styles.linkRow} onPress={() => navigation.navigate('Legal', { type: 'guidelines' })}>
            <Text style={styles.linkText}>Community Guidelines</Text>
            <Ionicons name="chevron-forward" size={20} color="#555" />
          </TouchableOpacity>
          
        </View>

        <View style={styles.footer}>
          <Text style={styles.versionText}>Version 1.0.0 (Build 1)</Text>
          <Text style={styles.osText}>Running on {Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'Web'}</Text>
          <Text style={styles.copyright}>
            © {new Date().getFullYear()} MzansiReels. All rights reserved.
          </Text>
          <Text style={styles.madeWith}>Made with ❤️ in Mzansi.</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 5 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  content: { padding: 20, alignItems: 'center', paddingBottom: 40 },
  logoContainer: { alignItems: 'center', marginTop: 10, marginBottom: 20 },
  logoBox: { width: 90, height: 90, backgroundColor: COLORS.cyan, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  appName: { color: '#fff', fontSize: 28, fontWeight: 'bold', letterSpacing: 1 },
  tagline: { color: COLORS.muted, fontSize: 14, marginTop: 5, fontStyle: 'italic' },
  description: { color: '#ccc', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 30, paddingHorizontal: 10 },
  infoCard: { width: '100%', backgroundColor: COLORS.card, padding: 20, borderRadius: 15, borderWidth: 1, borderColor: '#2A2A35', marginBottom: 30 },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  infoIcon: { marginRight: 15 },
  infoLabel: { color: COLORS.muted, fontSize: 12, textTransform: 'uppercase', marginBottom: 2, fontWeight: 'bold' },
  infoValue: { color: '#fff', fontSize: 15, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#2A2A35', marginVertical: 15 },
  sectionTitle: { width: '100%', color: COLORS.muted, fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 10, marginLeft: 5 },
  linkCard: { width: '100%', backgroundColor: COLORS.card, borderRadius: 15, borderWidth: 1, borderColor: '#2A2A35', paddingHorizontal: 15, marginBottom: 30 },
  linkRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 15 },
  linkText: { color: '#fff', fontSize: 16 },
  footer: { alignItems: 'center', marginTop: 10 },
  versionText: { color: COLORS.muted, fontSize: 13, fontWeight: 'bold' },
  osText: { color: '#555', fontSize: 12, marginTop: 4 },
  copyright: { color: '#444', fontSize: 12, marginTop: 20, textAlign: 'center' },
  madeWith: { color: '#444', fontSize: 12, marginTop: 5, fontWeight: 'bold' }
});