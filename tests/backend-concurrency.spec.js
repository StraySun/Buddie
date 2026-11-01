const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const BACKUP_PATH = path.join(__dirname, '..', 'data', 'db.json.backup');
const INITIAL_DB = fs.readFileSync(DB_PATH, 'utf8');

function safeWrite(filePath, data) {
  for (let i = 0; i < 5; i++) {
    try {
      fs.writeFileSync(filePath, data, 'utf8');
      return;
    } catch (err) {
      if (i === 4) throw err;
      const s = Date.now();
      while (Date.now() - s < 50 * Math.pow(2, i)) {}
    }
  }
}

test.beforeEach(async () => {
  safeWrite(DB_PATH, INITIAL_DB, 'utf8');
  safeWrite(BACKUP_PATH, INITIAL_DB, 'utf8');
});

test.afterAll(async () => {
  safeWrite(DB_PATH, INITIAL_DB, 'utf8');
  safeWrite(BACKUP_PATH, INITIAL_DB, 'utf8');
});

test.describe('Backend & Data Optimization Suite', () => {

  test('GET /api/health returns healthy system status and entity metrics', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('healthy');
    expect(body.counts).toBeDefined();
    expect(body.counts.jobs).toBeGreaterThan(0);
    expect(body.counts.applications).toBeGreaterThan(0);
    expect(body.counts.candidates).toBeGreaterThan(0);
  });

  test('GET /api/jobs supports query parameter filtering and individual CRUD operations', async ({ request }) => {
    // 1. Search filter
    const searchRes = await request.get('/api/jobs?search=Java');
    expect(searchRes.status()).toBe(200);
    const javaJobs = await searchRes.json();
    expect(javaJobs.length).toBeGreaterThan(0);
    expect(javaJobs.every(j => (j.title + j.company + j.description).toLowerCase().includes('java'))).toBe(true);

    // 2. Specialty & format filter
    const specRes = await request.get('/api/jobs?specialty=analysis&format=hybrid');
    expect(specRes.status()).toBe(200);
    const filteredJobs = await specRes.json();
    expect(filteredJobs.length).toBeGreaterThan(0);
    expect(filteredJobs.every(j => j.specialty === 'analysis' && j.format === 'hybrid')).toBe(true);

    // 3. GET /api/jobs/:id
    const targetJob = filteredJobs[0];
    const singleRes = await request.get(`/api/jobs/${targetJob.id}`);
    expect(singleRes.status()).toBe(200);
    const singleData = await singleRes.json();
    expect(singleData.id).toBe(targetJob.id);

    // 4. PUT /api/jobs/:id (Update)
    const updateRes = await request.put(`/api/jobs/${targetJob.id}`, {
      data: { workload: '▣ 35 ч/неделю (обновлено)' }
    });
    expect(updateRes.status()).toBe(200);
    const updatedData = await updateRes.json();
    expect(updatedData.workload).toBe('▣ 35 ч/неделю (обновлено)');

    // 5. DELETE /api/jobs/:id
    const deleteRes = await request.delete(`/api/jobs/${targetJob.id}`);
    expect(deleteRes.status()).toBe(200);
    const checkDeleted = await request.get(`/api/jobs/${targetJob.id}`);
    expect(checkDeleted.status()).toBe(404);
  });

  test('concurrency stress test: 20 simultaneous mutations execute with Zero Data Loss & no race conditions', async ({ request }) => {
    // Отправляем параллельно 10 откликов и 10 сохранений вакансий одновременно
    const promises = [];

    for (let i = 0; i < 10; i++) {
      const jobId = `stress-job-${i}`;
      promises.push(
        request.post('/api/applications', {
          data: {
            jobId: jobId,
            title: `Stress Engineer ${i}`,
            company: `TechCorp ${i}`,
            location: 'Казань · Remote'
          }
        }).then(r => r.json())
      );
    }

    for (let i = 0; i < 10; i++) {
      promises.push(
        request.post('/api/saved-jobs', {
          data: { jobId: `stress-saved-${i}` }
        }).then(r => r.json())
      );
    }

    const results = await Promise.all(promises);
    expect(results).toHaveLength(20);

    // Проверяем состояние базы данных: все 10 откликов и 10 сохранений зафиксированы в db.json
    const dbRes = await request.get('/api/db');
    expect(dbRes.status()).toBe(200);
    const db = await dbRes.json();

    for (let i = 0; i < 10; i++) {
      const jobId = `stress-job-${i}`;
      const appFound = db.applications.find(a => a.jobId === jobId);
      expect(appFound).toBeDefined();

      const candFound = db.candidates.find(c => c.jobId === jobId);
      expect(candFound).toBeDefined();

      expect(db.savedJobs).toContain(`stress-saved-${i}`);
    }

    // Проверяем физический файл на диске: валидный JSON, не пустой, UTF-8
    const diskContent = fs.readFileSync(DB_PATH, 'utf8');
    const parsedDisk = JSON.parse(diskContent);
    expect(parsedDisk.applications.length).toBeGreaterThanOrEqual(14); // 4 исходных + 10 новых
  });

  test('GET /api/candidates/:id and PUT /api/candidates/:id work reliably', async ({ request }) => {
    const listRes = await request.get('/api/candidates');
    expect(listRes.status()).toBe(200);
    const candidates = await listRes.json();
    expect(candidates.length).toBeGreaterThan(0);

    const firstCand = candidates[0];
    const singleRes = await request.get(`/api/candidates/${firstCand.id}`);
    expect(singleRes.status()).toBe(200);
    const singleCand = await singleRes.json();
    expect(singleCand.id).toBe(firstCand.id);

    // Обновляем статус
    const updateRes = await request.put(`/api/candidates/${firstCand.id}`, {
      data: { status: 'interview', statusLabel: 'Интервью' }
    });
    expect(updateRes.status()).toBe(200);
    const updatedCand = await updateRes.json();
    expect(updatedCand.status).toBe('interview');
  });

  test('GET /api/profile and PUT /api/profile read and persist student profile', async ({ request }) => {
    const profileRes = await request.get('/api/profile');
    expect(profileRes.status()).toBe(200);
    const profile = await profileRes.json();
    expect(profile.name).toBeDefined();

    const putRes = await request.put('/api/profile', {
      data: { role: 'Lead Data Architect' }
    });
    expect(putRes.status()).toBe(200);
    const updated = await putRes.json();
    expect(updated.role).toBe('Lead Data Architect');

    const verifyRes = await request.get('/api/profile');
    const verify = await verifyRes.json();
    expect(verify.role).toBe('Lead Data Architect');
  });

});
