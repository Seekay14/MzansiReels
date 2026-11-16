import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { View, Text, StyleSheet, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { databases, Query } from './config/appwrite';

// 1. SAFELY import config
import { account } from './config/appwrite';
import {
  COLLECTIONS,
  COLORS,
  DATABASE_ID,
} from './config/constants';
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
import OTPScreen from './screens/OTPScreen';
import LandingScreen from './screens/LandingScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import EmailOTPScreen from './screens/EmailOTPScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
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
const USER_STORAGE_KEY = '@user';

async function getCachedUser() {
  const cachedUser = await AsyncStorage.getItem(USER_STORAGE_KEY);
  if (!cachedUser) return null;

  let user;
  try {
    user = JSON.parse(cachedUser);
  } catch (error) {
    console.error('Could not parse the cached user profile:', error);
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }

  if (!user || typeof user.$id !== 'string' || !user.$id) {
    console.error('The cached user profile is invalid and will be removed.');
    await AsyncStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }

  return user;
}

/**
 * Session type constants.
 * - 'registered': A verified Appwrite session issued to a registered email/password user.
 *                 This is the ONLY session type that is trusted as a real account.
 * - 'anonymous':   A session created by MzansiReels's anonymous/guest sign-in flow.
 * - 'guest':       Any other non-verified session that Appwrite classifies as guest
 *                  (e.g. legacy OAuth guest role, third-party identity without email).
 * - 'none':        No current session exists (Appwrite returned 401).
 */
const SESSION_TYPE_REGISTERED = 'registered';
const SESSION_TYPE_ANONYMOUS = 'anonymous';
const SESSION_TYPE_GUEST = 'guest';
const SESSION_TYPE_NONE = 'none';

/**
 * Detects the type of the currently active Appwrite session.
 *
 * This function never treats an anonymous/guest session as a registered
 * account. It only returns the session type so callers can decide what to do
 * with the user.
 *
 * @returns {'registered' | 'anonymous' | 'guest' | 'none'}
 */
export async function detectSessionType() {
  let session;
  try {
    session = await account.getSession('current');
  } catch (error) {
    // Appwrite returns 401 when there is no current session.
    if (error?.code === 401 || error?.type === 'auth') {
      return SESSION_TYPE_NONE;
    }
    // Re-throw any other error so we do not silently fall back to an
    // unauthenticated state.
    throw error;
  }

  // No session object returned.
  if (!session) return SESSION_TYPE_NONE;

  // Verify the session is actually a registered user by fetching the account.
  // Guest/anonymous sessions lack the 'account' scope, so account.get()
  // fails with 401 for them. We must never treat a guest session as a
  // registered account, even if its provider is null.
  try {
    await account.get();
    // account.get() succeeded: this is a verified registered-user session.
    if (session.provider?.toLowerCase() === 'anonymous') {
      return SESSION_TYPE_ANONYMOUS;
    }
    return SESSION_TYPE_REGISTERED;
  } catch (error) {
    // account.get() failed: this is not a registered account (guest/anonymous
    // sessions lack the 'account' scope). Do not treat as registered.
    if (error?.code === 401 || error?.type === 'auth') {
      if (session.provider?.toLowerCase() === 'anonymous') {
        return SESSION_TYPE_ANONYMOUS;
      }
      return SESSION_TYPE_GUEST;
    }
    throw error;
  }
}

/**
 * Loads the currently active Appwrite session, or null if no session exists.
 *
 * @returns {Promise<{userId: string, provider: ?string} | null>}
 */
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    const requestedPath = window.sessionStorage.getItem('mzansireels:spa-path');
    if (requestedPath) {
      window.sessionStorage.removeItem('mzansireels:spa-path');
      const requestedUrl = new URL(requestedPath, window.location.origin);
      if (requestedUrl.origin === window.location.origin) {
        const restoredPath = `${requestedUrl.pathname}${requestedUrl.search}${requestedUrl.hash}`;
        window.history.replaceState(null, '', restoredPath);
      }
    }
  } catch (error) {
    console.error('Could not restore the requested route:', error);
  }
}

