# RaportGen — блок-схеми всього проєкту

Цей документ показує систему на трьох рівнях: загальна карта, потоки даних між модулями та дії користувача на кожній сторінці. Схеми описують поточну реалізацію розширеної редакції; у простій редакції з основного меню лишаються «Документи» й «Особовий склад», а також системні «Налаштування» та «Попередження».

## Як читати схеми

- суцільна стрілка `→` — явна дія користувача або пряме читання даних;
- товста стрілка `⇒` — збереження у постійне сховище або створення файла;
- пунктирна стрілка `⇢` — автоматичне оновлення, синхронізація чи похідний розрахунок;
- зелені блоки — сторінки; сині — кнопки й дії; золоті — дані; фіолетові — автоматичні процеси; сірі — файли або зовнішні результати; червоні — перевірки й підтвердження.

> Повторювані кнопки «Пошук», «Фільтр», «Сортування», перемикання вкладок і розгортання секцій об’єднані в один вузол, оскільки вони змінюють лише поточне відображення й не записують дані.

## 1. Головна карта застосунку

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":48,"htmlLabels":true}}}%%
flowchart LR
  start(["Запуск RaportGen"])
  shell["Оболонка застосунку<br/>навігація · спільний стан · повідомлення"]
  warnings["Попередження запуску"]

  subgraph docs["Документи"]
    generator["Генерація рапортів"]
    templates["Шаблони"]
    analyser["Аналізатор рапортів"]
    generated["Згенеровані рапорти"]
  end

  subgraph accounting["Облік підрозділу"]
    people["Особовий склад<br/>Штат · Контроль ОС"]
    staffing["Штат та БЧС"]
    assets["Майно<br/>Авто · БпЛА · Генератори · Зв’язок · Зброя · Цукерня"]
    incidents["Інциденти"]
    summary["Підсумкове донесення"]
  end

  subgraph combat["Бойова робота"]
    plan["План польотів"]
    journal["Журнал польотів"]
    crews["Екіпажі"]
    positions["Позиції"]
  end

  subgraph support["Системні розділи"]
    guide["Довідник"]
    settings["Налаштування"]
  end

  subgraph storage["Джерела та результати"]
    db[("SQLite<br/>особовий_склад.db")]
    config[("settings.json")]
    templateFiles[("DOCX-шаблони")]
    reportFiles[("DOCX / XLSX<br/>результати")]
    browser[("Локальний UI-стан<br/>вкладки · секції · чернетка плану")]
  end

  start --> shell
  shell --> warnings
  shell --> docs
  shell --> accounting
  shell --> combat
  shell --> support

  people <--> db
  staffing <--> db
  assets <--> db
  incidents <--> db
  crews <--> db
  positions <--> db
  plan <--> db
  journal <--> db
  summary <--> db

  settings <--> config
  settings <--> db
  templates <--> templateFiles
  analyser ==> templateFiles
  generator --> db
  generator --> config
  generator --> templateFiles
  generator ==> reportFiles
  generated <--> reportFiles
  staffing ==> reportFiles
  plan ==> reportFiles
  summary ==> reportFiles
  shell <--> browser

  class generator,templates,analyser,generated,people,staffing,assets,incidents,summary,plan,journal,crews,positions,guide,settings page;
  class shell action;
  class db,config,templateFiles,reportFiles,browser data;
  class warnings warn;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef data fill:#2a2418,stroke:#b59b53,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

### 1.1. Зв’язки між сторінками

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":26,"rankSpacing":48,"htmlLabels":true}}}%%
flowchart LR
  analyser["Аналізатор"]
  templates["Шаблони"]
  generator["Генерація"]
  generated["Згенеровані рапорти"]

  people["Особовий склад"]
  control["Контроль ОС"]
  staffing["Штат і БЧС"]
  assets["Майно"]
  crews["Екіпажі"]
  positions["Позиції"]
  plan["План польотів"]
  journal["Журнал польотів"]
  incidents["Інциденти"]
  summary["Підсумкове донесення"]
  settings["Налаштування"]
  warnings["Попередження"]
  guide["Довідник"]
  help["Інструкції та типові сценарії<br/>для всіх модулів"]

  analyser ==>|"створює DOCX-шаблон"| templates
  templates -->|"обраний шаблон"| generator
  generator ==>|"новий DOCX + manifest"| generated

  people -->|"штатні дані"| staffing
  people -->|"офіційний / фактичний склад"| crews
  people -->|"відповідальні"| assets
  people -->|"ручне місце"| control
  control -.->|"де знаходиться"| staffing

  crews -->|"склад і командир"| plan
  positions -->|"координати, БРО, смуга"| plan
  assets -->|"авто, БпЛА, БК"| plan
  plan -.->|"На позиції / ЗБЗ / ПБЗ / ОХ"| control
  plan -.->|"підстановка форми"| journal
  plan -.->|"позиція на дату"| incidents
  plan -->|"знімки D−1 і D"| summary
  journal -->|"фактичні польоти"| summary

  positions -.->|"реко / облаштування"| control
  positions -->|"події робіт"| summary
  staffing -->|"склад і БЧС"| summary
  crews -->|"фактичний snapshot"| incidents
  assets -->|"майно події"| incidents

  people -->|"поля рапорту"| generator
  crews -->|"поля рапорту"| generator
  positions -->|"поля рапорту"| generator
  assets -->|"поля рапорту"| generator

  settings -.->|"структура"| staffing
  settings -.->|"підписанти й реквізити"| generator
  settings -.->|"підрозділ"| plan
  settings -.->|"реквізити"| summary
  warnings -->|"виправити відсутні дані"| people
  guide -.-> help

  class analyser,templates,generator,generated,people,control,staffing,assets,crews,positions,plan,journal,incidents,summary,settings,warnings,guide page;
  class help auto;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
