// Location: src/dev-tools/bootstrap.ts

import { themeConfig } from '../theme';

let mounted = false;

export async function initTokenInspector(): Promise<void> {
  if (!themeConfig.enableTokenInspector || mounted || typeof document === 'undefined') {
    return;
  }
  mounted = true;

  const [{ createRoot }, { ThemeTokenInspector }] = await Promise.all([
    import('react-dom/client'),
    import('./ThemeTokenInspector'),
  ]);

  const container = document.createElement('div');
  container.id = '__dev_theme_token_inspector_root__';
  container.setAttribute('data-dev-tool', 'true');
  document.body.appendChild(container);

  const React = await import('react');
  createRoot(container).render(React.createElement(ThemeTokenInspector));
}

// Auto-run when imported if enabled
void initTokenInspector();