// Place in src/dev-tools/ThemeTokenInspector.tsx

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { themeConfig } from '../theme';

// ============================================================================
// 1. DATA TYPES & CONSTANTS
// ============================================================================

interface RGB {
  r: number; // 0 - 255
  g: number; // 0 - 255
  b: number; // 0 - 255
}

interface RGBA extends RGB {
  a: number; // 0 - 1
}

interface HSVA {
  h: number; // 0 - 360
  s: number; // 0 - 100
  v: number; // 0 - 100
  a: number; // 0 - 1
}

interface CssToken {
  name: string;
  initialValue: string;
  currentValue: string;
}

const SWATCH_STORAGE_KEY = 'dev_theme_inspector_swatches_v2';
const DEFAULT_SWATCHES = ['#0F172A', '#FFFFFF', '#2563EB', '#059669', '#D97706', '#DC2626'];

let sharedProbeCanvas: HTMLCanvasElement | null = null;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// ============================================================================
// 2. COLOR PARSING & FORMAT CONVERSION
// ============================================================================

function getProbeContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!sharedProbeCanvas) {
    sharedProbeCanvas = document.createElement('canvas');
    sharedProbeCanvas.width = 1;
    sharedProbeCanvas.height = 1;
  }
  return sharedProbeCanvas.getContext('2d', { willReadFrequently: true });
}

function parseColor(input: string): RGBA | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Hex (#RGB, #RGBA, #RRGGBB, #RRGGBBAA)
  const hexMatch = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(trimmed);
  if (hexMatch) {
    const raw = hexMatch[1];
    if (raw.length === 3 || raw.length === 4) {
      return {
        r: parseInt(raw[0] + raw[0], 16),
        g: parseInt(raw[1] + raw[1], 16),
        b: parseInt(raw[2] + raw[2], 16),
        a: raw.length === 4 ? parseInt(raw[3] + raw[3], 16) / 255 : 1,
      };
    }
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
      a: raw.length === 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1,
    };
  }

  // 2. rgb() / rgba()
  const rgbMatch =
    /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(
      trimmed
    );
  if (rgbMatch) {
    const r = clamp(Number(rgbMatch[1]), 0, 255);
    const g = clamp(Number(rgbMatch[2]), 0, 255);
    const b = clamp(Number(rgbMatch[3]), 0, 255);
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      a = rgbMatch[4].endsWith('%')
        ? clamp(parseFloat(rgbMatch[4]) / 100, 0, 1)
        : clamp(Number(rgbMatch[4]), 0, 1);
    }
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b) && !Number.isNaN(a)) {
      return { r, g, b, a };
    }
  }

  // 3. Canvas probe fallback for hsl(), hsla(), oklch(), named colors, etc.
  if (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    !CSS.supports('color', trimmed)
  ) {
    return null;
  }
  const ctx = getProbeContext();
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#000000';
  ctx.fillStyle = trimmed;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, alphaByte] = ctx.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: alphaByte / 255 };
}

function toHex({ r, g, b, a }: RGBA): string {
  const hex = (n: number) =>
    clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0').toUpperCase();
  const alpha = a < 0.999 ? hex(a * 255) : '';
  return `#${hex(r)}${hex(g)}${hex(b)}${alpha}`;
}

function toRgbaString({ r, g, b, a }: RGBA): string {
  const rr = Math.round(clamp(r, 0, 255));
  const gg = Math.round(clamp(g, 0, 255));
  const bb = Math.round(clamp(b, 0, 255));
  const aa = Number(clamp(a, 0, 1).toFixed(2));
  return aa >= 1 ? `rgb(${rr}, ${gg}, ${bb})` : `rgba(${rr}, ${gg}, ${bb}, ${aa})`;
}

