import type { Player, Position, RosterCandidate, Skill } from '../../types';
import { POSITION_LABELS } from './skills';
import { PositionBadges } from './PositionBadges';
import { overallAvgFromSkills } from './composite';
import { RADAR_AXES, RADAR_AXIS_LABELS, skillAveragesToRadarProfile } from './radar';
import { RadarChart } from './RadarChart';

export function CandidateComparisonModal({
  position,
  candidates,
  playersById,
  skillsByPlayer,
  onClose,
}: {
  position: Position;
  candidates: RosterCandidate[];
  playersById: Map<string, Player>;
  skillsByPlayer: Map<string, Partial<Record<Skill, number>>>;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Comparing {POSITION_LABELS[position]} Candidates</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 px-4 rounded-lg border border-gray-300 text-base font-medium text-gray-700 active:bg-gray-100"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {candidates.map((candidate) => {
            const player = playersById.get(candidate.playerId);
            if (!player) return null;
            const bySkill = skillsByPlayer.get(player.id) ?? {};
            const profile = skillAveragesToRadarProfile(bySkill);
            const avg = overallAvgFromSkills(bySkill);

            return (
              <div key={candidate.id} className="rounded-lg border border-gray-200 p-3">
                <div className="mb-1">
                  <p className="font-semibold text-gray-900">
                    {player.firstName} {player.lastName}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <PositionBadges positions={player.positions} />
                    <span className="text-xs text-gray-500">
                      {avg != null ? `Overall avg ${avg.toFixed(1)}` : 'No scores yet'}
                    </span>
                  </div>
                </div>

                <RadarChart profile={profile} label={`${player.firstName} ${player.lastName}`} />

                <table className="w-full text-xs mt-2">
                  <tbody>
                    {RADAR_AXES.map((axis) => (
                      <tr key={axis} className="border-t border-gray-100">
                        <td className="py-1 text-gray-500">{RADAR_AXIS_LABELS[axis]}</td>
                        <td className="py-1 text-right font-medium text-gray-900">
                          {profile[axis] != null ? profile[axis]!.toFixed(1) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
