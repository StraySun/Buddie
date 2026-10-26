# Агентская экосистема проекта «HR портал для студентов»

Оптимизирована для высокой производительности и стабильности под моделью **Gemini 3.8 Flash (Medium / High)**.

---

## 1. Состав специализированных ролей и навыков

| Агент / Навык | Название типа | Назначение | Ключевые файлы |
| :--- | :--- | :--- | :--- |
| **Backend & Data Architect** | `backend-data-agent` | REST API в `server.js`, схемы и валидация `data/db.json`, защита UTF-8 на Windows | `server.js`, `data/db.json` |
| **Data Contract Validator** | `data-contract-validator` | Атомарная запись `temp -> rename`, ссылочная целостность (Application <-> Candidate), Zero Data Loss | `server.js`, `data/db.json` |
| **UI/UX & Design Tokens** | `ui-frontend-specialist` | Семантическая вёрстка HTML5, токен-архитектура, WCAG AA доступность, SVG-спрайты | `css/variables.css`, `css/*.css`, `*.html` |
| **Design System Guardian** | `design-system-guardian` | Контроль запрета хардкодных цветов, тач-таргеты 44×44px, фокус-ринги, Zero Horizontal Overflow | `css/`, `*.html` |
| **Fast QA & Regression Pilot** | `qa-testing` | Двухуровневый контур верификации, таргетированные спеки Playwright, 33 E2E сценария | `tests/app.spec.js`, `playwright.config.js` |

---

## 2. Структура каталогов

```
.agents/
├── _archive/                      # Локальный архив (игнорируется в git через .gitignore)
├── skills/                        # Активные навыки, регистрируемые средой
│   ├── backend-data-agent/
│   ├── data-contract-validator/
│   ├── ui-frontend-specialist/
│   ├── design-system-guardian/
│   └── qa-testing/
└── README.md                      # Данный документ
```

---

## 3. Двухуровневый контур верификации (Self-Healing Loop)

Для максимальной скорости обратной связи и экономии токенов под Gemini 3.8 Flash:

```
[Агент вносит изменение]
         │
         ▼
[Tier 1: Pre-flight Syntax Check (< 100 мс)]
npm run lint:syntax (node --check js/app.js && node --check server.js)
         │
         ▼
[Tier 2: Targeted Playwright Spec (1-3 сек)]
npm run test:fast -- -g "название сценария"
         │
         ▼
[Tier 3: Full Regression Sweep (перед сдачей задачи)]
npm test (33 теста Playwright)
```

---

## 4. Защита от сбоев под Gemini 3.8 Flash

1. **Atomic Write**: Все мутации `data/db.json` идут через временный файл `db.json.tmp` и `fs.renameSync()`.
2. **Windows UTF-8**: Исключено повреждение кириллицы при работе с файлами (строгое указание `'utf8'`).
3. **Безопасные селекторы**: Исключены проверки динамически меняющегося текста в фильтрах локаторов Playwright.
4. **Git Hygiene**: Каталог `_archive/` и тестовые логи скрыты в `.gitignore`, сохраняя чистоту вывода `git status`.
