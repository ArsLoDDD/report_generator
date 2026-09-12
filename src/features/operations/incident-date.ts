export function incidentDateTimeParts(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return match
    ? { date: `${match[3]}.${match[2]}.${match[1]}`, time: `${match[4]}:${match[5]}` }
    : { date: value || "—", time: "—" };
}
