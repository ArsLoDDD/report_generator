const ukrainianNumericCollator = new Intl.Collator("uk-UA", {
  numeric: true,
  sensitivity: "base",
});

export function compareNatural(left: string | number, right: string | number) {
  return ukrainianNumericCollator.compare(String(left), String(right));
}

export function byNumber<T>(selector: (item: T) => string | number) {
  return (left: T, right: T) => compareNatural(selector(left), selector(right));
}

export function sortedByNumber<T>(items: readonly T[], selector: (item: T) => string | number) {
  return [...items].sort(byNumber(selector));
}
