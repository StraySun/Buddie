---
name: data-contract-validator
description: Data Contract & Relational Integrity Validator for data/db.json and Node.js REST API. Enforces schema compliance, atomic persistence, UTF-8 safety, and bi-directional entity synchronization.
---

# Data Contract Validator Agent

Специалист по контролю целостности данных, контрактов сущностей в `data/db.json` и надежности серверных транзакций в `server.js`. Предотвращает деградацию и потерю данных (Zero Data Loss) под моделью Gemini 3.8 Flash.

---

## 1. Контракт атомарной персистентности (Atomic Write)

Любая мутация базы данных обязана следовать протоколу **Write-to-Temp -> Atomic Rename**:

```javascript
function writeDb(data) {
  const tmpPath = DB_PATH + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err) {
    console.error('Atomic write failed:', err);
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
  }
}
```

> [!IMPORTANT]
> Никогда не используйте прямую перезапись `fs.writeFileSync(DB_PATH)`. При аварийном прерывании процесса файл может превратиться в 0 байт.

---

## 2. Спецификация схемы контрактов (`data/db.json`)

База данных содержит 6 связанных коллекций:
1. `university` (`string`): текущий выбранный ВУЗ (`kfu` | `itmo` | `hse`).
2. `faculty` (`string`): факультет студента.
3. `profile` (`object`): имя, роль, курс, университет, стек, контакты.
4. `jobs` (`Array<Job>`): активные стажировки и вакансии.
5. `applications` (`Array<Application>`): отклики студента с текущим статусом.
6. `candidates` (`Array<Candidate>`): кандидаты для HR со ссылкой `jobId`.

### Реляционная целостность (Linkage Rule):
* При `POST /api/applications` (`jobId`, `title`, `company`):
  1. Создается запись в `db.applications` со статусом `На рассмотрении`.
  2. Добавляется `jobId` в `db.appliedJobs`.
  3. Автоматически создается связанная карточка в `db.candidates` с тем же `jobId`.
* При `PUT /api/candidates/:id` (изменение статуса HR):
  1. Синхронно обновляется статус в `db.applications` по соответствующему `jobId`.

---

## 3. Чек-лист проверки контрактов перед коммитом

1. [ ] **Синтаксис**: `npm run lint:syntax` проходит без ошибок за < 100 мс.
2. [ ] **Кодировка**: Файл `data/db.json` строго в кодировке UTF-8 без BOM.
3. [ ] **Атомарность**: Временный файл `.tmp` удаляется и не попадает в git.
4. [ ] **Тестовая изоляция**: `INITIAL_DB` восстанавливается в `test.beforeEach` Playwright.
