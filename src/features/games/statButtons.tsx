// Shared building blocks between the Game Day Live tab (LiveStatsTab.tsx)
// and the Practice tracking tab (PracticeTrackTab.tsx) — filled,
// high-contrast buttons tuned for fast scanning during live tapping.
// Serve-receive ratings are color-coded by quality (0 = bad, 3 = perfect),
// matching the common coaching-scoresheet convention.
export const SR_RATINGS = [0, 1, 2, 3] as const;
export const SR_RATING_COLOR_CLASSES: Record<(typeof SR_RATINGS)[number], string> = {
  0: 'bg-rose-600 text-white active:bg-rose-700',
  1: 'bg-orange-500 text-white active:bg-orange-600',
  2: 'bg-amber-400 text-gray-900 active:bg-amber-500',
  3: 'bg-emerald-600 text-white active:bg-emerald-700',
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
    gray: 'bg-slate-600 active:bg-slate-700',
    green: 'bg-emerald-600 active:bg-emerald-700',
    red: 'bg-rose-600 active:bg-rose-700',
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
