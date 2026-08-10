import { useState } from 'react';
import type { Player, Skill } from '../../types';
import { RADAR_AXES, RADAR_AXIS_LABELS, skillAveragesToRadarProfile } from './radar';
import { RadarChart } from './RadarChart';

// Small "📊" icon button that opens a compact modal with a player's 5-axis
// radar chart — lets a coach check a profile without leaving the page
// they're on (bench list, court cell, subs list, ...).
export function PlayerRadarPopover({
  player,
  bySkill,
}: {
  player: Player;
  bySkill: Partial<Record<Skill, number>>;
}) {
  const [open, setOpen] = useState(false);
  const profile = skillAveragesToRadarProfile(bySkill);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`${player.firstName} ${player.lastName}'s 5-point profile`}
        className="min-h-9 min-w-9 shrink-0 rounded-lg border border-gray-200 text-base leading-none active:bg-gray-100"
      >
        📊
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-gray-900">
                {player.firstName} {player.lastName}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-9 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 active:bg-gray-100"
              >
                Close
              </button>
            </div>

            <RadarChart profile={profile} label={`${player.firstName} ${player.lastName}`} />

            <table className="w-full text-xs mt-2">
              <tbody>
                {RADAR_AXES.map((axis) => {
                  const value = profile[axis];
                  return (
                    <tr key={axis} className="border-t border-gray-100">
                      <td className="py-1 text-gray-500">{RADAR_AXIS_LABELS[axis]}</td>
                      <td className="py-1 text-right font-medium text-gray-900">
                        {value != null ? value.toFixed(1) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
