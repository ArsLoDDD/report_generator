import { BookOpen, FileText, Users } from "lucide-react";
import { PageFrame } from "../../shared/ui/PageFrame";
import { PageTitle } from "../../shared/ui/PageTitle";

const personnelVariables = ["rank", "surname", "givenName", "patronymic", "fullName", "position", "taxId", "birthDate", "educationLevel", "educationDetails", "armedForcesServiceStartDate", "positionAssignedDate", "positionAssignmentOrder", "militaryId", "assignedVehicleName", "assignedVehicleRegistration"];

export function DocumentationPage() {
  return <PageFrame header={<PageTitle title="Довідник" subtitle="Мова шаблонів та доступні дані для генерації рапортів" />} className="documentation-page"><section className="panel documentation"><div className="documentation__intro"><BookOpen /><div><h2>Мова шаблонів</h2><p>Змінна завжди записується у подвійних фігурних дужках, без пробілів: <code>{"{{soldiers[0].surname}}"}</code>.</p></div></div><div className="detail-cards"><article><header><Users /><div><h3>Військовослужбовці</h3><p>Індекс 0 — перший обраний військовослужбовець, 1 — другий.</p></div></header><div className="tag-list">{personnelVariables.map((name) => <code key={name}>{`{{soldiers[0].${name}}}`}</code>)}</div></article><article><header><FileText /><div><h3>Службові змінні</h3><p>Дані з налаштувань програми.</p></div></header><div className="tag-list">{["mainRank", "mainName", "mainPosition", "mainSignature", "commanderName", "chiefName"].map((name) => <code key={name}>{`{{${name}}}`}</code>)}</div></article></div><div className="settings-tip">Швидка перевірка перед генерацією перевіряє синтаксис змінних і наявність даних. Повна перевірка в «Шаблонах» також показує попередження та невідомі змінні.</div></section></PageFrame>;
}
