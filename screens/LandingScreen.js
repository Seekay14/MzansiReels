import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  ImageBackground,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

const HERO_IMAGE = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&h=1600&q=90';
const CREATOR_IMAGE = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=160&h=160&q=85';
const BRAND_CYAN = '#00E5FF';
const BRAND_DARK = '#171A1F';
const TRENDING_HASHTAGS = ['#Amapiano', '#JoburgVibes', '#DurbanBeach', '#ComedySA', '#MzansiTalent'];
const STATS = [
  { value: '10k+', label: 'Creators' },
  { value: '500k+', label: 'Reels Watched' },
  { value: '1M+', label: 'Likes' },
  { value: '12', label: 'Languages' },
];
const STEPS = [
  { icon: 'person-add-outline', title: 'Create an Account', description: 'Join the community and set up your creator profile.' },
  { icon: 'videocam-outline', title: 'Upload Your Reels', description: 'Share the moments, moves and stories that are you.' },
  { icon: 'rocket-outline', title: 'Get Featured in Mzansi', description: 'Find your audience and let your creativity travel.' },
];

function BrandLogo() {
  return (
    <View style={styles.brand} accessibilityRole="header">
      <View style={styles.brandMark} accessibilityElementsHidden>
        <View style={styles.brandPillSolid} />
        <View style={styles.brandPillOutline} />
      </View>
      <Text style={styles.brandName}>MzansiReels</Text>
    </View>
  );
}

function FloatingCard({ style, delay = 0, children }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    const entrance = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 550, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, delay, friction: 7, tension: 55, useNativeDriver: true }),
    ]);
    entrance.start(({ finished }) => {
      if (!finished) return;
      Animated.loop(
        Animated.sequence([
          Animated.timing(translateY, { toValue: -5, duration: 1100, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 1100, useNativeDriver: true }),
        ]),
      ).start();
    });
    return () => {
      entrance.stop();
      opacity.stopAnimation();
      translateY.stopAnimation();
    };
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

function HeroVisual({ compact, width }) {
  const phoneWidth = compact ? Math.min(width - 72, 270) : 282;
  const phoneHeight = phoneWidth * 1.86;

  return (
    <View style={styles.heroFrame}>
      <View style={[styles.phoneBezel, { width: phoneWidth, height: phoneHeight }]}>
        <View style={styles.phoneScreen}>
          <ImageBackground
            source={{ uri: HERO_IMAGE }}
            style={styles.heroImage}
            imageStyle={styles.heroImageStyle}
            resizeMode="cover"
          >
            <View style={styles.imageShade} />
            <View style={styles.screenHeader}>
              <View style={styles.liveLabel}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>FOR YOU</Text>
              </View>
              <Ionicons name="volume-high" size={17} color="#fff" />
            </View>
            <View style={styles.actionRail}>
              <FloatingCard style={styles.actionItem} delay={180}>
                <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                <Ionicons name="heart" size={27} color="#fff" />
                <Text style={styles.actionText}>24.5k</Text>
              </FloatingCard>
              <FloatingCard style={styles.actionItem} delay={320}>
                <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                <Ionicons name="chatbubble" size={24} color="#fff" />
                <Text style={styles.actionText}>1.2k</Text>
              </FloatingCard>
              <FloatingCard style={styles.actionItem} delay={460}>
                <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
                <Ionicons name="bookmark" size={24} color="#fff" />
                <Text style={styles.actionText}>Save</Text>
              </FloatingCard>
            </View>
            <View style={styles.profileCard}>
              <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
              <Image source={{ uri: CREATOR_IMAGE }} style={styles.profileAvatar} />
              <View style={styles.profileCopy}>
                <View style={styles.profileNameRow}>
                  <Text style={styles.username}>@sipho_creates</Text>
                  <Ionicons name="checkmark-circle" size={15} color="#38BDF8" />
                </View>
                <Text style={styles.caption} numberOfLines={1}>Golden hour in Joburg</Text>
              </View>
            </View>
          </ImageBackground>
        </View>
      </View>
      <FloatingCard style={styles.trendingBadge} delay={300}>
        <BlurView intensity={24} tint="light" style={StyleSheet.absoluteFill} />
        <Ionicons name="flame" size={17} color="#F97316" />
        <Text style={styles.trendingText}>Trending</Text>
      </FloatingCard>
    </View>
  );
}

