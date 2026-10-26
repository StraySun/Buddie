# Агентская экосистема проекта «HR портал для студентов»

Оптимизирована для высокой производительности и стабильности под моделью **Gemini 3.8 Flash (Medium / High)**.

---

## 1. Состав специализированных агентов («Тройка»)

| Агент / Навык | Название типа | Назначение | Ключевые файлы |
| :--- | :--- | :--- | :--- |
| **Backend & Data Architect** | `backend-specialist` | REST API в `server.js`, схемы и валидация `data/db.json`, защита UTF-8 на Windows | [SKILL.md](file:///c:/Users/Wanderer/Desktop/HR%20портал%20для%20студентов/.agents/skills/backend-data-agent/SKILL.md), `server.js`, `data/db.json` |
| **UI/UX & Design Tokens Specialist** | `frontend-specialist` | Семантическая вёрстка HTML5, дизайн-токены в `css/variables.css`, WCAG AA доступность, SVG-иконки, нулевой оверфлоу | [SKILL.md](file:///c:/Users/Wanderer/Desktop/HR%20портал%20для%20студентов/.agents/skills/ui-frontend-specialist/SKILL.md), `css/`, `*.html` |
| **Autonomous QA & Regression Specialist** | `qa-specialist` | Сквозные e2e тесты Playwright (28 сценариев), адаптивность (320px, 375px, 1440px), устойчивость к сбоям `localStorage` | [SKILL.md](file:///c:/Users/Wanderer/Desktop/HR%20портал%20для%20студентов/.agents/skills/qa-testing/SKILL.md), `tests/app.spec.js`, `playwright.config.js` |

---

## 2. Структура каталогов

```
.agents/
├── _archive/                      # Локальный архив дублирующихся навыков ui-ux-pro-max
│   ├── banner-design/             # (сохранены локально, но не перегружают контекст)
│   ├── brand/
│   ├── design/
│   ├── design-system/
│   ├── slides/
│   ├── ui-styling/
│   └── ui-ux-pro-max/
├── skills/                        # Активные навыки, регистрируемые средой
│   ├── backend-data-agent/
│   ├── ui-frontend-specialist/
│   └── qa-testing/
└── README.md                      # Данный документ
```

---

## 3. Гибридный режим работы (Hybrid Orchestration)

1. **Повседневные задачи**: Выполняются основным агентом в текущем диалоге с автоматическим использованием правил из `skills/`.
2. **Изолированные / тяжёлые задачи**: Основной агент может вызвать специализированного субагента через инструмент `invoke_subagent`:
   - `backend-specialist` — для миграции базы данных или добавления новых REST-эндпоинтов.
   - `frontend-specialist` — для редизайна страниц и аудита контрастности.
   - `qa-specialist` — для полного регрессионного прогона тестов и фиксации скриншотов.

---

## 4. Защита от сбоев под Gemini 3.8 Flash

1. **Таргетированные тесты**: Вместо тяжелых полных прогонов используется запуск по имени:
   ```bash
   npx playwright test -g "название теста"
   ```
2. **Windows UTF-8**: Исключено повреждение кириллицы при работе с файлами (строгое указание кодировки `'utf8'` в Node.js).
3. **Безопасные селекторы**: Исключены проверки динамически меняющегося текста в фильтрах локаторов Playwright.