```

## 2. Єдине джерело правди та головні зв’язки даних

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":30,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart TB
  excel["Excel-база<br/>імпорт / експорт"]
  settingsFile["settings.json<br/>підрозділ · підписанти · видимі колонки"]

  subgraph sqlite["SQLite — поточний стан і історія"]
    personnel[("Особовий склад")]
    staffSlots[("Штатні місця<br/>призначення · ТВО · рекомендації")]
    control[("Контроль ОС<br/>поточне місце · історія")]
    crewData[("Екіпажі<br/>офіційний і фактичний склад")]
    assetData[("Майно<br/>власник · відповідальний · стан")]
    positionData[("Позиції<br/>роботи · періоди · історія статусів")]
    planData[("Знімки плану польотів<br/>до 3 місяців")]
    journalData[("Журнал польотів")]
    incidentData[("Інциденти<br/>пов’язані особи й майно")]
    summaryDrafts[("Чернетки підсумкового")]
  end

  templates["DOCX-шаблони<br/>токени автозаповнення"]
  values["Пул значень генератора"]
  bcsModel["Модель БЧС"]
  summaryModel["Модель підсумкового донесення"]
  generated["Незмінні DOCX / XLSX<br/>та manifest знімка"]

  excel ==> personnel
  excel ==> staffSlots
  excel ==> control
  excel ==> crewData
  excel ==> assetData
  personnel --> staffSlots
  personnel --> control
  personnel --> crewData
  personnel --> assetData
  personnel --> incidentData
  crewData --> assetData
  crewData --> positionData
  crewData --> planData
  positionData --> planData
  planData -.->|"фактичне перебування"| control
  positionData -.->|"реко / облаштування / охорона"| control
  control --> bcsModel
  staffSlots --> bcsModel
  crewData --> bcsModel
  planData --> bcsModel
  planData -.->|"лише підстановка у форму; запис зберігає користувач"| journalData
  journalData --> summaryModel
  planData --> summaryModel
  positionData --> summaryModel
  staffSlots --> summaryModel
  summaryDrafts --> summaryModel

  personnel --> values
  staffSlots --> values
  crewData --> values
  assetData --> values
  positionData --> values
  settingsFile --> values
  templates --> values
  values ==> generated
  bcsModel ==> generated
  summaryModel ==> generated

  class personnel,staffSlots,control,crewData,assetData,positionData,planData,journalData,incidentData,summaryDrafts data;
  class excel,settingsFile,templates,generated file;
  class values,bcsModel,summaryModel auto;
  classDef data fill:#2a2418,stroke:#b59b53,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef file fill:#21252d,stroke:#9298a6,color:#f5f7ef,stroke-width:1.5px;
```

## 3. Оболонка, навігація та автоматичне оновлення

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":48,"htmlLabels":true}}}%%
flowchart LR
  launch(["Запуск"])
  diagnostics["Перевірка сумісності<br/>БД · налаштувань · файлів"]
  hasWarnings{"Є попередження?"}
  warningPage["Сторінка «Попередження»"]
  normalPage["Останній / початковий розділ"]
  refreshWarnings["«Перевірити знову»"]
  openPeople["«Відкрити особовий склад»"]

  sidebar["Сайдбар"]
  groupToggle["Назва групи<br/>згорнути / розгорнути"]
  navButton["Назва сторінки<br/>перейти без перезавантаження"]
  collapse["Згорнути сайдбар<br/>запам’ятати стан"]

  mutation["Створення · редагування · видалення<br/>у доменному сервісі"]
  opEvent(("operational-data-updated"))
  settingsMutation["Зміна підрозділу / підписанта / колонок"]
  settingsEvent(("settings-updated"))
  subscribers["Залежні відкриті сторінки<br/>перечитують лише потрібні дані"]
  preserve["Поточна сторінка і scroll<br/>не скидаються таймером"]

  launch --> diagnostics --> hasWarnings
  hasWarnings -->|"так"| warningPage
  hasWarnings -->|"ні"| normalPage
  warningPage --> refreshWarnings --> diagnostics
  warningPage --> openPeople --> normalPage
  normalPage --> sidebar
  sidebar --> groupToggle
  sidebar --> navButton
  sidebar --> collapse

  mutation ==> opEvent -.-> subscribers -.-> preserve
  settingsMutation ==> settingsEvent -.-> subscribers

  class warningPage,normalPage,sidebar page;
  class refreshWarnings,openPeople,groupToggle,navButton,collapse,mutation,settingsMutation action;
  class opEvent,settingsEvent,subscribers,preserve auto;
  class diagnostics,hasWarnings warn;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

## 4. Документи: від шаблону до готового рапорту

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart TB
  subgraph templatePage["Шаблони"]
    tList["Список DOCX-шаблонів"]
    tView["Пошук · фільтр · «Скинути» · вибір шаблону"]
    tRefresh["«Оновити»<br/>очистити кеш і перечитати каталог"]
    tOpenFolder["«Відкрити папку»"]
    tOpen["«Відкрити»<br/>відкрити DOCX"]
    tInsert["«Вставити поле»<br/>відкрити вибір автозаповнення"]
    tValidate["«Перевірити шаблон»<br/>синтаксис · змінні · модифікатори"]
    tLast["Останній рапорт<br/>відкрити готовий DOCX"]
    tDelete["«Видалити»"]
    tDeleteConfirm{"Підтвердити<br/>переміщення в кошик?"}
  end

  picker["Поля автозаповнення<br/>джерело → сутність → поле → номер − / +<br/>відмінок · регістр · жирний · підкреслення · технічний код"]
  clipboard["«Скопіювати поле»<br/>токен у буфер обміну"]

  subgraph analyserPage["Аналізатор рапортів"]
    aChoose["«Обрати DOCX»<br/>прочитати текст і стилі"]
    aReset["X біля файла<br/>скинути аналіз"]
    aDetect["Автоаналіз<br/>знайти відомі значення і запропонувати токени"]
    aSelect["Виділити текст у preview"]
    aField["«Вставити поле»<br/>відкрити той самий picker"]
    aManual["Ручна заміна<br/>«Застосувати» / «Видалити»"]
    aModifiers["«Модифікатори»<br/>відмінок · регістр · формат"]
    aUndo["«Скасувати останню зміну»"]
    aProposal["Увімкнути / змінити пропозицію<br/>обрати альтернативний токен"]
    aCreate["«Створити шаблон»"]
  end

  subgraph generatorPage["Генерація рапортів"]
    gChoose["Пошук і вибір шаблону<br/>або «Відкрити шаблон з файлу…»"]
    gInspect["Автоматично прочитати токени<br/>і визначити потрібні сутності"]
    gSelect["Обрати людей / авто / екіпажі / позиції / майно<br/>checkbox · вище / нижче · очистити · обрати потрібну кількість · «Готово»"]
    gParams["«Параметри значень»<br/>заповнити ручні значення → «Готово»"]
    gGenerate["«Згенерувати рапорт»"]
    gValidate{"Усі дані існують,<br/>кількість і параметри правильні?"}
    gOpen["«Відкрити документ»"]
    gFolder["«Відкрити папку»"]
  end

  subgraph generatedPage["Згенеровані рапорти"]
    rList["Журнал створених документів"]
    rView["Пошук · період · сортування · вибір рядків"]
    rOpen["«Відкрити»"]
    rFolder["«Відкрити папку»"]
    rDelete["«Видалити» / «Видалити вибрані»"]
    rConfirm{"Підтвердити видалення?"}
  end

  templateDir[("Каталог шаблонів")]
  db[("SQLite")]
  settings[("settings.json")]
  output[("Згенеровані рапорти / DD.MM.YYYY<br/>DOCX + manifest")]
  templateTrash[(".trash/templates")]
  reportTrash[(".trash/reports")]
  error["Показати точну причину<br/>і не створювати пошкоджений файл"]

  templateDir --> tList
  tList --> tView
  tView --> tRefresh --> tList
  tView --> tOpenFolder --> templateDir
  tView --> tOpen --> templateDir
  tView --> tInsert --> picker --> clipboard
  tView --> tValidate
  tView --> tLast --> output
  tView --> tDelete --> tDeleteConfirm
  tDeleteConfirm ==>|"так"| templateTrash

  aChoose --> aDetect --> aSelect
  aChoose --> aReset
  aSelect --> aField --> picker
  picker -->|"замінити виділення"| aManual
  aSelect --> aManual
  aSelect --> aModifiers --> aManual
  aManual --> aUndo
  aDetect --> aProposal --> aCreate
  aManual --> aCreate
  aCreate ==> templateDir
  aCreate -.->|"оновити список і перейти"| tList

  templateDir --> gChoose --> gInspect --> gSelect
  gInspect --> gParams
  gSelect --> gGenerate
  gParams --> gGenerate
  db --> gGenerate
  settings --> gGenerate
  gGenerate --> gValidate
  gValidate -->|"ні"| error
  gValidate -->|"так"| output
  output --> gOpen
  output --> gFolder
  output -.->|"інвалідація журналу"| rList

  output --> rList --> rView
  rView --> rOpen --> output
  rView --> rFolder --> output
  rView --> rDelete --> rConfirm
  rConfirm ==>|"так"| reportTrash

  class tList,rList page;
  class tView,tRefresh,tOpenFolder,tOpen,tInsert,tValidate,tLast,tDelete,clipboard,aChoose,aReset,aSelect,aField,aManual,aModifiers,aUndo,aProposal,aCreate,gChoose,gSelect,gParams,gGenerate,gOpen,gFolder,rView,rOpen,rFolder,rDelete action;
  class aDetect,gInspect auto;
  class templateDir,db,settings,output,templateTrash,reportTrash file;
  class tDeleteConfirm,gValidate,rConfirm,error warn;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef file fill:#21252d,stroke:#9298a6,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

