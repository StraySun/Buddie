const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4173;
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const DB_PATH = path.join(ROOT, 'data', 'db.json');
const BACKUP_PATH = path.join(ROOT, 'data', 'db.json.backup');
const MAX_BODY_SIZE = 1024 * 1024; // 1 MB payload protection

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

// ==========================================
// In-Memory Database Engine & Zero Data Loss
// ==========================================
let dbCache = null;
let lastMtime = 0;
let writeQueue = Promise.resolve();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadDbFromDisk() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const stat = fs.statSync(DB_PATH);
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      dbCache = JSON.parse(raw);
      lastMtime = stat.mtimeMs;
      return dbCache;
    }
  } catch (err) {
    console.error('Failed reading primary DB, attempting backup recovery:', err.message);
  }

  // Backup recovery fallback
  try {
    if (fs.existsSync(BACKUP_PATH)) {
      const raw = fs.readFileSync(BACKUP_PATH, 'utf8');
      dbCache = JSON.parse(raw);
      console.log('Successfully recovered database state from backup!');
      return dbCache;
    }
  } catch (err) {
    console.error('Failed reading backup DB:', err.message);
  }

  // Fallback default minimal structure if no valid DB exists
  dbCache = {
    university: 'kfu',
    faculty: 'itis',
    profile: {
      name: 'Нур М.',
      role: 'Аналитика данных',
      course: '3-й курс',
      university: 'Казанский федеральный университет',
      skills: ['Python', 'SQL'],
      about: 'Студент КФУ'
    },
    savedJobs: [],
    appliedJobs: [],
    applications: [],
    jobs: [],
    candidates: []
  };
  return dbCache;
}

function getDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return loadDbFromDisk();
    }
    const stat = fs.statSync(DB_PATH);
    // If modified externally (e.g. test.beforeEach fs.writeFileSync), reload cache
    if (!dbCache || stat.mtimeMs !== lastMtime) {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      dbCache = JSON.parse(raw);
      lastMtime = stat.mtimeMs;
    }
  } catch {
    if (!dbCache) loadDbFromDisk();
  }
  return dbCache;
}

// Windows-safe atomic persist with exponential backoff retry and backup snapshot
async function atomicPersist(data) {
  const tmpPath = DB_PATH + '.tmp';
  const jsonString = JSON.stringify(data, null, 2);

  // 1. Write to temporary file with UTF-8 encoding
  fs.writeFileSync(tmpPath, jsonString, 'utf8');

  // 2. Safely create or update backup before replacing primary DB
  try {
    fs.writeFileSync(BACKUP_PATH, jsonString, 'utf8');
  } catch (bErr) {
    console.warn('Non-fatal: could not update backup file:', bErr.message);
  }

  // 3. Atomic rename with retry loop for Windows EPERM / EBUSY / EACCES
  const maxRetries = 5;
  const backoff = [10, 25, 50, 100, 200];
  let renamed = false;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      fs.renameSync(tmpPath, DB_PATH);
      renamed = true;
      break;
    } catch (err) {
      if ((err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES') && attempt < maxRetries - 1) {
        await delay(backoff[attempt]);
      } else if (attempt === maxRetries - 1) {
        // Fallback for strict Windows lock: copyFileSync + unlinkSync
        try {
          fs.copyFileSync(tmpPath, DB_PATH);
          fs.unlinkSync(tmpPath);
          renamed = true;
          break;
        } catch (copyErr) {
          console.error('Atomic rename & copy fallback failed:', copyErr);
          throw copyErr;
        }
      } else {
        throw err;
      }
    }
  }

  // 4. Update memory cache timestamp
  try {
    lastMtime = fs.statSync(DB_PATH).mtimeMs;
  } catch {}

  // Clean tmp if somehow leftover
  try {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  } catch {}

  return renamed;
}

// Mutex queue to serialize all mutations and prevent race conditions (Zero Race Conditions)
function runMutation(mutatorFn) {
  return new Promise((resolve, reject) => {
    writeQueue = writeQueue.then(async () => {
      try {
        const db = getDb();
        const result = await mutatorFn(db);
        await atomicPersist(db);
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }).catch(err => {
      console.error('Unhandled mutation queue error:', err);
      reject(err);
    });
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_SIZE) {
        const err = new Error('Payload Too Large');
        err.statusCode = 413;
        req.destroy(err);
        reject(err);
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        const jsonErr = new Error('Invalid JSON');
        jsonErr.statusCode = 400;
        reject(jsonErr);
      }
    });
    req.on('error', err => reject(err));
  });
}

