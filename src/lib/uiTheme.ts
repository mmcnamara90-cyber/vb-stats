// Device-level look preferences — not shared coaching data, so these live in
// localStorage (like the mobile-view toggles) rather than Supabase. Applied
// as data-attributes on <html>; see src/index.css for the CSS custom
// properties each attribute value swaps.

export type SiteTheme = 'default' | 'ocean';
export type StatTheme = 'classic' | 'colorblind';

const SITE_THEME_KEY = 'vb-stats-site-theme';
const STAT_THEME_KEY = 'vb-stats-stat-theme';

export const SITE_THEMES: { id: SiteTheme; label: string }[] = [
  { id: 'default', label: 'Current (Indigo)' },
  { id: 'ocean', label: 'Ocean' },
];

export const STAT_THEMES: { id: StatTheme; label: string }[] = [
  { id: 'classic', label: 'Classic' },
  { id: 'colorblind', label: 'Colorblind-Safe' },
];

export function readStoredSiteTheme(): SiteTheme {
  try {
    return localStorage.getItem(SITE_THEME_KEY) === 'ocean' ? 'ocean' : 'default';
  } catch {
    return 'default';
  }
}

export function readStoredStatTheme(): StatTheme {
  try {
    return localStorage.getItem(STAT_THEME_KEY) === 'colorblind' ? 'colorblind' : 'classic';
  } catch {
    return 'classic';
  }
}

export function applySiteTheme(theme: SiteTheme): void {
  document.documentElement.dataset.siteTheme = theme;
  try {
    localStorage.setItem(SITE_THEME_KEY, theme);
  } catch {
    // ignore
  }
}

export function applyStatTheme(theme: StatTheme): void {
  document.documentElement.dataset.statTheme = theme;
  try {
    localStorage.setItem(STAT_THEME_KEY, theme);
  } catch {
    // ignore
  }
}
