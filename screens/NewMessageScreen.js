import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, Query } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import Avatar from '../components/Avatar';
import { useAuth } from '../context/AuthContext';

export default function NewMessageScreen({ navigation }) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [searchText, setSearchText] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  useEffect(() => {
    let active = true;
    const queryText = searchText.trim().replace(/^@/, '');
    setUsers([]);
    setSearchError('');

    if (!user?.$id || queryText.length < 2) {
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    const fetchUsers = async () => {
      try {
        const results = await databases.listDocuments(
          DATABASE_ID,
          COLLECTIONS.users,
          [
            Query.or([
              Query.startsWith('name', queryText),
              Query.startsWith('username', queryText),
            ]),
            Query.limit(25),
          ],
        );
        if (active) {
          const uniqueUsers = new Map();
          results.documents.forEach((profile) => {
            if (profile.userId && profile.userId !== user.$id) {
              uniqueUsers.set(profile.userId, profile);
            }
          });
          setUsers([...uniqueUsers.values()]);
        }
      } catch (error) {
        console.error('Could not search users for new messages:', error);
        if (active) setSearchError(error.message || 'Could not search users. Please try again.');
      } finally {
        if (active) setLoading(false);
      }
    };
    const timer = queryText.length >= 2 ? setTimeout(fetchUsers, 300) : null;

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [searchText, user?.$id]);

  const startChat = async (targetUser) => {
    if (!targetUser?.userId) return;
    navigation.replace('Chat', {
      otherUserId: targetUser.userId,
      otherUserName: targetUser.name || targetUser.username || 'User',
      otherUserAvatar: targetUser.avatarUrl || null,
    });
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Message</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#888" style={{ marginRight: 8 }} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search for a user by name or @username..."
            placeholderTextColor="#888"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      </View>

      {searchText.trim().replace(/^@/, '').length < 2 ? (
        <View style={styles.placeholderContainer}>
          <Text style={styles.placeholder}>Search for a user to start chatting.</Text>
        </View>
      ) : loading ? (
        <View style={styles.placeholderContainer}>
          <ActivityIndicator size="large" color={COLORS.cyan} />
        </View>
      ) : searchError ? (
        <View style={styles.placeholderContainer}>
          <Text style={styles.emptyText}>{searchError}</Text>
        </View>
      ) : users.length === 0 ? (
        <View style={styles.placeholderContainer}>
          <Text style={styles.emptyText}>No users found matching '{searchText.trim()}'.</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.$id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.userRow} onPress={() => startChat(item)}>
              <Avatar uri={item.avatarUrl} userId={item.userId} name={item.name} size={50} />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.name}</Text>
                <Text style={styles.userHandle}>@{item.username || 'user'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#555" />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backBtn: { padding: 5 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  searchContainer: { padding: 15 },
  searchBar: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 10, alignItems: 'center', paddingHorizontal: 12, height: 45 },
  searchInput: { flex: 1, color: '#fff', fontSize: 16 },
  placeholderContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  placeholder: { color: '#8B95A7', fontSize: 14, textAlign: 'center' },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  userInfo: { flex: 1, marginLeft: 15 },
  userName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  userHandle: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  emptyText: { color: COLORS.muted, textAlign: 'center', marginTop: 50 },
});