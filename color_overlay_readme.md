# CSS Token & WCAG Contrast Studio Overlay

A lightweight, zero-dependency, self-contained **React + TypeScript** developer overlay for inspecting live `:root` CSS custom properties, evaluating **WCAG 2.1 AA/AAA** contrast ratios on opaque and translucent (`rgba`/`hsla`) surfaces, and adjusting colors in real time via a Chrome DevTools-style HSV picker, EyeDropper, and bi-directional target contrast slider.

Designed to drop into any React + TypeScript project **without modifying `App.tsx`** and to completely tree-shake out of production builds when disabled in `src/theme.ts`.

---

## How the Contrast & Alpha Engine Works

When evaluating translucent design tokens (such as `--color-warning-bg: rgba(253, 214, 99, 0.16)` on a dark theme surface), computing contrast against the raw RGB channels ignores how the browser actually renders the pixels on screen. To match real rendered pixels, this overlay models color stacking in three sequential layers:

### 1. The 3-Layer Alpha Compositing Model
Before calculating relative luminance, semi-transparent colors are flattened using standard Porter-Duff `source-over` alpha blending 
#### $C_{\text{out}} = \alpha C_{\text{fg}} + (1 - \alpha) C_{\text{bg}}$

1. **Layer 1 — Base Backdrop (`backdropRgb`):** The opaque page canvas behind all translucent badges, cards, and overlays.
2. **Layer 2 — Against Surface Token (`effectiveBgRgb`):** The selected **Against** token (e.g., `--color-warning-bg`) composited over `backdropRgb`. For example, `rgba(253, 214, 99, 0.16)` over a dark backdrop `rgb(30, 31, 34)` resolves to the actual rendered `rgb(66, 59, 41)`.
3. **Layer 3 — Selected Foreground Token (`effectiveFgRgb`):** The active token being edited (e.g., `--color-warning-text`) composited over `effectiveBgRgb`.

WCAG 2.1 relative luminance ($L = 0.2126 R_{\text{lin}} + 0.7152 G_{\text{lin}} + 0.0722 B_{\text{lin}}$ with the `0.04045` sRGB linearization threshold) and contrast ratio $\frac{\max(L_1, L_2) + 0.05}{\min(L_1, L_2) + 0.05}$ are then computed between `effectiveFgRgb` and `effectiveBgRgb`.

### 2. Smart Page Backdrop Detection & Base Eyedropper Fallback
Because apps name their root surface variables differently (and dark-mode apps may have dark backgrounds while `:root` defaults to light), `backdropRgb` is resolved in priority order:
1. **Live DOM `document.body` / `document.documentElement` background:** Reads `getComputedStyle(document.body).backgroundColor` (falling back to `document.documentElement`) if it is opaque (`alpha > 0.95`), capturing the true active light/dark theme canvas immediately.
2. **Token Heuristics:** Scans discovered tokens matching `--color-bg`, `--color-background`, `--color-surface`, `--bg`, `--background`, or `--surface`.
3. **Base Eyedropper Override:** Includes a dedicated **Base Backdrop Eyedropper** button next to the backdrop readout so you can sample any pixel on screen (or reset to auto-detected) if a component sits inside a custom nested container.

### 3. Automatic `*-text` to `*-bg` Token Pairing
When you click a semantic foreground token in the list (such as `--color-warning-text`, `--color-danger-text`, or `--text-primary`), the overlay automatically checks if a matching surface token exists (`--color-warning-bg`, `--color-danger-bg`, `--bg-primary`, or `-surface` equivalents) and switches the **Against:** dropdown to that pair automatically—while still allowing manual override at any time.

### 4. Unrounded HSVA Precision in the Contrast Solver
Converting `RGBA -> HSVA` with integer rounding (`Math.round(h)`, `toFixed(1)`) introduces quantization drift when stepping through target contrast ratios (`1.0:1` to `21.0:1`). Keeping **unrounded floating-point `HSVA`** values inside `rgbaToHsva` and `solveColorForTargetContrast` ensures smooth, monotonic convergence whether sliding left (decreasing contrast) or right (increasing contrast).

