import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, ActivityIndicator, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { client, databases, Query } from './config/appwrite';

// 1. SAFELY import config
import { account } from './config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from './config/constants';
import { AuthContext, useAuth } from './context/AuthContext';
import { ensureUserDoc } from './config/helpers';

// ... keep all your screen imports exactly as they are ...
import HomeScreen from './screens/HomeScreen';
import SearchScreen from './screens/SearchScreen';
import MessagesScreen from './screens/MessagesScreen';
import ChatScreen from './screens/ChatScreen';
import NewMessageScreen from './screens/NewMessageScreen';
import UploadScreen from './screens/UploadScreen';
import ProfileScreen from './screens/ProfileScreen';
import AuthScreen from './screens/AuthScreen';
import LandingScreen from './screens/LandingScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import InterestsScreen from './screens/InterestsScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import UserProfileScreen from './screens/UserProfileScreen';
import WatchScreen from './screens/WatchScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import HelpCenterScreen from './screens/HelpCenterScreen';
import AboutScreen from './screens/AboutScreen';
import LegalScreen from './screens/LegalScreen';
import EditVideoScreen from './screens/EditVideoScreen';
import LogoutScreen from './screens/LogoutScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const linking = {
  prefixes: [Linking.createURL('/'), 'mzansireels://'],
  config: {
    screens: {
      App: '',
      Auth: 'login',
      ForgotPassword: 'forgot-password',
      ResetPassword: {
        path: 'reset-password',
        parse: { userId: String, secret: String },
      },
    },
  },
};

// Move theme inside a function to prevent top-level crashes
const getNavTheme = () => {
  const safeColors = COLORS || { bg: '#000', cyan: '#00ffff', pink: '#ff00ff', border: '#333', muted: '#888' };
  return {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: safeColors.bg,
      card: safeColors.bg,
      border: safeColors.border
    }
  };
};

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Feed" component={HomeScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="Watch" component={WatchScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyProfile" component={ProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="EditVideo" component={EditVideoScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="LogoutScreen" component={LogoutScreen} />
    </Stack.Navigator>
  );
}

function MessagesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Inbox" component={MessagesScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="NewMessage" component={NewMessageScreen} />
    </Stack.Navigator>
  );
}

