export function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * 60_000);
}

export function addHours(date, hours) {
  return new Date(new Date(date).getTime() + hours * 3_600_000);
}

export function isAfter(a, b) {
  return new Date(a).getTime() > new Date(b).getTime();
}
