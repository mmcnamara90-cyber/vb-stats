export function PlayerSearchInput({
  value,
  onChange,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search name, grade, or position…"
      className={`min-h-11 w-full rounded-lg border border-gray-300 px-3 text-base focus:border-brand-indigo focus:outline-none ${className}`}
    />
  );
}
