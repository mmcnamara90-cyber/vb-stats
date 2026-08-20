// Shared building blocks between the Game Day Live tab (LiveStatsTab.tsx)
// and the Practice tracking tab (PracticeTrackTab.tsx) — filled,
// high-contrast buttons tuned for fast scanning during live tapping.
// Serve-receive ratings are color-coded by quality (0 = bad, 3 = perfect),
// matching the common coaching-scoresheet convention.
//
// Colors are the `stat-*` tokens (src/index.css), not literal Tailwind
// palette classes — they resolve through CSS custom properties swapped by
// Settings > Preferences > "Stat colors" (see src/lib/uiTheme.ts), so
// don't replace these with hardcoded `bg-rose-600` etc. or the toggle stops
// doing anything here.
export const SR_RATINGS = [0, 1, 2, 3] as const;
export const SR_RATING_COLOR_CLASSES: Record<(typeof SR_RATINGS)[number], string> = {
  0: 'bg-stat-sr0 text-stat-sr0-fg active:bg-stat-sr0-active',
  1: 'bg-stat-sr1 text-stat-sr1-fg active:bg-stat-sr1-active',
  2: 'bg-stat-sr2 text-stat-sr2-fg active:bg-stat-sr2-active',
  3: 'bg-stat-sr3 text-stat-sr3-fg active:bg-stat-sr3-active',
};

export function StatButton({
  label,
  count,
  onClick,
  color,
  large,
  stack,
}: {
  label: string;
  count: number;
  onClick: () => void;
  color: 'gray' | 'green' | 'red';
  large?: boolean;
  stack?: boolean;
}) {
  const colorClasses: Record<typeof color, string> = {
    gray: 'bg-slate-600 active:bg-slate-700', // neutral — not part of the swappable stat-quality system
    green: 'bg-stat-kill active:bg-stat-kill-active',
    red: 'bg-stat-error active:bg-stat-error-active',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${stack ? 'w-full' : 'flex-1'} rounded-md font-semibold text-white ${colorClasses[color]} ${
        large ? 'min-h-14 text-base' : 'min-h-9 text-xs'
      }`}
    >
      {label} <span className={large ? 'font-extrabold text-lg' : 'font-bold'}>{count}</span>
    </button>
  );
}
