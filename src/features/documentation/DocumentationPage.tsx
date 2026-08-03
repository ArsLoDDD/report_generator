import { useState } from "react";
import { BookOpen, Copy, FileText, Info, ListChecks, PenTool, Users, type LucideIcon } from "lucide-react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";
import { multiPersonVariables, serviceVariables, singlePersonVariables, type TemplateVariable } from "./constants/templateVariables";

type VariableSectionProps = { icon: LucideIcon; title: string; description: string; variables: TemplateVariable[]; onSelect: (variable: TemplateVariable) => void };

function VariableSection({ icon: Icon, title, description, variables, onSelect }: VariableSectionProps) {
  return <section className="documentation-section"><header><Icon /><div><h2>{title}</h2><p>{description}</p></div></header><div className="variable-grid">{variables.map((variable) => <button className="variable-token" key={variable.token} onClick={() => onSelect(variable)}><code>{variable.token}</code><span>{variable.label}</span></button>)}</div></section>;
}

function TemplateFlow() {
  return <section className="documentation-flow"><header><ListChecks /><div><h2>Як працює генерація</h2><p>Короткий порядок роботи з шаблоном і даними.</p></div></header><ol><li>Оберіть DOCX-файл шаблону та одного або кількох військовослужбовців.</li><li>Програма перевіряє, що режим змінних відповідає кількості обраних осіб.</li><li>Для однієї особи підставляється <code>{"{{soldier.field}}"}</code>.</li><li>Для кількох осіб формується масив повної довжини: <code>{"{{soldiers[0].field}}"}</code>, <code>{"{{soldiers[1].field}}"}</code>, <code>{"{{soldiers[2].field}}"}</code> … до останньої обраної особи.</li><li>Один запуск створює один DOCX у новій папці рапортів.</li></ol></section>;
}

function SignersGuide() {
  return <section className="documentation-flow"><header><PenTool /><div><h2>Підписанти та підпис</h2><p>Налаштовуються у розділі «Налаштування» та застосовуються до кожної генерації.</p></div></header><ol><li><b>Основний підписант</b>: ПІБ, звання, посада та єдиний доступний графічний підпис. У шаблоні доступні <code>{"{{mainRank}}"}</code>, <code>{"{{mainName}}"}</code>, <code>{"{{mainPosition}}"}</code> і <code>{"{{mainSignature}}"}</code>.</li><li>PNG-файл підпису зберігається у папці «Підписи». Назва за замовчуванням — <code>main.png</code>; її можна змінити в налаштуваннях без перейменування самого файлу.</li><li><b>Командир</b> і <b>начальник штабу</b> не мають графічних підписів. Для них використовуються лише текстові змінні <code>{"{{commanderName}}"}</code> та <code>{"{{chiefName}}"}</code>.</li><li>Папки даних створюються програмою автоматично, тому шляхи вручну не налаштовуються.</li></ol></section>;
}

export function DocumentationPage() {
  const [selectedVariable, setSelectedVariable] = useState<TemplateVariable>(singlePersonVariables[0]);
  const copySelectedVariable = () => void navigator.clipboard?.writeText(selectedVariable.token);
  const wordLine = `${selectedVariable.label}: ${selectedVariable.token}`;
  const completedLine = `${selectedVariable.label}: ${selectedVariable.example}`;
  return <PageFrame header={<PageTitle title="Довідник" subtitle="Повний опис мови шаблонів і доступних змінних" />} className="documentation-page"><section className="documentation-layout"><main className="panel documentation"><div className="documentation__intro"><BookOpen /><div><h1>Мова шаблонів</h1><p>Змінні записуються у подвійних фігурних дужках без пробілів. Натисніть на будь-яку змінну, щоб переглянути приклад.</p></div></div><div className="documentation-rule"><Info /><div><b>Один рапорт на один запуск</b><span>Для однієї особи використовуйте <code>{"{{soldier.field}}"}</code>. Для двох або більше створюється масив довжиною в кількість обраних осіб: від <code>{"{{soldiers[0].field}}"}</code> до останнього індексу.</span></div></div><TemplateFlow /><SignersGuide /><VariableSection icon={FileText} title="Один військовослужбовець" description="Повний перелік змінних для шаблону з однією обраною особою." variables={singlePersonVariables} onSelect={setSelectedVariable} /><VariableSection icon={Users} title="Кілька військовослужбовців" description="Повний перелік полів, доступних для кожного елемента масиву обраних осіб." variables={multiPersonVariables} onSelect={setSelectedVariable} /><VariableSection icon={BookOpen} title="Службові змінні" description="Значення з налаштувань програми та підписантів." variables={serviceVariables} onSelect={setSelectedVariable} /></main><aside className="panel variable-preview"><span className="status-pill ready">Приклад у Word</span><h2>{selectedVariable.label}</h2><p>{selectedVariable.description}</p><div className="word-example"><span>Фрагмент у DOCX-шаблоні</span><code>{wordLine}</code></div><div className="variable-result"><span>Після підстановки</span><b>{completedLine}</b></div><button className="button" onClick={copySelectedVariable}><Copy />Скопіювати змінну</button></aside></section></PageFrame>;
}
