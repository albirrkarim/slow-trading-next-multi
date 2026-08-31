import type {
  ThemeOptions
} from "@mui/material/styles";
import {
  createTheme as createMuiTheme,
  responsiveFontSizes
} from "@mui/material/styles";
import merge from "lodash/merge";
import { tradeLog } from "@/lib/trading/helper/log";

export const THEMES = {
  LIGHT: "LIGHT",
  DARK: "DARK",
  // NATURE: 'NATURE'
};

// Extend the background type to include "blur"
declare module "@mui/material/styles" {
  interface TypeBackground {
    blur?: string;
  }
}

// Base theme options common to all themes
const DIALOG_LAYER_Z_INDEX = 9999;
const FLOATING_LAYER_Z_INDEX = 12000;

const baseOptions: ThemeOptions = {
  direction: "ltr",
  components: {
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: "inherit",  // Or theme.palette.text.primary
        },
      },
    },
    MuiFormHelperText: {
      styleOverrides: {
        root: {
          color: "inherit",  // Or theme.palette.text.secondary
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        popper: {
          zIndex: FLOATING_LAYER_Z_INDEX,
        },
        tooltip: {
          fontSize: '1rem', // Adjust as needed (e.g., '12px', '0.75rem', etc.)
        },
      },
    },
  },
};

// Specific theme options for different themes
const themesOptions: Record<string, ThemeOptions> = {
  [THEMES.LIGHT]: {
    palette: {
      mode: "light",
      action: {
        active: "#6b778c",
      },
      background: {
        default: "#f4f5f7",
        paper: "#ffffff",
        blur: "rgba(255,255,255,0.6)",
      },
      primary: {
        main: "#004984",
        contrastText: "#ffffff",
      },
      secondary: {
        main: "#f50057",
        contrastText: "#ffffff",
      },
      error: {
        main: "#f44336",
        contrastText: "#ffffff",
      },
      success: {
        main: "#4caf50",
        contrastText: "#ffffff",
      },
      warning: {
        main: "#ff9800",
        contrastText: "#ffffff",
      },
      text: {
        primary: "#172b4d",
        // secondary: "#697488",
        secondary: "#4a5568",
      },
    },
    components: {
      MuiInputBase: {
        styleOverrides: {
          input: {
            "&::placeholder": {
              opacity: 0.86,
              color: "#42526e",
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          root: {
            zIndex: DIALOG_LAYER_Z_INDEX
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          root: {
            zIndex: FLOATING_LAYER_Z_INDEX,
          },
        },
      },
      MuiPopper: {
        styleOverrides: {
          root: {
            zIndex: FLOATING_LAYER_Z_INDEX,
          },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          popper: {
            zIndex: FLOATING_LAYER_Z_INDEX,
          }
        }
      }
    },
  },
  [THEMES.DARK]: {
    palette: {
      mode: "dark",
      action: {
        active: "#9ca3af",
      },
      background: {
        default: "#000000",
        paper: "#111827",
        blur: "rgba(17,24,39,0.7)",
      },
      primary: {
        main: "#60a5fa",
        contrastText: "#0b1020",
      },
      secondary: {
        main: "#f472b6",
        contrastText: "#0b1020",
      },
      error: {
        main: "#ef4444",
        contrastText: "#0b1020",
      },
      success: {
        main: "#22c55e",
        contrastText: "#0b1020",
      },
      warning: {
        main: "#f59e0b",
        contrastText: "#0b1020",
      },
      text: {
        primary: "#e5e7eb",
        secondary: "#9ca3af",
      },
    },
    components: {
      MuiInputBase: {
        styleOverrides: {
          input: {
            "&::placeholder": {
              opacity: 0.86,
              color: "#9ca3af",
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          root: {
            zIndex: DIALOG_LAYER_Z_INDEX
          },
        },
      },
      MuiPopover: {
        styleOverrides: {
          root: {
            zIndex: FLOATING_LAYER_Z_INDEX,
          },
        },
      },
      MuiPopper: {
        styleOverrides: {
          root: {
            zIndex: FLOATING_LAYER_Z_INDEX,
          },
        },
      },
      MuiAutocomplete: {
        styleOverrides: {
          popper: {
            zIndex: FLOATING_LAYER_Z_INDEX,
          }
        }
      }
    },
  },
};

interface ThemeConfig {
  theme?: string;
  roundedCorners?: boolean;
  direction?: "ltr" | "rtl";
  responsiveFontSizes?: boolean;
}

export const createTheme = (config: ThemeConfig) => {
  let themeOptions = themesOptions[config.theme ?? THEMES.LIGHT];

  if (!themeOptions) {
    tradeLog.warn(new Error(`The theme ${config.theme} is not valid`));
    themeOptions = themesOptions[THEMES.LIGHT];
  }

  let theme = createMuiTheme(
    merge(
      {},
      baseOptions,
      themeOptions,
      config.roundedCorners && { shape: { borderRadius: 16 } },
      { direction: config.direction },
    )
  );

  if (config.responsiveFontSizes) {
    theme = responsiveFontSizes(theme);
  }

  return theme;
};
