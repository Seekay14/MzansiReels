import React from 'react';
import { Text, View, FlatList, TouchableOpacity, useWindowDimensions, RefreshControl, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../config/constants';

export default function VideoGrid({ videos, onPress, onLongPress, header, refreshing, onRefresh, emptyText }) {
  const { width } = useWindowDimensions();
  const columns = width >= 1000 ? 5 : width >= 680 ? 4 : 3;
  const itemSize = width / columns;

  return (
    <FlatList
      key={`video-grid-${columns}`}
      data={videos}
      keyExtractor={(item) => item.$id}
      numColumns={columns}
      ListHeaderComponent={header}
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={COLORS.cyan} /> : undefined}
      renderItem={({ item }) => (
        <TouchableOpacity activeOpacity={0.8} style={[styles.tile, { width: itemSize, height: itemSize * 1.5 }]} onPress={() => onPress?.(item)} onLongPress={() => onLongPress?.(item)}>
          
          {item.thumbnailUrl ? (
            <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFillObject} />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="videocam" size={30} color={COLORS.muted} />
            </View>
          )}

          <View style={styles.overlay}>
            <Ionicons name="play-circle" size={24} color="rgba(255,255,255,0.85)" />
            <View style={styles.likes}>
              <Ionicons name="heart" size={12} color={COLORS.pink} />
              <Text style={styles.likeText}>{item.likes || 0}</Text>
            </View>
          </View>
          
        </TouchableOpacity>
      )}
      ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  tile: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.card },
  overlay: { position: 'absolute', bottom: 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  likes: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  likeText: { color: '#fff', fontSize: 11, marginLeft: 4, fontWeight: 'bold' },
  empty: { color: COLORS.muted, textAlign: 'center', marginTop: 30, width: '100%' },
});