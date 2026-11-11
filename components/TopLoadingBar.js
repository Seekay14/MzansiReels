import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, useWindowDimensions, View } from 'react-native';
import { COLORS } from '../config/constants';

export default function TopLoadingBar({ isLoading }) {
  const { width: screenWidth } = useWindowDimensions();
  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const wasLoading = useRef(false);

  useEffect(() => {
    if (isLoading) {
      wasLoading.current = true;
      progress.stopAnimation();
      opacity.stopAnimation();
      progress.setValue(0);
      opacity.setValue(1);
      Animated.timing(progress, {
        toValue: 0.9,
        duration: 900,
        useNativeDriver: false,
      }).start();
      return undefined;
    }

    if (!wasLoading.current) return undefined;
    wasLoading.current = false;
    progress.stopAnimation();
    opacity.stopAnimation();
    Animated.sequence([
      Animated.timing(progress, {
        toValue: 1,
        duration: 150,
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      if (finished) progress.setValue(0);
    });
    return undefined;
  }, [isLoading, opacity, progress]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, screenWidth],
  });

  return (
    <View pointerEvents="none" style={styles.track}>
      <Animated.View style={[styles.bar, { width, opacity }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    zIndex: 1000,
  },
  bar: {
    height: 3,
    backgroundColor: COLORS.cyan,
  },
});