function IntroCopy({ onGetStarted, onLogin, compact }) {
  return (
    <View style={[styles.copyBlock, compact && styles.copyBlockMobile]}>
      <View style={styles.flagAccent}>
      <View style={[styles.flagStripe, { backgroundColor: BRAND_CYAN }]} />
      <View style={[styles.flagStripe, { backgroundColor: BRAND_DARK }]} />
      </View>
      <Text style={styles.eyebrow}>MADE FOR THE MOMENTS THAT MOVE US</Text>
      <Text style={[styles.headline, compact && styles.headlineMobile]}>
        Watch the vibe. Share your <Text style={styles.headlineAccent}>Mzansi.</Text>
      </Text>
      <Text style={styles.bodyCopy}>
        Discover the creators, culture and everyday stories that bring South Africa together.
      </Text>
      <View style={[styles.actions, compact && styles.actionsMobile]}>
        <TouchableOpacity
          style={[styles.primaryButton, compact && styles.primaryButtonMobile]}
          onPress={onGetStarted}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
          <Ionicons name="arrow-forward" size={19} color={BRAND_DARK} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.loginButton, compact && styles.loginButtonMobile]}
          onPress={onLogin}
          accessibilityRole="button"
        >
          <Text style={styles.loginButtonText}>Log in</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StatsSection({ compact }) {
  return (
    <View style={[styles.contentSection, styles.statsSection, compact && styles.contentSectionMobile]}>
      <View style={styles.statsGrid}>
        {STATS.map((stat) => (
          <View key={stat.label} style={[styles.statItem, compact && styles.statItemMobile]}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function HowItWorksSection({ compact }) {
  return (
    <View style={[styles.contentSection, compact && styles.contentSectionMobile]}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionEyebrow}>YOUR NEXT BIG MOMENT STARTS HERE</Text>
        <Text style={styles.sectionTitle}>How it works</Text>
      </View>
      <View style={[styles.stepsGrid, compact && styles.stepsGridMobile]}>
        {STEPS.map((step, index) => (
          <View key={step.title} style={[styles.stepCard, compact && styles.stepCardMobile]}>
            <View style={styles.stepIcon}>
              <Ionicons name={step.icon} size={25} color={BRAND_CYAN} />
            </View>
            <Text style={styles.stepNumber}>0{index + 1}</Text>
            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepDescription}>{step.description}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function TrendingSection({ width }) {
  const groupWidth = Math.max(width - 56, 620);
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    translateX.setValue(0);
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: -groupWidth,
        duration: groupWidth * 35,
        useNativeDriver: true,
        isInteraction: false,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [groupWidth, translateX]);

  const renderTagGroup = (duplicate = false) => (
    <View
      style={[styles.hashtagGroup, { width: groupWidth }]}
      key={duplicate ? 'duplicate' : 'primary'}
      accessibilityElementsHidden={duplicate}
      importantForAccessibility={duplicate ? 'no-hide-descendants' : 'auto'}
    >
      {TRENDING_HASHTAGS.map((hashtag) => (
        <View key={hashtag} style={styles.hashtagPill}>
          <Text style={styles.hashtagText}>{hashtag}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <View style={styles.trendingSection}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionEyebrow}>THE CONVERSATION IS HERE</Text>
        <Text style={[styles.sectionTitle, styles.trendingTitle]}>Trending now</Text>
      </View>
      <View style={styles.marqueeViewport}>
        <Animated.View style={[styles.marqueeTrack, { width: groupWidth * 2, transform: [{ translateX }] }]}>
          {renderTagGroup()}
          {renderTagGroup(true)}
        </Animated.View>
      </View>
    </View>
  );
}

function DownloadFooter() {
  return (
    <View style={styles.downloadFooter}>
      <View style={styles.downloadContent}>
        <Text style={styles.downloadEyebrow}>YOUR NEXT FAVOURITE APP</Text>
        <Text style={styles.downloadTitle}>Mzansi, in your pocket.</Text>
        <Text style={styles.releaseDate}>Coming Jan 2027</Text>
        <View style={styles.storeButtons}>
          <View style={styles.storeButton} accessibilityRole="text" accessibilityLabel="Google Play, coming soon">
            <Ionicons name="logo-google-playstore" size={20} color="#fff" />
            <View style={styles.storeButtonCopy}>
              <Text style={styles.storeButtonOverline}>GET IT ON</Text>
              <Text style={styles.storeButtonName}>Google Play</Text>
            </View>
          </View>
          <View style={styles.storeButton} accessibilityRole="text" accessibilityLabel="App Store, coming soon">
            <Ionicons name="logo-apple" size={22} color="#fff" />
            <View style={styles.storeButtonCopy}>
              <Text style={styles.storeButtonOverline}>DOWNLOAD ON THE</Text>
              <Text style={styles.storeButtonName}>App Store</Text>
            </View>
          </View>
        </View>
        <Text style={styles.downloadNote}>Be ready for the stories that move us.</Text>
      </View>
    </View>
  );
}

export default function LandingScreen({ navigation }) {
  const { width, height } = useWindowDimensions();
  const compact = width < 768;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentOffset = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(contentOpacity, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.spring(contentOffset, { toValue: 0, friction: 8, tension: 45, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [contentOpacity, contentOffset]);

  const openAuth = () => navigation.navigate('Auth');
  const heroHeight = compact
    ? Math.max(Math.min(width * 1.5, 520), 410)
    : Math.min(Math.max(height * 0.68, 460), 680);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.scrollContent}
      bounces={false}
    >
      <View style={[styles.page, compact && styles.pageMobile]}>
        <View style={[styles.topBar, compact && styles.topBarMobile]}>
          <BrandLogo />
          {!compact && (
            <TouchableOpacity onPress={openAuth} accessibilityRole="button">
              <Text style={styles.topLogin}>Log in</Text>
            </TouchableOpacity>
          )}
        </View>

        <Animated.View
          style={[
            styles.heroLayout,
            compact ? styles.heroLayoutMobile : styles.heroLayoutDesktop,
            { opacity: contentOpacity, transform: [{ translateY: contentOffset }] },
          ]}
        >
          <IntroCopy onGetStarted={openAuth} onLogin={openAuth} compact={compact} />
          <View style={[styles.heroColumn, compact && styles.heroColumnMobile, { height: heroHeight }]}>
            <HeroVisual compact={compact} width={width} />
          </View>
        </Animated.View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Proudly rooted in South Africa</Text>
          <View style={styles.footerDots}>
            <View style={[styles.footerDot, { backgroundColor: BRAND_CYAN }]} />
            <View style={[styles.footerDot, { backgroundColor: BRAND_DARK }]} />
            <View style={[styles.footerDot, { backgroundColor: BRAND_CYAN }]} />
          </View>
        </View>
        <StatsSection compact={compact} />
        <HowItWorksSection compact={compact} />
        <TrendingSection width={width} />
        <DownloadFooter />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  scrollContent: { flexGrow: 1 },
  page: { width: '100%', maxWidth: 1240, minHeight: '100%', alignSelf: 'center', paddingHorizontal: 28 },
  pageMobile: { paddingHorizontal: 24 },
  topBar: { height: 82, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', zIndex: 2 },
  topBarMobile: { height: 68, justifyContent: 'flex-start' },
  brand: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  brandMark: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  brandPillSolid: { width: 10, height: 25, borderRadius: 6, backgroundColor: BRAND_CYAN },
  brandPillOutline: { width: 10, height: 25, borderRadius: 6, borderWidth: 2, borderColor: BRAND_CYAN },
  brandName: { color: BRAND_DARK, fontSize: 18, fontWeight: '800', marginLeft: 10, letterSpacing: -0.3, flexShrink: 0 },
  topLogin: { color: '#27323A', fontSize: 14, fontWeight: '700', padding: 10 },
  heroLayout: { flexGrow: 1, alignItems: 'center', paddingVertical: 22 },
  heroLayoutDesktop: { flexDirection: 'row', gap: 48 },
  heroLayoutMobile: { flexDirection: 'column', alignItems: 'stretch', paddingTop: 0, paddingBottom: 12, gap: 0 },
  heroColumn: { flex: 1.08, width: '100%', maxWidth: 660, zIndex: 0 },
  heroColumnMobile: { flex: 0, flexShrink: 0, flexBasis: 'auto', width: '100%', maxWidth: 540, alignSelf: 'center' },
  heroFrame: { flex: 1, width: '100%', overflow: 'visible', alignItems: 'center', justifyContent: 'center' },
  phoneBezel: {
    padding: 8,
    borderRadius: 38,
    backgroundColor: '#08090D',
    borderWidth: 1,
    borderColor: '#383A42',
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 14,
  },
  phoneScreen: { flex: 1, overflow: 'hidden', borderRadius: 30, backgroundColor: '#252525' },
  heroImage: { flex: 1, width: '100%', overflow: 'hidden', justifyContent: 'space-between', backgroundColor: '#252525' },
  heroImageStyle: { borderRadius: 30 },
  imageShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3, 5, 10, 0.24)' },
  screenHeader: {
    position: 'absolute',
    top: 18,
    left: 17,
    right: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveLabel: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.42)' },
  liveDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6, backgroundColor: BRAND_CYAN },
  liveText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  actionRail: {
    position: 'absolute',
    right: 10,
    bottom: 100,
    alignItems: 'center',
  },
  actionItem: {
    minWidth: 48,
    alignItems: 'center',
    marginBottom: 17,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(12, 14, 20, 0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  actionText: { color: '#fff', fontSize: 10, fontWeight: '800', marginTop: 4, textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 4 },
  profileCard: {
    position: 'absolute',
    left: 12,
    right: 68,
    bottom: 18,
    minHeight: 55,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: 'rgba(15, 17, 23, 0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  profileAvatar: { width: 35, height: 35, borderRadius: 18, borderWidth: 1.5, borderColor: '#fff' },
  profileCopy: { flex: 1, marginLeft: 8 },
  profileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  username: { color: '#fff', fontSize: 10, fontWeight: '800' },
  caption: { color: '#F0F0F2', fontSize: 9, marginTop: 3 },
  trendingBadge: {
    position: 'absolute',
    top: '15%',
    right: '7%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 13,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.94)',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 7,
  },
  trendingText: { color: '#20212A', fontSize: 12, fontWeight: '800', marginLeft: 6 },
  copyBlock: { flex: 0.92, maxWidth: 470, paddingHorizontal: 10, justifyContent: 'center', zIndex: 1 },
  copyBlockMobile: { flex: 0, flexShrink: 0, flexBasis: 'auto', width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 0, paddingTop: 18, paddingBottom: 22 },
  flagAccent: { flexDirection: 'row', width: 60, height: 5, borderRadius: 4, overflow: 'hidden', marginBottom: 22 },
  flagStripe: { flex: 1 },
  eyebrow: { color: '#27323A', fontSize: 11, fontWeight: '800', letterSpacing: 1.6, marginBottom: 15 },
  headline: { color: '#15221C', fontSize: 51, lineHeight: 58, fontWeight: '800', letterSpacing: -1.7 },
  headlineMobile: { fontSize: 39, lineHeight: 46, letterSpacing: -1.1 },
  headlineAccent: { color: BRAND_CYAN },
  bodyCopy: { color: '#626D66', fontSize: 16, lineHeight: 27, marginTop: 19, maxWidth: 430 },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 28, gap: 12, zIndex: 2 },
  actionsMobile: { flexDirection: 'column', alignItems: 'stretch', gap: 10, marginTop: 22 },
  primaryButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 23,
    borderRadius: 15,
    backgroundColor: BRAND_CYAN,
    zIndex: 2,
  },
  primaryButtonMobile: { width: '100%', alignSelf: 'stretch' },
  primaryButtonText: { color: BRAND_DARK, fontSize: 15, fontWeight: '800', marginRight: 11 },
  loginButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 17, zIndex: 2 },
  loginButtonMobile: { width: '100%', alignSelf: 'stretch' },
  loginButtonText: { color: '#27323A', fontSize: 14, fontWeight: '700' },
  footer: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 1 },
  footerText: { color: '#87918B', fontSize: 11 },
  footerDots: { flexDirection: 'row', gap: 4 },
  footerDot: { width: 6, height: 6, borderRadius: 3 },
  contentSection: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingVertical: 76 },
  contentSectionMobile: { paddingVertical: 52 },
  statsSection: { borderTopWidth: 1, borderTopColor: '#E8EDF0', borderBottomWidth: 1, borderBottomColor: '#E8EDF0' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', rowGap: 28 },
  statItem: { width: '25%', minWidth: 150, alignItems: 'center', paddingHorizontal: 10 },
  statItemMobile: { width: '50%', minWidth: 0 },
  statValue: { color: BRAND_CYAN, fontSize: 36, lineHeight: 42, fontWeight: '900', letterSpacing: -1 },
  statLabel: { color: '#77818A', fontSize: 13, fontWeight: '600', marginTop: 6, textAlign: 'center' },
  sectionHeading: { alignItems: 'center', marginBottom: 34 },
  sectionEyebrow: { color: '#7A858D', fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  sectionTitle: { color: BRAND_DARK, fontSize: 32, fontWeight: '900', letterSpacing: -0.8, marginTop: 9, textAlign: 'center' },
  stepsGrid: { flexDirection: 'row', gap: 18 },
  stepsGridMobile: { flexDirection: 'column', gap: 12 },
  stepCard: {
    flex: 1,
    minHeight: 220,
    padding: 22,
    borderRadius: 20,
    backgroundColor: '#F6F9FA',
    borderWidth: 1,
    borderColor: '#E8EEF0',
  },
  stepCardMobile: { minHeight: 0, padding: 19 },
  stepIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#E6FBFE' },
  stepNumber: { color: '#9BA5AA', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 19 },
  stepTitle: { color: BRAND_DARK, fontSize: 17, fontWeight: '800', marginTop: 6 },
  stepDescription: { color: '#77818A', fontSize: 13, lineHeight: 20, marginTop: 8 },
  trendingSection: { width: '100%', paddingVertical: 60, backgroundColor: '#101217' },
  trendingTitle: { color: '#fff' },
  marqueeViewport: { width: '100%', minWidth: 0, flexShrink: 1, overflow: 'hidden', paddingVertical: 5 },
  marqueeTrack: { flexDirection: 'row', flexShrink: 0 },
  hashtagGroup: { flexDirection: 'row', flexShrink: 0, alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 10 },
  hashtagPill: { paddingVertical: 9, paddingHorizontal: 13, borderRadius: 18, borderWidth: 1, borderColor: BRAND_CYAN, backgroundColor: 'rgba(0,229,255,0.06)' },
  hashtagText: { color: '#DDE8EB', fontSize: 12, fontWeight: '700' },
  downloadFooter: { width: '100%', marginTop: 58, marginBottom: 30, paddingHorizontal: 26, paddingVertical: 58, borderRadius: 26, backgroundColor: '#101217' },
  downloadContent: { width: '100%', maxWidth: 650, alignSelf: 'center', alignItems: 'center' },
  downloadEyebrow: { color: BRAND_CYAN, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  downloadTitle: { color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.8, textAlign: 'center', marginTop: 11 },
  releaseDate: { color: BRAND_CYAN, fontSize: 17, fontWeight: '800', marginTop: 12 },
  storeButtons: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 12, marginTop: 27 },
  storeButton: { minWidth: 156, minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: '#454951', backgroundColor: '#1C1F25' },
  storeButtonCopy: { marginLeft: 9 },
  storeButtonOverline: { color: '#AAB1B6', fontSize: 8, fontWeight: '700', letterSpacing: 0.6 },
  storeButtonName: { color: '#fff', fontSize: 13, fontWeight: '800', marginTop: 2 },
  downloadNote: { color: '#87919A', fontSize: 12, marginTop: 22, textAlign: 'center' },
});
