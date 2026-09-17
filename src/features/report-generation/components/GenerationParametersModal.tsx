import { Modal } from "../../../shared/ui/Modal";
import type { ParameterToken } from "../types";
import { GenerationParameterFields } from "./GenerationParameterFields";

type Props = {
  parameters: ParameterToken[];
  values: Record<string, string>;
  onChange: (token: string, value: string) => void;
  onClose: () => void;
};

export function GenerationParametersModal({ parameters, values, onChange, onClose }: Props) {
  const complete = parameters.every(({ token }) => (values[token] ?? "").trim().length > 0);
  return <Modal title="Параметри значень" subtitle="Заповніть лише значення, потрібні для цього рапорту." onClose={onClose} className="generation-parameters-modal">
    <div className="generation-parameters-modal__body"><GenerationParameterFields parameters={parameters} values={values} onChange={onChange} /></div>
    <footer className="modal-actions">{!complete && <span>Заповніть усі обов’язкові значення.</span>}<button className="button primary" disabled={!complete} onClick={onClose}>Готово</button></footer>
  </Modal>;
}
