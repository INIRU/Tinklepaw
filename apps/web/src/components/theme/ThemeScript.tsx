import React from 'react';

export default function ThemeScript() {
  // Set data-theme before paint to avoid FOUC.
  const code = `(() => {
  try {
    const saved = localStorage.getItem('bangul-theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved === 'light' || saved === 'dark' ? saved : (prefersDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
  } catch {}
})();`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
