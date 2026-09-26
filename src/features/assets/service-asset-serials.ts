export const splitSerialNumbers = (value: string) => [
  ...new Set(value.split(/[\n,;]+/u).map((item) => item.trim()).filter(Boolean)),
];

export const expandSerialRange = (start: string, end: string) => {
  const left = start.trim();
  const right = end.trim();
  if (!left || !right) throw new Error("Вкажіть початковий і кінцевий серійні номери.");

  let prefix = 0;
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < left.length - prefix && suffix < right.length - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix += 1;

  const leftNumber = left.slice(prefix, left.length - suffix || undefined);
  const rightNumber = right.slice(prefix, right.length - suffix || undefined);
  if (!/^\d+$/u.test(leftNumber) || !/^\d+$/u.test(rightNumber)) {
    throw new Error("У діапазоні повинна змінюватися одна числова частина, а текст до і після неї — збігатися.");
  }
  const first = Number(leftNumber);
  const last = Number(rightNumber);
  if (last < first) throw new Error("Кінцевий номер не може бути меншим за початковий.");
  if (last - first + 1 > 500) throw new Error("За один раз можна додати не більше 500 серійних номерів.");

  const width = Math.max(leftNumber.length, rightNumber.length);
  const ending = suffix ? left.slice(left.length - suffix) : "";
  return Array.from(
    { length: last - first + 1 },
    (_, index) => `${left.slice(0, prefix)}${String(first + index).padStart(width, "0")}${ending}`,
  );
};
