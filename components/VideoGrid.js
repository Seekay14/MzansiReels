import React from 'react';
import { Text, View, FlatList, TouchableOpacity, Dimensions, RefreshControl, StyleSheet, Image, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../config/constants';

const itemSize = Dimensions.get('window').width / 3;

export default function VideoGrid({ videos, onPress, onLongPress, header, refreshing, onRefresh, emptyText, onDelete }) {
  return (
    <FlatList
      data={videos}
      keyExtractor={(item) => item.$id}
      numColumns={3}
      ListHeaderComponent={header}
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={COLORS.cyan} /> : undefined}
      renderItem={({ item }) => (
        <TouchableOpacity activeOpacity={0.8} style={styles.tile} onPress={() => onPress?.(item)} onLongPress={() => onLongPress?.(item)}>
          
          {item.thumbnailUrl ? (
            <Image source={{ uri: item.thumbnailUrl }} style={StyleSheet.absoluteFillObject} />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="videocam" size={30} color={COLORS.muted} />
            </View>
          )}

          {onDelete && (
            <TouchableOpacity 
              style={styles.deleteBtn} 
              onPress={() => {
                Alert.alert(
                  "Delete Video", 
                  "Are you sure you want to delete this video?",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => onDelete(item) }
                  ]
                );
              }}
            >
              <Ionicons name="trash" size={16} color="#fff" />
            </TouchableOpacity>
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
  tile: { width: itemSize, height: itemSize * 1.5, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.card },
  overlay: { position: 'absolute', bottom: 8, left: 8, right: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  likes: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  likeText: { color: '#fff', fontSize: 11, marginLeft: 4, fontWeight: 'bold' },
  empty: { color: COLORS.muted, textAlign: 'center', marginTop: 30, width: '100%' },
  deleteBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(255,0,85,0.8)', padding: 6, borderRadius: 20, zIndex: 10 }
});