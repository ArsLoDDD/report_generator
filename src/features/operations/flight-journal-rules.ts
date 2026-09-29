export const strikeUavTypes = ["Літаковий ударний", "ФПВ", "Бомбер", "ФПВ перехоплювач", "Коптер"] as const;

export function isStrikeUavType(value: string) {
  const normalized = value.trim().toLocaleLowerCase("uk");
  return strikeUavTypes.some((type) => type.toLocaleLowerCase("uk") === normalized);
}

export function isFpvUavType(value: string) {
  return value.trim().toLocaleLowerCase("uk").includes("фпв");
}

export function currentTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
