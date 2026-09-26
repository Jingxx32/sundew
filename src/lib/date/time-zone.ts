export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function partsAt(date: Date, timeZone: string): DateParts {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]),
  );
  return values as DateParts;
}

export function zonedDateKey(date: Date, timeZone: string): string {
  const { year, month, day } = partsAt(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function offsetAt(date: Date, timeZone: string): number {
  const p = partsAt(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - date.getTime();
}

export function zonedStartOfDay(dateKey: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day));
  let result = new Date(guess.getTime() - offsetAt(guess, timeZone));
  result = new Date(guess.getTime() - offsetAt(result, timeZone));
  return result;
}

export function addCalendarDays(dateKey: string, amount: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function startOfLocalWeek(dateKey: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return zonedStartOfDay(addCalendarDays(dateKey, mondayOffset), timeZone);
}

export function calendarDayDifference(fromDateKey: string, toDateKey: string): number {
  const toUtc = Date.parse(`${toDateKey}T00:00:00Z`);
  const fromUtc = Date.parse(`${fromDateKey}T00:00:00Z`);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}
