# Агентская экосистема проекта «HR портал для студентов (Buddie)»

Оптимизирована для высокой производительности, нулевой потери данных (**Zero Data Loss**) и стабильности под моделью **Gemini 3.8 Flash (Medium / High)**.

---

## 1. Состав специализированных ролей и навыков

| Агент / Навык | Название типа | Назначение | Ключевые файлы |
| :--- | :--- | :--- | :--- |
| **Backend & Data Architect** | `backend-data-agent` | REST API в `src/server.js`, схемы и валидация `data/db.json`, защита UTF-8 на Windows | `src/server.js`, `data/db.json` |
| **Data Contract Validator** | `data-contract-validator` | Атомарная запись `temp -> rename`, ссылочная целостность (Application <-> Candidate), Zero Data Loss | `src/server.js`, `data/db.json` |
| **Offline Fallback Guardian** | `offline-fallback-guardian` | Устойчивость GitHub Pages, Circuit Breaker в `ApiService`, относительные пути, валидация localStorage | `public/js/app.js`, `public/data/db.json` |
| **UI/UX & Design Tokens** | `ui-frontend-specialist` | Семантическая вёрстка HTML5, токен-архитектура, WCAG AA доступность, SVG-спрайты | `public/css/variables.css`, `public/*.html` |
| **Design System Guardian** | `design-system-guardian` | Контроль токенов, WCAG AA (>= 4.5:1), тач-таргеты 44×44px, Focus Trap, Zero Overflow | `public/css/`, `public/*.html` |
| **Performance & a11y Auditor** | `performance-accessibility-auditor` | Аудит Core Web Vitals (CLS, LCP, INP), Focus Trap модалок, Escape dismiss, мобильная доступность 320px | `public/css/`, `public/js/app.js` |
| **E2E Scenario Architect** | `e2e-scenario-architect` | Проектирование сложных Playwright-тестов, Edge Cases, Double Submit, сетевые оффлайн-сбои, @media print | `tests/app.spec.js` |
| **Fast QA & Regression Pilot** | `qa-testing` | Двухуровневый контур верификации, таргетированные спеки Playwright, 64 E2E теста | `tests/app.spec.js`, `playwright.config.js` |
| **Security & Data Sanitizer** | `security-sanitizer` | Защита от XSS, устранение Race Conditions (Double submit), валидация и trim строковых полей | `public/js/app.js`, `src/server.js` |
| **Documentation & Changelog** | `docs-changelog-maintainer` | Реестр REST API, инструкции деплоя GitHub Pages, актуализация .agents/README.md | `README.md`, `.agents/README.md` |
| **Request Accelerator** | `request-accelerator` | Декомпозиция больших запросов на параллельные пакеты, экономия контекста, чекпоинты | `.agents/skills/request-accelerator/` |
| **Bilingual Writing Assistant** | `bilingual-writer-agent` | Разгрузка написания текстов на RU/EN: документация, UI microcopy, PR, перевод | `.agents/skills/bilingual-writer-agent/` |

---

## 2. Структура каталогов

```
.agents/
├── skills/                               # Активные навыки, регистрируемые средой
│   ├── backend-data-agent/               # Серверный REST API и мьютекс-мутации
│   ├── data-contract-validator/          # Схемы данных и ссылочная целостность
│   ├── offline-fallback-guardian/        # Устойчивость GitHub Pages и Circuit Breaker
│   ├── ui-frontend-specialist/           # Семантическая вёрстка и дизайн-токены
│   ├── design-system-guardian/           # WCAG AA, Focus Trap, Zero Overflow
│   ├── performance-accessibility-auditor/# Core Web Vitals (CLS, LCP), модалки, a11y
│   ├── e2e-scenario-architect/           # Генератор стресс-сценариев Playwright
│   ├── qa-testing/                       # E2E-тестовый раннер и регрессионный сьют
│   ├── security-sanitizer/               # XSS-санитизация и защита от Double Submit
│   ├── docs-changelog-maintainer/        # Актуализация API-реестра и документации
│   ├── request-accelerator/              # Батчинг больших задач под Gemini Flash
│   └── bilingual-writer-agent/           # RU/EN копирайтинг и UI-микрокопии
└── README.md                             # Данный реестр экосистемы
```

---

## 3. Трехуровневый контур верификации (Self-Healing Loop)

Для максимальной скорости обратной связи и экономии токенов под Gemini 3.8 Flash:

```
[Агент вносит изменение]
         │
         ▼
[Tier 1: Pre-flight Syntax Check (< 100 мс)]
npm run lint:syntax (node --check public/js/app.js && node --check src/server.js)
         │
         ▼
[Tier 2: Targeted Playwright Spec (1-2 сек)]
npx playwright test -g "название сценария"
         │
         ▼
[Tier 3: Full Regression Sweep (перед сдачей задачи)]
npm test (64 теста Playwright)
```

---

## 4. Критические правила для Windows и Gemini 3.8 Flash

1. **Atomic Write**: Все мутации `data/db.json` идут через временный файл `db.json.tmp` и `fs.renameSync()`.
2. **Windows UTF-8**: Исключено повреждение кириллицы при работе с файлами (строгое указание `'utf8'`).
3. **Безопасные селекторы**: Исключены проверки динамически меняющегося текста в фильтрах локаторов Playwright.
4. **Circuit Breaker для GitHub Pages**: Отсутствие бэкенда на статическом хостинге не должно генерировать красных 404-ошибок в консоли.
