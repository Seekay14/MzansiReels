import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { COLORS } from '../config/constants';

function SkeletonBar({ style }) {
  return <View style={[styles.bar, style]} />;
}

export default function SkeletonPost() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 850,
          useNativeDriver: false,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 850,
          useNativeDriver: false,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <View style={styles.card}>
      <Animated.View style={[styles.content, { opacity }]}>
        <View style={styles.header}>
          <View style={styles.avatar} />
          <View style={styles.authorInfo}>
            <SkeletonBar style={styles.nameBar} />
            <SkeletonBar style={styles.timeBar} />
          </View>
          <View style={styles.optionsDot} />
        </View>
        <View style={styles.postText}>
          <SkeletonBar style={styles.firstTextBar} />
          <SkeletonBar style={styles.secondTextBar} />
        </View>
        <View style={styles.actions}>
          <SkeletonBar style={styles.actionBar} />
          <SkeletonBar style={styles.actionBar} />
          <SkeletonBar style={styles.actionBar} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginBottom: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  content: {
    opacity: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#343943',
  },
  authorInfo: {
    flex: 1,
    marginLeft: 11,
    gap: 7,
  },
  bar: {
    height: 9,
    borderRadius: 5,
    backgroundColor: '#343943',
  },
  nameBar: {
    width: 120,
  },
  timeBar: {
    width: 76,
    height: 7,
  },
  optionsDot: {
    width: 24,
    height: 8,
    marginLeft: 10,
    borderRadius: 5,
    backgroundColor: '#343943',
  },
  postText: {
    marginTop: 16,
    gap: 9,
  },
  firstTextBar: {
    width: '95%',
  },
  secondTextBar: {
    width: '68%',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 19,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  actionBar: {
    width: '24%',
    height: 8,
  },
});