## 5. Особовий склад і контроль місця перебування

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart TB
  subgraph registry["Особовий склад → вкладка «Особовий склад»"]
    pTable["Таблиця військовослужбовців"]
    pView["Пошук · фільтри · колонки · сортування · скрол"]
    pAdd["«Додати військовослужбовця»"]
    pRow["Клік рядка<br/>відкрити деталі"]
    pTabs["Основне · Служба · Документи<br/>Контакти · БЧС · Майно · Кастомні поля"]
    pEdit["«Редагувати»"]
    pDelete["«Видалити»"]
    pConfirm{"Підтвердити безповоротне<br/>видалення з бази?"}
    pFields["Редактор кастомних полів<br/>додати · перейменувати · видалити"]
  end

  subgraph controlPage["Особовий склад → вкладка «Контроль особового складу»"]
    cCurrent["«Актуальні»<br/>поточне місце кожної людини"]
    cHistory["«Історія»<br/>створено · змінено · завершено"]
    cSearch["Пошук · вкладки за типом · лічильники"]
    cAssign["«Розподілити особовий склад»"]
    cPeople["Обрати одну або кількох<br/>доступних людей"]
    cLocation["Тип · місце · дати · примітка"]
    cSave["«Зберегти»"]
    cEdit["Олівець<br/>редагувати ручний запис"]
    cFinish["Галочка<br/>завершити перебування"]
    cNext{"Обрано дату завершення<br/>і наступне місце?"}
    cMore["«Показати ще 100 подій»"]
    cLocked["Замок «Автоматично» / «У БЧС»<br/>редагування у джерелі"]
    cWarning["Попередження «Не вказано»<br/>показати нерозподілених"]
  end

  subgraph automatic["Автоматичні джерела"]
    flight["План польотів<br/>На позиції · ЗБЗ · ПБЗ"]
    work["Роботи на позиції<br/>періоди реко · облаштування · охорони<br/>→ вкладка «Реко та облаштування»"]
    bcsInput["Редаговані поля БЧС"]
  end

  db[("SQLite<br/>personnel · custom fields<br/>personnel_control_assignments / events")]
  bcs["Модель БЧС<br/>«Де знаходиться» і підсумки"]
  picker["Конструктор змінних<br/>нові кастомні поля"]
  opEvent(("operational-data-updated"))

  db --> pTable --> pView
  pTable --> pRow --> pTabs
  pTable --> pAdd ==> db
  pTabs --> pEdit ==> db
  pTabs --> pDelete --> pConfirm
  pConfirm -->|"так"| db
  pFields ==> db
  db -.-> picker

  db --> cCurrent
  cCurrent --> cSearch
  cCurrent --> cAssign --> cPeople --> cLocation --> cSave ==> db
  cCurrent --> cEdit --> cLocation
  cCurrent --> cFinish --> cNext
  cNext -->|"ні"| cFinish
  cNext -->|"так: закрити старе + створити нове"| db
  cCurrent --> cLocked
  cCurrent --> cWarning
  db --> cHistory --> cMore

  flight -.-> db
  work -.-> db
  bcsInput -.-> db
  db --> bcs
  db ==> opEvent -.-> cCurrent
  opEvent -.-> bcs

  class pTable,cCurrent,cHistory,bcs page;
  class pView,pAdd,pRow,pTabs,pEdit,pDelete,pFields,cSearch,cAssign,cPeople,cLocation,cSave,cEdit,cFinish,cMore,cLocked,cWarning action;
  class flight,work,bcsInput,opEvent auto;
  class db data;
  class pConfirm,cNext warn;
  class picker file;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef data fill:#2a2418,stroke:#b59b53,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef file fill:#21252d,stroke:#9298a6,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

### Правила контролю ОС

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":48,"htmlLabels":true}}}%%
flowchart LR
  person["Військовослужбовець"]
  source{"Яке джерело<br/>визначило місце?"}
  auto["План / позиція<br/>автоматичний запис"]
  bcsSource["Поле БЧС<br/>запис керується в БЧС"]
  manual["Контроль ОС<br/>ручне призначення"]
  locked["Тільки перегляд<br/>замок і назва джерела"]
  editable["Редагувати або завершити"]
  history["Незмінна подія в історії"]
  next["Нове місце обов’язкове<br/>після завершення"]
  warning["Якщо місця немає —<br/>попередження «Не вказано»"]

  person --> source
  source -->|"план / робота"| auto --> locked
  source -->|"БЧС"| bcsSource --> locked
  source -->|"вручну"| manual --> editable
  editable ==> history
  editable --> next
  source -->|"нічого"| warning

  class person page;
  class auto,bcsSource,manual data;
  class locked,editable,next action;
  class history auto;
  class source,warning warn;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef data fill:#2a2418,stroke:#b59b53,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

