---
name: data-contract-validator
description: Data Contract & Relational Integrity Validator for data/db.json and Node.js REST API. Enforces schema compliance, atomic persistence, UTF-8 safety, and bi-directional entity synchronization.
---

# Data Contract Validator Agent

Специалист по контролю целостности данных, контрактов сущностей в `data/db.json` и надежности серверных транзакций в `src/server.js`. Обеспечивает парадигму **Zero Data Loss** под моделью Gemini 3.8 Flash на Windows OS.

---

## 1. Контракт атомарной персистентности (Atomic Safe Engine)

Любая мутация базы данных обязана следовать протоколу **Write-to-Temp -> Auto-Backup -> Safe Rename with Retries**:

```javascript
async function atomicPersist(data) {
  const tmpPath = DB_PATH + '.tmp';
  const jsonString = JSON.stringify(data, null, 2);

  // 1. Запись во временный файл UTF-8
  fs.writeFileSync(tmpPath, jsonString, 'utf8');

  // 2. Создание / обновление резервной копии
  try {
    fs.writeFileSync(BACKUP_PATH, jsonString, 'utf8');
  } catch (err) {}

  // 3. Атомарное переименование с циклом повторных попыток для Windows EPERM/EBUSY
  const maxRetries = 5;
  const backoff = [10, 25, 50, 100, 200];
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      fs.renameSync(tmpPath, DB_PATH);
      return true;
    } catch (err) {
      if ((err.code === 'EPERM' || err.code === 'EBUSY') && attempt < maxRetries - 1) {
        await delay(backoff[attempt]);
      } else if (attempt === maxRetries - 1) {
        fs.copyFileSync(tmpPath, DB_PATH);
        fs.unlinkSync(tmpPath);
        return true;
      }
    }
  }
}
```

> [!IMPORTANT]
> Никогда не перезаписывайте файл базы данных напрямую. Использование транзакционной очереди `runMutation` гарантирует отсутствие гонок и перезаписей.

---

## 2. Спецификация схемы контрактов (`data/db.json`)

База данных содержит 6 связанных коллекций:
1. `university` (`string`): текущий выбранный ВУЗ (`kfu` | `itmo` | `hse`).
2. `faculty` (`string`): факультет студента.
3. `profile` (`object`): имя, роль, курс, университет, стек, контакты.
4. `jobs` (`Array<Job>`): активные стажировки и вакансии.
5. `applications` (`Array<Application>`): отклики студента с текущим статусом.
6. `candidates` (`Array<Candidate>`): кандидаты для HR со связью `jobId`.
7. `savedJobs` (`Array<string>`): сохраненные идентификаторы вакансий.
8. `appliedJobs` (`Array<string>`): идентификаторы вакансий, на которые отправлен отклик.

### Реляционная целостность (Linkage Rule):
* При `POST /api/applications` (`jobId`, `title`, `company`):
  1. Создается запись в `db.applications` со статусом `На рассмотрении`.
  2. Добавляется `jobId` в `db.appliedJobs`.
  3. Автоматически создается связанная карточка в `db.candidates` с тем же `jobId`.
* При `DELETE /api/applications/:id`:
  1. Каскадно удаляется заявка из `db.applications`.
  2. Удаляется связанный `jobId` из `db.appliedJobs`.
  3. Удаляется созданный кандидат из `db.candidates` (предотвращение утечки данных в HR).

---

## 3. Чек-лист проверки контрактов перед коммитом

1. [ ] **Синтаксис**: `npm run lint:syntax` проходит без ошибок за < 100 мс.
2. [ ] **Кодировка**: Файлы `data/db.json` и `data/db.json.backup` строго в UTF-8.
3. [ ] **Стресс-тесты параллелизма**: `npx playwright test tests/backend-concurrency.spec.js` проходит за < 2 с.
4. [ ] **Полная регрессия**: Все 51 тест `npm test` завершаются успешно (зеленый статус).
