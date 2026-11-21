// INSTRUCTIONS - ADD TO THEME.TS


export interface ThemeConfig {
  /** Master switch for the floating CSS Token & WCAG Studio overlay */
  enableTokenInspector: boolean;
  /** Prefix filter for CSS variables (e.g., '--', '--color-', '--md-sys-color-') */
  tokenPrefixFilter: string;
  /** Default background token used to compute WCAG 2.1 contrast ratios */
  defaultReferenceBgToken: string;
}

export const themeConfig: ThemeConfig = {
  // Set to `false` to completely exclude the inspector from production builds
  enableTokenInspector: false,
  tokenPrefixFilter: '--',
  defaultReferenceBgToken: '--background',
};

