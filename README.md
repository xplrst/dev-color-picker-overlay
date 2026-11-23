# 🎨 CSS Token & WCAG Contrast Studio Overlay

[![React](https://img.shields.io/badge/React-18%20%7C%2019-61DAFB?logo=react&logoColor=black)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](#)
[![WCAG 2.1](https://img.shields.io/badge/Accessibility-WCAG%202.1%20AA%2FAAA-10B981)](#)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-8B5CF6)](#)
[![Tree-Shakeable](https://img.shields.io/badge/Production%20Footprint-0%20KB-F59E0B)](#)

> **Zero-dependency React & TypeScript developer overlay for live CSS custom property inspection, Chrome DevTools-style color picking, alpha-composited WCAG 2.1 AA/AAA contrast checking, and bi-directional contrast tuning—with zero production bundle bleed.**

<details>
<summary><strong>📑 Table of Contents</strong></summary>

- [Overview: Why This Tool Exists](#-overview-why-this-tool-exists)
- [Core Features](#-core-features)
- [Architecture & Under the Hood (A Professor's Walkthrough)](#-architecture--under-the-hood-a-professors-walkthrough)
  - [1. The 3-Layer Alpha Compositing Model](#1-the-3-layer-alpha-compositing-model)
  - [2. Smart Backdrop Detection & The Base Eyedropper](#2-smart-backdrop-detection--the-base-eyedropper)
  - [3. Automatic `*-text` to `*-bg` Token Pairing](#3-automatic--text-to--bg-token-pairing)
  - [4. Unrounded HSVA Precision & Bi-Directional Contrast Solving](#4-unrounded-hsva-precision--bi-directional-contrast-solving)
  - [5. Zero-Footprint Tree Shaking](#5-zero-footprint-tree-shaking)
- [Directory Structure](#-directory-structure)
- [Installation & Setup](#-installation--setup)
  - [Step 1: Configure `src/theme.ts`](#step-1-configure-srcthemets)
  - [Step 2: Create the Self-Mounting Bootstrapper (`src/dev-tools/bootstrap.ts`)](#step-2-create-the-self-mounting-bootstrapper-srcdev-toolsbootstrapts)
  - [Step 3: Add the Inspector Component (`src/dev-tools/ThemeTokenInspector.tsx`)](#step-3-add-the-inspector-component-srcdev-toolsthemetokeninspectortsx)
  - [Step 4: Wire Into Your Main Entry File](#step-4-wire-into-your-main-entry-file)
- [Adding the Tool to Pages Outside `App.tsx`](#-adding-the-tool-to-pages-outside-apptsx)
  - [Scenario A: Multi-Page Apps (MPA) / Multiple HTML Entry Points](#scenario-a-multi-page-apps-mpa--multiple-html-entry-points)
  - [Scenario B: Standalone Static HTML / Legacy Pages (No React Root)](#scenario-b-standalone-static-html--legacy-pages-no-react-root)
  - [Scenario C: Micro-Frontends, Portals, or Shadow DOM Widgets](#scenario-c-micro-frontends-portals-or-shadow-dom-widgets)
  - [Scenario D: Storybook or Isolated Component Sandboxes](#scenario-d-storybook-or-isolated-component-sandboxes)
- [AI Agent Implementation Prompt](#-ai-agent-implementation-prompt)

</details>

---

## ✨ Overview: Why This Tool Exists

Think about the traditional workflow for tuning colors and verifying accessibility in a modern web application:

1. You open your browser's **DevTools**, which immediately steals 30–40% of your viewport and squeezes your responsive layout.
2. You hunt down a CSS custom property (`--color-warning-text`), tweak a hex code, and then realize you have no idea whether it still passes **WCAG 2.1 AA (`4.5:1`)** against its translucent badge background (`--color-warning-bg: rgba(253, 214, 99, 0.16)`).
3. You switch tabs to an external contrast checker, manually eye-drop or compute the blended background color, copy-paste values back and forth between windows, and then manually transcribe your changes back into your CSS file.

**CSS Token & WCAG Contrast Studio eliminates that entire context-switching loop.**

It floats directly over your live application as a lightweight, draggable studio panel—giving you **rapid, real-time design token prototyping** right where your components live:

* **No Browser DevTools Required:** Keep your full viewport intact and drag the studio anywhere on screen—or collapse it into a tiny floating pill when inspecting layout spacing.
* **No Browser Extensions to Install:** Everything is self-contained inside your repository in two TypeScript files with **zero third-party runtime dependencies**. Every teammate who clones your repo gets the exact same tool automatically.
* **No Tab or Window Switching:** Inspect every `:root` CSS variable, pick colors from a DevTools-grade 2D spectrum or native screen `EyeDropper`, save reusable swatches, and slide a **Target Contrast Ratio (`1.0:1` – `21.0:1`)** control to mathematically dial in WCAG AA or AAA compliance in seconds.
* **One-Click Export:** When your palette looks sharp and passes every contrast check, click **Copy :root** to copy the complete, updated CSS variable block straight to your clipboard.

---

## 🚀 Core Features

| Capability | What It Does for Your Workflow |
| :--- | :--- |
| **Rapid In-Context Prototyping** | Discovers all `:root`, `html`, and inline CSS color custom properties automatically and mutates them live via `document.documentElement.style.setProperty`. |
| **Chrome DevTools-Style Picker** | Interactive 2D Saturation/Value spectrum, Hue & Alpha sliders, instant format cycling (`HEX` / `RGBA` / `HSLA`), native Chromium `EyeDropper`, and `localStorage`-persisted color swatches. |
| **3-Layer Alpha Compositing** | Flattens `Base Backdrop -> Against Surface Token -> Selected Foreground Token` so translucent `rgba()`/`hsla()` surfaces yield true on-screen contrast ratios. |
| **Bi-Directional Contrast Slider** | Drag left to decrease contrast or right to increase contrast (`1.0:1` to `21.0:1`), or click **Fix AA** to snap immediately to `4.55:1` while preserving your brand hue. |
| **Smart Backdrop + Base Eyedropper** | Auto-detects active light/dark theme surfaces (`document.body` / `--color-bg` / `--color-surface`) and provides a **Base 💧** eyedropper button to sample complex gradients or nested cards. |
| **Automatic `*-text` / `*-bg` Pairing** | Selecting a semantic text token (e.g., `--color-warning-text`) automatically pairs it against its matching surface token (`--color-warning-bg`) in the contrast evaluator. |
| **Zero Production Bundle Bleed** | Controlled by a single boolean in `src/theme.ts` and loaded via dynamic `import()` outside `App.tsx`, allowing bundlers to completely strip it from production builds. |

---

## 🎓 Architecture & Under the Hood (A Professor's Walkthrough)

To build a tool that is both **mathematically trustworthy** and **safe to leave in a production repository**, we need to solve two classic front-end engineering problems: *how browsers physically composite translucent colors*, and *how JavaScript bundlers eliminate dead code*. Let's walk through how each piece works.

### 1. The 3-Layer Alpha Compositing Model

Suppose you have a warning badge on a dark-mode page:
* **Page Canvas:** `rgb(30, 31, 34)`
* **Badge Surface (`--color-warning-bg`):** `rgba(253, 214, 99, 0.16)`
* **Badge Text (`--color-warning-text`):** `rgb(248, 210, 98)`

A naive contrast checker compares the raw RGB values `(248, 210, 98)` against `(253, 214, 99)`—ignoring the `0.16` alpha channel—and falsely reports an unreadable `1.04:1` ratio!

In reality, the browser renders translucent elements like **stacked sheets of colored acetate resting on an opaque poster board**. Before we can measure WCAG luminance, we must flatten those layers from bottom to top using Porter-Duff `source-over` alpha blending:

$$C_{\text{out}} = \alpha \cdot C_{\text{fg}} + (1 - \alpha) \cdot C_{\text{bg}}$$

Our engine performs this in three deterministic steps:
1. **Layer 1 — Base Backdrop (`backdropRgb`):** The opaque canvas behind everything (`rgb(30, 31, 34)`).
2. **Layer 2 — Effective Background (`effectiveBgRgb`):** We composite `--color-warning-bg` over `backdropRgb`. That `16%` yellow tint over dark gray blends into `rgb(66, 59, 41)`—a warm dark bronze.
3. **Layer 3 — Effective Foreground (`effectiveFgRgb`):** We composite `--color-warning-text` over `effectiveBgRgb`.

Now we convert each sRGB channel ($c \in [0, 255]$, normalized to $s = c / 255$) into **linear light intensity** using the official WCAG 2.1 piecewise transfer function (`0.04045` threshold):

$$s_{\text{lin}} = \begin{cases} \dfrac{s}{12.92} & \text{if } s \le 0.04045 \\[6pt] \left(\dfrac{s + 0.055}{1.055}\right)^{2.4} & \text{if } s > 0.04045 \end{cases}$$

From linear channels, we calculate **Relative Luminance** ($L$) weighted by human eye sensitivity (most sensitive to green, least to blue) and finally the **WCAG Contrast Ratio**:

$$L = 0.2126\,R_{\text{lin}} + 0.7152\,G_{\text{lin}} + 0.0722\,B_{\text{lin}}, \qquad \text{CR} = \frac{\max(L_1, L_2) + 0.05}{\min(L_1, L_2) + 0.05}$$

Comparing `rgb(248, 210, 98)` against our composited `rgb(66, 59, 41)` yields the **true on-screen contrast ratio**.

---

### 2. Smart Backdrop Detection & The Base Eyedropper

How does the overlay know whether your page's poster board is dark (`rgb(30, 31, 34)`) or light (`rgb(255, 255, 255)`)?

* **First, it inspects the live DOM:** It reads `getComputedStyle(document.body).backgroundColor` (and `document.documentElement`) to see what the browser is actually painting behind your app right now.
* **Second, it checks semantic root tokens:** If `<body>` is transparent, it searches your CSS variables for opaque page surface tokens (`--color-bg`, `--color-background`, `--color-surface`, `--bg`, `--surface`).
* **Third, it gives you a manual override (`Base 💧`):** If your badge sits inside an elevated card or gradient container whose background differs from `<body>`, clicking **Base 💧** activates the native EyeDropper so you can sample the exact pixel behind that container.

---

### 3. Automatic `*-text` to `*-bg` Token Pairing

In well-structured design systems, foreground and background tokens follow predictable naming conventions (`--color-warning-text` & `--color-warning-bg`, `--danger-fg` & `--danger-bg`). Whenever you select a token ending in `-text`, `-fg`, or `-foreground`, `handleSelectToken` automatically checks whether a sibling `-bg` token exists in `:root` and updates the **Against:** dropdown for you—saving dozens of repetitive clicks while auditing your palette.

---

### 4. Unrounded HSVA Precision & Bi-Directional Contrast Solving

Notice two subtle traps that break naive contrast sliders:
1. **State Fighting:** If a range `<input>` binds its `value` directly to the computed `ratio`, dragging the slider triggers a color recalculation whose rounded ratio overwrites the slider thumb position on the very next render—making it impossible to drag smoothly backward. By separating `sliderTarget` (where your thumb is) from `ratio` (what the color currently achieves), dragging left or right is always fluid.
2. **Quantization Drift:** If `rgbaToHsva` rounds Hue (`h`), Saturation (`s`), and Value (`v`) to integers on every step, tiny rounding errors accumulate as you scrub the slider. Keeping **full floating-point precision** in `HSVA` allows `solveColorForTargetContrast` to search along your color's brightness (`V`) and saturation (`S`) curve to find the closest perceptual match minimizing $|\text{CR}_{\text{actual}} - \text{CR}_{\text{target}}|$.

---

### 5. Zero-Footprint Tree Shaking

Why didn't we render `<ThemeTokenInspector />` inside `App.tsx`?

Because **coupling developer tools to your root UI component invites production bloat and architectural clutter**. Instead:
1. `src/theme.ts` exports a static configuration flag (`enableTokenInspector`).
2. `src/dev-tools/bootstrap.ts` checks that flag at the top level *before* importing React or the inspector UI, and mounts into a detached `<div>` appended to `document.body`.
3. When `enableTokenInspector` is `false` (or bound to `import.meta.env.DEV` in production), modern bundlers (Vite, Rollup, webpack, esbuild) perform **dead-code elimination** on the `if (!themeConfig.enableTokenInspector) return;` branch—meaning **0 KB** of `ThemeTokenInspector.tsx` ever ships to end users.

---

## 📁 Directory Structure

```text
src/
├── main.tsx                             # Main app entry (single side-effect import)
├── theme.ts                             # Master feature toggle & token prefix config
└── dev-tools/
    ├── bootstrap.ts                     # Self-mounting lazy loader (no-op when disabled)
    └── ThemeTokenInspector.tsx          # Floating UI, color math, & WCAG 2.1 contrast engine
```

---

## 🛠 Installation & Setup

### Step 1: Configure `src/theme.ts`

Create or update `src/theme.ts` to hold your master toggle and token discovery settings:

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
  // Tip: Use `import.meta.env.DEV` so production builds automatically strip the overlay
  enableTokenInspector: true,
  tokenPrefixFilter: '--',
  defaultReferenceBgToken: '--color-bg',
};
```

### Step 2: Create the Self-Mounting Bootstrapper (`src/dev-tools/bootstrap.ts`)

This file acts as a firewall between your application code and the developer overlay:

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

### Step 3: Add the Inspector Component (`src/dev-tools/ThemeTokenInspector.tsx`)

Place the complete `ThemeTokenInspector.tsx` component (containing the 3-layer alpha compositing engine, smart backdrop detection, `*-text` / `*-bg` auto-pairing, unrounded HSVA solver, and Base Eyedropper) into `src/dev-tools/ThemeTokenInspector.tsx`.

### Step 4: Wire Into Your Main Entry File

Add a single side-effect import to `src/main.tsx` (or `src/index.tsx`). **You never need to touch `App.tsx`:**

```ts
import './dev-tools/bootstrap';
```

---

## 🌐 Adding the Tool to Pages Outside `App.tsx`

Because `bootstrap.ts` mounts itself into an isolated DOM container (`#__dev_theme_token_inspector_root__`) directly on `document.body` and reads CSS variables from `document.documentElement` (`:root`), **it has zero dependency on `App.tsx` or React Router**.

Here is how to enable it on pages that are rendered outside your main `App.tsx`:

### Scenario A: Multi-Page Apps (MPA) / Multiple HTML Entry Points
If your Vite, webpack, or Next.js Pages project has separate entry points (for example, `landing.html` $\rightarrow$ `src/landing.tsx`, `admin.html` $\rightarrow$ `src/admin.tsx`, or `auth.html` $\rightarrow$ `src/auth.tsx`):

Simply import `./dev-tools/bootstrap` at the top of each entry script:

```ts
// src/landing.tsx (or src/auth.tsx)
import './styles/tokens.css';
import './dev-tools/bootstrap'; // <-- Automatically mounts on this standalone page
```

Each page will independently scan its own loaded `:root` stylesheets and let you prototype tokens for that page.

### Scenario B: Standalone Static HTML / Legacy Pages (No React Root)
Suppose you have a static `public/marketing.html`, an offline `404.html`, or a server-rendered template that doesn't mount `App.tsx` at all, as long as your bundler processes a `<script type="module">` tag on that page:

```html
<!doctype html>
<html lang="en">
  <head>
    <link rel="stylesheet" href="/src/styles/tokens.css" />
  </head>
  <body>
    <main class="hero">Standalone Static Page</main>

    <!-- Mounts the floating inspector onto document.body even if the page itself is static HTML -->
    <script type="module" src="/src/dev-tools/bootstrap.ts"></script>
  </body>
</html>
```

Because `bootstrap.ts` creates its own React root on `document.body`, it works seamlessly even when the rest of the page is pure HTML/CSS!

### Scenario C: Micro-Frontends, Portals, or Shadow DOM Widgets
If a page renders sub-applications inside a `ShadowRoot` or an `<iframe>`:
* **For `<iframe>` pages:** Include `import './dev-tools/bootstrap'` inside the iframe's entry bundle so the overlay inspects the iframe's own `:root` document scope.
* **For Micro-Frontends sharing one `document`:** Because `bootstrap.ts` guards with a module-level `let mounted = false` (and you can also check `document.getElementById('__dev_theme_token_inspector_root__')`), importing `bootstrap.ts` in multiple micro-frontends safely mounts only **one** shared overlay instance.

### Scenario D: Storybook or Isolated Component Sandboxes
To inspect your design tokens while developing isolated components in Storybook without modifying individual stories, import the bootstrapper once inside `.storybook/preview.ts`:

```ts
// .storybook/preview.ts
import '../src/styles/tokens.css';
import '../src/dev-tools/bootstrap';
```

---

## 🤖 AI Agent Implementation Prompt

Copy and paste the prompt below to instruct your/the agent to scaffold and wire up the overlay automatically:

```text
Implement the CSS Token & WCAG Contrast Studio developer overlay in this React + TypeScript project following these exact architectural and mathematical requirements:

1. DO NOT modify `App.tsx` or any core application components.
2. Create or update `src/theme.ts` exporting `themeConfig` with:
   - `enableTokenInspector: boolean` (default `true` in dev, or `import.meta.env.DEV`)
   - `tokenPrefixFilter: string` (default `'--'`)
   - `defaultReferenceBgToken: string` (default `'--color-bg'`)
3. Create `src/dev-tools/bootstrap.ts` that checks `if (!themeConfig.enableTokenInspector || mounted || typeof document === 'undefined') return;` and dynamically imports `react-dom/client`, `react`, and `./ThemeTokenInspector` to mount into a detached `<div id="__dev_theme_token_inspector_root__" data-dev-tool="true">` on `document.body`.
4. Create `src/dev-tools/ThemeTokenInspector.tsx` as a self-contained, zero-dependency component with inline styles (`zIndex: 2147483647`) and clear, pedagogical comments implementing:
   - **Live CSS Token Discovery:** Scan `:root`, `html`, and inline `document.documentElement.style` for color custom properties and update them live via `setProperty`.
   - **3-Layer Alpha Compositing Model:** Flatten semi-transparent colors in three steps before calculating luminance:
     1) `backdropRgb` (Base Backdrop)
     2) `effectiveBgRgb = compositeOver(againstBgTokenRgba, backdropRgb)` (Against Surface Token)
     3) `effectiveFgRgb = compositeOver(selectedFgTokenRgba, effectiveBgRgb)` (Selected Foreground Token)
     Compute WCAG 2.1 relative luminance using exact sRGB linearization (`s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4`) between `effectiveFgRgb` and `effectiveBgRgb`.
   - **Smart Page Backdrop Detection + Base Eyedropper Fallback:** Automatically resolve `backdropRgb` by checking opaque `getComputedStyle(document.body).backgroundColor` / `document.documentElement`, then falling back to tokens matching `--color-bg`, `--color-surface`, `--bg`, or `--surface`. Provide a **Base Eyedropper** button (using `window.EyeDropper`) so developers can sample the exact container pixel behind translucent tokens.
   - **Automatic `*-text` to `*-bg` Pairing:** When a user selects a token ending in `-text`, `-fg`, or `-foreground` (e.g., `--color-warning-text`), automatically set the **Against:** reference dropdown to its matching `-bg` token (e.g., `--color-warning-bg`) if present.
   - **Unrounded HSVA Precision & Bi-Directional Contrast Slider:** Keep floating-point (unrounded) `h`, `s`, `v` values in `rgbaToHsva` so iterative contrast solving does not suffer from rounding drift. Back the **Target ratio (`1.0` to `21.0`)** range slider with a separate `sliderTarget` state (so dragging left or right never fights the live ratio) and solve for the closest HSVA color minimizing `Math.abs(actualRatio - targetRatio)`, plus a one-click **Fix AA (`4.55:1`)** button.
   - **Chrome DevTools-Style Controls:** Draggable floating window with minimized pill mode, 2D Saturation/Value picker, Hue & Alpha sliders, HEX/RGBA/HSLA format cycler, foreground `EyeDropper`, `localStorage` saved swatches, **Copy :root**, and **Reset**.
5. Add `import './dev-tools/bootstrap';` to the app entry point (`src/main.tsx` or `src/index.tsx`), and to any standalone page entry points rendered outside `App.tsx`.
```