## 6. Штат і БЧС

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart TB
  subgraph staffTab["Вкладка «Штат»"]
    staffTree["Дерево підрозділу<br/>блоки · підблоки · посади"]
    staffToggle["Розгорнути / згорнути блок"]
    staffCopy["Клік картки людини<br/>скопіювати звання, ПІБ і посаду"]
    staffParams["«Параметри штатки»<br/>початково згортати всі блоки"]
    transfer["«Переміщення»"]
    choosePerson["Обрати людину"]
    chooseSlot["Обрати посаду<br/>постійно або ТВО"]
    chain["Побудувати ланцюжок<br/>і розв’язати зайняті посади"]
    apply["«Застосувати переміщення»"]
    recommendation["«Рек. лист»<br/>кандидат на вакансію"]
    saveLetter["«Зберегти лист»"]
  end

  subgraph bcsTab["Вкладка «БЧС»"]
    bcsTable["Таблиця БЧС<br/>штат · список · наявність · де знаходиться"]
    bcsEdit["Редагувати дозволені поля людини<br/>або фактичну чисельність екіпажу"]
    bcsZoom["Масштаб · розгортання колонок"]
    bcsParams["«Параметри БЧС»"]
    bcsExtra["Додати<br/>прикомандированого · тимчасового · підгрупу"]
    bcsExtraEdit["Редагувати / видалити<br/>окремий запис"]
    bcsExport["«Експорт БЧС»"]
  end

  structure[("settings.json<br/>скелет підрозділу")]
  staffing[("SQLite<br/>штатні призначення · ТВО<br/>рекомендації · тимчасові записи")]
  sources["Актуальні джерела<br/>Контроль ОС · екіпажі · план · роботи на позиції"]
  model["Автоматичне формування<br/>рядків, груп і підсумків БЧС"]
  xlsx[("XLSX БЧС")]
  conflicts{"Є дубль посади,<br/>незавершений ланцюжок або ТВО?"}

  structure --> staffTree
  staffing --> staffTree
  staffTree --> staffToggle
  staffTree --> staffCopy
  staffTree --> staffParams
  staffTree --> transfer --> choosePerson --> chooseSlot --> chain --> conflicts
  conflicts -->|"так"| chain
  conflicts -->|"ні"| apply ==> staffing
  staffTree --> recommendation --> saveLetter ==> staffing

  structure --> model
  staffing --> model
  sources --> model --> bcsTable
  bcsTable --> bcsEdit ==> staffing
  bcsTable --> bcsZoom
  bcsTable --> bcsParams --> bcsExtra ==> staffing
  bcsParams --> bcsExtraEdit ==> staffing
  bcsParams --> bcsExport ==> xlsx

  class staffTree,bcsTable page;
  class staffToggle,staffCopy,staffParams,transfer,choosePerson,chooseSlot,chain,apply,recommendation,saveLetter,bcsEdit,bcsZoom,bcsParams,bcsExtra,bcsExtraEdit,bcsExport action;
  class structure,staffing,sources data;
  class model auto;
  class xlsx file;
  class conflicts warn;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef data fill:#2a2418,stroke:#b59b53,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef file fill:#21252d,stroke:#9298a6,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

## 7. Екіпажі та позиції

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart LR
  subgraph crewPage["Екіпажі"]
    crewCards["Картки екіпажів<br/>пошук · скрол · відкрити"]
    crewCreate["«Створити екіпаж»"]
    crewOverview["Огляд<br/>назва · статус · смуга · позиція · основний БпЛА"]
    crewMembers["ОС<br/>офіційний / фактичний склад"]
    crewAdd["«Додати людей»<br/>пошук і множинний вибір"]
    crewMove{"Людина вже<br/>в іншому екіпажі?"}
    crewRemove["Кошик<br/>прибрати зі складу"]
    crewAssets["Майно<br/>БпЛА · авто · генератори · зв’язок · зброя"]
    crewAssignUav["«Закріпити БпЛА»"]
    crewReassign{"БпЛА має<br/>інший екіпаж?"}
    crewDetach["Кошик<br/>зняти прив’язку майна"]
    crewHistory["Історія<br/>інциденти екіпажу"]
    crewSave["«Зберегти екіпаж»<br/>або закрити зі збереженням змін"]
    crewDelete["«Видалити екіпаж»<br/>після підтвердження"]
  end

  subgraph positionPage["Позиції"]
    positionCards["Картки позицій<br/>пошук · скрол · відкрити"]
    positionCreate["«Додати позицію»"]
    positionOverview["Огляд<br/>назва · тип · БРО · смуга · район · MGRS · готовність"]
    positionRelations["Екіпажі і майно<br/>лише пов’язані дані"]
    positionHistory["Історія<br/>роботи · статуси · інциденти"]
    reconnaissance["«Провести рекогностування»"]
    setupWork["«Провести облаштування»"]
    workPeople["Пошук і вибір доступних людей"]
    workPeriods["Періоди кожної людини<br/>додати · видалити · вид робіт · від / до"]
    rotation["Тривалість чергування<br/>автоматично побудувати графік"]
    workSave["«Зберегти групу»"]
    workEdit["Редагувати / видалити роботи"]
    setupPosition["«Облаштувати позицію»<br/>нова або наявна"]
    positionSave["«Зберегти позицію»"]
    positionDelete["«Видалити позицію»<br/>після підтвердження"]
  end

  personnel[("ОС")]
  crews[("crews<br/>crew_members · crew_actual_members")]
  positions[("positions · position_uavs")]
  work[("position_work<br/>members · periods · events · status history")]
  assets[("equipment · vehicles")]
  plan["План польотів"]
  control["Контроль ОС / БЧС"]
  incidents["Інциденти"]

  crewCards --> crewCreate --> crewOverview
  crewCards --> crewOverview
  crewOverview --> crewMembers --> crewAdd --> crewMove
  crewMove -->|"так: показати попереднього власника"| crewAdd
  crewMove -->|"підтверджено"| crewMembers
  crewMembers --> crewRemove
  crewOverview --> crewAssets --> crewAssignUav --> crewReassign
  crewReassign -->|"підтвердити перенесення"| crewAssets
  crewAssets --> crewDetach
  crewOverview --> crewHistory
  crewOverview --> crewSave ==> crews
  crewRemove --> crewSave
  crewAssets --> crewSave
  crewOverview --> crewDelete ==> crews

  personnel --> crewAdd
  assets --> crewAssets
  positions --> crewOverview
  incidents --> crewHistory
  crews -.-> plan
  crews -.-> control

  positionCards --> positionCreate --> positionOverview
  positionCards --> positionOverview
  positionOverview --> positionRelations
  positionOverview --> positionHistory
  positionOverview --> reconnaissance --> workPeople --> workPeriods --> workSave ==> work
  positionOverview --> setupWork --> workPeople
  workPeriods --> rotation
  positionHistory --> workEdit ==> work
  positionCards --> setupPosition --> workPeople
  setupPosition ==> positions
  setupPosition ==> work
  positionOverview --> positionSave ==> positions
  positionOverview --> positionDelete ==> positions

  crews --> positionRelations
  assets --> positionRelations
  work --> positionHistory
  incidents --> positionHistory
  work -.-> control
  work -.-> plan

  class crewCards,positionCards,plan,control,incidents page;
  class crewCreate,crewOverview,crewMembers,crewAdd,crewRemove,crewAssets,crewAssignUav,crewDetach,crewHistory,crewSave,crewDelete,positionCreate,positionOverview,positionRelations,positionHistory,reconnaissance,setupWork,workPeople,workPeriods,rotation,workSave,workEdit,setupPosition,positionSave,positionDelete action;
  class personnel,crews,positions,work,assets data;
  class crewMove,crewReassign warn;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef data fill:#2a2418,stroke:#b59b53,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

