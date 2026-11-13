import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import SearchMenu from '../components/SearchMenu';

const SearchMenuContext = createContext(null);

export function SearchMenuProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const [searchTab, setSearchTab] = useState('Search');
  const [navigation, setNavigation] = useState(null);
  const openSearchMenu = useCallback(() => setVisible(true), []);
  const closeSearchMenu = useCallback(() => setVisible(false), []);
  const registerNavigation = useCallback((nextNavigation) => {
    setNavigation((current) => current === nextNavigation ? current : nextNavigation);
  }, []);
  const value = useMemo(
    () => ({ openSearchMenu, closeSearchMenu, searchTab, setSearchTab, registerNavigation }),
    [openSearchMenu, closeSearchMenu, searchTab, setSearchTab, registerNavigation],
  );

  return (
    <SearchMenuContext.Provider value={value}>
      {children}
      <SearchMenu
        visible={visible}
        onClose={closeSearchMenu}
        navigation={navigation}
        searchTab={searchTab}
        setSearchTab={setSearchTab}
      />
    </SearchMenuContext.Provider>
  );
}

export function useSearchMenu() {
  const context = useContext(SearchMenuContext);
  if (!context) {
    throw new Error('useSearchMenu must be used within a SearchMenuProvider.');
  }
  const navigation = useNavigation();
  useEffect(() => {
    context.registerNavigation(navigation);
  }, [context.registerNavigation, navigation]);
  return context;
}
