import { useState } from "react";
import { BookOpen, Copy, FileText, Info, Users, type LucideIcon } from "lucide-react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { multiPersonVariables, serviceVariables, singlePersonVariables, type TemplateVariable } from "./constants/templateVariables";

type VariableSectionProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  variables: TemplateVariable[];
  onSelect: (variable: TemplateVariable) => void;
};

function VariableSection({ icon: Icon, title, description, variables, onSelect }: VariableSectionProps) {
  return <section className="documentation-section"><header><Icon /><div><h2>{title}</h2><p>{description}</p></div></header><div className="variable-grid">{variables.map((variable) => <button className="variable-token" key={variable.token} onClick={() => onSelect(variable)}><code>{variable.token}</code><span>{variable.label}</span></button>)}</div></section>;
}

export function DocumentationPage() {
  const [selectedVariable, setSelectedVariable] = useState<TemplateVariable>(singlePersonVariables[0]);
  const copySelectedVariable = () => void navigator.clipboard?.writeText(selectedVariable.token);
  return <PageFrame header={<PageTitle title="Довідник" subtitle="Повний опис мови шаблонів і доступних змінних" />} className="documentation-page"><section className="documentation-layout"><main className="panel documentation"><div className="documentation__intro"><BookOpen /><div><h1>Мова шаблонів</h1><p>Змінні записуються у подвійних фігурних дужках без пробілів. Натисніть на будь-яку змінну, щоб переглянути приклад.</p></div></div><div className="documentation-rule"><Info /><div><b>Один рапорт на один запуск</b><span>Для однієї особи використовуйте <code>{"{{soldier.field}}"}</code>. Для двох або більше — лише <code>{"{{soldiers[0].field}}"}</code>, <code>{"{{soldiers[1].field}}"}</code>.</span></div></div><VariableSection icon={FileText} title="Один військовослужбовець" description="Повний перелік змінних для шаблону з однією обраною особою." variables={singlePersonVariables} onSelect={setSelectedVariable} /><VariableSection icon={Users} title="Кілька військовослужбовців" description="Усі обрані особи передаються в один рапорт як масив; [0] — перша, [1] — друга." variables={multiPersonVariables} onSelect={setSelectedVariable} /><VariableSection icon={BookOpen} title="Службові змінні" description="Значення з налаштувань програми та підписантів." variables={serviceVariables} onSelect={setSelectedVariable} /></main><aside className="panel variable-preview"><span className="status-pill ready">Приклад</span><h2>{selectedVariable.label}</h2><code>{selectedVariable.token}</code><p>{selectedVariable.description}</p><div><span>Після підстановки</span><b>{selectedVariable.example}</b></div><button className="button" onClick={copySelectedVariable}><Copy />Скопіювати змінну</button></aside></section></PageFrame>;
}
