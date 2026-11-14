import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

const DOT_COUNT = 4;
const DOT_STAGGER_MS = 140;

export default function LoadingDots() {
  const dotValues = useRef(
    Array.from({ length: DOT_COUNT }, () => new Animated.Value(0)),
  ).current;

  useEffect(() => {
    const animations = dotValues.map((value, index) => {
      const animation = Animated.sequence([
        Animated.delay(index * DOT_STAGGER_MS),
        Animated.loop(
          Animated.sequence([
            Animated.timing(value, {
              toValue: 1,
              duration: 280,
              useNativeDriver: true,
            }),
            Animated.timing(value, {
              toValue: 0,
              duration: 280,
              useNativeDriver: true,
            }),
            Animated.delay(180),
          ]),
        ),
      ]);
      animation.start();
      return animation;
    });

    return () => animations.forEach((animation) => animation.stop());
  }, [dotValues]);

  return (
    <View
      style={styles.container}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      {dotValues.map((value, index) => {
        const opacity = value.interpolate({
          inputRange: [0, 1],
          outputRange: [0.45, 1],
        });
        const translateY = value.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -6],
        });

        return (
          <Animated.View
            key={index}
            style={[
              styles.dot,
              index < DOT_COUNT - 1 && styles.dotSpacing,
              { opacity, transform: [{ translateY }] },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#00E5FF',
  },
  dotSpacing: {
    marginRight: 9,
  },
});
