export function includesSearch(query: string, ...values: string[]) {
  const normalizedQuery = query.trim().toLocaleLowerCase("uk-UA");
  return !normalizedQuery || values.some((value) => value.toLocaleLowerCase("uk-UA").includes(normalizedQuery));
}
