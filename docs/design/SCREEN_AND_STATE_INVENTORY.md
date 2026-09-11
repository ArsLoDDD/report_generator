# RaportGen — реєстр екранів, вікон і станів

Це контрольний список повноти макета. Він використовується під час реалізації та візуальної перевірки.

## Сторінки

| № | Сторінка | Основний патерн | Головна дія | Пов’язані вікна |
|---:|---|---|---|---|
| 1 | Попередження | список проблем | Перевірити знову | звіт імпорту, перехід до сутності |
| 2 | Генерація рапортів | наявний layout, color-only | Згенерувати рапорт | вибір даних, параметри значень |
| 3 | Шаблони | наявний layout, color-only | Відкрити папку | перевірка, видалення |
| 4 | Аналізатор рапортів | наявний layout, color-only | Створити шаблон | модифікатори, конструктор змінних |
| 5 | Згенеровані рапорти | наявний layout, color-only | Відкрити | bulk delete |
| 6 | Конструктор змінних | наявний layout, color-only | Скопіювати | embedded modal |
| 7 | Особовий склад | table + 7-tab detail drawer | Додати людину | editor, filters, custom fields, delete |
| 8 | Штат і БЧС | redesigned staff / locked BCS | Переміщення або експорт | штатка, ТВО, рекомендація, БЧС, тимчасові |
| 9 | Екіпажі | card grid + 4-tab full card | Створити екіпаж | crew editor, people picker, asset picker, delete |
| 10 | Планування польотів | наявний layout, color-only controls | Експорт плану | загальні параметри, параметри екіпажу |
| 11 | Позиції | card grid + 3-tab full card | Додати позицію | editor, related assets, incident history, delete |
| 12 | Інциденти | chronological registry | Додати інцидент | incident editor |
| 13 | Майно | tabs: автомобілі / БпЛА / генератори / зв’язок / зброя | залежить від вкладки | editors, assignments, filters, deletes |
| 14 | Налаштування | local settings navigation | залежить від секції | unit, signer, import/export |
| 15 | Довідник | table of contents + article | контекстна | копіювання прикладу |

## Модальні сценарії

| Сімейство | Сценарії | Розмір |
|---|---|---|
| Сутність | людина, екіпаж, позиція, автомобіль, майно, інцидент | M/L/XL |
| Вибір і зв’язок | склад екіпажу, БпЛА/БпАК, водій/екіпаж автомобіля, дані рапорту | M/L |
| Документ | параметри БЧС, плану польотів, значень, модифікатори | M/L |
| Штат | параметри штатки, переміщення/ТВО, рекомендація, тимчасова людина | M/L |
| Налаштування | підрозділ, підписант, Excel import, archive export | M/L/XL |
| Підтвердження | delete, reassign, replace database, dirty close | S |
| Результат | успішний/частковий імпорт, експорт, помилка файлу | M |

## Стани, обов’язкові для кожного патерну

### Реєстр

- loading skeleton;
- empty;
- no results;
- loading more;
- selected row;
- detail drawer open/closed;
- filters active;
- bulk selection;
- recoverable error.

### Картки

- loading skeleton;
- empty;
- default;
- hover/focus;
- selected/open;
- inactive;
- warning/incomplete;
- deleted relation.

### Форми

- pristine;
- dirty;
- focused field;
- invalid field;
- async validation;
- disabled dependent field;
- saving;
- save success;
- save error;
- confirm close with unsaved changes.

### Документи

- loading preview;
- preview ready;
- zoom 35–100%;
- horizontal and vertical overflow;
- fixed document header only;
- normal non-sticky Excel index row;
- export ready;
- export blocked with exact cause;
- export processing;
- export complete/error.

### Імпорт Excel

- compatible file;
- older file with missing optional columns;
- partial import with defaults;
- rows added to warnings;
- corrupted/unsupported workbook;
- duplicate/conflict resolution;
- append;
- replace with confirmation.

## Interaction rules

- Row click opens details; checkbox click never triggers the row.
- Card click opens the full entity window.
- Escape closes the topmost window unless it contains unsaved changes.
- Enter submits only short forms; multiline forms require the explicit save button.
- Modal header and footer remain visible; only body scrolls.
- Destructive action is never the visually primary action.
- Disabled action has a visible explanation nearby.
- Toast reports a completed result; it never replaces field-level validation.
- Every relationship change names the current owner and the new owner before confirmation.
