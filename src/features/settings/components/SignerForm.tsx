import { Pencil } from "lucide-react";

type Props = { number: number; role: string; name: string; rank: string; position: string; mark: string };

/** Reused signer card for main signer, commander, and chief of staff. */
export function SignerForm({ number, role, name, rank, position, mark }: Props) {
  return <article className="signer-card"><b>{number}. {role}</b><button className="button"><Pencil />Редагувати</button><div className="signature-mark">{mark}</div><dl><dt>ПІБ</dt><dd>{name}</dd><dt>Звання</dt><dd>{rank}</dd><dt>Посада</dt><dd>{position}</dd></dl></article>;
}
