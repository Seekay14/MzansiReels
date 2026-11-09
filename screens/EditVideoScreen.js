import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';

export default function EditVideoScreen({ route, navigation }) {
  // Safety check: if params are missing, show a blank screen instead of crashing
  if (!route.params || !route.params.video) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#fff' }}>Video not found.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20, padding: 10, backgroundColor: COLORS.cyan, borderRadius: 10 }}>
          <Text>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { video } = route.params;
  const insets = useSafeAreaInsets();
  
  const [caption, setCaption] = useState(video.caption || '');
  const [soundName, setSoundName] = useState(video.soundName || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.videos, video.$id, {
        caption: caption.trim() || 'No caption',
        soundName: soundName.trim() || 'Original Audio',
      });
      Alert.alert("Success", "Video updated successfully!");
      navigation.goBack();
    } catch (error) {
      console.log("EDIT VIDEO ERROR:", error);
      Alert.alert("Error", "Could not update video.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
        
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="close" size={28} color="#fff" /></TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Video</Text>
          <TouchableOpacity onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color={COLORS.cyan} /> : <Text style={styles.saveText}>Save</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Caption</Text>
          <TextInput 
            style={[styles.input, styles.bioInput]} 
            value={caption} 
            onChangeText={setCaption} 
            placeholder="Write a caption..." 
            placeholderTextColor="#555" 
            multiline 
            maxLength={150}
          />
          <Text style={styles.counter}>{caption.length}/150</Text>

          <Text style={styles.label}>Sound Name</Text>
          <View style={styles.soundInputContainer}>
            <Ionicons name="musical-notes" size={20} color={COLORS.cyan} style={{ marginRight: 10 }} />
            <TextInput 
              style={styles.soundInput} 
              value={soundName} 
              onChangeText={setSoundName} 
              placeholder="e.g. Amapiano Beat" 
              placeholderTextColor="#555" 
            />
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  saveText: { color: COLORS.cyan, fontSize: 16, fontWeight: 'bold' },
  form: { padding: 20 },
  label: { color: COLORS.muted, fontSize: 14, marginBottom: 8, marginTop: 15, fontWeight: '600' },
  input: { backgroundColor: COLORS.card, color: '#fff', borderRadius: 10, padding: 15, fontSize: 16, borderWidth: 1, borderColor: '#2A2A35' },
  bioInput: { height: 100, textAlignVertical: 'top' },
  counter: { color: '#555', fontSize: 12, textAlign: 'right', marginTop: 4 },
  soundInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10, borderWidth: 1, borderColor: '#2A2A35' },
  soundInput: { flex: 1, color: '#fff', fontSize: 14 },
});