function sendJson(res, statusCode, data, headers = {}) {
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
  const etag = `W/"${jsonStr.length}-${Buffer.byteLength(jsonStr, 'utf8')}"`;

  const finalHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Cache-Control': 'no-cache',
    'ETag': etag,
    ...headers
  };

  res.writeHead(statusCode, finalHeaders);
  res.end(jsonStr);
}

// Initial DB load
getDb();

// ==========================================
// Main HTTP Request Handler
// ==========================================
const server = http.createServer(async (req, res) => {
  const fullUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1:4173'}`);
  const reqPath = decodeURI(fullUrl.pathname);

  // ==========================================
  // REST API Endpoints
  // ==========================================
  if (reqPath.startsWith('/api/')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      // 0. GET /api/health - Системный статус и мониторинг
      if (reqPath === '/api/health' && req.method === 'GET') {
        const db = getDb();
        sendJson(res, 200, {
          status: 'healthy',
          uptime: Math.round(process.uptime()),
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          counts: {
            jobs: (db.jobs || []).length,
            applications: (db.applications || []).length,
            candidates: (db.candidates || []).length,
            savedJobs: (db.savedJobs || []).length
          }
        });
        return;
      }

      // 1. GET /api/db - Получить всё состояние
      if (reqPath === '/api/db' && req.method === 'GET') {
        const db = getDb();
        sendJson(res, 200, db);
        return;
      }

      // 2. GET /api/jobs - Получить вакансии (с поддержкой поиска и фильтрации)
      if (reqPath === '/api/jobs' && req.method === 'GET') {
        const db = getDb();
        let jobs = db.jobs || [];

        const search = fullUrl.searchParams.get('search');
        const specialty = fullUrl.searchParams.get('specialty');
        const format = fullUrl.searchParams.get('format');
        const university = fullUrl.searchParams.get('university');

        if (search || specialty || format || university) {
          jobs = jobs.filter(job => {
            if (search) {
              const q = search.toLowerCase();
              const inTitle = (job.title || '').toLowerCase().includes(q);
              const inComp = (job.company || '').toLowerCase().includes(q);
              const inDesc = (job.description || '').toLowerCase().includes(q);
              const inTags = (job.tags || []).some(t => t.toLowerCase().includes(q));
              if (!inTitle && !inComp && !inDesc && !inTags) return false;
            }
            if (specialty && specialty !== 'all') {
              if ((job.specialty || '').toLowerCase() !== specialty.toLowerCase()) return false;
            }
            if (format && format !== 'all') {
              if ((job.format || '').toLowerCase() !== format.toLowerCase()) return false;
            }
            if (university && university !== 'all') {
              const target = (job.targetUniversity || '').toLowerCase();
              if (target !== 'all' && target !== university.toLowerCase()) return false;
            }
            return true;
          });
        }

        sendJson(res, 200, jobs);
        return;
      }

      // 2.1. GET /api/jobs/:id - Получить конкретную вакансию
      if (reqPath.startsWith('/api/jobs/') && req.method === 'GET') {
        const jobId = decodeURIComponent(reqPath.slice('/api/jobs/'.length).replace(/\/+$/, ''));
        const db = getDb();
        const job = (db.jobs || []).find(j => j.id === jobId);
        if (job) {
          sendJson(res, 200, job);
        } else {
          sendJson(res, 404, { error: 'Job not found' });
        }
        return;
      }

      // 3. POST /api/jobs - Создать вакансию (от HR)
      if (reqPath === '/api/jobs' && req.method === 'POST') {
        const newJob = await parseBody(req);
        const createdJob = await runMutation(db => {
          newJob.id = newJob.id || 'job-' + Date.now();
          newJob.postedTime = 'Только что';
          newJob.rating = newJob.rating || '⭐ 5.0 · Новая аккредитация';
          newJob.matchScore = newJob.matchScore || '✧ 95% совпадение';
          const formatTag = newJob.format === 'remote' ? 'Remote' : (newJob.format === 'office' ? 'Office' : 'Hybrid');
          newJob.specialty = newJob.specialty || (/ml|frontend|python|java|backend|developer|разработ/i.test(newJob.title || '') ? 'development' : 'analysis');
          newJob.tags = newJob.tags || ['Стажировка', formatTag, newJob.specialty === 'development' ? 'Dev' : 'Data'];
          newJob.company = newJob.company || 'ООО Партнёр КФУ';
          newJob.companyLetter = newJob.companyLetter || (newJob.company || 'П')[0].toUpperCase();
          newJob.companyLogoClass = newJob.companyLogoClass || 'company-logo--yandex';
          newJob.responseBadge = '● Новая стажировка';
          newJob.targetUniversity = newJob.targetUniversity || db.university || 'kfu';
          newJob.location = newJob.location || 'Казань / Удалённо';
          newJob.workload = newJob.workload || '20–30 ч/неделю';
          newJob.description = newJob.description || 'Новая стажировка, созданная HR-специалистом для студентов университета.';

          db.jobs = db.jobs || [];
          db.jobs.unshift(newJob);
          return newJob;
        });

        sendJson(res, 201, createdJob);
        return;
      }

      // 3.1. PUT /api/jobs/:id - Обновить вакансию
      if (reqPath.startsWith('/api/jobs/') && req.method === 'PUT') {
        const jobId = decodeURIComponent(reqPath.slice('/api/jobs/'.length).replace(/\/+$/, ''));
        const updateData = await parseBody(req);
        const updated = await runMutation(db => {
          db.jobs = db.jobs || [];
          const job = db.jobs.find(j => j.id === jobId);
          if (!job) return null;
          Object.assign(job, updateData);
          return job;
        });
        if (updated) {
          sendJson(res, 200, updated);
        } else {
          sendJson(res, 404, { error: 'Job not found' });
        }
        return;
      }

      // 3.2. DELETE /api/jobs/:id - Удалить вакансию
      if (reqPath.startsWith('/api/jobs/') && req.method === 'DELETE') {
        const jobId = decodeURIComponent(reqPath.slice('/api/jobs/'.length).replace(/\/+$/, ''));
        const result = await runMutation(db => {
          db.jobs = db.jobs || [];
          const initialCount = db.jobs.length;
          db.jobs = db.jobs.filter(j => j.id !== jobId);
          return { success: true, deleted: initialCount - db.jobs.length };
        });
        sendJson(res, 200, result);
        return;
      }

      // 4. GET /api/applications - Отклики студента
      if (reqPath === '/api/applications' && req.method === 'GET') {
        const db = getDb();
        sendJson(res, 200, db.applications || []);
        return;
      }

      // 4.1. GET /api/applications/:id - Получить конкретный отклик
      if (reqPath.startsWith('/api/applications/') && req.method === 'GET') {
        const appId = decodeURIComponent(reqPath.slice('/api/applications/'.length).replace(/\/+$/, ''));
        const db = getDb();
        const app = (db.applications || []).find(a => a.id === appId || a.jobId === appId);
        if (app) {
          sendJson(res, 200, app);
        } else {
          sendJson(res, 404, { error: 'Application not found' });
        }
        return;
      }

      // 4.2. POST /api/applications - Откликнуться на вакансию
      if (reqPath === '/api/applications' && req.method === 'POST') {
        const app = await parseBody(req);
        const result = await runMutation(db => {
          db.applications = db.applications || [];
          db.appliedJobs = db.appliedJobs || [];
          db.candidates = db.candidates || [];

          // Проверяем, откликались ли уже
          const existing = db.applications.find(a => a.jobId === app.jobId);
          if (existing) {
            return { isNew: false, data: existing };
          }

          const comp = app.company || 'Компания';
          const compLower = comp.toLowerCase();
          const logoLetter = compLower.includes('vk') ? 'VK' : comp[0].toUpperCase();
          const logoClass = compLower.includes('yandex') ? 'company-logo--yandex' :
                            compLower.includes('sber') ? 'company-logo--sber' :
                            compLower.includes('vk') ? 'company-logo--vk' : 'company-logo--tbank';

          const timestamp = Date.now();
          const randSuffix = Math.random().toString(36).slice(2, 6);
          const appId = `app-${timestamp}-${randSuffix}`;
          const candId = `cand-${timestamp}-${randSuffix}`;

          const newApp = {
            id: appId,
            jobId: app.jobId,
            title: app.title || 'Стажёр',
            company: comp,
            companyLetter: logoLetter,
            companyLogoClass: logoClass,
            location: app.location || 'Москва · Hybrid',
            appliedDate: 'Сегодня, только что',
            status: 'На рассмотрении',
            statusClass: 'status-badge--warning',
            actionText: 'Чат с HR'
          };
          db.applications.unshift(newApp);
          if (!db.appliedJobs.includes(app.jobId)) db.appliedJobs.push(app.jobId);

          // Автоматически создаём кандидата в кабинете HR с парным candId и jobId!
          db.candidates.unshift({
            id: candId,
            jobId: app.jobId,
            name: db.profile?.name || 'Нур М.',
            initials: 'НМ',
            avatarClass: '',
            role: app.title || 'Соискатель',
            university: (db.university === 'kfu' ? 'КФУ' : (db.university === 'itmo' ? 'ИТМО' : 'НИУ ВШЭ')) + ' · 3-й курс',
            jobTitle: app.title || 'Стажёр',
            matchScore: '94%',
            skills: db.profile?.skills || ['Python', 'SQL'],
            status: 'new',
            statusLabel: 'Новый',
            statusClass: 'status-badge--success'
          });

          return { isNew: true, data: newApp };
        });

        sendJson(res, result.isNew ? 201 : 200, result.data);
        return;
      }

      // 4.3. DELETE /api/applications/:id - Отмена заявки с каскадным удалением кандидата из db.candidates
      if (reqPath.startsWith('/api/applications/') && req.method === 'DELETE') {
        let targetId = reqPath.slice('/api/applications/'.length).replace(/\/+$/, '');
        try {
          targetId = decodeURIComponent(targetId);
        } catch {}

        if (!targetId) {
          sendJson(res, 400, { error: 'Application ID is required' });
          return;
        }

        const deleteResult = await runMutation(db => {
          db.applications = db.applications || [];
          db.appliedJobs = db.appliedJobs || [];
          db.candidates = db.candidates || [];

          // 1. Находим все удаляемые заявки по id или jobId
          const matchedApps = db.applications.filter(a => a.id === targetId || a.jobId === targetId);

          // 2. Находим всех кандидатов, связанных по id, jobId или по суффиксу (cand-xxx для app-xxx)
          const matchedCandidates = db.candidates.filter(c => {
            if (c.id === targetId || c.jobId === targetId) return true;
            if (targetId.startsWith('app-') && c.id === targetId.replace('app-', 'cand-')) return true;
            return false;
          });

          // 3. Собираем связанные jobId для гарантированной очистки
          const relatedJobIds = new Set();
          relatedJobIds.add(targetId);
          matchedApps.forEach(a => { if (a.jobId) relatedJobIds.add(a.jobId); });
          matchedCandidates.forEach(c => { if (c.jobId) relatedJobIds.add(c.jobId); });

          // 4. Собираем идентификаторы заявок и кандидатов
          const appIdsToRemove = new Set(matchedApps.map(a => a.id));
          appIdsToRemove.add(targetId);
          if (targetId.startsWith('cand-')) {
            appIdsToRemove.add(targetId.replace('cand-', 'app-'));
          }

          const candidateIdsToRemove = new Set(matchedCandidates.map(c => c.id));
          candidateIdsToRemove.add(targetId);
          if (targetId.startsWith('app-')) {
            candidateIdsToRemove.add(targetId.replace('app-', 'cand-'));
          }

          // 5. Каскадное удаление из db.applications
          const initialAppCount = db.applications.length;
          db.applications = db.applications.filter(a => {
            if (appIdsToRemove.has(a.id)) return false;
            if (a.jobId && relatedJobIds.has(a.jobId)) return false;
            return true;
          });
          const deletedApps = initialAppCount - db.applications.length;

          // 6. Каскадное удаление из db.appliedJobs
          db.appliedJobs = db.appliedJobs.filter(id => !relatedJobIds.has(id) && id !== targetId);

          // 7. Каскадное удаление из db.candidates (предотвращает утечку данных в пайплайне HR)
          const initialCandCount = db.candidates.length;
          db.candidates = db.candidates.filter(c => {
            if (candidateIdsToRemove.has(c.id)) return false;
            if (c.jobId && relatedJobIds.has(c.jobId)) return false;
            return true;
          });
          const deletedCandidates = initialCandCount - db.candidates.length;

          return {
            success: true,
            deletedApplications: deletedApps,
            deletedCandidates: deletedCandidates,
            applications: db.applications,
            candidates: db.candidates
          };
        });

        sendJson(res, 200, deleteResult);
        return;
      }

      // 4.4. PUT /api/applications/:id - Обновление статуса заявки
      if (reqPath.startsWith('/api/applications/') && req.method === 'PUT') {
        let appId = reqPath.slice('/api/applications/'.length).replace(/\/+$/, '');
        try { appId = decodeURIComponent(appId); } catch {}
        const update = await parseBody(req);

        const updated = await runMutation(db => {
          db.applications = db.applications || [];
          const app = db.applications.find(a => a.id === appId || a.jobId === appId);
          if (app) {
            Object.assign(app, update);
            return app;
          }
          return null;
        });

        if (updated) {
          sendJson(res, 200, updated);
        } else {
          sendJson(res, 404, { error: 'Application not found' });
        }
        return;
      }

      // 5. GET /api/candidates - Кандидаты для HR
      if (reqPath === '/api/candidates' && req.method === 'GET') {
        const db = getDb();
        sendJson(res, 200, db.candidates || []);
        return;
      }

      // 5.1. GET /api/candidates/:id - Получить кандидата
      if (reqPath.startsWith('/api/candidates/') && req.method === 'GET') {
        let candId = reqPath.slice('/api/candidates/'.length).replace(/\/+$/, '');
        try { candId = decodeURIComponent(candId); } catch {}
        const db = getDb();
        const candidate = (db.candidates || []).find(c => c.id === candId);
        if (candidate) {
          sendJson(res, 200, candidate);
        } else {
          sendJson(res, 404, { error: 'Candidate not found' });
        }
        return;
      }

      // 5.2. PUT /api/candidates/:id - Обновить кандидата (HR статус)
      if (reqPath.startsWith('/api/candidates/') && req.method === 'PUT') {
        let candId = reqPath.slice('/api/candidates/'.length).replace(/\/+$/, '');
        try { candId = decodeURIComponent(candId); } catch {}
        const update = await parseBody(req);

        const updatedCandidate = await runMutation(db => {
          db.candidates = db.candidates || [];
          const candidate = db.candidates.find(c => c.id === candId);
          if (candidate) {
            Object.assign(candidate, update);
            return candidate;
          }
          return null;
        });

        if (updatedCandidate) {
          sendJson(res, 200, updatedCandidate);
        } else {
          sendJson(res, 404, { error: 'Candidate not found' });
        }
        return;
      }

      // 6. POST & DELETE /api/saved-jobs - Сохранённые вакансии
      if (reqPath === '/api/saved-jobs' && req.method === 'POST') {
        const { jobId } = await parseBody(req);
        const saved = await runMutation(db => {
          db.savedJobs = db.savedJobs || [];
          if (jobId && !db.savedJobs.includes(jobId)) {
            db.savedJobs.push(jobId);
          }
          return db.savedJobs;
        });
        sendJson(res, 200, saved);
        return;
      }

      if (reqPath.startsWith('/api/saved-jobs/') && req.method === 'DELETE') {
        let jobId = reqPath.slice('/api/saved-jobs/'.length).replace(/\/+$/, '');
        try { jobId = decodeURIComponent(jobId); } catch {}
        const saved = await runMutation(db => {
          db.savedJobs = (db.savedJobs || []).filter(id => id !== jobId);
          return db.savedJobs;
        });
        sendJson(res, 200, saved);
        return;
      }

      // 7. PUT /api/state - Обновление глобального стейта (Вуз, профиль)
      if (reqPath === '/api/state' && req.method === 'PUT') {
        const stateUpdate = await parseBody(req);
        const updatedDb = await runMutation(db => {
          Object.assign(db, stateUpdate);
          return db;
        });
        sendJson(res, 200, { success: true, db: updatedDb });
        return;
      }

      // 8. GET & PUT /api/profile - Профиль студента
      if (reqPath === '/api/profile' && req.method === 'GET') {
        const db = getDb();
        sendJson(res, 200, db.profile || {});
        return;
      }

      if (reqPath === '/api/profile' && req.method === 'PUT') {
        const profileUpdate = await parseBody(req);
        const updatedProfile = await runMutation(db => {
          db.profile = db.profile || {};
          Object.assign(db.profile, profileUpdate);
          return db.profile;
        });
        sendJson(res, 200, updatedProfile);
        return;
      }

      sendJson(res, 404, { error: 'Endpoint not found' });
      return;
    } catch (apiErr) {
      console.error('API Error:', apiErr);
      const code = apiErr.statusCode || 500;
      sendJson(res, code, { error: apiErr.message || 'Internal Server Error' });
      return;
    }
  }

  // ==========================================
  // Static File Serving with Traversal Guard
  // ==========================================
  const sanitizedPath = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(PUBLIC_DIR, sanitizedPath));

  // Directory traversal defense
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Server with Database REST API running at http://127.0.0.1:${PORT}/`);
  });
}

// Graceful process shutdown handling
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, draining mutation queue...');
  await writeQueue;
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, draining mutation queue...');
  await writeQueue;
  server.close(() => process.exit(0));
});

module.exports = {
  server,
  getDb,
  runMutation,
  atomicPersist,
  parseBody
};
