import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { COLORS } from '../config/constants';

export default function BrandTitle() {
  return (
    <Text style={[styles.brand, { color: COLORS.text }]}>
      Mzansi<Text style={[styles.accent, { color: COLORS.cyan }]}>Reels</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  brand: { color: COLORS.text, fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  accent: { color: COLORS.cyan },
});

