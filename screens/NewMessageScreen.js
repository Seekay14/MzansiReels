import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { databases, Query, account } from '../config/appwrite';
import { DATABASE_ID, COLLECTIONS, COLORS } from '../config/constants';
import Avatar from '../components/Avatar';

export default function NewMessageScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [searchText, setSearchText] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const user = await account.get();
        setCurrentUser(user);
        
        // Fetch all users except yourself
        const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
          Query.notEqual('userId', user.$id),
          Query.limit(100)
        ]);
        setUsers(res.documents);
      } catch (error) {
        console.log("Error fetching users:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(searchText.toLowerCase())
  );

  const startChat = (user) => {
    // Navigate to the Chat screen with the selected user
    navigation.replace('Chat', { userId: user.userId, userName: user.name });
  };

  return (
    <View style={styles.container}>
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Message</Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#888" style={{ marginRight: 8 }} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search for people..." 
            placeholderTextColor="#888"
            value={searchText}
            onChangeText={setSearchText}
            autoFocus
          />
        </View>
      </View>

      {/* User List */}
      {loading ? (
        <ActivityIndicator size="large" color={COLORS.cyan} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.$id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.userRow} onPress={() => startChat(item)}>
              <Avatar uri={item.avatarUrl} name={item.name} size={50} />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{item.name}</Text>
                <Text style={styles.userHandle}>@{item.username || 'user'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#555" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No users found.</Text>
          }
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

  userRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  userInfo: { flex: 1, marginLeft: 15 },
  userName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  userHandle: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
  emptyText: { color: COLORS.muted, textAlign: 'center', marginTop: 50 },
});