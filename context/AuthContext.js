import { createContext, useContext } from 'react';

export const AuthContext = createContext({ user: null, setUser: () => {}, logout: async () => {} });
export const useAuth = () => useContext(AuthContext);
