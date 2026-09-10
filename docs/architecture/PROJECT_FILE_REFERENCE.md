# Довідник структури проєкту

Документ описує всі підтримувані вихідні файли після фронтенд-рефакторингу. Згенеровані DOCX/XLSX, локальна база, скриншоти, `dist`, `target`, `node_modules` і lock-файли перелічені як дані/артефакти: вони не є модулями програми й не повинні редагуватися як код.

## Корінь і збірка

- `README.md` — призначення програми, запуск, тести та основні сценарії.
- `EDITIONS.md` — відмінності простої та розширеної редакцій.
- `AGENTS.md` — локальні правила роботи з репозиторієм.
- `package.json` — команди фронтенду (`lint`, `test`, `build`, повна перевірка) та залежності.
- `package-lock.json` — зафіксовані версії npm-залежностей; змінюється менеджером пакетів.
- `vite.config.ts` — Vite/Vitest, dev-server і поділ production-бандла.
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` — правила TypeScript для застосунку та інструментів.
- `eslint.config.js` — строгі правила ESLint; попередження прирівняні до помилок.
- `index.html` — HTML-точка входу Vite.
- `settings.json` — початкові/локальні налаштування застосунку.
- `Excel-база.xlsx`, `особовий_склад.db` — робочі дані, не вихідний код.

## Точка входу та оболонка фронтенду

- `src/main.tsx` — монтує React, підключає глобальні стилі.
- `src/App.tsx` — композиція екранів, вибір поточного розділу, спільні вибрані записи та модальне відкриття конструктора. Навігаційна розмітка винесена з файла.
- `src/App.test.tsx` — інтеграційно перевіряє переходи між усіма розділами, редакції та головні сценарії оболонки.
- `src/vite-env.d.ts` — типи середовища Vite.
- `src/test/setup.ts` — спільне налаштування jsdom і тестових підмін.

### `src/app`

- `app/navigation.ts` — єдине типізоване джерело груп меню, іконок, screen-id та ознаки редакції.
- `app/components/AppSidebar.tsx` — сайдбар, згортання груп, попередження запуску й нижня навігація.
- `app/hooks/useStartupWarnings.ts` — завантажує діагностичні попередження під час запуску.
- `app/services/applicationService.ts` — Tauri-контракт отримання попереджень.
- `app/README.md` — межі шару оболонки.

## Спільний фронтенд (`src/shared`)

### Типи, схема та доменна структура

- `shared/types/domain.ts` — спільні контракти людей, шаблонів, налаштувань, рапортів і екранів.
- `shared/types/string.d.ts` — додаткові декларації рядкових API середовища.
- `shared/bcs-schema.json` — канонічні категорії БЧС і порядок колонок/значень.
- `shared/constants/personnelCoreFields.ts` — перелік базових полів особового складу.
- `shared/unit-structure.ts` — стандартний скелет роти/взводу, нормалізація назв, прив’язка посад і створення відсутніх структурних блоків.

### Сервіси, події та хуки

- `shared/services/personnelService.ts` — усі Tauri-виклики CRUD особового складу, кастомних полів та Excel-обміну.
- `shared/services/morphologyService.ts` — відмінювання ПІБ, звань, посад і регістр тексту.
- `shared/services/morphologyService.test.ts` — контроль українських відмінків та перетворень.
- `shared/services/tauriContracts.test.ts` — захищає назви команд і форму payload між React та Rust.
- `shared/events/appEvents.ts` — типізований реєстр інвалідації колекцій (`personnel`, `vehicles`, `generated reports`).
- `shared/hooks/useEntityCollection.ts` — універсальний цикл `load → items/error/loading → reload`; сторінки лишають за собою доменну логіку мутацій.
- `shared/hooks/useEntityCollection.test.tsx` — перевіряє первинне завантаження, повторне оновлення й помилку колекції.
- `shared/hooks/useLoadMoreOnScroll.ts` — безпечне дозавантаження списку біля нижньої межі scroll-контейнера.
- `shared/utils/naturalSort.ts` — числове сортування назв/номерів через український `Intl.Collator`.
- `shared/utils/naturalSort.test.ts` — перевіряє порядок 1, 2, 10 замість лексикографічного 1, 10, 2.
- `shared/utils/search.ts` — нормалізований пошук одразу по кількох полях.

### Мова шаблонів

- `shared/template-language/registry.v2.json` — єдине декларативне джерело змінних, полів, ролей і модифікаторів.
- `shared/template-language/registry.ts` — будує типізований registry, знаходить параметри генерації та вимоги вибору сутностей.
- `shared/template-language/parser.ts` — розбирає `{{змінна:модифікатор}}`, перевіряє синтаксис і конфлікти.
- `shared/template-language/registry.test.ts`, `parser.test.ts` — контроль доступності змінних, зв’язків та синтаксису.

### UI-примітиви

- `shared/ui/Modal.tsx` — доступний modal-shell із заголовком, підзаголовком і закриттям по фону.
- `shared/ui/EntityEditorModal.tsx` — стандартне тіло/дії редактора, busy-стан і захист незбережених змін.
- `shared/ui/EntityDetailsPanel.tsx` — єдина бокова панель деталей для клікабельних рядків реєстрів.
- `shared/ui/ConfirmDialog.tsx` — підтвердження руйнівних операцій.
- `shared/ui/NotificationProvider.tsx` — глобальна черга повідомлень і hook `useNotifications`.
- `shared/ui/PageFrame.tsx` — каркас сторінки з header/tools/content.
- `shared/ui/PageTitle.tsx` — лише заголовок і композиція дій; доступ до БД відсутній.
- `shared/ui/custom-fields/CustomFieldsManager.tsx` — повний CRUD кастомних полів і інвалідація залежного реєстру.
- `shared/ui/RegistryToolbar.tsx` — пошук, фільтри, додаткові дії та лічильник результатів.
- `shared/ui/data-table/EntityTable.tsx` — natural sort, вибір рядків, checkbox-вибір, sticky-колонки, loading/error/empty/footer і scroll pagination.
- `shared/ui/data-table/EntityTable.test.tsx` — сортування, вибір та порожній стан таблиці.
- `shared/ui/entity-card/EntityCard.tsx` — семантичні оболонки картки й сітки.
- `shared/ui/entity-card/CardGridSkeleton.tsx` — спільний skeleton карток екіпажу/позиції.
- `shared/ui/record-picker/RecordPickerModal.tsx` — пошук і одиночний/множинний вибір пов’язаних записів із показом поточного власника.
- `shared/ui/CheckBox.tsx`, `FilterButton.tsx`, `SearchInput.tsx`, `Select.tsx`, `Stat.tsx` — малі контрольовані елементи.
- `shared/ui/RecentReportsList.tsx` — компактний список останніх рапортів.
- `shared/ui/PageTitle.test.tsx` — перевіряє заголовок та інтеграцію менеджера кастомних полів.

## Функціональні модулі (`src/features`)

### Особовий склад

- `personnel/PersonnelPage.tsx` — оркеструє пошук, колонки, вибір, створення, редагування, видалення та Excel-імпорт.
- `personnel/components/PersonnelForm.tsx` — контрольована форма всіх базових і кастомних полів бійця.
- `personnel/components/PersonnelTable.tsx` — конфігурація колонок поверх `EntityTable`, ознака неповних даних і row actions.
- `personnel/hooks/usePersonnel.ts` — пагінація, CRUD, повне оновлення та синхронізація списку.
- `personnel/utils/personnelCompleteness.ts` — визначає, чи заповнені обов’язкові дані.
- `personnel/PersonnelPage.test.tsx` — пошук, CRUD, стани та імпортні сценарії.

### Генерація рапортів

- `report-generation/ReportGenerationPage.tsx` — тільки оркестрація шаблону, вимог, вибраних id і виклику генерації.
- `report-generation/types.ts` — вузькі read-моделі сутностей для заповнення рапорту; не дублює UI-логіку.
- `report-generation/hooks/useReportGeneration.ts` — вибір/аналіз DOCX, валідація, генерація і відкриття результату.
- `report-generation/services/reportGenerationService.ts` — Tauri API генератора.
- `report-generation/components/GenerationParameterFields.tsx` — поля довільних параметрів документа.
- `report-generation/components/GenerationParametersModal.tsx` — модальне редагування параметрів.
- `report-generation/components/GenerationSelectionTable.tsx` — таблиця вибору одного типу сутностей.
- `report-generation/components/GenerationRequirementModal.tsx` — вибір сутностей для складного багатодоменного шаблону.
- `report-generation/components/GeneratedReportActions.tsx` — відкриття створеного DOCX або його папки.
- `report-generation/ReportGenerationPage.test.tsx` — прості, параметризовані та зв’язані сценарії генерації.

### Шаблони й аналізатор

- `templates/TemplatesPage.tsx` — реєстр шаблонів, оновлення, валідація, перегляд і видалення.
- `templates/hooks/useTemplates.ts` — пагінація й примусове очищення кешу при оновленні.
- `templates/services/templateService.ts` — аналіз, preview, створення та файлові операції шаблонів.
- `templates/components/VariableGroup.tsx` — група змінних у довіднику/конструкторі.
- `templates/ReportAnalyserPage.tsx` — оркеструє вибір DOCX, Word-preview, ручне виділення та створення шаблону.
- `templates/analysis/analysisModel.ts` — чисті функції нормалізації пропозицій, ключів і розпізнавання виділеного token.
- `templates/analysis/AnalysisProposalList.tsx` — групи надійних/сумнівних замін та альтернативні змінні.
- `templates/analysis/ModifierModal.tsx` — вибір відмінка, регістру й форматування змінної.
- `templates/TemplatesPage.test.tsx`, `hooks/useTemplates.test.tsx`, `ReportAnalyserPage.test.ts` — регресійні тести оновлення, кешу та аналізу.

### Згенеровані рапорти

- `generated-reports/GeneratedReportsPage.tsx` — фільтр періоду, checkbox-вибір через `EntityTable`, відкриття й підтверджене видалення.
- `generated-reports/hooks/useGeneratedReports.ts` — кеш, пагінація, prefetch та реакція на типізовану інвалідацію.
- `generated-reports/services/generatedReportsService.ts` — список, відкриття папки/файла й видалення.
- `generated-reports/hooks/useGeneratedReports.test.tsx` — перевіряє prefetch, фільтри та оновлення після генерації.

### Операційний облік

- `operations/types.ts` — контракти екіпажів, позицій, майна, інцидентів, штату й БЧС.
- `operations/services/operationsService.ts` — єдиний Tauri API операційних сутностей.
- `operations/OperationalPages.tsx` — стабільний barrel-export екранів для `App`.
- `operations/FlightPlanningPage.tsx` — зарезервований екран майбутнього планування польотів у розширеному обліку.
- `operations/CrewsPage.tsx` — картки екіпажів, офіційний/фактичний склад і `RecordPickerModal` із попередженням перенесення.
- `operations/PositionsPage.tsx` — картки позицій, стан готовності, фільтри, редактор і підтверджене видалення.
- `operations/EquipmentPage.tsx` — спільний реєстр генераторів, БпЛА, зв’язку, зброї та БК з різними правилами відповідальності.
- `operations/EquipmentPage.test.tsx` — відкриття бокової панелі та підтвердження видалення майна.
- `operations/IncidentsPage.tsx` — журнал інцидентів зі snapshot пов’язаного екіпажу, позиції та БпЛА.
- `operations/StaffingBcsPage.tsx` — вкладки штату/БЧС, завантаження даних і збереження параметрів.
- `operations/BcsTable.tsx` — візуальна БЧС, групування, редаговані персональні поля й масштаб.
- `operations/BcsParametersModal.tsx` — дата, назва, ім’я файла, підгрупи, прикомандировані й тимчасово прибулі.
- `operations/bcs-model.ts` — чисте формування груп, рядків і підсумків БЧС: штат/список/наявність, фактичні екіпажі, типи БпАК, статуси та структурні блоки.
- `operations/StaffTransferModal.tsx` — ланцюжки переміщень і ТВО з перевіркою конфліктів.
- `operations/TemporaryArrivalEditor.tsx` — CRUD прикомандированих, тимчасово прибулих та інших підгруп із посадою і можливістю ТВО для тимчасово прибулих.
- `operations/staffing-slots.ts` — зіставлення кожної штатної посади з унікальним slot-id і побудова ієрархії.
- `operations/CrewsPage.test.tsx`, `StaffingBcsPage.test.ts`, `staffing-slots.test.tsx` — склад екіпажів, групування БЧС та унікальність/порядок штатних місць.

### Автомобілі

- `vehicles/types.ts` — контракт автомобіля та його прив’язок.
- `vehicles/services/vehiclesService.ts` — CRUD, статус, водій, екіпаж.
- `vehicles/VehiclesPage.tsx` — реєстр, фільтри, колонки, деталі та оркестрація мутацій.
- `vehicles/components/VehicleEditorModal.tsx` — ізольований стан створення автомобіля.
- `vehicles/components/VehicleAssignmentModal.tsx` — вибір відповідального водія й екіпажу.
- `vehicles/VehiclesPage.test.tsx` — створення, фільтри й перепризначення.

### Налаштування

- `settings/SettingsPage.tsx` — оркестрація секцій підрозділу, підписантів, Excel та архівів.
- `settings/hooks/useAppSettings.ts` — завантаження і мутації налаштувань.
- `settings/services/settingsService.ts` — Tauri-команди налаштувань, backup та перенесення даних.
- `settings/components/SignerEditorModal.tsx` — локальна форма ролі підписанта.
- `settings/components/UnitEditorModal.tsx` — параметри підрозділу й композиція редактора структури.
- `settings/components/UnitStructureEditor.tsx` — згортання, редагування, створення, видалення і pointer drag-and-drop блоків/посад.

### Довідка

- `documentation/DocumentationPage.tsx` — конструктор змінної та інтерактивний приклад модифікаторів.
- `documentation/ProgramGuidePage.tsx` — користувацька інструкція всередині програми.
- `documentation/*.test.tsx` — перевіряють пошук, конструктор і відображення довідки.
- `documentation/README.md` — межі модуля документації.

## Стилі та ресурси фронтенду

- `src/styles.css` — базові tokens, primitives і legacy-сумісність.
- `src/styles/layout-core.css` — оболонка, sidebar, таблиці, модальні вікна та спільні layout-компоненти.
- `src/styles/layout-features.css` — доменні сторінки, картки та редактори.
- `src/layout-fixes.css` — точкові адаптивні виправлення, які ще не можна безпечно злити з базовими правилами.
- `src/template-language.css` — аналізатор, preview DOCX і конструктор змінних.
- `src/assets/*` — логотипи/марки інтерфейсу; не містять логіки.
- `tests/visual/staffing.html`, `tests/visual/staffing.tsx` — локальний visual harness штату без зміни production-навігації.

## Rust/Tauri (`src-tauri`)

- `Cargo.toml`, `Cargo.lock` — crate, feature flags і зафіксовані залежності.
- `build.rs` — Tauri build hook.
- `tauri.conf.json`, `tauri.simple.conf.json`, `tauri.advanced.conf.json` — базова, проста та розширена конфігурації збірки.
- `capabilities/default.json` — дозволи desktop API.
- `src/main.rs` — реєстрація всіх Tauri-команд і запуск застосунку.
- `src/database.rs` — відкриття SQLite, міграції, транзакції та спільні database helpers.
- `src/database/test_support.rs` — ізольована тестова база.
- `src/personnel.rs` — доменне зчитування/запис особового складу.
- `src/personnel_commands.rs` — тонкий command-шар CRUD/пагінації людей і кастомних полів.
- `src/settings.rs`, `src/settings_commands.rs` — модель та команди налаштувань/архівів.
- `src/document_commands.rs` — файлові операції DOCX, каталогів і системного відкриття.
- `src/report_generation.rs` — координація перевірки й генерації рапорту.
- `src/report_generation/docx.rs` — безпечна заміна тексту всередині Word XML зі збереженням runs/styles.
- `src/report_generation/values.rs` — формує pool значень і розв’язує зв’язки людина ↔ екіпаж ↔ позиція ↔ майно.
- `src/report_generation/morphology.rs` — серверні відмінки й текстові модифікатори.
- `src/report_generation/tests.rs` — регресійні DOCX-тести генератора.
- `src/template_analysis.rs` — модуль аналізатора.
- `src/template_analysis/commands.rs` — Tauri API аналізу/preview/створення.
- `src/template_analysis/detection.rs` — пошук відомих значень у документі, ранжування і пропозиції.
- `src/operations.rs` — кореневий модуль операційних команд.
- `src/operations/models.rs` — Rust DTO операційних сутностей.
- `src/operations/crews.rs`, `positions.rs`, `equipment.rs`, `vehicles.rs`, `incidents.rs`, `staffing.rs`, `bcs.rs` — SQL і правила відповідного домену.
- `src/bcs_export.rs` — експорт БЧС у XLSX, групування A:J та персональні K:P.
- `src/staffing_exchange.rs` — імпорт/експорт і синхронізація штатного скелета.
- `src/temporary_personnel.rs` — тимчасово прибулі/прикомандировані та підгрупи.
- `src/xlsx.rs` — фасад Excel-обміну.
- `src/xlsx/reader.rs`, `writer.rs` — читання суворого шаблону та запис сумісного XLSX.
- `src/xlsx/tests.rs`, `src/tests.rs` — інтеграційні тести імпорту, БД, зв’язків і команд.
- `resources/bcs-reference-styles.xml`, `bcs-reference-theme.xml` — стилі Excel, сумісні з Windows Excel.
- `icons/*`, `templates/*` — ресурси інсталятора й початкові DOCX.

## Службові скрипти й документація

- `scripts/build_excel_template.mjs` — відтворюване створення офіційного Excel-шаблону.
- `scripts/create_starter_templates.py` — формує стартовий комплект DOCX.
- `scripts/inspect_bcs_reference.mjs` — діагностує стилі еталонного БЧС.
- `scripts/seed-development-data.sql` — тестові дані для локальної розробки.
- `docs/template-language.md`, `docs/architecture/template-language-v2.md` — синтаксис і архітектура мови шаблонів.
- `docs/architecture/2026-08-02-personnel-template-language.md` — початковий контракт особового складу та змінних.
- `docs/architecture/2026-08-03-application-data-layout.md` — розміщення даних у desktop-застосунку.
- `docs/architecture/2026-08-03-file-sources-and-generation.md` — джерела файлів і pipeline генерації.
- `docs/architecture/2026-08-04-personnel-crud-and-database-location.md` — CRUD і база даних.
- `docs/architecture/2026-09-07-domain-relations-and-reuse.md` — модель «одного джерела правди» та масштабованих зв’язків.
- `docs/architecture/2026-09-07-frontend-component-audit.md` — аудит дублювання та фактичний статус рефакторингу.
- `docs/architecture/2026-09-08-template-relationship-variables.md` — змінні, які проходять через зв’язки сутностей.

## Напрям залежностей

`App → feature page → feature hook/service → Tauri command → Rust domain module → SQLite/filesystem`.

Спільний UI не імпортує feature-модулі. Доменна форма не переноситься до універсального «конструктора форм»: повторно використовуються оболонки, таблиці, пікери, стани й toolbar, а правила збереження залишаються у відповідному feature.
