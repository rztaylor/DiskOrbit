export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes < 1000) {
    return `${bytes.toLocaleString()} B`;
  }
  const units = ["kB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1000;
    unit += 1;
  } while (value >= 1000 && unit < units.length - 1);
  return `${value.toLocaleString(undefined, { maximumFractionDigits: value >= 100 ? 0 : value >= 10 ? 1 : 2 })} ${units[unit]}`;
}

export function formatCount(value: number): string {
  return value.toLocaleString();
}

export function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function formatPercent(part: number, whole: number): string {
  if (whole <= 0) {
    return "0%";
  }
  const percentage = (part / whole) * 100;
  return `${percentage.toLocaleString(undefined, { maximumFractionDigits: percentage < 1 ? 2 : 1 })}%`;
}
