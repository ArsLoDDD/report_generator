import { Select } from "../../../shared/ui/Select";
import type { ParameterToken } from "../types";

type Props = {
  parameters: ParameterToken[];
  values: Record<string, string>;
  onChange: (token: string, value: string) => void;
};

export function GenerationParameterFields({ parameters, values, onChange }: Props) {
  return <div className="generation-parameters-fields">
    {parameters.map(({ token, field }) => {
      const name = `${field.name}${token === field.id ? "" : ` №${token.slice(field.id.length + 1)}`}`;
      const control = field.inputType === "textarea"
        ? <textarea aria-label={name} value={values[token] ?? ""} onChange={(event) => onChange(token, event.target.value)} />
        : field.inputType === "boolean"
          ? <Select ariaLabel={name} value={values[token] ?? "Ні"} onChange={(value) => onChange(token, value)} options={[{ value: "Так", label: "Так" }, { value: "Ні", label: "Ні" }]} />
          : <input aria-label={name} type={field.inputType} value={values[token] ?? ""} onChange={(event) => onChange(token, event.target.value)} />;
      return <div className={`generation-parameter generation-parameter--${field.inputType}`} key={token}><span><b>{name}</b><code>{`{{${token}}}`}</code></span>{control}</div>;
    })}
  </div>;
}