## 8. План польотів, журнал і підсумкове донесення

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart TB
  subgraph planning["План польотів"]
    dateNav["Попередній день · дата · наступний день<br/>«Сьогодні» · «Завтра»"]
    dateRange{"Дата в межах<br/>−3 місяці … +7 днів?"}
    loadPlan["Завантажити канонічний знімок<br/>або відновити локальну незбережену чернетку"]
    crewSelect["Checkbox екіпажу<br/>додати / прибрати з плану"]
    crewExpand["Розгорнути екіпаж"]
    planFields["Фактичний склад і командир · позиція · авто<br/>БпЛА / БК · маршрут · район · висота · погода · завдання · час"]
    presence["Прибуває сьогодні / вибуває сьогодні<br/>і час переходу"]
    rotate["«Провести ротацію»<br/>новий склад і командир"]
    rotateEdit["Редагувати / видалити етап ротації"]
    validatePlan{"Розклад не перетинається,<br/>склад доступний, позивні заповнені?"}
    autoSave["Автозбереження після зміни<br/>серійна черга · локальний pending fallback"]
    retrySave["«Повторити збереження»"]
    planParams["«Параметри плану польотів»<br/>підрозділ · дата · масштаб"]
    exportPlan["«Експорт плану»"]
  end

  subgraph journal["Журнал польотів"]
    journalTable["Таблиця фактичних польотів<br/>sticky-шапка · скрол · деталі"]
    addFlight["«Додати»"]
    chooseFlight["Дата + екіпаж"]
    prefill["Підставити зі знімка плану<br/>позицію · БРО · час · БпЛА · БК · завдання"]
    actualFlight["Внести фактичні «Небо» / «Земля»<br/>і за потреби виправити решту полів"]
    saveFlight["«Зберегти запис»<br/>або закрити змінену модалку зі збереженням"]
    flightDetails["Клік рядка → деталі → «Готово»"]
  end

  subgraph summary["Підсумкове донесення"]
    summaryDate["Звітний період 18:01 D−1 — 18:00 D"]
    summarySources["Автоматично зібрати<br/>плани D−1 і D · польоти · БЧС · позиції · роботи"]
    summaryManual["Ручні секції<br/>додати · редагувати · видалити рядки / групи / періоди"]
    dutySchedule["КСП і охорона<br/>додати періоди · обрати години · побудувати чергування"]
    summaryRefresh["«Оновити»<br/>перечитати джерела на вимогу"]
    summaryParams["«Параметри ПД»<br/>реквізити, що переходять у наступні донесення"]
    summarySwitch["«Попереднє» / «Нове донесення»<br/>підтвердження і збереження правок"]
    beforeNoon{"Повернення до попереднього<br/>ще доступне до 12:00?"}
    exportSummary["«Створити підсумкове донесення»"]
    openSummary["«Відкрити створений DOCX»"]
  end

  crews[("Екіпажі + фактичний склад")]
  positions[("Позиції")]
  assets[("Авто · БпЛА · БК · Цукерня")]
  settings[("Налаштування підрозділу")]
  snapshots[("flight_plan_snapshots")]
  locationSync["Розрахунок На позиції / ЗБЗ / ПБЗ / ОХ<br/>і синхронізація Контролю ОС та БЧС"]
  journalDb[("flight_journal_entries<br/>незмінні snapshot-поля")]
  summaryDraft[("summary_report_drafts<br/>лише ручна частина")]
  files[("XLSX плану / DOCX підсумкового")]

  dateNav --> dateRange
  dateRange -->|"ні"| dateNav
  dateRange -->|"так"| loadPlan
  snapshots --> loadPlan
  crews --> loadPlan
  positions --> loadPlan
  assets --> loadPlan
  settings --> loadPlan
  loadPlan --> crewSelect --> crewExpand --> planFields
  planFields --> presence
  planFields --> rotate --> rotateEdit
  planFields --> validatePlan
  presence --> validatePlan
  rotateEdit --> validatePlan
  validatePlan -->|"ні: показати причину"| planFields
  validatePlan -->|"так"| autoSave ==> snapshots
  autoSave -->|"помилка"| retrySave --> autoSave
  snapshots -.-> locationSync
  planFields --> planParams --> exportPlan ==> files

  journalTable --> addFlight --> chooseFlight --> prefill
  snapshots --> prefill
  crews --> prefill
  positions --> prefill
  assets --> prefill
  prefill --> actualFlight --> saveFlight ==> journalDb
  journalTable --> flightDetails
  journalDb --> journalTable

  summaryDate --> summarySources
  snapshots --> summarySources
  journalDb --> summarySources
  locationSync --> summarySources
  summaryDraft --> summaryManual
  summarySources --> summaryManual
  summaryManual --> dutySchedule
  summaryManual ==> summaryDraft
  summaryManual --> summaryRefresh --> summarySources
  summaryManual --> summaryParams ==> summaryDraft
  summaryManual --> summarySwitch --> beforeNoon
  beforeNoon -->|"так"| summaryDate
  beforeNoon -->|"ні: лише нове"| summaryDate
  summaryManual --> exportSummary ==> files
  exportSummary --> openSummary

  class dateNav,journalTable,summaryDate page;
  class crewSelect,crewExpand,planFields,presence,rotate,rotateEdit,retrySave,planParams,exportPlan,addFlight,chooseFlight,actualFlight,saveFlight,flightDetails,summaryManual,dutySchedule,summaryRefresh,summaryParams,summarySwitch,exportSummary,openSummary action;
  class loadPlan,prefill,summarySources,autoSave,locationSync auto;
  class crews,positions,assets,settings,snapshots,journalDb,summaryDraft data;
  class files file;
  class dateRange,validatePlan,beforeNoon warn;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef data fill:#2a2418,stroke:#b59b53,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef file fill:#21252d,stroke:#9298a6,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

### 8.1. Ротації та перехід станів у БЧС

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":30,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart LR
  previous["Попередній план<br/>екіпаж на позиції"]
  current{"Що вказано<br/>у плані на дату?"}
  continues["Екіпаж продовжує роботу"]
  incoming["Новий екіпаж прибуває<br/>або входить у ротацію"]
  outgoing["Попередній екіпаж вибуває<br/>у вказаний час"]
  position["На позиції"]
  zbz["ЗБЗ"]
  pbz["ПБЗ"]
  nextDay["Наступна доба"]
  ox["ОХ"]
  workPriority{"Є активне реко /<br/>облаштування?"}
  work["Реко та облаштування<br/>має вищий пріоритет"]

  previous --> current
  current -->|"той самий склад"| continues --> position
  current -->|"заїзд"| incoming --> zbz
  current -->|"виїзд"| outgoing --> pbz
  zbz --> nextDay --> position
  pbz --> nextDay --> ox
  position --> workPriority
  zbz --> workPriority
  pbz --> workPriority
  workPriority -->|"так"| work
  workPriority -->|"ні"| position

  class previous,current page;
  class continues,incoming,outgoing,nextDay auto;
  class position,zbz,pbz,ox,work data;
  class workPriority warn;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef data fill:#2a2418,stroke:#b59b53,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

