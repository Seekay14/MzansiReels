import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  DarkTheme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { client, databases, Query } from './config/appwrite';

// 1. SAFELY import config
import { account } from './config/appwrite';
import { COLLECTIONS, COLORS, DATABASE_ID } from './config/constants';
import { AuthContext, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { SearchMenuProvider } from './context/SearchMenuContext';
import { ensureUserDoc } from './config/helpers';
import { useResponsiveLayout } from './config/responsive';
import LaunchModal from './components/LaunchModal';

// ... keep all your screen imports exactly as they are ...
import HomeScreen from './screens/HomeScreen';
import HomeFeed from './screens/HomeFeed';
import SearchScreen from './screens/SearchScreen';
import MessagesScreen from './screens/MessagesScreen';
import ChatScreen from './screens/ChatScreen';
import NewMessageScreen from './screens/NewMessageScreen';
import UploadScreen from './screens/UploadScreen';
import StoryUploadScreen from './screens/StoryUploadScreen';
import ProfileScreen from './screens/ProfileScreen';
import ProfileFollowListScreen from './screens/ProfileFollowListScreen';
import AuthScreen from './screens/AuthScreen';
import LandingScreen from './screens/LandingScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import EmailOTPScreen from './screens/EmailOTPScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import InterestsScreen from './screens/InterestsScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import WatchScreen from './screens/WatchScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import BlockedUsersScreen from './screens/BlockedUsersScreen';
import HelpCenterScreen from './screens/HelpCenterScreen';
import AboutScreen from './screens/AboutScreen';
import LegalScreen from './screens/LegalScreen';
import EditVideoScreen from './screens/EditVideoScreen';
import LogoutScreen from './screens/LogoutScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const linking = {
  prefixes: [
    Linking.createURL('/'),
    'mzansireels://',
    'http://localhost:8081',
    'https://seekay14.github.io/MzansiReels',
  ],
  config: {
    screens: {
      App: {
        path: '',
        screens: {
          Home: {
            path: 'Home',
            screens: {
              Feed: '',
              UserProfile: {
                path: 'profile/:userId',
                parse: { userId: String },
              },
              Search: { path: 'Search', exact: true },
            },
          },
          Reels: {
            path: 'Reels',
            screens: { Feed: '', Search: 'Search' },
          },
          Upload: 'Create',
          Profile: {
            path: 'Profile',
            screens: {
              MyProfile: '',
              UserProfile: {
                path: 'user/:userId',
                parse: { userId: String },
              },
              Settings: { path: 'Settings', exact: true },
            },
          },
          Messages: {
            path: 'Inbox',
            screens: {
              Inbox: '',
              Chat: 'Chat',
              NewMessage: 'NewMessage',
            },
          },
        },
      },
      Login: 'Login',
      Register: 'Register',
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
const getNavTheme = (colors) => {
  return {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      primary: colors.accent,
      background: colors.bg,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      notification: colors.accent,
    }
  };
};

function RedirectToApp({ navigation }) {
  useEffect(() => {
    navigation.replace('App');
  }, [navigation]);

  return null;
}

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Feed" component={HomeFeed} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="UserProfile" component={ProfileScreen} />
      <Stack.Screen name="FollowersList" component={ProfileFollowListScreen} />
      <Stack.Screen name="FollowingList" component={ProfileFollowListScreen} />
      <Stack.Screen name="Watch" component={WatchScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="NewMessage" component={NewMessageScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="StoryUpload" component={StoryUploadScreen} />
    </Stack.Navigator>
  );
}

function ReelsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Feed" component={HomeScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="UserProfile" component={ProfileScreen} />
      <Stack.Screen name="FollowersList" component={ProfileFollowListScreen} />
      <Stack.Screen name="FollowingList" component={ProfileFollowListScreen} />
      <Stack.Screen name="Watch" component={WatchScreen} />
      <Stack.Screen name="Search" component={SearchScreen} />
    </Stack.Navigator>
  );
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyProfile" component={ProfileScreen} />
      <Stack.Screen name="UserProfile" component={ProfileScreen} />
      <Stack.Screen name="FollowersList" component={ProfileFollowListScreen} />
      <Stack.Screen name="FollowingList" component={ProfileFollowListScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="EditVideo" component={EditVideoScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
      <Stack.Screen name="HelpCenter" component={HelpCenterScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="LogoutScreen" component={LogoutScreen} />
      <Stack.Screen name="StoryUpload" component={StoryUploadScreen} />
    </Stack.Navigator>
  );
}

function MessagesStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Inbox" component={MessagesScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="NewMessage" component={NewMessageScreen} />
      <Stack.Screen name="UserProfile" component={ProfileScreen} />
      <Stack.Screen name="FollowersList" component={ProfileFollowListScreen} />
      <Stack.Screen name="FollowingList" component={ProfileFollowListScreen} />
    </Stack.Navigator>
  );
}