function toHslaString({ r, g, b, a }: RGBA): string {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }

  const aa = Number(clamp(a, 0, 1).toFixed(2));
  return aa >= 1
    ? `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
    : `hsla(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%, ${aa})`;
}

// Keep full floating-point precision in HSVA so dragging sliders never accumulates rounding drift
function rgbaToHsva({ r, g, b, a }: RGBA): HSVA {
  const rn = clamp(r, 0, 255) / 255;
  const gn = clamp(g, 0, 255) / 255;
  const bn = clamp(b, 0, 255) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return {
    h,
    s: max === 0 ? 0 : (d / max) * 100,
    v: max * 100,
    a: clamp(a, 0, 1),
  };
}

function hsvaToRgba({ h, s, v, a }: HSVA): RGBA {
  const hh = ((h % 360) + 360) % 360;
  const sn = clamp(s, 0, 100) / 100;
  const vn = clamp(v, 0, 100) / 100;
  const c = vn * sn;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vn - c;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hh < 60) [r1, g1, b1] = [c, x, 0];
  else if (hh < 120) [r1, g1, b1] = [x, c, 0];
  else if (hh < 180) [r1, g1, b1] = [0, c, x];
  else if (hh < 240) [r1, g1, b1] = [0, x, c];
  else if (hh < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  return {
    r: (r1 + m) * 255,
    g: (g1 + m) * 255,
    b: (b1 + m) * 255,
    a: clamp(a, 0, 1),
  };
}

// ============================================================================
// 3. ALPHA COMPOSITING & WCAG 2.1 CONTRAST ENGINE
// ============================================================================

/** Porter-Duff "source-over" alpha compositing: places translucent `fg` over opaque `bg`. */
function compositeOver(fg: RGBA, bg: RGB): RGB {
  const a = clamp(fg.a, 0, 1);
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
  };
}

/** WCAG 2.1 sRGB channel linearization (0.04045 threshold). */
function srgbChannelToLinear(channel8Bit: number): number {
  const s = clamp(channel8Bit, 0, 255) / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminanceRgb({ r, g, b }: RGB): number {
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

function wcagContrastRatio(fgOpaque: RGB, bgOpaque: RGB): number {
  const l1 = relativeLuminanceRgb(fgOpaque);
  const l2 = relativeLuminanceRgb(bgOpaque);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Solves for the HSVA color closest to `current` whose alpha-composited contrast
 * against `effectiveBg` best matches `targetRatio` (1.0 .. 21.0).
 */
function solveColorForTargetContrast(
  current: HSVA,
  effectiveBg: RGB,
  targetRatio: number
): HSVA {
  const clampedTarget = clamp(targetRatio, 1, 21);
  let bestHsva = current;
  let bestError = Infinity;
  let bestMoveCost = Infinity;

  const evaluate = (candidate: HSVA) => {
    const compositedFg = compositeOver(hsvaToRgba(candidate), effectiveBg);
    const ratio = wcagContrastRatio(compositedFg, effectiveBg);
    const error = Math.abs(ratio - clampedTarget);
    const moveCost = Math.hypot(candidate.v - current.v, (candidate.s - current.s) * 0.5);

    if (
      error < bestError - 1e-4 ||
      (Math.abs(error - bestError) <= 1e-4 && moveCost < bestMoveCost)
    ) {
      bestError = error;
      bestMoveCost = moveCost;
      bestHsva = candidate;
    }
  };

  // 1. Vary Value (V) across 0..100 while preserving Hue & Saturation
  for (let v = 0; v <= 100; v += 0.5) {
    evaluate({ ...current, v });
  }

  // 2. If saturation caps achievable contrast (e.g., vivid yellow on mid/light tones),
  //    relax Saturation so the full luminance range becomes reachable.
  if (bestError > 0.2) {
    for (let s = current.s; s >= 0; s -= 2) {
      for (let v = 0; v <= 100; v += 1) {
        evaluate({ ...current, s, v });
      }
    }
  }

  return bestHsva;
}

// ============================================================================
// 4. DOM CSS TOKEN SCANNER & BACKDROP DETECTION
// ============================================================================

function detectDocumentBackdrop(): RGB {
  if (typeof document === 'undefined') return { r: 255, g: 255, b: 255 };
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const parsed = parseColor(getComputedStyle(el).backgroundColor);
    if (parsed && parsed.a > 0.05) {
      return compositeOver(parsed, { r: 255, g: 255, b: 255 });
    }
  }
  return { r: 255, g: 255, b: 255 };
}

function isOpaquePageBgToken(name: string): boolean {
  // Matches --bg, --background, --color-bg, --color-background, --surface, --color-surface
  // while excluding component-specific backgrounds like --color-warning-bg
  return /^--(color-|md-sys-color-)?(bg|background|surface)(-primary|-base|-default)?$/i.test(
    name
  );
}

function scanRootColorTokens(prefix: string): CssToken[] {
  const names = new Set<string>();
  const computed = getComputedStyle(document.documentElement);

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules || [])) {
        if (
          rule instanceof CSSStyleRule &&
          (rule.selectorText.includes(':root') || rule.selectorText === 'html')
        ) {
          for (const prop of Array.from(rule.style)) {
            if (prop.startsWith(prefix)) names.add(prop);
          }
        }
      }
    } catch {
      // Cross-origin stylesheet ignored
    }
  }

  for (const prop of Array.from(document.documentElement.style)) {
    if (prop.startsWith(prefix)) names.add(prop);
  }

  const result: CssToken[] = [];
  for (const name of names) {
    const value = computed.getPropertyValue(name).trim();
    if (value && parseColor(value)) {
      result.push({ name, initialValue: value, currentValue: value });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// 5. MAIN INSPECTOR COMPONENT
// ============================================================================

export const ThemeTokenInspector: React.FC = () => {
  const [minimized, setMinimized] = useState(false);
  const [tokens, setTokens] = useState<CssToken[]>([]);
  const [selectedName, setSelectedName] = useState('');
  const [bgTokenName, setBgTokenName] = useState(themeConfig.defaultReferenceBgToken);
  const [customBackdrop, setCustomBackdrop] = useState<RGB | null>(null);
  const [filter, setFilter] = useState('');
  const [format, setFormat] = useState<'HEX' | 'RGBA' | 'HSLA'>('HEX');
  const [hsva, setHsva] = useState<HSVA>({ h: 221, s: 83, v: 92, a: 1 });
  const [textInput, setTextInput] = useState('#2563EB');
  const [copied, setCopied] = useState(false);
  const [sliderTarget, setSliderTarget] = useState<number>(4.5);
  const [swatches, setSwatches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(SWATCH_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as string[]) : DEFAULT_SWATCHES;
    } catch {
      return DEFAULT_SWATCHES;
    }
  });

  const [pos, setPos] = useState({ x: 24, y: 24 });
  const dragModeRef = useRef<'window' | 'sv' | null>(null);
  const winOffsetRef = useRef({ x: 0, y: 0 });
  const svBoxRef = useRef<HTMLDivElement | null>(null);
  const isSlidingContrastRef = useRef(false);
  const hsvaRef = useRef(hsva);
  const selectedNameRef = useRef(selectedName);
  const bgTokenNameRef = useRef(bgTokenName);

  useEffect(() => {
    hsvaRef.current = hsva;
    selectedNameRef.current = selectedName;
    bgTokenNameRef.current = bgTokenName;
  }, [hsva, selectedName, bgTokenName]);

  const formatRgba = useCallback(
    (rgba: RGBA, mode = format) =>
      mode === 'HEX' ? toHex(rgba) : mode === 'RGBA' ? toRgbaString(rgba) : toHslaString(rgba),
    [format]
  );

  const refreshTokens = useCallback(() => {
    const found = scanRootColorTokens(themeConfig.tokenPrefixFilter);
    setTokens(found);
    if (found.length > 0) {
      const current = found.find((t) => t.name === selectedNameRef.current) ?? found[0];
      setSelectedName(current.name);
      const parsed = parseColor(current.currentValue);
      if (parsed) {
        setHsva(rgbaToHsva(parsed));
        setTextInput(current.currentValue);
      }
      if (!found.some((t) => t.name === bgTokenNameRef.current)) {
        const fallbackBg =
          found.find((t) => isOpaquePageBgToken(t.name))?.name ?? found[0].name;
        setBgTokenName(fallbackBg);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) refreshTokens();
    });
    return () => {
      active = false;
    };
  }, [refreshTokens]);

  const commitColor = useCallback(
    (tokenName: string, nextHsva: HSVA, rawText?: string) => {
      setHsva(nextHsva);
      const formatted = rawText ?? formatRgba(hsvaToRgba(nextHsva));
      setTextInput(formatted);
      document.documentElement.style.setProperty(tokenName, formatted);
      setTokens((prev) =>
        prev.map((t) => (t.name === tokenName ? { ...t, currentValue: formatted } : t))
      );
    },
    [formatRgba]
  );

  const updateSvAtClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      const box = svBoxRef.current;
      const targetToken = selectedNameRef.current;
      if (!box || !targetToken) return;
      const rect = box.getBoundingClientRect();
      const s = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
      const v = clamp(100 - ((clientY - rect.top) / rect.height) * 100, 0, 100);
      commitColor(targetToken, { ...hsvaRef.current, s, v });
    },
    [commitColor]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragModeRef.current === 'sv') {
        updateSvAtClientPoint(e.clientX, e.clientY);
      } else if (dragModeRef.current === 'window') {
        setPos({
          x: clamp(e.clientX - winOffsetRef.current.x, 8, window.innerWidth - 360),
          y: clamp(e.clientY - winOffsetRef.current.y, 8, window.innerHeight - 56),
        });
      }
    };
    const onUp = () => {
      dragModeRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [updateSvAtClientPoint]);

  const handleSelectToken = (token: CssToken) => {
    setSelectedName(token.name);
    const parsed = parseColor(token.currentValue);
    if (parsed) {
      setHsva(rgbaToHsva(parsed));
      setTextInput(formatRgba(parsed));
    }

    // Auto-pair *-text / *-fg tokens with their matching *-bg / *-surface sibling if present
    const matchingBg = token.name.replace(/-(text|fg|foreground)$/i, '-bg');
    if (matchingBg !== token.name && tokens.some((t) => t.name === matchingBg)) {
      setBgTokenName(matchingBg);
    }
  };

  const handleCycleFormat = () => {
    const next = format === 'HEX' ? 'RGBA' : format === 'RGBA' ? 'HSLA' : 'HEX';
    setFormat(next);
    setTextInput(formatRgba(hsvaToRgba(hsva), next));
  };

  const handleEyeDropper = async (target: 'token' | 'backdrop') => {
    const EyeDropperCtor = (
      window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }
    ).EyeDropper;
    if (!EyeDropperCtor) return;
    try {
      const { sRGBHex } = await new EyeDropperCtor().open();
      const parsed = parseColor(sRGBHex);
      if (!parsed) return;
      if (target === 'backdrop') {
        setCustomBackdrop({ r: parsed.r, g: parsed.g, b: parsed.b });
      } else if (selectedName) {
        commitColor(selectedName, rgbaToHsva(parsed));
      }
    } catch {
      // Dismissed by user
    }
  };

  const handleSaveSwatch = () => {
    const hex = toHex(hsvaToRgba(hsva));
    setSwatches((prev) => {
      const next = [hex, ...prev.filter((c) => c !== hex)].slice(0, 16);
      try {
        localStorage.setItem(SWATCH_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage quota/privacy mode ignored
      }
      return next;
    });
  };

  // --- 3-LAYER ALPHA COMPOSITING CHAIN ---
  // Layer 1 (Base): Page backdrop (sampled via eyedropper, page bg token, or computed body bg)
  const backdropRgb: RGB = useMemo(() => {
    if (customBackdrop) return customBackdrop;
    const pageBg = tokens.find((t) => isOpaquePageBgToken(t.name));
    const parsed = pageBg ? parseColor(pageBg.currentValue) : null;
    if (parsed && parsed.a > 0.95) {
      return { r: parsed.r, g: parsed.g, b: parsed.b };
    }
    return detectDocumentBackdrop();
  }, [tokens, customBackdrop]);

  // Layer 2 (Middle): Selected "Against" surface token composited over Base backdrop
  const effectiveBgRgb: RGB = useMemo(() => {
    const bgToken = tokens.find((t) => t.name === bgTokenName);
    const parsedBg = bgToken ? parseColor(bgToken.currentValue) : null;
    if (!parsedBg) return backdropRgb;
    return compositeOver(parsedBg, backdropRgb);
  }, [tokens, bgTokenName, backdropRgb]);

  // Layer 3 (Top): Selected foreground token composited over Effective Background
  const currentRgba = useMemo(() => hsvaToRgba(hsva), [hsva]);
  const effectiveFgRgb: RGB = useMemo(
    () => compositeOver(currentRgba, effectiveBgRgb),
    [currentRgba, effectiveBgRgb]
  );

  const ratio = useMemo(
    () => wcagContrastRatio(effectiveFgRgb, effectiveBgRgb),
    [effectiveFgRgb, effectiveBgRgb]
  );

  const passesAA = ratio >= 4.5;
  const passesAALarge = ratio >= 3.0;
  const passesAAA = ratio >= 7.0;

  useEffect(() => {
    if (!isSlidingContrastRef.current) {
      setSliderTarget(Number(clamp(ratio, 1, 21).toFixed(1)));
    }
  }, [selectedName, bgTokenName, ratio]);

  const handleContrastSliderChange = (nextTarget: number) => {
    setSliderTarget(nextTarget);
    if (!selectedName) return;
    const solved = solveColorForTargetContrast(hsva, effectiveBgRgb, nextTarget);
    commitColor(selectedName, solved);
  };

  const handleCopyRoot = async () => {
    const css = `:root {\n${tokens.map((t) => `  ${t.name}: ${t.currentValue};`).join('\n')}\n}`;
    await navigator.clipboard?.writeText(css);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const handleReset = () => {
    setCustomBackdrop(null);
    for (const t of tokens) {
      document.documentElement.style.setProperty(t.name, t.initialValue);
    }
    refreshTokens();
  };

  const visibleTokens = useMemo(
    () => tokens.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase())),
    [tokens, filter]
  );

  const supportsEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          zIndex: 2147483647,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 14px',
          borderRadius: 999,
          border: '1px solid #3f3f46',
          background: '#18181b',
          color: '#f4f4f5',
          font: '600 12px/1 system-ui, sans-serif',
          boxShadow: '0 10px 28px rgba(0,0,0,.4)',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background:
              'conic-gradient(#ef4444, #eab308, #22c55e, #06b6d4, #3b82f6, #ec4899, #ef4444)',
          }}
        />
        Tokens ({tokens.length})
      </button>
    );
  }

  return (
    <aside
      aria-label="CSS Token and WCAG Contrast Inspector"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: 356,
        maxHeight: '88vh',
        zIndex: 2147483647,
        display: 'flex',
        flexDirection: 'column',
        background: '#18181b',
        color: '#e4e4e7',
        border: '1px solid #27272a',
        borderRadius: 10,
        boxShadow: '0 18px 44px rgba(0,0,0,.55)',
        font: '400 12px/1.4 system-ui, -apple-system, sans-serif',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      <div
        onPointerDown={(e) => {
          dragModeRef.current = 'window';
          winOffsetRef.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '9px 12px',
          background: '#222226',
          borderBottom: '1px solid #27272a',
          cursor: 'grab',
        }}
      >
        <strong style={{ fontSize: 12, fontWeight: 600 }}>⋮⋮ Token &amp; WCAG Inspector</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={handleCopyRoot} style={btnStyle}>
            {copied ? 'Copied' : 'Copy :root'}
          </button>
          <button type="button" onClick={handleReset} style={btnStyle}>
            Reset
          </button>
          <button type="button" onClick={() => setMinimized(true)} style={btnStyle} aria-label="Minimize">
            —
          </button>
        </div>
      </div>

      <div style={{ padding: 12, borderBottom: '1px solid #27272a', background: '#1b1b1f' }}>
        <div
          ref={svBoxRef}
          onPointerDown={(e) => {
            dragModeRef.current = 'sv';
            updateSvAtClientPoint(e.clientX, e.clientY);
          }}
          style={{
            position: 'relative',
            height: 124,
            borderRadius: 6,
            marginBottom: 10,
            cursor: 'crosshair',
            backgroundColor: `hsl(${hsva.h}, 100%, 50%)`,
            backgroundImage:
              'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)',
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: `${hsva.s}%`,
              top: `${100 - hsva.v}%`,
              width: 12,
              height: 12,
              borderRadius: '50%',
              border: '2px solid #fff',
              boxShadow: '0 0 2px rgba(0,0,0,.85)',
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          {supportsEyeDropper && (
            <button
              type="button"
              onClick={() => handleEyeDropper('token')}
              title="Sample color into selected token"
              style={{ ...btnStyle, width: 28, height: 28, padding: 0 }}
            >
              💧
            </button>
          )}
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '2px solid #3f3f46',
              background: toRgbaString(currentRgba),
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              type="range"
              aria-label="Hue"
              min={0}
              max={360}
              value={hsva.h}
              onChange={(e) =>
                selectedName && commitColor(selectedName, { ...hsva, h: Number(e.target.value) })
              }
              style={{
                width: '100%',
                height: 10,
                borderRadius: 5,
                appearance: 'none',
                cursor: 'pointer',
                background:
                  'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
              }}
            />
            <input
              type="range"
              aria-label="Alpha"
              min={0}
              max={1}
              step={0.01}
              value={hsva.a}
              onChange={(e) =>
                selectedName && commitColor(selectedName, { ...hsva, a: Number(e.target.value) })
              }
              style={{
                width: '100%',
                height: 10,
                borderRadius: 5,
                appearance: 'none',
                cursor: 'pointer',
                background: `linear-gradient(to right, transparent, ${toHex({ ...currentRgba, a: 1 })})`,
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            type="text"
            aria-label="Color value"
            value={textInput}
            onChange={(e) => {
              const raw = e.target.value;
              setTextInput(raw);
              const parsed = parseColor(raw);
              if (parsed && selectedName) commitColor(selectedName, rgbaToHsva(parsed), raw);
            }}
            style={inputStyle}
          />
          <button type="button" onClick={handleCycleFormat} style={btnStyle}>
            {format}
          </button>
          <button type="button" onClick={handleSaveSwatch} style={btnStyle}>
            + Swatch
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
          {swatches.map((hex) => (
            <button
              key={hex}
              type="button"
              title={hex}
              onClick={() => {
                const parsed = parseColor(hex);
                if (parsed && selectedName) commitColor(selectedName, rgbaToHsva(parsed));
              }}
              style={{
                width: 18,
                height: 18,
                padding: 0,
                borderRadius: 4,
                background: hex,
                border: '1px solid rgba(255,255,255,.25)',
                cursor: 'pointer',
              }}
            />
          ))}
        </div>

        {/* WCAG CONTRAST PANEL WITH ALPHA-COMPOSITING PREVIEW */}
        <div
          style={{
            padding: 8,
            borderRadius: 6,
            background: '#141417',
            border: '1px solid #27272a',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ color: '#a1a1aa', fontSize: 11 }}>Against:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                title={`Composited surface: ${toRgbaString({ ...effectiveBgRgb, a: 1 })}`}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: toRgbaString({ ...effectiveBgRgb, a: 1 }),
                  border: '1px solid rgba(255,255,255,.3)',
                }}
              />
              <select
                aria-label="Reference background token"
                value={bgTokenName}
                onChange={(e) => setBgTokenName(e.target.value)}
                style={{
                  maxWidth: 165,
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: '1px solid #3f3f46',
                  background: '#27272a',
                  color: '#f4f4f5',
                  fontSize: 11,
                }}
              >
                {tokens.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
              {supportsEyeDropper && (
                <button
                  type="button"
                  onClick={() => handleEyeDropper('backdrop')}
                  title="Eyedrop actual base surface behind translucent tokens"
                  style={{ ...btnStyle, padding: '2px 5px', fontSize: 10 }}
                >
                  Base 💧
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <strong style={{ fontSize: 13 }}>{ratio.toFixed(2)}:1</strong>
              <span style={pillStyle(passesAA)}>AA {passesAA ? '✓' : '✕'}</span>
              <span style={pillStyle(passesAALarge)}>3:1 {passesAALarge ? '✓' : '✕'}</span>
              <span style={pillStyle(passesAAA)}>AAA {passesAAA ? '✓' : '✕'}</span>
            </div>
            {!passesAA && (
              <button
                type="button"
                onClick={() => handleContrastSliderChange(4.55)}
                style={{
                  ...btnStyle,
                  background: '#2563eb',
                  borderColor: '#2563eb',
                  color: '#fff',
                  fontWeight: 600,
                }}
              >
                Fix AA
              </button>
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#a1a1aa' }}>
            <span style={{ whiteSpace: 'nowrap' }}>Target ratio ({sliderTarget.toFixed(1)}):</span>
            <input
              type="range"
              min={1}
              max={21}
              step={0.1}
              value={sliderTarget}
              onPointerDown={() => {
                isSlidingContrastRef.current = true;
              }}
              onPointerUp={() => {
                isSlidingContrastRef.current = false;
                setSliderTarget(Number(clamp(ratio, 1, 21).toFixed(1)));
              }}
              onChange={(e) => handleContrastSliderChange(Number(e.target.value))}
              style={{ flex: 1, cursor: 'pointer' }}
            />
          </label>
        </div>
      </div>

      <div style={{ padding: '8px 12px', borderBottom: '1px solid #27272a' }}>
        <input
          type="text"
          placeholder="Filter tokens (e.g. --primary)..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
        {visibleTokens.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: '#71717a' }}>
            No CSS color variables found.
          </div>
        ) : (
          visibleTokens.map((token) => {
            const active = token.name === selectedName;
            const parsed = parseColor(token.currentValue);
            const itemRatio = parsed
              ? wcagContrastRatio(compositeOver(parsed, effectiveBgRgb), effectiveBgRgb)
              : 1;

            return (
              <div
                key={token.name}
                onClick={() => handleSelectToken(token)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 6,
                  marginBottom: 2,
                  cursor: 'pointer',
                  background: active ? '#27272a' : 'transparent',
                }}
              >
                <span
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: 4,
                    background: token.currentValue,
                    border: '1px solid rgba(255,255,255,.22)',
                    flexShrink: 0,
                  }}
                />
                <span
                  title={token.name}
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 11,
                    color: active ? '#fff' : '#d4d4d8',
                  }}
                >
                  {token.name}
                </span>
                <span style={pillStyle(itemRatio >= 4.5)}>{itemRatio.toFixed(1)}</span>
                <input
                  type="text"
                  aria-label={`${token.name} value`}
                  value={token.currentValue}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectToken(token);
                  }}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    document.documentElement.style.setProperty(token.name, nextVal);
                    setTokens((prev) =>
                      prev.map((t) => (t.name === token.name ? { ...t, currentValue: nextVal } : t))
                    );
                    const p = parseColor(nextVal);
                    if (p) {
                      setHsva(rgbaToHsva(p));
                      setTextInput(nextVal);
                    }
                  }}
                  style={{ ...inputStyle, width: 88, padding: '2px 6px', fontSize: 10 }}
                />
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

const btnStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 4,
  border: '1px solid #3f3f46',
  background: '#27272a',
  color: '#e4e4e7',
  fontSize: 11,
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  width: '100%',
  boxSizing: 'border-box',
  padding: '5px 8px',
  borderRadius: 4,
  border: '1px solid #3f3f46',
  background: '#111114',
  color: '#f4f4f5',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
};

const pillStyle = (ok: boolean): React.CSSProperties => ({
  padding: '1px 5px',
  borderRadius: 4,
  fontSize: 10,
  fontWeight: 600,
  background: ok ? 'rgba(16, 185, 129, 0.16)' : 'rgba(239, 68, 68, 0.16)',
  color: ok ? '#34d399' : '#f87171',
});