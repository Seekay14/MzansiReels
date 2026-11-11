import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { COLORS } from '../config/constants';

export default function MzansiLoader({ size = 12, style }) {
  const scales = useRef(
    Array.from({ length: 3 }, () => new Animated.Value(0.65)),
  ).current;

  useEffect(() => {
    const animations = scales.map((scale, index) => Animated.loop(
      Animated.sequence([
        Animated.delay(index * 180),
        Animated.timing(scale, {
          toValue: 1.15,
          duration: 320,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.65,
          duration: 320,
          useNativeDriver: true,
        }),
      ]),
    ));
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [scales]);

  return (
    <View style={[styles.container, style]} accessibilityRole="progressbar">
      {scales.map((scale, index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            { width: size, height: size, borderRadius: size / 2 },
            { transform: [{ scale }] },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  dot: { backgroundColor: COLORS.cyan },
});