## 9. Майно: усі вкладки та прив’язки

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart TB
  hub["Сторінка «Майно»"]
  tabs["Вкладки<br/>Автомобілі · БпЛА та БпАК · Генератори<br/>Зв’язок · Зброя та БК · Цукерня"]

  subgraph vehicles["Автомобілі"]
    vTable["Таблиця<br/>пошук · фільтри · колонки · деталі"]
    vAdd["«Додати»"]
    vEdit["«Редагувати»"]
    vForm["Назва · номер · стан · відповідальна людина"]
    vSave["«Додати автомобіль» / «Зберегти»"]
    vDelete["«Видалити» → підтвердження"]
  end

  subgraph equipment["БпЛА / БпАК · генератори · зв’язок · зброя / БК"]
    eTable["Спільна таблиця<br/>пошук · фільтри · колонки · деталі"]
    eAdd["«Додати»"]
    eEdit["«Редагувати»"]
    eBase["Назва · інвентарний / серійний №<br/>стан · примітка · закріплення"]
    eUav["БпЛА / БпАК<br/>тип · кількість · день / ніч · комплектація"]
    ePart["«Додати компонент» / кошик компонента"]
    eWeapon["Зброя / БК / Вибухові матеріали<br/>відповідальний · залишок · одиниця"]
    eSave["«Додати» / «Зберегти»"]
    eDelete["«Видалити» → підтвердження"]
  end

  subgraph workshop["Цукерня"]
    wList["Історія виготовлень"]
    wAdd["«Додати виготовлення»"]
    wRecipe["Виріб · кількість · дата · екіпаж"]
    wMaterials["«Додати матеріал» / «Прибрати матеріал»<br/>кількість не більша за залишок"]
    wSave["«Зберегти виготовлення»"]
    wWriteOff["Атомарно списати складові<br/>і зафіксувати рецепт"]
  end

  personnel[("Особовий склад")]
  crews[("Екіпажі<br/>офіційний + фактичний склад")]
  vehicleDb[("vehicles")]
  equipmentDb[("equipment")]
  workshopDb[("workshop_products<br/>workshop_ingredients")]
  consumers["Екіпажі · Позиції · План · Журнал<br/>Інциденти · Генератор рапортів"]
  deleteCheck{"Підтверджено<br/>руйнівну дію?"}

  hub --> tabs
  tabs -->|"Автомобілі"| vTable
  vTable --> vAdd --> vForm
  vTable --> vEdit --> vForm
  personnel --> vForm
  vForm --> vSave ==> vehicleDb
  vTable --> vDelete --> deleteCheck
  deleteCheck -->|"так"| vehicleDb

  tabs -->|"4 реєстри майна"| eTable
  eTable --> eAdd --> eBase
  eTable --> eEdit --> eBase
  eBase -->|"БпЛА / БпАК"| eUav --> ePart
  eBase -->|"Зброя та БК"| eWeapon
  crews --> eBase
  personnel --> eWeapon
  eBase --> eSave ==> equipmentDb
  eTable --> eDelete --> deleteCheck
  deleteCheck -->|"так"| equipmentDb

  tabs -->|"Цукерня"| wList
  wList --> wAdd --> wRecipe --> wMaterials --> wSave --> wWriteOff
  equipmentDb --> wMaterials
  wWriteOff ==> equipmentDb
  wWriteOff ==> workshopDb

  vehicleDb --> consumers
  equipmentDb --> consumers
  workshopDb --> consumers

  class hub,vTable,eTable,wList,consumers page;
  class tabs,vAdd,vEdit,vForm,vSave,vDelete,eAdd,eEdit,eBase,eUav,ePart,eWeapon,eSave,eDelete,wAdd,wRecipe,wMaterials,wSave action;
  class personnel,crews,vehicleDb,equipmentDb,workshopDb data;
  class wWriteOff auto;
  class deleteCheck warn;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef data fill:#2a2418,stroke:#b59b53,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

## 10. Інциденти

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart LR
  list["Таблиця «Інциденти»<br/>скрол · відкрити деталі"]
  add["«Додати інцидент»"]
  common["Категорія · тип · статус · дата / час<br/>екіпаж · позиція · район · опис · дії · наслідки"]
  category{"Категорія<br/>інциденту"}
  people["Особовий склад<br/>«Додати осіб» / прибрати"]
  flight["БпЛА та польоти<br/>етап польоту · попередня причина"]
  other["Інше<br/>власна назва події"]
  crewSelect["Обраний екіпаж"]
  datedPlan["Знімок плану на дату<br/>позиція і ознака перебування"]
  actualCrew["Фактичний склад екіпажу"]
  availableAssets["Майно екіпажу й особисте майно<br/>його фактичного складу"]
  addAssets["«Додати майно» / прибрати"]
  save["«Зберегти інцидент»"]
  snapshot["Зафіксувати snapshot<br/>ПІБ · звання · посади · склад · майно · позиція"]
  db[("incidents<br/>incident_personnel · incident_equipment")]
  details["Клік рядка<br/>Тип — Прізвище І. — дата<br/>«Готово»"]
  limitation["Поточний UI: існуючий інцидент<br/>можна переглянути, але не редагувати й не видаляти"]

  list --> add --> common --> category
  category -->|"Особовий склад"| people
  category -->|"БпЛА та польоти"| flight
  category -->|"Інше"| other
  common --> crewSelect
  crewSelect --> datedPlan
  crewSelect --> actualCrew
  crewSelect --> availableAssets --> addAssets
  people --> save
  flight --> save
  other --> save
  common --> save
  actualCrew --> snapshot
  datedPlan --> snapshot
  addAssets --> snapshot
  save --> snapshot ==> db
  db --> list --> details
  details --> limitation

  class list,details page;
  class add,common,people,flight,other,crewSelect,addAssets,save action;
  class datedPlan,actualCrew,availableAssets,snapshot auto;
  class db data;
  class category,limitation warn;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef data fill:#2a2418,stroke:#b59b53,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