function MyTabs() {
  const insets = useSafeAreaInsets();
  const { scale, isCompact } = useResponsiveLayout();
  const { user } = useAuth();
  const isAuthenticated = Boolean(user?.$id);
  const { colors: safeColors } = useTheme();
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

  if (!isAuthenticated) return null;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarLabel: route.name === 'Upload' ? 'Create'
            : route.name === 'Messages' ? 'Inbox'
              : route.name,
        tabBarLabelStyle: { fontSize: Math.max(9, Math.round(10 * scale)), fontWeight: '600', marginTop: 2 },
        tabBarStyle: {
          backgroundColor: safeColors.bg,
          borderTopWidth: 1,
          borderTopColor: safeColors.border,
          height: (isCompact ? 60 : 64) + insets.bottom,
          paddingBottom: Math.max(insets.bottom, isCompact ? 4 : 6),
          paddingTop: isCompact ? 4 : 6,
        },
        tabBarActiveTintColor: safeColors.cyan,
        tabBarInactiveTintColor: '#666',
        tabBarIcon: ({ focused, color }) => {
          if (route.name === 'Upload') {
            return (
              <View
                style={[
                  styles.uploadButton,
                  {
                    width: 56 * scale,
                    height: 56 * scale,
                    borderRadius: 28 * scale,
                  },
                ]}
              >
                <Ionicons name="add" size={28 * scale} color="#fff" />
              </View>
            );
          }
          const icons = {
            Home: ['home', 'home-outline'],
            Reels: ['play-circle', 'play-circle-outline'],
            Messages: ['chatbubbles', 'chatbubbles-outline'],
            Profile: ['person', 'person-outline'],
          };
          const [active, inactive] = icons[route.name] || ['home', 'home-outline'];
          return <Ionicons name={focused ? active : inactive} size={Math.max(22, 26 * scale)} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeStack} options={{ tabBarAccessibilityLabel: 'Home feed' }} />
      <Tab.Screen name="Reels" component={ReelsStack} options={{ tabBarAccessibilityLabel: 'Reels video feed' }} />
      <Tab.Screen
        name="Upload"
        component={UploadScreen}
        options={{ tabBarAccessibilityLabel: 'Create a video' }}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            if (!isAuthenticated) {
              event.preventDefault();
              navigation.navigate('Login');
            }
          },
        })}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesStack}
        options={{
          tabBarAccessibilityLabel: 'Inbox',
          tabBarBadge: unreadMessages > 0 ? (unreadMessages > 99 ? '99+' : unreadMessages) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#FF4057', color: '#fff', fontSize: 10 },
        }}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            if (!isAuthenticated) {
              event.preventDefault();
              navigation.navigate('Login');
            }
          },
        })}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ tabBarAccessibilityLabel: 'Your profile' }}
        listeners={({ navigation }) => ({
          tabPress: (event) => {
            if (!isAuthenticated) {
              event.preventDefault();
              navigation.navigate('Login');
            }
          },
        })}
      />
    </Tab.Navigator>
  );
}

