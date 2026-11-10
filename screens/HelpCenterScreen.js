import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../config/constants';

const FAQS = [
  { q: "How do I upload a video?", a: "Tap the pink '+' button at the bottom of the screen. Select a video from your library or record a new one. Add a caption, choose a sound name, and tap 'Post to Feed'." },
  { q: "Why is my video not playing?", a: "If you are on the web browser, some video formats (like iPhone .mov files) are not supported by Chrome. Upload .mp4 files for the best web experience. The mobile app supports all formats." },
  { q: "How do I get a blue checkmark?", a: "The blue checkmark is currently reserved for the official MzansiReels account and select verified creators. Keep posting high-quality, original content to get noticed!" },
  { q: "How do I change my privacy settings?", a: "Go to Profile > Settings > Private Account. When enabled, only your followers can see your videos." },
  { q: "Can I delete a video I uploaded?", a: "Yes. Open your video, tap the three-dot menu, and choose Delete video." },
];

export default function HelpCenterScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [expandedIndex, setExpandedIndex] = useState(null);

  const toggleExpand = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help Center</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroBox}>
          <Ionicons name="chatbubbles" size={40} color={COLORS.cyan} />
          <Text style={styles.heroTitle}>How can we help?</Text>
          <Text style={styles.heroSub}>Find answers to common questions below.</Text>
        </View>

        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        
        {FAQS.map((faq, index) => (
          <TouchableOpacity 
            key={index} 
            style={styles.faqCard} 
            activeOpacity={0.8} 
            onPress={() => toggleExpand(index)}
          >
            <View style={styles.faqHeader}>
              <Text style={styles.question}>{faq.q}</Text>
              <Ionicons 
                name={expandedIndex === index ? "chevron-up" : "chevron-down"} 
                size={20} 
                color={COLORS.cyan} 
              />
            </View>
            {expandedIndex === index && (
              <Text style={styles.answer}>{faq.a}</Text>
            )}
          </TouchableOpacity>
        ))}

        <View style={styles.contactBox}>
          <Text style={styles.contactTitle}>Still need help?</Text>
          <Text style={styles.contactText}>Our support team is available Monday to Friday, 9am - 5pm SAST.</Text>
          <TouchableOpacity style={styles.emailBtn}>
            <Ionicons name="mail" size={20} color="#000" />
            <Text style={styles.emailBtnText}>Email Support</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20 },
  backBtn: { padding: 5 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  content: { padding: 20 },
  
  heroBox: { alignItems: 'center', marginBottom: 30, marginTop: 10 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 10 },
  heroSub: { color: COLORS.muted, fontSize: 14, marginTop: 5 },

  sectionTitle: { color: COLORS.muted, fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 15, marginLeft: 5 },
  
  faqCard: { backgroundColor: COLORS.card, padding: 18, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#2A2A35' },
  faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  question: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1, marginRight: 10 },
  answer: { color: COLORS.muted, fontSize: 14, lineHeight: 22, marginTop: 15, borderTopWidth: 1, borderTopColor: '#2A2A35', paddingTop: 15 },
  
  contactBox: { alignItems: 'center', marginTop: 20, padding: 25, backgroundColor: '#15151E', borderRadius: 15 },
  contactTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  contactText: { color: COLORS.muted, fontSize: 14, textAlign: 'center', marginBottom: 20 },
  emailBtn: { flexDirection: 'row', backgroundColor: COLORS.cyan, paddingVertical: 12, paddingHorizontal: 25, borderRadius: 10, alignItems: 'center' },
  emailBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
});