const linking = {
  prefixes: [
    Linking.createURL('/'),
    'mzansireels://',
    'http://localhost:8081',
    'https://seekay14.github.io/MzansiReels',
    ...(Platform.OS === 'web' && typeof window !== 'undefined' ? [window.location.origin] : []),
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
    const refreshTimer = setInterval(refreshUnreadMessages, 30000);

    return () => {
      active = false;
      clearInterval(refreshTimer);
    };
  }, [user?.$id]);

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
        tabBarInactiveTintColor: safeColors.muted,
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
                <Ionicons name="add" size={28 * scale} color={safeColors.text} />
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
      <Tab.Screen
        name="Profile"
        component={ProfileStack}
        options={{ tabBarAccessibilityLabel: 'Your profile' }}
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
      <NavigationContainer theme={getNavTheme(colors)} linking={linking} style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="App">
            {(navigationProps) => (
              isAuthenticated
                ? <MyTabs />
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
          <Stack.Screen name="OTPScreen" component={OTPScreen} />
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
  const [authState, setAuthState] = useState('checking');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [fatalError, setFatalError] = useState(null);
  const authUpdateId = useRef(0);

  const setUser = useCallback(async (nextUser, options = {}) => {
    const updateId = ++authUpdateId.current;

    // If there is no user, clear the auth state and remove the cached profile.
    if (!nextUser) {
      setAuthUser(null);
      setAuthState('unauthenticated');
      try {
        await AsyncStorage.removeItem(USER_STORAGE_KEY);
      } catch (error) {
        console.error('Could not clear the cached user profile:', error);
      }
      return;
    }

    // Resolve the user's profile document from the database.
    let profile;
    try {
      profile = options.profile || await ensureUserDoc(nextUser);
    } catch (error) {
      console.error('Could not load the signed-in user profile:', error);
      setAuthUser(null);
      setAuthState('unauthenticated');
      return;
    }

    // Ensure the user is a registered account before persisting.
    if (!nextUser?.$id || typeof nextUser.$id !== 'string' || !nextUser.$id) {
      console.error('Invalid user object: no $id.');
      setAuthUser(null);
      setAuthState('unauthenticated');
      return;
    }

    // Build the authenticated user object.
    const authenticatedUser = {
      ...nextUser,
      profileDocumentId: profile?.$id,
      username: profile?.username,
      avatarUrl: profile?.avatarUrl,
      province: profile?.province,
      bio: profile?.bio,
      interests: profile?.interests,
      profileSetupComplete: profile?.profileSetupComplete,
      onboardingComplete: profile?.onboardingComplete,
      skipOnboarding: options.skipOnboarding === true,
    };

    try {
      await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(authenticatedUser));
    } catch (storageError) {
      console.error('Could not persist the signed-in user profile:', storageError);
    }

    if (updateId !== authUpdateId.current) return;
    setAuthUser(authenticatedUser);
    setAuthState('authenticated');
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
    let sessionCheckActive = true;

    const checkSession = async () => {
      try {
        // 1. Check AsyncStorage FIRST. If a saved user exists, restore it
        // immediately and skip ALL Appwrite verification (account.get(),
        // detectSessionType, etc.) so a blocked cookie never kicks the user
        // back to the login screen.
        const cachedUser = await getCachedUser();
        if (cachedUser) {
          if (!mounted || !sessionCheckActive) return;
          setAuthUser(cachedUser);
          setAuthState('authenticated');
          setIsCheckingAuth(false);
          return;
        }

        // 2. No cached user: fall back to verifying the Appwrite session.
        const sessionType = await detectSessionType();
        if (!mounted || !sessionCheckActive) return;

        switch (sessionType) {
          case SESSION_TYPE_REGISTERED: {
            try {
              const currentUser = await account.get();
              if (!mounted || !sessionCheckActive) return;
              await setUser(currentUser);
            } catch (error) {
              if (!mounted || !sessionCheckActive) return;
              console.error('Could not verify registered-user session:', error);
              await setUser(null);
            }
            break;
          }

          case SESSION_TYPE_ANONYMOUS: {
            if (!mounted || !sessionCheckActive) return;
            setAuthUser(null);
            setAuthState('anonymous');
            break;
          }

          case SESSION_TYPE_GUEST: {
            if (!mounted || !sessionCheckActive) return;
            setAuthUser(null);
            setAuthState('guest');
            break;
          }

          case SESSION_TYPE_NONE: {
            if (!mounted || !sessionCheckActive) return;
            await setUser(null);
            setIsCheckingAuth(false);
            break;
          }
        }
      } catch (error) {
        if (!mounted || !sessionCheckActive) return;
        console.error('[Auth] checkSession failed:', error);
        await setUser(null);
      } finally {
        if (mounted && sessionCheckActive) {
          sessionCheckActive = false;
          setIsCheckingAuth(false);
        }
      }
    };

    checkSession();

    return () => {
      mounted = false;
      sessionCheckActive = false;
    };
  }, [setUser]);

  const logout = useCallback(async (expectedUserId) => {
    // Guard against stale render closures: only act if the expected user
    // matches the user that is currently logged in.
    if (expectedUserId && expectedUserId !== user?.$id) return;

    // Reset the local auth state immediately so the UI can react before the
    // async Appwrite call finishes.
    setAuthUser(null);
    setAuthState('unauthenticated');
    try {
      await AsyncStorage.removeItem(USER_STORAGE_KEY);
    } catch (error) {
      console.error('Could not clear the cached user profile:', error);
    }

    // Delete the current session if it exists. If no session exists, the
    // Appwrite SDK will throw a 401 which we silently ignore because the
    // local state is already cleared.
    try {
      await account.deleteSession('current');
    } catch (error) {
      // A 401 / 'no session' error is expected when the user was already
      // logged out or never logged in. Do nothing.
      if (error?.code !== 401 && error?.type !== 'auth') {
        console.error('Could not delete the current Appwrite session during logout:', {
          code: error?.code,
          type: error?.type,
          message: error?.message || String(error),
        });
      }
    }
  }, [setUser, user?.$id]);

  const handleAuthenticationError = useCallback(async (expectedUserId) => {
    if (expectedUserId && expectedUserId !== user?.$id) return;
    await logout(expectedUserId);
  }, [logout, user?.$id]);

  const auth = useMemo(
    () => ({ user, authState, setUser, logout, handleAuthenticationError }),
    [user, authState, setUser, logout, handleAuthenticationError],
  );

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {isCheckingAuth ? <LandingScreen /> : (
          <AuthContext.Provider value={auth}>
            <SearchMenuProvider>
              <AppNavigation />
            </SearchMenuProvider>
          </AuthContext.Provider>
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  uploadButton: {
    top: -18,
    width: 56,
    height: 56,
    backgroundColor: COLORS?.pink || '#FF0055',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: COLORS?.bg || '#0A0A0F',
    shadowColor: COLORS?.pink || '#FF0055',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 10,
  },
});