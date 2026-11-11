import React from 'react';
import {
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../config/constants';

const STICKERS = [
  { id: 'wave', label: 'Wave', url: 'https://placehold.co/240x240/00E5FF/071014.png?text=Hi!' },
  { id: 'love', label: 'Love', url: 'https://placehold.co/240x240/FF6B8A/FFFFFF.png?text=Love' },
  { id: 'laugh', label: 'Laugh', url: 'https://placehold.co/240x240/FFD166/071014.png?text=LOL' },
  { id: 'star', label: 'Star', url: 'https://placehold.co/240x240/8E7CFF/FFFFFF.png?text=Star' },
  { id: 'fire', label: 'Fire', url: 'https://placehold.co/240x240/FF7A45/FFFFFF.png?text=Fire' },
  { id: 'cool', label: 'Cool', url: 'https://placehold.co/240x240/54D6A5/071014.png?text=Cool' },
  { id: 'thanks', label: 'Thanks', url: 'https://placehold.co/240x240/4C9AFF/FFFFFF.png?text=Thanks' },
  { id: 'yay', label: 'Yay', url: 'https://placehold.co/240x240/F7A8FF/071014.png?text=Yay!' },
  { id: 'great', label: 'Great', url: 'https://placehold.co/240x240/FFCE56/071014.png?text=Great' },
  { id: 'bye', label: 'Bye', url: 'https://placehold.co/240x240/83D8FF/071014.png?text=Bye!' },
];

export default function StickerPicker({ visible, onClose, onSelect }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Stickers</Text>
            <TouchableOpacity
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close sticker picker"
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={STICKERS}
            numColumns={2}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.stickerButton}
                onPress={() => onSelect(item.url)}
                accessibilityRole="button"
                accessibilityLabel={`Send ${item.label} sticker`}
              >
                <Image source={{ uri: item.url }} style={styles.sticker} />
                <Text style={styles.label}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    maxHeight: '72%',
    paddingBottom: 20,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: '#11141A',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    color: '#F3F5F7',
    fontSize: 17,
    fontWeight: '800',
  },
  grid: {
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  stickerButton: {
    flex: 1,
    alignItems: 'center',
    margin: 6,
    padding: 8,
    borderRadius: 14,
    backgroundColor: COLORS.card,
  },
  sticker: {
    width: 112,
    height: 112,
    borderRadius: 12,
    backgroundColor: '#232833',
  },
  label: {
    marginTop: 6,
    color: '#DCE1E6',
    fontSize: 12,
  },
});
