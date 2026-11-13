import React, { useEffect, useState } from 'react';
import { Text, View, FlatList, TouchableOpacity, RefreshControl, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, fileIdFromUrl } from '../config/constants';
import { getVideoThumbnail } from '../config/helpers';
import { formatCompactCount } from '../config/formatNumbers';

function VideoGridTile({ item, onPress, onLongPress }) {
  const [imageFailed, setImageFailed] = useState(false);
  let thumbnailUrl = item.mediaType === 'post'
    ? item.thumbnailUrl || item.imageUrl || ''
    : '';
  if (item.mediaType !== 'post') {
    try {
      thumbnailUrl = getVideoThumbnail(item);
    } catch (error) {
      console.error('Could not create video grid preview URL:', error);
    }
  }
  const showViews = item.mediaType !== 'post';

  useEffect(() => {
    setImageFailed(false);
  }, [item.$id, thumbnailUrl]);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={{ flex: 1 / 3, aspectRatio: 1, padding: 1 }}
      onPress={() => onPress?.(item)}
      onLongPress={() => onLongPress?.(item)}
    >
      <View style={styles.cellContent}>
        {thumbnailUrl && !imageFailed ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={styles.thumbnail}
            resizeMode="cover"
            onLoad={() => {
              if (__DEV__ && showViews) {
                console.debug('PROFILE VIDEO THUMBNAIL LOADED:', {
                  videoDocumentId: item.$id,
                  thumbnailField: item.thumbnailUrl || '',
                  thumbnailFileId: fileIdFromUrl(item.thumbnailUrl) || '',
                  videoFileId: item.videoFileId || fileIdFromUrl(item.videoUrl) || '',
                  generatedThumbnailUrl: thumbnailUrl,
                });
              }
            }}
            onError={(event) => {
              if (__DEV__ && showViews) {
                console.error('PROFILE VIDEO THUMBNAIL LOAD FAILED:', {
                  videoDocumentId: item.$id,
                  thumbnailField: item.thumbnailUrl || '',
                  thumbnailFileId: fileIdFromUrl(item.thumbnailUrl) || '',
                  videoFileId: item.videoFileId || fileIdFromUrl(item.videoUrl) || '',
                  generatedThumbnailUrl: thumbnailUrl,
                  error: event.nativeEvent?.error || 'Image network failure',
                });
              }
              setImageFailed(true);
            }}
          />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="play" size={24} color="#AAB2BD" />
          </View>
        )}
        {showViews ? (
          <View style={styles.overlay}>
            <View style={styles.meta}>
              <Ionicons name="play" size={12} color="#fff" />
              <Text style={styles.metaText}>{formatCompactCount(item.views)}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function VideoGrid({
  videos,
  onPress,
  onLongPress,
  header,
  refreshing,
  onRefresh,
  emptyText,
}) {
  return (
    <FlatList
      data={videos}
      keyExtractor={(item) => `${item.mediaType || 'video'}-${item.$id}`}
      numColumns={3}
      ListHeaderComponent={header}
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={COLORS.cyan} /> : undefined}
      renderItem={({ item }) => (
        <VideoGridTile
          item={item}
          onPress={onPress}
          onLongPress={onLongPress}
        />
      )}
      ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  cellContent: { width: '100%', height: '100%', aspectRatio: 1, backgroundColor: '#1F1F1F', borderRadius: 4, overflow: 'hidden' },
  thumbnail: { width: '100%', height: '100%', borderRadius: 4 },
  placeholder: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#1F1F1F', borderRadius: 4 },
  overlay: { position: 'absolute', bottom: 6, left: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.62)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10 },
  metaText: { color: '#fff', fontSize: 11, marginLeft: 4, fontWeight: '700' },
  empty: { color: COLORS.muted, textAlign: 'center', marginTop: 30, width: '100%' },
});