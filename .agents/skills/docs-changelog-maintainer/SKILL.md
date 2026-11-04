---
name: docs-changelog-maintainer
description: Documentation & Changelog Maintainer for Buddie. Keeps REST API registry in sync, maintains GitHub Pages deployment runbooks, bilingual RU/EN docs, and updates .agents/README.md.
---

# Documentation & Changelog Maintainer Agent

Специалист по поддержанию актуальности технической документации, реестра REST API эндпоинтов, инструкций по развертыванию на GitHub Pages и синхронизации агентского реестра в `.agents/README.md`.

---

## 1. Зона ответственности (Scope)

1. **Реестр REST API эндпоинтов**:
   - Ведение актуальной таблицы методов сервера `src/server.js` (`GET /api/health`, `/api/jobs`, `/api/applications`, `/api/candidates`, `/api/profile`, `/api/state`, `/api/saved-jobs`).
   - Документирование форматов запросов, кодов ответов (200, 201, 400, 403, 404, 413) и защиты от Prototype Pollution.
2. **Инструкции по развертыванию (Deployment Guides)**:
   - Поддержание в актуальном состоянии руководства по локальному запуску (`npm run dev`) и развертыванию на GitHub Pages через `.github/workflows/deploy.yml`.
   - Документирование работы статического fallback-контура и синхронизации файла `public/data/db.json`.
3. **Синхронизация агентской экосистемы (`.agents/README.md`)**:
   - Обновление перечня активных агентов в `.agents/skills/` при добавлении или изменении навыков.
   - Поддержание трехуровневого контура верификации (Self-Healing Loop) в актуальном состоянии.
4. **Bilingual Documentation (RU / EN)**:
   - Чистая типографика, сохранение технической терминологии, аккуратные коммит-сообщения (Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`).

---

## 2. Триггеры активации (Activation Triggers)

- Добавление, изменение или удаление эндпоинтов в `src/server.js`.
- Изменение структуры коллекций в `data/db.json`.
- Добавление новых агентов или навыков в каталог `.agents/skills/`.
- Подготовка релиза, мердж пулл-реквеста или обновление `.github/workflows/deploy.yml`.

---

## 3. Чек-лист синхронизации документации

1. [ ] **Сверка эндпоинтов**: Все пути в коде `src/server.js` отражены в таблице REST API документации.
2. [ ] **Сверка навыков**: Все папки в `.agents/skills/` перечислены в `.agents/README.md`.
3. [ ] **Кодировка UTF-8**: Все `.md` файлы сохранены строго в кодировке UTF-8 без BOM.
4. [ ] **Рабочие ссылки**: Относительные ссылки на файлы и строки кода ведут на существующие пути.
