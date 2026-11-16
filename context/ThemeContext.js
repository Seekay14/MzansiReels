import React, { createContext, useContext, useMemo } from 'react';

const ThemeContext = createContext(null);

const PALETTE = {
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
};

export function ThemeProvider({ children }) {
  const colors = PALETTE;
  const value = useMemo(() => ({
    mode: 'dark',
    colors,
    loaded: true,
    setMode: () => {},
  }), []);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}
