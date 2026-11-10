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

const HERO_IMAGE = 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?auto=format&fit=crop&w=1400&q=85';
const CREATOR_IMAGE = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=85';
const BRAND_CYAN = '#00E5FF';
const BRAND_DARK = '#171A1F';

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
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 550, delay, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, delay, friction: 7, tension: 55, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}

function HeroVisual({ compact }) {
  return (
    <View style={[styles.heroFrame, compact ? styles.heroFrameMobile : styles.heroFrameDesktop]}>
      <ImageBackground
        source={{ uri: HERO_IMAGE }}
        style={styles.heroImage}
        imageStyle={styles.heroImageStyle}
        resizeMode="cover"
      >
        <View style={styles.imageShade} />
        {!compact && (
          <>
            <FloatingCard style={styles.reaction} delay={180}>
              <Text style={styles.reactionEmoji}>😂</Text>
              <Text style={styles.reactionCount}>2.4k</Text>
            </FloatingCard>

            <FloatingCard style={styles.playCard} delay={360}>
              <View style={styles.playIcon}>
                <Ionicons name="play" size={17} color={BRAND_CYAN} />
              </View>
              <View style={styles.playCopy}>
                <Text style={styles.playTitle}>A moment from Mzansi</Text>
                <Text style={styles.playSubtitle}>Watch the joy unfold</Text>
              </View>
              <Ionicons name="volume-high" size={17} color="#62706A" />
            </FloatingCard>

            <FloatingCard style={styles.creatorAvatar} delay={520}>
              <Image source={{ uri: CREATOR_IMAGE }} style={styles.creatorImage} />
              <View style={styles.onlineDot} />
            </FloatingCard>
          </>
        )}
      </ImageBackground>
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
        Experience the heartbeat of <Text style={styles.headlineAccent}>Mzansi.</Text>
      </Text>
      <Text style={styles.bodyCopy}>
        Discover the creators, culture and everyday stories that bring South Africa together — one reel at a time.
      </Text>
      <View style={[styles.actions, compact && styles.actionsMobile]}>
        <TouchableOpacity
          style={[styles.primaryButton, compact && styles.primaryButtonMobile]}
          onPress={onGetStarted}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Get started</Text>
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
      <View style={styles.communityNote}>
        <Ionicons name="play-circle-outline" size={18} color={BRAND_CYAN} />
        <Text style={styles.communityText}>Your people. Your stories. Your Mzansi.</Text>
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
    ? Math.min(Math.max(height * 0.32, 220), 320)
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
            <HeroVisual compact={compact} />
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
  heroFrame: { flex: 1, width: '100%', overflow: 'visible', padding: 8 },
  heroFrameDesktop: { transform: [{ rotate: '-1deg' }] },
  heroFrameMobile: { transform: [{ rotate: '0deg' }] },
  heroImage: { flex: 1, width: '100%', borderRadius: 28, overflow: 'hidden', backgroundColor: '#DDE6E0' },
  heroImageStyle: { borderRadius: 28 },
  imageShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,25,18,0.08)', borderRadius: 28 },
  reaction: {
    position: 'absolute',
    top: '12%',
    right: -14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 13,
    shadowColor: '#15221C',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  reactionEmoji: { fontSize: 22 },
  reactionCount: { color: '#23332B', fontSize: 12, fontWeight: '800', marginLeft: 7 },
  playCard: {
    position: 'absolute',
    left: -20,
    bottom: '17%',
    maxWidth: 300,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 17,
    padding: 12,
    shadowColor: '#15221C',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  playIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#E8FBFF', alignItems: 'center', justifyContent: 'center' },
  playCopy: { flex: 1, marginHorizontal: 11 },
  playTitle: { color: '#1C2A22', fontSize: 12, fontWeight: '800' },
  playSubtitle: { color: '#728077', fontSize: 11, marginTop: 3 },
  creatorAvatar: {
    position: 'absolute',
    right: 17,
    bottom: '5%',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#15221C',
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  creatorImage: { width: '100%', height: '100%', borderRadius: 28 },
  onlineDot: { position: 'absolute', right: -1, bottom: 1, width: 14, height: 14, borderRadius: 7, backgroundColor: '#FFB81C', borderWidth: 2, borderColor: '#fff' },
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
  loginButtonMobile: { width: '100%', alignSelf: 'stretch', borderWidth: 1, borderColor: '#DCE5DF', borderRadius: 15 },
  loginButtonText: { color: '#27323A', fontSize: 14, fontWeight: '700' },
  communityNote: { flexDirection: 'row', alignItems: 'center', marginTop: 28 },
  communityText: { color: '#66726A', fontSize: 12, marginLeft: 8 },
  footer: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 1 },
  footerText: { color: '#87918B', fontSize: 11 },
  footerDots: { flexDirection: 'row', gap: 4 },
  footerDot: { width: 6, height: 6, borderRadius: 3 },
});