---

## Features

| Capability | Details |
| --- | --- |
| **Zero Production Footprint** | Controlled via `themeConfig.enableTokenInspector` in `src/theme.ts` and dynamically imported outside `App.tsx`, allowing bundlers (Vite, Rollup, webpack, esbuild) to strip the overlay from production builds. |
| **3-Layer Alpha Compositing** | Flattens `Base Backdrop -> Against Surface Token -> Selected Foreground Token` so `rgba()`/`hsla()` surfaces produce exact on-screen contrast ratios. |
| **Smart Backdrop + Eyedropper** | Auto-detects active `document.body` / `--color-bg` / `--color-surface` backdrop and provides a **Base Eyedropper** fallback to sample custom container backgrounds. |
| **Auto `*-text` / `*-bg` Pairing** | Selecting a `*-text` token automatically pairs it against its corresponding `*-bg` or `*-surface` token. |
| **Chrome DevTools-Style Picker** | 2D Saturation/Value spectrum, Hue & Alpha sliders, format cycling (`HEX` / `RGBA` / `HSLA`), native Chromium `EyeDropper`, and `localStorage` swatch palette. |
| **Bi-Directional Contrast Slider** | Tracks a dedicated `sliderTarget` (`1.0:1` to `21.0:1`) using unrounded HSVA math to minimize `|actualRatio - targetRatio|` smoothly in both directions, plus a one-click **Fix AA (`4.55:1`)** button. |

---

## Directory Structure

```text
src/
├── main.tsx                             # Single side-effect import of ./dev-tools/bootstrap
├── theme.ts                             # Feature flag & token prefix configuration
└── dev-tools/
    ├── bootstrap.ts                     # Self-mounting lazy loader (no-op when disabled)
    └── ThemeTokenInspector.tsx          # Floating UI, color math, & WCAG 2.1 contrast engine
```

---

## Manual Installation

### 1. Create `src/theme.ts`

```ts
export interface ThemeConfig {
  /** Master switch for the floating CSS Token & WCAG Contrast Studio overlay */
  enableTokenInspector: boolean;
  /** Prefix filter for CSS variables (e.g., '--', '--color-', '--md-sys-color-') */
  tokenPrefixFilter: string;
  /** Default background token used when no *-bg pair or surface token is detected */
  defaultReferenceBgToken: string;
}

export const themeConfig: ThemeConfig = {
  // Set to `false` (or bind to `import.meta.env.DEV`) to exclude from production builds
  enableTokenInspector: true,
  tokenPrefixFilter: '--',
  defaultReferenceBgToken: '--color-bg',
};
```

### 2. Create `src/dev-tools/bootstrap.ts`

```ts
import { themeConfig } from '../theme';

let mounted = false;

export async function initTokenInspector(): Promise<void> {
  if (!themeConfig.enableTokenInspector || mounted || typeof document === 'undefined') {
    return;
  }
  mounted = true;

  const [{ createRoot }, { ThemeTokenInspector }, React] = await Promise.all([
    import('react-dom/client'),
    import('./ThemeTokenInspector'),
    import('react'),
  ]);

  const container = document.createElement('div');
  container.id = '__dev_theme_token_inspector_root__';
  container.setAttribute('data-dev-tool', 'true');
  document.body.appendChild(container);

  createRoot(container).render(React.createElement(ThemeTokenInspector));
}

void initTokenInspector();
```

### 3. Add `src/dev-tools/ThemeTokenInspector.tsx`

Place the full `ThemeTokenInspector.tsx` component (with 3-layer alpha compositing, smart backdrop detection, `*-text` / `*-bg` auto-pairing, unrounded HSVA solver, and Base Eyedropper fallback) in `src/dev-tools/ThemeTokenInspector.tsx`.

### 4. Wire Into Your Entry File (`src/main.tsx` or `src/index.tsx`)

Add a single side-effect import at the top of your entry file without touching `App.tsx`:

```ts
import './dev-tools/bootstrap';
```

---

## AI Studio Agent Implementation Prompt

