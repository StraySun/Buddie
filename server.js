const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 4173;
const ROOT = __dirname;
const DB_PATH = path.join(ROOT, 'data', 'db.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeDb(data) {
  const tmpPath = DB_PATH + '.tmp';
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err) {
    console.error('Error atomically writing db:', err);
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const urlParts = req.url.split('?');
  const reqPath = decodeURI(urlParts[0]);

  // ==========================================
  // REST API Endpoints
  // ==========================================
  if (reqPath.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const db = readDb();

    // 1. GET /api/db - Получить всё состояние
    if (reqPath === '/api/db' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(db));
      return;
    }

    // 2. GET /api/jobs - Получить вакансии
    if (reqPath === '/api/jobs' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(db.jobs || []));
      return;
    }

    // 3. POST /api/jobs - Создать вакансию (от HR)
    if (reqPath === '/api/jobs' && req.method === 'POST') {
      const newJob = await parseBody(req);
      newJob.id = newJob.id || 'job-' + Date.now();
      newJob.postedTime = '◷ Только что';
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
      newJob.location = newJob.location || '⌖ Казань / Удалённо';
      newJob.workload = newJob.workload || '▣ 20–30 ч/неделю';
      newJob.description = newJob.description || 'Новая стажировка, созданная HR-специалистом для студентов университета.';
      
      db.jobs = db.jobs || [];
      db.jobs.unshift(newJob);
      writeDb(db);

      res.writeHead(201);
      res.end(JSON.stringify(newJob));
      return;
    }

    // 4. GET & POST /api/applications - Отклики студента
    if (reqPath === '/api/applications' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(db.applications || []));
      return;
    }

    if (reqPath === '/api/applications' && req.method === 'POST') {
      const app = await parseBody(req);
      db.applications = db.applications || [];
      db.appliedJobs = db.appliedJobs || [];
      db.candidates = db.candidates || [];

      // Проверяем, откликались ли уже
      const existing = db.applications.find(a => a.jobId === app.jobId);
      if (!existing) {
        const comp = app.company || 'Компания';
        const compLower = comp.toLowerCase();
        const logoLetter = compLower.includes('vk') ? 'VK' : comp[0].toUpperCase();
        const logoClass = compLower.includes('yandex') ? 'company-logo--yandex' :
                          compLower.includes('sber') ? 'company-logo--sber' :
                          compLower.includes('vk') ? 'company-logo--vk' : 'company-logo--tbank';

        const newApp = {
          id: 'app-' + Date.now(),
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

        // Автоматически создаём кандидата в кабинете HR!
        db.candidates.unshift({
          id: 'cand-' + Date.now(),
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

        writeDb(db);
        res.writeHead(201);
        res.end(JSON.stringify(newApp));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify(existing));
      }
      return;
    }

    // 4.1. DELETE /api/applications/:id - Отмена / удаление заявки с каскадным удалением кандидата из db.candidates
    if (reqPath.startsWith('/api/applications/') && req.method === 'DELETE') {
      let targetId = reqPath.slice('/api/applications/'.length).replace(/\/+$/, '');
      try {
        targetId = decodeURIComponent(targetId);
      } catch {}

      if (!targetId) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Application ID is required' }));
        return;
      }

      db.applications = db.applications || [];
      db.appliedJobs = db.appliedJobs || [];
      db.candidates = db.candidates || [];

      // 1. Находим все удаляемые заявки по id или jobId
      const matchedApps = db.applications.filter(a => a.id === targetId || a.jobId === targetId);

      // 2. Находим всех кандидатов, связанных по id, jobId или по timestamp (cand-xxx для app-xxx)
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

      writeDb(db);
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        deletedApplications: deletedApps,
        deletedCandidates: deletedCandidates,
        applications: db.applications,
        candidates: db.candidates
      }));
      return;
    }

    // 5. GET & PUT /api/candidates - Кандидаты для HR
    if (reqPath === '/api/candidates' && req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(db.candidates || []));
      return;
    }

    if (reqPath.startsWith('/api/candidates/') && req.method === 'PUT') {
      let candId = reqPath.slice('/api/candidates/'.length).replace(/\/+$/, '');
      try { candId = decodeURIComponent(candId); } catch {}
      const update = await parseBody(req);
      db.candidates = db.candidates || [];
      const candidate = db.candidates.find(c => c.id === candId);
      if (candidate) {
        Object.assign(candidate, update);
        writeDb(db);
        res.writeHead(200);
        res.end(JSON.stringify(candidate));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Candidate not found' }));
      }
      return;
    }

    // 6. POST & DELETE /api/saved-jobs
    if (reqPath === '/api/saved-jobs' && req.method === 'POST') {
      const { jobId } = await parseBody(req);
      db.savedJobs = db.savedJobs || [];
      if (!db.savedJobs.includes(jobId)) db.savedJobs.push(jobId);
      writeDb(db);
      res.writeHead(200);
      res.end(JSON.stringify(db.savedJobs));
      return;
    }

    if (reqPath.startsWith('/api/saved-jobs/') && req.method === 'DELETE') {
      let jobId = reqPath.slice('/api/saved-jobs/'.length).replace(/\/+$/, '');
      try { jobId = decodeURIComponent(jobId); } catch {}
      db.savedJobs = (db.savedJobs || []).filter(id => id !== jobId);
      writeDb(db);
      res.writeHead(200);
      res.end(JSON.stringify(db.savedJobs));
      return;
    }

    // 7. PUT /api/state - Обновление вуза / профиля
    if (reqPath === '/api/state' && req.method === 'PUT') {
      const stateUpdate = await parseBody(req);
      Object.assign(db, stateUpdate);
      writeDb(db);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, db }));
      return;
    }

    // 8. PUT /api/applications/:id - Обновление статуса заявки
    if (reqPath.startsWith('/api/applications/') && req.method === 'PUT') {
      let appId = reqPath.slice('/api/applications/'.length).replace(/\/+$/, '');
      try { appId = decodeURIComponent(appId); } catch {}
      const update = await parseBody(req);
      db.applications = db.applications || [];
      const app = db.applications.find(a => a.id === appId || a.jobId === appId);
      if (app) {
        Object.assign(app, update);
        writeDb(db);
        res.writeHead(200);
        res.end(JSON.stringify(app));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Application not found' }));
      }
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Endpoint not found' }));
    return;
  }

  // ==========================================
  // Static File Serving
  // ==========================================
  let filePath = path.join(ROOT, reqPath === '/' ? 'index.html' : reqPath);

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

server.listen(PORT, '127.0.0.1', () => {
  console.log('Server with Database REST API running at http://127.0.0.1:' + PORT + '/');
});
