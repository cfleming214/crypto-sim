import React, { createContext, useContext, useState } from 'react';
import { lightColors, darkColors, Colors } from './tokens';

type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: Colors;
  toggle: () => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  colors: lightColors,
  toggle: () => {},
  isDark: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');
  const isDark = mode === 'dark';

  return (
    <ThemeContext.Provider
      value={{
        mode,
        colors: isDark ? darkColors : lightColors,
        toggle: () => setMode(m => (m === 'light' ? 'dark' : 'light')),
        isDark,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
