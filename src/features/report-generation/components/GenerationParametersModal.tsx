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
  return <Modal title="Параметри значень" subtitle="Заповніть лише значення, потрібні для цього рапорту." onClose={onClose} className="generation-parameters-modal">
    <div className="generation-parameters-modal__body"><GenerationParameterFields parameters={parameters} values={values} onChange={onChange} /></div>
    <footer className="modal-actions"><button className="button primary" onClick={onClose}>Готово</button></footer>
  </Modal>;
}

