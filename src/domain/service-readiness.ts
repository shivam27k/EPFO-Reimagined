import type { MemberSnapshot } from "./member-snapshot";

const DEMO_REFERENCE_DATE = "2026-08-22";

function completedMonthsBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  let months = (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12
    + endDate.getUTCMonth() - startDate.getUTCMonth();
  if (endDate.getUTCDate() < startDate.getUTCDate()) months -= 1;
  return Math.max(0, months);
}

export function recordedServiceMonths(snapshot: MemberSnapshot) {
  return snapshot.employments.reduce((total, employment) => {
    const end = employment.exitedAt ?? DEMO_REFERENCE_DATE;
    return total + completedMonthsBetween(employment.joinedAt, end);
  }, 0);
}

export function memberAge(dateOfBirth: string) {
  return Math.floor(completedMonthsBetween(dateOfBirth, DEMO_REFERENCE_DATE) / 12);
}

export function postedContributionSummary(snapshot: MemberSnapshot) {
  const posted = snapshot.contributions.filter((row) => row.postingStatus === "POSTED");
  const monthIndexes = Array.from(new Set(posted.map((row) => {
    const [year, month] = row.wageMonth.split("-").map(Number);
    return year * 12 + month - 1;
  }))).filter(Number.isFinite).sort((left, right) => left - right);
  let consecutivePostedMonths = monthIndexes.length > 0 ? 1 : 0;
  let currentRun = consecutivePostedMonths;
  for (let index = 1; index < monthIndexes.length; index += 1) {
    currentRun = monthIndexes[index] === monthIndexes[index - 1] + 1 ? currentRun + 1 : 1;
    consecutivePostedMonths = Math.max(consecutivePostedMonths, currentRun);
  }
  const employeeShare = posted.reduce((sum, row) => sum + row.employeeEpf, 0);
  const totalEpf = posted.reduce((sum, row) => sum + row.employeeEpf + row.employerEpf, 0);
  const latest = posted[0];
  const combinedMonthlyContribution = latest
    ? latest.employeeEpf + latest.employerEpf + latest.employerEps
    : 0;
  const inferredMonthlyEpfWage = Math.round(combinedMonthlyContribution / 0.24);

  return {
    postedMonths: new Set(posted.map((row) => row.wageMonth)).size,
    consecutivePostedMonths,
    employeeShare,
    totalEpf,
    inferredMonthlyEpfWage,
  };
}

export function formatRupees(amountInPaise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amountInPaise / 100);
}

export const demoReferenceDate = DEMO_REFERENCE_DATE;