## 11. Налаштування, імпорт, експорт і резервування

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart TB
  settingsPage["Сторінка «Налаштування»"]

  subgraph unit["Підрозділ"]
    unitOpen["«Налаштувати»"]
    unitFields["Тип · коротка / повна назва<br/>військова частина · штатна чисельність"]
    structure["Структура<br/>розгорнути · drag-and-drop · перейменувати · видалити"]
    structureAdd["«Блок» · «Підблок / відділення»<br/>«Додати посаду»"]
    unitSave["«Зберегти»"]
  end

  subgraph signers["Підписанти"]
    signerAdd["«Додати підписанта»"]
    signerEdit["«Редагувати»"]
    signerForm["Роль · ПІБ · звання · посада"]
    signerSave["«Додати підписанта» / «Зберегти зміни»"]
    signerDelete["«Видалити» → підтвердження"]
  end

  subgraph dataActions["Дані"]
    openDir["«Відкрити директорію»"]
    backup["«Резервна копія БД»"]
    excelImport["«Імпорт Excel-бази»"]
    excelExport["«Експорт Excel-бази»"]
    zipExport["«Експортувати всі дані»"]
    zipImport["«Імпортувати архів даних»"]
  end

  settingsJson[("settings.json")]
  database[("SQLite")]
  custom[("custom_variables.json")]
  templates[("Шаблони")]
  reports[("Згенеровані рапорти")]
  backupDir[("Резервні копії / дата")]
  consumers["Штатка · БЧС · План · Підсумкове<br/>Конструктор · Аналізатор · Генератор"]

  settingsPage --> unitOpen --> unitFields --> structure --> structureAdd --> unitSave ==> settingsJson
  settingsPage --> signerAdd --> signerForm --> signerSave ==> settingsJson
  settingsPage --> signerEdit --> signerForm
  settingsPage --> signerDelete ==> settingsJson
  settingsJson -.-> consumers

  settingsPage --> openDir
  settingsPage --> backup
  database --> backup ==> backupDir
  settingsPage --> excelImport
  settingsPage --> excelExport
  settingsPage --> zipExport
  settingsPage --> zipImport

  database --> excelExport
  database --> zipExport
  settingsJson --> zipExport
  custom --> zipExport
  templates --> zipExport
  reports --> zipExport

  class settingsPage,consumers page;
  class unitOpen,unitFields,structure,structureAdd,unitSave,signerAdd,signerEdit,signerForm,signerSave,signerDelete,openDir,backup,excelImport,excelExport,zipExport,zipImport action;
  class settingsJson,database,custom,templates,reports,backupDir data;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef data fill:#2a2418,stroke:#b59b53,color:#f5f7ef,stroke-width:1.5px;
