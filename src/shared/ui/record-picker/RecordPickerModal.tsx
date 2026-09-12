import { useMemo, useState } from "react";
import { includesSearch } from "../../utils/search";
import { Modal } from "../Modal";
import { SearchInput } from "../SearchInput";

export type PickerRecord = { id: number; title: string; subtitle: string; owner?: string };

type Props = {
  title: string;
  items: PickerRecord[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onClose: () => void;
  multiple?: boolean;
  searchPlaceholder?: string;
};

export function RecordPickerModal({ title, items, selectedIds, onToggle, onClose, multiple = true, searchPlaceholder = "Пошук за ПІБ, званням або посадою…" }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => items.filter((item) => includesSearch(query, item.title, item.subtitle, item.owner ?? "")), [items, query]);
  return <Modal title={title} onClose={onClose} className="crew-member-picker"><div className="crew-member-picker__body"><SearchInput placeholder={searchPlaceholder} value={query} onChange={setQuery} /><div className="crew-member-picker__list">{filtered.map((item) => <label key={item.id} className={selectedIds.includes(item.id) ? "selected" : ""}><input type={multiple ? "checkbox" : "radio"} checked={selectedIds.includes(item.id)} onChange={() => onToggle(item.id)} /><span><b>{item.title}</b><small>{item.subtitle}</small>{item.owner && <em>{item.owner}</em>}</span></label>)}</div></div><footer className="modal-actions"><button className="button primary" onClick={onClose}>Готово</button></footer></Modal>;
}
