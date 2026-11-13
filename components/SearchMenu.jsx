import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../config/constants';
import { useTheme } from '../context/ThemeContext';

const TABS = [
  { id: 'Search', icon: 'search-outline', description: 'Search videos, people, sounds, and hashtags.' },
  { id: 'Creators', icon: 'people-outline', description: 'Browse featured creators and follow accounts.' },
  { id: 'Explore', icon: 'compass-outline', description: 'Discover current stories, videos, and posts.' },
];

export default function SearchMenu({ visible, onClose, navigation, searchTab, setSearchTab }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const selectedTab = TABS.find((tab) => tab.id === searchTab) || TABS[0];

  const openSelectedTab = () => {
    onClose();
    navigation?.navigate('Search', { initialTab: selectedTab.id });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Pressable
          style={styles.dismissArea}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss search menu"
        />
        <View style={[styles.menu, { backgroundColor: colors.bg }]}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.heading, { color: colors.text }]}>Discover</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close search menu"
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.tabs}>
            {TABS.map((tab) => {
              const isSelected = tab.id === selectedTab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.tab,
                    { borderColor: isSelected ? COLORS.cyan : colors.border, backgroundColor: colors.card },
                  ]}
                  onPress={() => setSearchTab(tab.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Ionicons name={tab.icon} size={22} color={isSelected ? COLORS.cyan : colors.muted} />
                  <Text style={[styles.tabLabel, { color: isSelected ? COLORS.cyan : colors.text }]}>
                    {tab.id}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.selectedContent}>
            <Ionicons name={selectedTab.icon} size={34} color={COLORS.cyan} />
            <Text style={[styles.selectedTitle, { color: colors.text }]}>{selectedTab.id}</Text>
            <Text style={[styles.description, { color: colors.muted }]}>{selectedTab.description}</Text>
            <TouchableOpacity style={styles.openButton} onPress={openSelectedTab} accessibilityRole="button">
              <Text style={styles.openButtonText}>Open {selectedTab.id}</Text>
              <Ionicons name="arrow-forward" size={18} color="#000" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)' },
  dismissArea: { ...StyleSheet.absoluteFillObject },
  menu: { flex: 1, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  heading: { fontSize: 20, fontWeight: '800', paddingVertical: 16 },
  closeButton: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  tabs: { flexDirection: 'row', marginTop: 22 },
  tab: { flex: 1, minHeight: 82, borderWidth: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginHorizontal: 4 },
  tabLabel: { fontSize: 13, fontWeight: '700', marginTop: 7 },
  selectedContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  selectedTitle: { fontSize: 23, fontWeight: '800', marginTop: 14 },
  description: { textAlign: 'center', fontSize: 14, lineHeight: 21, marginTop: 8 },
  openButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.cyan, borderRadius: 24, paddingHorizontal: 22, paddingVertical: 12, marginTop: 24 },
  openButtonText: { color: '#000', fontWeight: '800', marginRight: 8 },
});