Copy and paste the prompt below into Google AI Studio to instruct the agent to scaffold and wire up the overlay automatically:

```text
Implement the CSS Token & WCAG Contrast Studio developer overlay in this React + TypeScript project following these exact architectural and mathematical requirements:

1. DO NOT modify `App.tsx` or any core application components.
2. Create or update `src/theme.ts` exporting `themeConfig` with:
   - `enableTokenInspector: boolean` (default `true` in dev, or `import.meta.env.DEV`)
   - `tokenPrefixFilter: string` (default `'--'`)
   - `defaultReferenceBgToken: string` (default `'--color-bg'`)
3. Create `src/dev-tools/bootstrap.ts` that checks `if (!themeConfig.enableTokenInspector || mounted || typeof document === 'undefined') return;` and dynamically imports `react-dom/client`, `react`, and `./ThemeTokenInspector` to mount into a detached `<div id="__dev_theme_token_inspector_root__" data-dev-tool="true">` on `document.body`.
4. Create `src/dev-tools/ThemeTokenInspector.tsx` as a self-contained, zero-dependency component with inline styles (`zIndex: 2147483647`) and clear developer-friendly comments implementing:
   - **Live CSS Token Discovery:** Scan `:root`, `html`, and inline `document.documentElement.style` for color custom properties and update them live via `setProperty`.
   - **3-Layer Alpha Compositing Model:** Flatten semi-transparent colors in three steps before calculating luminance:
     1) `backdropRgb` (Base Backdrop)
     2) `effectiveBgRgb = compositeOver(againstBgTokenRgba, backdropRgb)` (Against Surface Token)
     3) `effectiveFgRgb = compositeOver(selectedFgTokenRgba, effectiveBgRgb)` (Selected Foreground Token)
     Compute WCAG 2.1 relative luminance using exact sRGB linearization (`s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4`) between `effectiveFgRgb` and `effectiveBgRgb`.
   - **Smart Page Backdrop Detection + Base Eyedropper Fallback:** Automatically resolve `backdropRgb` by checking opaque `getComputedStyle(document.body).backgroundColor` / `document.documentElement`, then falling back to tokens matching `--color-bg`, `--color-surface`, `--bg`, or `--surface`. Provide a **Base Eyedropper** button (using `window.EyeDropper`) and reset control so developers can sample the exact container pixel behind translucent tokens.
   - **Automatic `*-text` to `*-bg` Pairing:** When a user selects a token ending in `-text` (e.g., `--color-warning-text`), automatically set the **Against:** reference dropdown to its matching `-bg` or `-surface` token (e.g., `--color-warning-bg`) if present.
   - **Unrounded HSVA Precision & Bi-Directional Contrast Slider:** Keep floating-point (unrounded) `h`, `s`, `v` values in `rgbaToHsva` so iterative contrast solving does not suffer from rounding drift. Back the **Target ratio (`1.0` to `21.0`)** range slider with a separate `sliderTarget` state (so dragging left or right never fights the live ratio) and solve for the closest HSVA color minimizing `Math.abs(actualRatio - targetRatio)`, plus a one-click **Fix AA (`4.55:1`)** button.
   - **Chrome DevTools-Style Controls:** Draggable floating window with minimized pill mode, 2D Saturation/Value picker, Hue & Alpha sliders, HEX/RGBA/HSLA format cycler, foreground `EyeDropper`, `localStorage` saved swatches, **Copy :root**, and **Reset**.
5. Add `import './dev-tools/bootstrap';` to the entry file (`src/main.tsx` or `src/index.tsx`).
```

---

## Production Bundle Guarantee

To guarantee the inspector is stripped from production builds even if `enableTokenInspector` is left enabled locally, bind the flag in `src/theme.ts` to your bundler's dev environment check:

```ts
export const themeConfig: ThemeConfig = {
  enableTokenInspector: import.meta.env.DEV,
  tokenPrefixFilter: '--',
  defaultReferenceBgToken: '--color-bg',
};
```

Because `import.meta.env.DEV` evaluates to `false` during production builds, dead-code elimination removes the dynamic `import('./ThemeTokenInspector')` branch completely.
