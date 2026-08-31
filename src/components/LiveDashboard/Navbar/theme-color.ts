"use client";

import { useEffect } from "react";

import type { Theme } from "@mui/material";

const THEME_COLOR_SELECTOR = 'meta[name="theme-color"]';

/**
 * Returns the exact background color used by the navbar for its runtime state.
 */
export function getNavbarBackgroundColor(theme: Theme, isActive: boolean) {
  return isActive
    ? theme.palette.error.main
    : theme.palette.background.default;
}

/**
 * Keeps the browser theme-color meta tag aligned with the navbar background.
 */
export function useNavbarThemeColor(
  navbarBackgroundColor: string,
  inactiveBackgroundColor: string,
) {
  useEffect(() => {
    let themeColorMeta =
      document.head.querySelector<HTMLMetaElement>(THEME_COLOR_SELECTOR);
    const createdThemeColorMeta = !themeColorMeta;

    if (!themeColorMeta) {
      themeColorMeta = document.createElement("meta");
      themeColorMeta.name = "theme-color";
      document.head.append(themeColorMeta);
    }

    themeColorMeta.content = navbarBackgroundColor;

    return () => {
      if (createdThemeColorMeta) {
        themeColorMeta.remove();
        return;
      }

      themeColorMeta.content = inactiveBackgroundColor;
    };
  }, [inactiveBackgroundColor, navbarBackgroundColor]);
}
