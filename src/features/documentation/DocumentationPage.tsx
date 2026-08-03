import { useState } from "react";
import { BookOpen, Copy, FileText, Info, ListChecks, PenTool, Users, type LucideIcon } from "lucide-react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { useNotifications } from "../../shared/ui/NotificationProvider";
import { PageTitle } from "../../shared/ui/PageTitle";
import { documentVariables, multiPersonVariables, serviceVariables, singlePersonVariables, type TemplateVariable } from "./constants/templateVariables";

type VariableSectionProps = { icon: LucideIcon; title: string; description: string; variables: TemplateVariable[]; onSelect: (variable: TemplateVariable) => void };

function VariableSection({ icon: Icon, title, description, variables, onSelect }: VariableSectionProps) {
  return <section className="documentation-section"><header><Icon /><div><h2>{title}</h2><p>{description}</p></div></header><div className="variable-grid">{variables.map((variable) => <button className="variable-token" key={variable.token} onClick={() => onSelect(variable)}><code>{variable.token}</code><span>{variable.label}</span></button>)}</div></section>;
}

function TemplateFlow() {
  return <section className="documentation-flow"><header><ListChecks /><div><h2>Як працює генерація</h2><p>Короткий порядок роботи з шаблоном і даними.</p></div></header><ol><li>Оберіть DOCX-файл шаблону та одного або кількох військовослужбовців.</li><li>Програма перевіряє, що режим змінних відповідає кількості обраних осіб.</li><li>Для однієї особи підставляється <code>{"{{soldier.field}}"}</code>.</li><li>Для кількох осіб формується масив повної довжини: <code>{"{{soldiers[0].field}}"}</code>, <code>{"{{soldiers[1].field}}"}</code>, <code>{"{{soldiers[2].field}}"}</code> … до останньої обраної особи.</li><li>Один запуск створює один DOCX у новій папці рапортів.</li></ol></section>;
}

function SignersGuide() {
  return <section className="documentation-flow"><header><PenTool /><div><h2>Підписанти та підпис</h2><p>Налаштовуються у розділі «Налаштування» та застосовуються до кожної генерації.</p></div></header><ol><li><b>Основний підписант</b> використовує простір імен <code>main</code>. ПІБ у налаштуваннях розділяється на прізвище, ім’я та по батькові.</li><li><code>{"{{main.rank}}"}</code> — звання основного підписанта.</li><li><code>{"{{main.surname}}"}</code> — прізвище основного підписанта.</li><li><code>{"{{main.givenName}}"}</code> — ім’я основного підписанта.</li><li><code>{"{{main.patronymic}}"}</code> — по батькові основного підписанта.</li><li><code>{"{{main.fullName}}"}</code> — повне ПІБ основного підписанта.</li><li><code>{"{{main.position}}"}</code> — посада основного підписанта.</li><li><code>{"{{main.signature}}"}</code> — PNG-підпис із папки «Підписи»; доступний лише для основного підписанта.</li><li>PNG-файл підпису за замовчуванням має назву <code>main.png</code>; її можна змінити в налаштуваннях без перейменування самого файлу.</li><li><b>Командир</b> і <b>начальник штабу</b> не мають графічних підписів. Для них використовуються лише текстові змінні <code>{"{{commanderName}}"}</code> та <code>{"{{chiefName}}"}</code>.</li><li>Папки даних створюються програмою автоматично, тому шляхи вручну не налаштовуються.</li></ol></section>;
}

export function DocumentationPage() {
  const [selectedVariable, setSelectedVariable] = useState<TemplateVariable>(singlePersonVariables[0]);
  const { notify } = useNotifications();
  const copySelectedVariable = async () => {
    try { await navigator.clipboard?.writeText(selectedVariable.token); notify("Змінну скопійовано.", "success"); }
    catch { notify("Не вдалося скопіювати змінну.", "error"); }
  };
  const wordLine = `${selectedVariable.label}: ${selectedVariable.token}`;
  const completedLine = `${selectedVariable.label}: ${selectedVariable.example}`;
  return <PageFrame header={<PageTitle title="Довідник" subtitle="Повний опис мови шаблонів і доступних змінних" />} className="documentation-page"><section className="documentation-layout"><main className="panel documentation"><div className="documentation__intro"><BookOpen /><div><h1>Мова шаблонів</h1><p>Змінні записуються у подвійних фігурних дужках без пробілів. Натисніть на будь-яку змінну, щоб переглянути приклад.</p></div></div><div className="documentation-rule"><Info /><div><b>Один рапорт на один запуск</b><span>Для однієї особи використовуйте <code>{"{{soldier.field}}"}</code>. Для двох або більше створюється масив довжиною в кількість обраних осіб: від <code>{"{{soldiers[0].field}}"}</code> до останнього індексу.</span></div></div><TemplateFlow /><SignersGuide /><VariableSection icon={FileText} title="Один військовослужбовець" description="Повний перелік змінних для шаблону з однією обраною особою." variables={singlePersonVariables} onSelect={setSelectedVariable} /><VariableSection icon={Users} title="Кілька військовослужбовців" description="Повний перелік полів, доступних для кожного елемента масиву обраних осіб." variables={multiPersonVariables} onSelect={setSelectedVariable} /><VariableSection icon={BookOpen} title="Дата та службові змінні" description="Дата рапорту та значення з налаштувань програми й підписантів." variables={[...documentVariables, ...serviceVariables]} onSelect={setSelectedVariable} /></main><aside className="panel variable-preview"><header className="variable-preview__header"><span>Приклад підстановки у Word</span></header><h2>{selectedVariable.label}</h2><p>{selectedVariable.description}</p><div className="word-example"><span>У тексті DOCX-шаблону</span><code>{wordLine}</code></div><div className="variable-result"><span>Результат після генерації</span><b>{completedLine}</b></div><button className="button" onClick={() => void copySelectedVariable()}><Copy />Скопіювати змінну</button></aside></section></PageFrame>;
}
