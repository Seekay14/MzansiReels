import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { databases } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';

export default function EditProfileScreen({ route, navigation }) {
  const { userDoc } = route.params;
  const insets = useSafeAreaInsets();
  
  const [name, setName] = useState(userDoc?.name || '');
  const [username, setUsername] = useState(userDoc?.username || '');
  const [bio, setBio] = useState(userDoc?.bio || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, userDoc.$id, {
        name: name.trim(),
        username: username.trim().toLowerCase().replace(/\s+/g, ''), 
        bio: bio.trim(),
      });

      Alert.alert("Success", "Profile updated!");
      navigation.goBack(); 
    } catch (error) {
      console.log("EDIT PROFILE ERROR:", error);
      Alert.alert("Error", error.message || "Could not update profile.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: COLORS.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 10 }]}>
        
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Ionicons name="close" size={28} color="#fff" /></TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <TouchableOpacity onPress={handleSave} disabled={loading}>
            {loading ? <ActivityIndicator color={COLORS.cyan} /> : <Text style={styles.saveText}>Save</Text>}
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your display name" placeholderTextColor="#555" />

          <Text style={styles.label}>Username (@handle)</Text>
          <View style={styles.usernameWrapper}>
            <Text style={styles.atSymbol}>@</Text>
            <TextInput 
              style={[styles.input, styles.usernameInput]} 
              value={username} 
              onChangeText={setUsername} 
              placeholder="username" 
              placeholderTextColor="#555"
              autoCapitalize="none"
            />
          </View>

          <Text style={styles.label}>Bio</Text>
          <TextInput 
            style={[styles.input, styles.bioInput]} 
            value={bio} 
            onChangeText={setBio} 
            placeholder="Tell people about yourself..." 
            placeholderTextColor="#555" 
            multiline 
            maxLength={150}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  saveText: { color: COLORS.cyan, fontSize: 16, fontWeight: 'bold' },
  form: { padding: 20 },
  label: { color: COLORS.muted, fontSize: 14, marginBottom: 8, marginTop: 15, fontWeight: '600' },
  input: { backgroundColor: COLORS.card, color: '#fff', borderRadius: 10, padding: 15, fontSize: 16, borderWidth: 1, borderColor: '#2A2A35' },
  usernameWrapper: { flexDirection: 'row', alignItems: 'center' },
  atSymbol: { color: COLORS.muted, fontSize: 18, fontWeight: 'bold', position: 'absolute', left: 15, zIndex: 1 },
  usernameInput: { flex: 1, paddingLeft: 35 },
  bioInput: { height: 100, textAlignVertical: 'top' }
});