function MyTabs() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const safeColors = COLORS || { bg: '#000', cyan: '#00ffff', pink: '#ff00ff', border: '#333' };
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    if (!user?.$id) {
      setUnreadMessages(0);
      return undefined;
    }

    let active = true;
    const refreshUnreadMessages = async () => {
      try {
        const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
          Query.equal('receiverId', user.$id),
          Query.equal('isRead', false),
          Query.limit(1),
        ]);
        if (active) setUnreadMessages(result.total);
      } catch (error) {
        console.error('Could not refresh unread message badge:', error);
      }
    };

    refreshUnreadMessages();
    const unsubscribe = client.subscribe(
      `databases.${DATABASE_ID}.collections.${COLLECTIONS.messages}.documents`,
      () => refreshUnreadMessages(),
    );
    const refreshTimer = setInterval(refreshUnreadMessages, 30000);

    return () => {
      active = false;
      if (typeof unsubscribe === 'function') unsubscribe();
      clearInterval(refreshTimer);
    };
  }, [user?.$id]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabel: route.name === 'Search' ? 'Discover'
          : route.name === 'Upload' ? 'Create'
            : route.name === 'Messages' ? 'Inbox'
              : route.name,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', marginTop: 2 },
        tabBarStyle: {
          backgroundColor: safeColors.bg,
          borderTopWidth: 1,
          borderTopColor: safeColors.border,
          height: 64 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 6),
          paddingTop: 6,
        },
        tabBarActiveTintColor: safeColors.cyan,
        tabBarInactiveTintColor: '#666',
        tabBarIcon: ({ focused, color }) => {
          if (route.name === 'Upload') {
            return (
              <View style={styles.uploadButton}>
                <Ionicons name="add" size={28} color="#fff" />
              </View>
            );
          }
          const icons = {
            Home: ['home', 'home-outline'],
            Search: ['search', 'search-outline'],
            Messages: ['chatbubbles', 'chatbubbles-outline'],
            Profile: ['person', 'person-outline'],
          };
          const [active, inactive] = icons[route.name] || ['home', 'home-outline'];
          return <Ionicons name={focused ? active : inactive} size={26} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} options={{ tabBarAccessibilityLabel: 'Home feed' }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ tabBarAccessibilityLabel: 'Discover videos and creators' }} />
      <Tab.Screen name="Upload" component={UploadScreen} options={{ tabBarAccessibilityLabel: 'Create a video' }} />
      <Tab.Screen
        name="Messages"
        component={MessagesStack}
        options={{
          tabBarAccessibilityLabel: 'Inbox',
          tabBarBadge: unreadMessages > 0 ? (unreadMessages > 99 ? '99+' : unreadMessages) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#FF4057', color: '#fff', fontSize: 10 },
        }}
      />
      <Tab.Screen name="Profile" component={ProfileStack} options={{ tabBarAccessibilityLabel: 'Your profile' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [user, setAuthUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [fatalError, setFatalError] = useState(null);

  const setUser = useCallback(async (nextUser) => {
    if (!nextUser) {
      setAuthUser(null);
      setProfileError('');
      return;
    }

    if (nextUser.onboardingComplete === true) {
      setAuthUser(nextUser);
      setProfileError('');
      return;
    }

    setProfileLoading(true);
    setProfileError('');
    try {
      const profile = await ensureUserDoc(nextUser);
      setAuthUser({
        ...nextUser,
        profileDocumentId: profile.$id,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        interests: profile.interests,
        onboardingComplete: profile.onboardingComplete === true,
      });
    } catch (error) {
      console.error('Could not load the signed-in user profile:', error);
      setAuthUser(null);
      setProfileError(error.message || 'Could not load your profile. Please try again.');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  // Safety check for AuthContext
  if (!AuthContext) {
    return (
      <View style={{ flex: 1, backgroundColor: 'red', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'white', fontSize: 18, textAlign: 'center', padding: 20 }}>
          FATAL ERROR: AuthContext is undefined.{'\n'}
          Check your context/AuthContext.js file and make sure you wrote:{'\n'}
          export const AuthContext = ...
        </Text>
      </View>
    );
  }

  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      try {
        const session = await account.get();
        if (mounted) await setUser(session);
      } catch (error) {
        if (mounted) setAuthUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    // Add a 5 second timeout just in case Appwrite hangs
    const timeout = setTimeout(() => {
      if (mounted) {
        console.log("Session check timed out");
        setLoading(false);
      }
    }, 5000);

    checkSession().finally(() => clearTimeout(timeout));

    return () => { mounted = false; clearTimeout(timeout); };
  }, [setUser]);

  const logout = useCallback(async () => {
    try {
      await account.deleteSession('current');
    } catch (error) {
      console.log('Logout error:', error);
    }
    setAuthUser(null);
    setProfileError('');
  }, []);

  const auth = useMemo(() => ({ user, setUser, logout }), [user, logout]);

  if (loading || profileLoading) {
    const safeColors = COLORS || { bg: '#000', cyan: '#00ffff', muted: '#888' };
    return (
      <View style={{ flex: 1, backgroundColor: safeColors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={safeColors.cyan} />
        <Text style={{ color: safeColors.muted, marginTop: 15, fontSize: 16 }}>Loading MzansiReels...</Text>
      </View>
    );
  }

  if (profileError) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', padding: 28 }}>
        <Text style={{ color: '#fff', fontSize: 17, textAlign: 'center', marginBottom: 18 }}>{profileError}</Text>
        <TouchableOpacity
          style={{ backgroundColor: COLORS.cyan, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 13 }}
          onPress={async () => {
            setLoading(true);
            try {
              const session = await account.get();
              await setUser(session);
            } catch (error) {
              setProfileError(error.message || 'Could not load your profile. Please try again.');
            } finally {
              setLoading(false);
            }
          }}
        >
          <Text style={{ color: '#000', fontWeight: '700' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthContext.Provider value={auth}>
        <NavigationContainer theme={getNavTheme()} linking={linking}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="App">
              {(navigationProps) => (
                user
                  ? user.onboardingComplete === true
                    ? <MyTabs />
                    : <InterestsScreen />
                  : <LandingScreen {...navigationProps} />
              )}
            </Stack.Screen>
            <Stack.Screen name="Auth">
              {(navigationProps) => (
                user
                  ? user.onboardingComplete === true
                    ? <MyTabs />
                    : <InterestsScreen />
                  : <AuthScreen {...navigationProps} />
              )}
            </Stack.Screen>
            <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
            <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </AuthContext.Provider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  uploadButton: {
    top: -18,
    width: 56,
    height: 56,
    backgroundColor: COLORS?.pink || '#ff00ff',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: COLORS?.bg || '#000',
    shadowColor: COLORS?.pink || '#ff00ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 10,
  },
});