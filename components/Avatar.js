import React from 'react';
import { Image, Text, View, StyleSheet } from 'react-native';
import { COLORS } from '../config/constants';

export default function Avatar({ uri, name, size = 45, bordered = false, style }) {
  const base = { width: size, height: size, borderRadius: size / 2 };
  const border = bordered ? styles.border : null;
  if (uri) return <Image source={{ uri }} style={[base, border, style]} />;
  return (
    <View style={[base, styles.placeholder, border, style]}>
      <Text style={{ color: '#000', fontWeight: 'bold', fontSize: size * 0.4 }}>
        {(name || '?').charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { backgroundColor: COLORS.cyan, justifyContent: 'center', alignItems: 'center' },
  border: { borderWidth: 2, borderColor: COLORS.cyan },
});
