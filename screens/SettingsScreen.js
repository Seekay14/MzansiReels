import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Switch, ScrollView, Modal, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { databases, account, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  
  const [isPrivate, setIsPrivate] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [userDoc, setUserDoc] = useState(null);

  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await account.get();
        const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [Query.equal('userId', user.$id)]);
        if (res.documents[0]) {
          setUserDoc(res.documents[0]);
          setIsPrivate(res.documents[0].isPrivate || false);
          setPushEnabled(res.documents[0].pushNotifications !== false); 
        }
      } catch (error) {}
    };
    fetchUser();
  }, []);

  const togglePrivate = async (value) => {
    setIsPrivate(value);
    if (userDoc) {
      try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, userDoc.$id, { isPrivate: value });
      } catch (error) {}
    }
  };

  const togglePush = async (value) => {
    setPushEnabled(value);
    if (userDoc) {
      try {
        await databases.updateDocument(DATABASE_ID, COLLECTIONS.users, userDoc.$id, { pushNotifications: value });
      } catch (error) {}
    }
  };

  const handleClearCache = () => {
    Alert.alert('Clear Cache', 'This will clear local data. You will remain logged in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => {
        setClearingCache(true);
        try {
          if (Platform.OS === 'web') {
            localStorage.removeItem('expo-cache'); 
          } else {
            await AsyncStorage.clear();
          }
          setTimeout(() => {
            setClearingCache(false);
            Alert.alert('✅ Success', 'Cache cleared successfully!');
          }, 1000);
        } catch (error) {
          setClearingCache(false);
          Alert.alert('Error', 'Could not clear cache.');
        }
      }}
    ]);
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword) return Alert.alert('Error', 'Please fill in both fields.');
    setLoading(true);
    try {
      await account.updatePassword(newPassword, oldPassword);
      Alert.alert('Success', 'Password updated successfully!');
      setIsPasswordModalVisible(false);
      setOldPassword('');
      setNewPassword('');
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    navigation.navigate('LogoutScreen');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings & Privacy</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('MyProfile')}>
          <View style={styles.iconBox}><Ionicons name="person-outline" size={20} color={COLORS.cyan} /></View>
          <Text style={styles.rowText}>Edit Profile</Text>
          <Ionicons name="chevron-forward" size={20} color="#555" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={() => setIsPasswordModalVisible(true)}>
          <View style={styles.iconBox}><Ionicons name="lock-closed-outline" size={20} color={COLORS.cyan} /></View>
          <Text style={styles.rowText}>Change Password</Text>
          <Ionicons name="chevron-forward" size={20} color="#555" />
        </TouchableOpacity>

        <View style={styles.row}>
          <View style={styles.iconBox}><Ionicons name="lock-open-outline" size={20} color={COLORS.cyan} /></View>
          <Text style={styles.rowText}>Private Account</Text>
          <Switch value={isPrivate} onValueChange={togglePrivate} trackColor={{ false: '#333', true: COLORS.cyan }} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>
        
        <View style={styles.row}>
          <View style={styles.iconBox}><Ionicons name="notifications-outline" size={20} color={COLORS.cyan} /></View>
          <Text style={styles.rowText}>Push Notifications</Text>
          <Switch value={pushEnabled} onValueChange={togglePush} trackColor={{ false: '#333', true: COLORS.cyan }} />
        </View>

        <TouchableOpacity style={styles.row} onPress={handleClearCache} disabled={clearingCache}>
          <View style={styles.iconBox}><Ionicons name="trash-outline" size={20} color={COLORS.cyan} /></View>
          <Text style={styles.rowText}>Clear Cache</Text>
          {clearingCache ? <ActivityIndicator size="small" color={COLORS.cyan} /> : <Ionicons name="chevron-forward" size={20} color="#555" />}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        
        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('HelpCenter')}>
          <View style={styles.iconBox}><Ionicons name="help-circle-outline" size={20} color={COLORS.cyan} /></View>
          <Text style={styles.rowText}>Help Center (FAQ)</Text>
          <Ionicons name="chevron-forward" size={20} color="#555" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('About')}>
          <View style={styles.iconBox}><Ionicons name="information-circle-outline" size={20} color={COLORS.cyan} /></View>
          <Text style={styles.rowText}>About MzansiReels</Text>
          <Ionicons name="chevron-forward" size={20} color="#555" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={22} color={COLORS.pink} />
        <Text style={styles.logoutText}>Log Out</Text>
      </TouchableOpacity>

      <Text style={styles.versionText}>MzansiReels v1.0.0</Text>

      <Modal visible={isPasswordModalVisible} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <TextInput style={styles.input} placeholder="Current Password" secureTextEntry value={oldPassword} onChangeText={setOldPassword} placeholderTextColor="#555" />
            <TextInput style={styles.input} placeholder="New Password" secureTextEntry value={newPassword} onChangeText={setNewPassword} placeholderTextColor="#555" />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 }}>
              <TouchableOpacity onPress={() => setIsPasswordModalVisible(false)} style={styles.cancelBtn}>
                <Text style={{ color: '#fff' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleChangePassword} style={styles.saveBtn} disabled={loading}>
                {loading ? <ActivityIndicator color="#000" /> : <Text style={{ color: '#000', fontWeight: 'bold' }}>Update</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20 },
  backBtn: { padding: 5 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  section: { marginTop: 10, paddingHorizontal: 20 },
  sectionTitle: { color: COLORS.muted, fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 10, marginLeft: 10 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, padding: 15, borderRadius: 12, marginBottom: 8 },
  iconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0, 229, 255, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  rowText: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '500' },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255, 0, 85, 0.1)', marginHorizontal: 20, marginTop: 30, padding: 16, borderRadius: 12 },
  logoutText: { color: COLORS.pink, fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
  versionText: { color: '#444', textAlign: 'center', marginTop: 20, marginBottom: 40, fontSize: 12 },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.8)' },
  modalContent: { width: '85%', backgroundColor: COLORS.card, padding: 20, borderRadius: 15 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  input: { backgroundColor: COLORS.bg, color: '#fff', borderRadius: 10, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: '#333' },
  cancelBtn: { padding: 12, borderRadius: 8 },
  saveBtn: { backgroundColor: COLORS.cyan, padding: 12, borderRadius: 8, paddingHorizontal: 20 },
});