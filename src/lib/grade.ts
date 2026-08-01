// Player.gradYear stores the stable fact (a graduation year never changes).
// Grade level (9th-12th) is presentation only, computed relative to "today"
// so it advances automatically each fall without anyone having to edit it.

function twelfthGradYearFor(today: Date): number {
  const schoolYearStartYear = today.getMonth() >= 6 ? today.getFullYear() : today.getFullYear() - 1;
  return schoolYearStartYear + 1;
}

export function gradeToGradYear(gradeNum: number, today = new Date()): number {
  return twelfthGradYearFor(today) + (12 - gradeNum);
}

export function gradYearToGrade(gradYear: number, today = new Date()): number {
  return 12 - (gradYear - twelfthGradYearFor(today));
}

export const GRADE_OPTIONS = [9, 10, 11, 12];

export function gradeLabel(gradeNum: number): string {
  if (gradeNum > 12) return 'Graduated';
  if (gradeNum < 9) return `${gradeNum}th (below HS)`;
  return `${gradeNum}th`;
}
