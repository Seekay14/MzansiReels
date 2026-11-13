import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext(null);
const THEME_STORAGE_KEY = '@mzansireels/appearance';

const PALETTES = {
  dark: {
    mode: 'dark',
    isDark: true,
    bg: '#0A0A0F',
    card: '#15151E',
    border: '#1F1F28',
    text: '#F6F8FA',
    muted: '#9299A5',
    input: '#101117',
    raised: '#20242D',
    accent: '#00E5FF',
    cyan: '#00E5FF',
    pink: '#FF0055',
    statusBar: 'light',
  },
  light: {
    mode: 'light',
    isDark: false,
    bg: '#F4F6F8',
    card: '#FFFFFF',
    border: '#E1E5EA',
    text: '#171A20',
    muted: '#68717E',
    input: '#F0F2F5',
    raised: '#E9EDF1',
    accent: '#008FA3',
    cyan: '#008FA3',
    pink: '#D92D54',
    statusBar: 'dark',
  },
};

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState('dark');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((savedMode) => {
        if (active && (savedMode === 'dark' || savedMode === 'light')) setMode(savedMode);
      })
      .catch((error) => {
        console.error('Could not load appearance preference:', error);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  const updateMode = useCallback(async (nextMode) => {
    if (nextMode !== 'dark' && nextMode !== 'light') {
      throw new Error('Appearance must be dark or light.');
    }
    const previousMode = mode;
    setMode(nextMode);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode);
    } catch (error) {
      setMode(previousMode);
      throw error;
    }
  }, [mode]);

  const colors = PALETTES[mode];
  const value = useMemo(() => ({
    mode,
    colors,
    loaded,
    setMode: updateMode,
  }), [mode, colors, loaded, updateMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}