function AppNavigation() {
  const { user } = useAuth();
  const isAuthenticated = Boolean(user?.$id);
  const { colors } = useTheme();

  return (
    <>
      <StatusBar style={colors.statusBar} />
      <NavigationContainer theme={getNavTheme(colors)} linking={linking}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="App">
            {(navigationProps) => (
              isAuthenticated
                ? user.profileSetupComplete === false
                  ? <ProfileSetupScreen />
                  : !user.skipOnboarding && user.onboardingComplete === false
                    ? <InterestsScreen />
                    : <MyTabs />
                : <AuthScreen {...navigationProps} />
            )}
          </Stack.Screen>
          <Stack.Screen name="Login">
            {(navigationProps) => (
              isAuthenticated
                ? <RedirectToApp navigation={navigationProps.navigation} />
                : <AuthScreen {...navigationProps} />
            )}
          </Stack.Screen>
          <Stack.Screen name="Register">
            {(navigationProps) => (
              isAuthenticated
                ? <RedirectToApp navigation={navigationProps.navigation} />
                : <AuthScreen {...navigationProps} initialTab="signup" />
            )}
          </Stack.Screen>
          <Stack.Screen name="Auth">
            {(navigationProps) => (
              isAuthenticated
                ? <RedirectToApp navigation={navigationProps.navigation} />
                : <AuthScreen {...navigationProps} />
            )}
          </Stack.Screen>
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
          <Stack.Screen name="EmailOTP" component={EmailOTPScreen} />
          <Stack.Screen name="Legal" component={LegalScreen} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      {isAuthenticated ? <LaunchModal /> : null}
    </>
  );
}

export default function App() {
  const [user, setAuthUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [fatalError, setFatalError] = useState(null);

  const setUser = useCallback(async (nextUser, options = {}) => {
    if (!nextUser) {
      setAuthUser(null);
      return;
    }

    try {
      const profile = await ensureUserDoc(nextUser);
      setAuthUser({
        ...nextUser,
        profileDocumentId: profile.$id,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        province: profile.province,
        bio: profile.bio,
        interests: profile.interests,
        profileSetupComplete: profile.profileSetupComplete,
        onboardingComplete: profile.onboardingComplete,
        skipOnboarding: options.skipOnboarding === true,
      });
    } catch (error) {
      console.error('Could not load the signed-in user profile:', error);
      setAuthUser(null);
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
        if (__DEV__) {
          console.error('Could not verify the Appwrite session:', {
            code: error?.code,
            type: error?.type,
            message: error?.message || String(error),
          });
        }
        if (mounted && Number(error?.code) === 401) {
          setAuthUser(null);
        } else if (mounted && __DEV__) {
          console.error('Session verification failed; routing to authentication:', error);
        }
      }
    };

    const sessionTimeout = setTimeout(() => {
      if (mounted) {
        if (__DEV__) console.warn('Appwrite session verification timed out.');
        setAuthUser(null);
        setIsCheckingAuth(false);
      }
    }, 5000);

    checkSession().finally(() => {
      clearTimeout(sessionTimeout);
      if (mounted) setIsCheckingAuth(false);
    });

    return () => {
      mounted = false;
      clearTimeout(sessionTimeout);
    };
  }, [setUser]);

  const logout = useCallback(async () => {
    try {
      await account.deleteSession('current');
    } catch (error) {
      console.log('Logout error:', error);
    }
    setAuthUser(null);
  }, []);

  const auth = useMemo(() => ({ user, setUser, logout }), [user, setUser, logout]);

  if (isCheckingAuth) return <LandingScreen />;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthContext.Provider value={auth}>
          <SearchMenuProvider>
            <AppNavigation />
          </SearchMenuProvider>
        </AuthContext.Provider>
      </ThemeProvider>
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