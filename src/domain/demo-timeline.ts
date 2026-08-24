function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function endOfWageMonth(wageMonth: string) {
  const [year, month] = wageMonth.split("-").map(Number);
  return isoDate(new Date(Date.UTC(year, month, 0)));
}

export function addCalendarMonthsClamped(dateValue: string, months: number) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const targetMonthIndex = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  return isoDate(new Date(Date.UTC(targetYear, targetMonthIndex, Math.min(day, lastDay))));
}

export function addMinutes(timestamp: string, minutes: number) {
  return new Date(new Date(timestamp).getTime() + minutes * 60_000).toISOString();
}

export function formatDemoDate(dateValue: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${dateValue}T00:00:00.000Z`));
}
