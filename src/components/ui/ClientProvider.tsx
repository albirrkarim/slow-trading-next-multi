"use client"

import { CssBaseline, ThemeProvider } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterMoment } from "@mui/x-date-pickers/AdapterMoment";
import { SnackbarProvider } from "notistack";
import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { EmotionRegistry } from './EmotionRegistry';
import { createTheme, THEMES } from './theme';

const STORAGE_KEY = "mui-theme";

type ColorModeContextValue = {
  themeName: string;
  setThemeName: (themeName: string) => void;
  toggleTheme: () => void;
};

function getInitialThemeName() {
  return THEMES.LIGHT;
}

export const ColorModeContext = createContext<ColorModeContextValue>({
  themeName: THEMES.LIGHT,
  setThemeName: () => undefined,
  toggleTheme: () => undefined,
});

export function useColorMode() {
  return useContext(ColorModeContext);
}

interface ClientProviderProps {
  children: ReactNode;
}

export const ClientProvider: React.FC<ClientProviderProps> = ({ children }) => (
  <ClientProviderInner>{children}</ClientProviderInner>
);

const ClientProviderInner: React.FC<ClientProviderProps> = ({ children }) => {
  const [themeName, setThemeName] = useState<string>(getInitialThemeName);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved && saved !== themeName) {
        setThemeName(saved);
      }
    } catch {
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ctx = useMemo<ColorModeContextValue>(() => {
    const toggleTheme = () => {
      const next = themeName === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
      setThemeName(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        return;
      }
    };

    const setThemeNameWithPersist = (next: string) => {
      setThemeName(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        return;
      }
    };

    return {
      themeName,
      setThemeName: setThemeNameWithPersist,
      toggleTheme,
    };
  }, [themeName]);

  const theme = useMemo(() => createTheme({ theme: themeName }), [themeName]);

  return (
    <EmotionRegistry>
      <ColorModeContext.Provider value={ctx}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <LocalizationProvider dateAdapter={AdapterMoment}>
            <SnackbarProvider
              anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
              autoHideDuration={4000}
              maxSnack={3}
            >
              {children}
            </SnackbarProvider>
          </LocalizationProvider>
        </ThemeProvider>
      </ColorModeContext.Provider>
    </EmotionRegistry>
  );
};