```

### Excel: сумісний імпорт старих і нових баз

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart TB
  choose["«Імпорт Excel-бази»<br/>обрати XLSX"]
  read["Знайти аркуші за видимою назвою<br/>прочитати два рядки заголовків"]
  old{"У старому XLSX немає<br/>нових колонок або аркушів?"}
  defaults["Додати безпечні defaults<br/>і відновити доступні legacy-зв’язки"]
  fatal{"Є фатальна помилка структури,<br/>дублі, зламане посилання або запис?"}
  mode{"Режим імпорту"}
  append["«Доповнити базу даних»<br/>додати / upsert"]
  replace["«Замінити базу даних»<br/>очистити залежні таблиці"]
  transaction["Одна SQLite-транзакція<br/>відновити всі зв’язки"]
  result{"Транзакція успішна?"}
  rollback["ROLLBACK<br/>чинна база не змінюється"]
  commit["COMMIT"]
  warnings["Показати нефатальні зауваження<br/>«Копіювати зауваження»"]
  error["Показати помилку<br/>«Копіювати помилку»"]
  done["«Готово» → перечитати застосунок"]
  db[("SQLite з актуальною схемою<br/>відсутні нові колонки додаються міграціями")]
  export["«Експорт Excel-бази»<br/>створити структуровані аркуші"]
  xlsx[("XLSX")]

  choose --> read --> old
  old -->|"так"| defaults --> fatal
  old -->|"ні"| fatal
  fatal -->|"так"| error --> rollback
  fatal -->|"ні"| mode
  mode -->|"доповнити"| append --> transaction
  mode -->|"замінити"| replace --> transaction
  transaction --> result
  result -->|"ні"| rollback
  result -->|"так"| commit ==> db
  commit --> warnings --> done
  db --> export ==> xlsx

  class choose,append,replace,warnings,error,done,export action;
  class read,defaults,transaction,commit,rollback auto;
  class db data;
  class xlsx file;
  class old,fatal,mode,result warn;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef data fill:#2a2418,stroke:#b59b53,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef file fill:#21252d,stroke:#9298a6,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

### Повний ZIP-архів і безпечне відновлення

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart LR
  exportButton["«Експортувати всі дані»"]
  selectParts["Обрати склад архіву<br/>БД · налаштування · кастомні поля · шаблони · рапорти"]
  create["«Створити архів»"]
  manifest["Manifest<br/>версія · перелік · розмір · SHA-256"]
  zip[("ZIP")]

  importButton["«Імпортувати архів даних»"]
  stage["Розпакувати у staging"]
  verify{"Безпечні шляхи, ліміти,<br/>manifest, hash, JSON і SQLite quick_check правильні?"}
  backup["Автоматично скопіювати<br/>поточні замінювані дані"]
  install["Встановити файли<br/>і виконати міграції БД"]
  reopen{"Нові дані<br/>успішно відкрились?"}
  rollback["Rollback<br/>повернути попередні файли"]
  reload["Перезапустити UI"]

  exportButton --> selectParts --> create --> manifest ==> zip
  zip --> importButton --> stage --> verify
  verify -->|"ні"| rollback
  verify -->|"так"| backup --> install --> reopen
  reopen -->|"ні"| rollback
  reopen -->|"так"| reload

  class exportButton,selectParts,create,importButton action;
  class manifest,stage,backup,install,reload auto;
  class zip file;
  class verify,reopen,rollback warn;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef file fill:#21252d,stroke:#9298a6,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

## 12. Довідник і попередження

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":30,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart LR
  guide["Довідник"]
  guideSearch["Пошук із синонімами"]
  guideCategories["Усі · Початок · Люди та екіпажі · Бойова робота<br/>Техніка та майно · Документи · Дані та налаштування"]
  guideTopic["Обрати тему<br/>розгорнути / згорнути"]
  guideAll["«Показати все» / «Показати весь довідник»"]
  hash["URL hash #guide-…<br/>відкрити конкретну тему"]

  diagnostics["Стартова діагностика"]
  warnings{"Є проблеми,<br/>які потребують уваги?"}
  warningPage["Попередження"]
  recheck["«Перевірити знову»"]
  openPeople["«Відкрити особовий склад»<br/>для відсутніх позивних"]
  normal["Продовжити роботу"]

  guide --> guideSearch --> guideTopic
  guide --> guideCategories --> guideTopic
  guide --> guideAll
  hash --> guideTopic

  diagnostics --> warnings
  warnings -->|"так"| warningPage
  warnings -->|"ні"| normal
  warningPage --> recheck --> diagnostics
  warningPage --> openPeople --> normal

  class guide,warningPage,normal page;
  class guideSearch,guideCategories,guideTopic,guideAll,recheck,openPeople action;
  class hash auto;
  class diagnostics,warnings warn;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

## 13. Технічний шлях кожної дії

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart LR
  user(["Користувач"])
  button["Кнопка / поле / рядок у React"]
  local{"Дія лише змінює<br/>відображення?"}
  uiState["React state / localStorage<br/>пошук · вкладка · секція · масштаб"]
  service["Типізований frontend service"]
  invoke["Tauri invoke"]
  command["Rust command<br/>валідація · нормалізація · транзакція"]
  target{"Куди записуємо?"}
  sqlite[("SQLite")]
  json[("settings.json<br/>custom_variables.json")]
  files[("DOCX · XLSX · ZIP<br/>каталоги програми")]
  result["Результат / помилка"]
  notification["Toast або field-level помилка"]
  event{"Чи команда поширює<br/>подію інвалідації?"}
  operationEvent(("operational-data-updated"))
  settingsEvent(("settings-updated"))
  generatedEvent(("generated-reports-changed"))
  reload["Залежні сторінки перечитують дані"]

  user --> button --> local
  local -->|"так"| uiState
  local -->|"ні"| service --> invoke --> command --> target
  target -->|"облік"| sqlite
  target -->|"налаштування"| json
  target -->|"документ / архів"| files
  sqlite --> result
  json --> result
  files --> result
  result --> notification
  result --> event
  event -->|"операційна мутація"| operationEvent --> reload
  event -->|"налаштування"| settingsEvent --> reload
  event -->|"новий / видалений рапорт"| generatedEvent --> reload
  event -->|"події немає"| notification

  class button,service,invoke,command,notification,reload action;
  class uiState,operationEvent,settingsEvent,generatedEvent auto;
  class sqlite,json data;
  class files file;
  class local,target,event warn;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef data fill:#2a2418,stroke:#b59b53,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef file fill:#21252d,stroke:#9298a6,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

### Спільна поведінка модальних вікон

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":30,"rankSpacing":50,"htmlLabels":true}}}%%
flowchart LR
  open["Відкрити модалку"]
  edit["Змінити поля"]
  submit["Основна кнопка<br/>або Enter для позначеної дії"]
  validate{"Дані валідні?"}
  save["Зберегти"]
  error["Показати помилку<br/>модалка лишається відкритою"]
  close["Esc · X · клік по фону · «Закрити»"]
  handler{"Який onClose<br/>визначила сторінка?"}
  autoSave["closeAndSave<br/>зберегти змінену чернетку"]
  cancel["Скасувати локальну чернетку"]
  confirm["Для руйнівної дії<br/>окреме підтвердження"]
  done(["Закрито"])

  open --> edit
  edit --> submit --> validate
  validate -->|"ні"| error --> edit
  validate -->|"так"| save --> done
  edit --> close --> handler
  handler -->|"Екіпаж / запис журналу та інші closeAndSave"| autoSave --> validate
  handler -->|"Скасування редактора"| cancel --> done
  edit -->|"видалення / відв’язування"| confirm
  confirm -->|"скасувати"| edit
  confirm -->|"підтвердити"| save

  class open,edit,submit,save,close,autoSave,cancel,confirm action;
  class validate,handler,error warn;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

## 14. Автоматичні перерахунки та «читання з побічними ефектами»

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":28,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart TB
  readCrew["list_crews"]
  syncCrew["Актуалізувати стан екіпажів<br/>за планом"]
  readStaff["list_staffing_records"]
  syncStaff["Нормалізувати посади<br/>і синхронізувати планові місця"]
  readControl["list_personnel_control_records"]
  syncControl["Закрити прострочені ручні записи<br/>і синхронізувати автоматичні стани"]
  readEquipment["list_equipment"]
  syncHolder["Перерахувати відповідального<br/>за фактичним, потім офіційним складом"]
  db[("SQLite змінюється навіть під час цих читань")]
  eventGap["Ці зміни не завжди мають<br/>окрему глобальну подію UI"]
  focus["Частина сторінок перечитує дані<br/>після focus / visibility / локального reload"]

  readCrew --> syncCrew ==> db
  readStaff --> syncStaff ==> db
  readControl --> syncControl ==> db
  readEquipment --> syncHolder ==> db
  db --> eventGap --> focus

  class readCrew,readStaff,readControl,readEquipment action;
  class syncCrew,syncStaff,syncControl,syncHolder,focus auto;
  class db data;
  class eventGap warn;
  classDef action fill:#10242c,stroke:#4f8296,color:#f5f7ef,stroke-width:1.5px;
  classDef data fill:#2a2418,stroke:#b59b53,color:#f5f7ef,stroke-width:1.5px;
  classDef auto fill:#281b2e,stroke:#9470a7,color:#f5f7ef,stroke-width:1.5px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

## 15. Важливі межі поточної реалізації

```mermaid
%%{init: {"theme":"base","themeVariables":{"primaryColor":"#1f2b1b","primaryTextColor":"#f5f7ef","primaryBorderColor":"#a8bd61","lineColor":"#7e8d72","secondaryColor":"#10242c","tertiaryColor":"#2a2418","clusterBkg":"#111711","clusterBorder":"#3e4d36","fontFamily":"Inter, Arial, sans-serif"},"flowchart":{"curve":"basis","nodeSpacing":30,"rankSpacing":52,"htmlLabels":true}}}%%
flowchart TB
  excelReplace["Excel «Замінити базу»"]
  clears["Очищає також плани, журнал, чернетки ПД,<br/>роботи на позиціях і Цукерню"]
  notExported["Ці дані не входять до Excel-експорту"]
  riskLoss["Ризик втрати операційної історії<br/>для повного перенесення слід використовувати ZIP"]

  journal["Журнал польотів"]
  journalLimit["Наразі лише створення і перегляд<br/>без редагування та видалення"]
  incidents["Інциденти"]
  incidentLimit["Наразі лише створення і перегляд<br/>без редагування та видалення"]

  vehicle["Синхронізація авто під час імпорту / ОС"]
  vehicleRisk["Поточний legacy-шлях може відкріпити авто,<br/>якщо назва посади не містить «водій»"]

  events["Глобальні події оновлення"]
  eventLimit["ОС, авто й частина Контролю ОС<br/>використовують прямий invoke без єдиної інвалідації"]

  excelReplace --> clears
  excelReplace --> notExported
  clears --> riskLoss
  notExported --> riskLoss
  journal --> journalLimit
  incidents --> incidentLimit
  vehicle --> vehicleRisk
  events --> eventLimit

  class excelReplace,journal,incidents,vehicle,events page;
  class clears,notExported,riskLoss,journalLimit,incidentLimit,vehicleRisk,eventLimit warn;
  classDef page fill:#1f2b1b,stroke:#a8bd61,color:#f5f7ef,stroke-width:2px;
  classDef warn fill:#351d1d,stroke:#cf7070,color:#f5f7ef,stroke-width:1.5px;
```

## Покриття схем

| Розділ застосунку | Детальна схема |
|---|---:|
| Генерація рапортів, Шаблони, Аналізатор, Згенеровані рапорти, Поля автозаповнення | 4 |
| Особовий склад, Контроль особового складу | 5 |
| Штат, БЧС, переміщення, ТВО, рекомендації | 6 |
| Екіпажі, Позиції, рекогностування й облаштування | 7 |
| План польотів, ротації, Журнал польотів, Підсумкове донесення | 8 |
| Автомобілі, БпЛА/БпАК, Генератори, Зв’язок, Зброя/БК, Цукерня | 9 |
| Інциденти | 10 |
| Налаштування, Excel, ZIP, резервні копії | 11 |
| Довідник, Попередження | 12 |
| Спільні кнопки, модалки, backend, події та ризики | 13–15 |
