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
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing db:', err);
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
      newJob.tags = newJob.tags || ['Стажировка', newJob.format === 'remote' ? 'Remote' : 'Hybrid'];
      newJob.companyLetter = (newJob.company || 'К')[0].toUpperCase();
      newJob.companyLogoClass = 'company-logo--yandex';
      
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
        const newApp = {
          id: 'app-' + Date.now(),
          jobId: app.jobId,
          title: app.title || 'Стажёр',
          company: app.company || 'Компания',
          appliedDate: 'Только что',
          status: 'На рассмотрении',
          statusClass: 'status-badge--warning',
          actionText: 'Чат с HR'
        };
        db.applications.unshift(newApp);
        if (!db.appliedJobs.includes(app.jobId)) db.appliedJobs.push(app.jobId);

        // Автоматически создаём кандидата в кабинете HR!
        db.candidates.unshift({
          id: 'cand-' + Date.now(),
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

    // 5. POST & DELETE /api/saved-jobs
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
      const jobId = reqPath.split('/api/saved-jobs/')[1];
      db.savedJobs = (db.savedJobs || []).filter(id => id !== jobId);
      writeDb(db);
      res.writeHead(200);
      res.end(JSON.stringify(db.savedJobs));
      return;
    }

    // 6. PUT /api/state - Обновление вуза / профиля
    if (reqPath === '/api/state' && req.method === 'PUT') {
      const stateUpdate = await parseBody(req);
      Object.assign(db, stateUpdate);
      writeDb(db);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, db }));
      return;
    }

    // 7. PUT /api/applications/:id - Обновление статуса заявки
    if (reqPath.startsWith('/api/applications/') && req.method === 'PUT') {
      const appId = reqPath.split('/api/applications/')[1];
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
