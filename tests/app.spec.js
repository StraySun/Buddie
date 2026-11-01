const fs = require('fs');
const path = require('path');
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const INITIAL_DB = fs.readFileSync(DB_PATH, 'utf8');
const { test: base, expect } = require('@playwright/test');

const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      const text = message.text();
      if (text.includes('Failed to load resource')) return;
      if (message.type() === 'error') errors.push(text);
    });
    await use(page);
    expect(errors).toEqual([]);
  }
});

function safeWriteDb(content) {
  for (let i = 0; i < 5; i++) {
    try {
      fs.writeFileSync(DB_PATH, content, 'utf8');
      return;
    } catch (err) {
      if (i === 4) throw err;
      const start = Date.now();
      while (Date.now() - start < 50 * Math.pow(2, i)) {}
    }
  }
}

test.beforeEach(async () => {
  safeWriteDb(INITIAL_DB);
});

test.afterAll(async () => {
  safeWriteDb(INITIAL_DB);
});

const pages = ['index.html', 'companies.html', 'profile.html', 'hr.html', 'notifications.html'];

for (const file of pages) {
  for (const width of [1440, 375, 320]) {
    test(`${file} renders without viewport overflow at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/${file}`);
      await expect(page.locator('h1')).toBeVisible();
      const documentWidth = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
      expect(documentWidth).toBeLessThanOrEqual(width);
      await page.screenshot({
        path: testInfo.outputPath(`${file.replace('.html', '')}-${width}.png`),
        fullPage: true
      });
    });
  }
}

test('malformed and unexpected localStorage values do not break pages', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('buddie-saved-jobs', '["known", {}, null]');
    localStorage.setItem('buddie-applied-jobs', '{invalid');
    localStorage.setItem('buddie-notification-settings', '[]');
    localStorage.setItem('buddie-notification-channels', 'null');
    localStorage.setItem('buddie-dismissed-notifications', '{}');
    localStorage.setItem('buddie-notifications-read', '[]');
  });

  for (const file of pages) {
    await page.goto(`/${file}`);
    await expect(page.locator('h1')).toBeVisible();
  }

  await page.goto('/index.html');
  const saveButton = page.locator('[data-job-action="save"]').first();
  await saveButton.click();
  await expect(saveButton).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/notifications.html');
  const toggles = page.locator('[data-notification-setting]');
  await expect(toggles).toHaveCount(5);
  await expect.poll(() => toggles.evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))).toEqual([
    'Новые подходящие вакансии (AI match)',
    'Изменение статуса отклика',
    'Напоминания о дедлайнах',
    'Сообщения от HR',
    'Дайджест КФУ'
  ]);
  await toggles.nth(3).click();
  await expect(toggles.nth(3)).toHaveAttribute('aria-label', 'Сообщения от HR');
  await expect(toggles.nth(3)).toHaveAttribute('aria-pressed', 'true');
});

test('student navigation, university selectors, partner cards, and anchors are accessible', async ({ page }) => {
  for (const file of ['index.html', 'companies.html', 'profile.html', 'notifications.html']) {
    await page.goto(`/${file}`);
    await expect(page.locator('.brand__caption')).toHaveText('Buddie · Карьерная лента');
    const nav = page.locator('.sidebar__nav');
    await expect(nav.locator('.sidebar__nav-item')).toHaveCount(4);
    await expect(nav.locator('.sidebar__nav-copy small')).toHaveText([
      'Вакансии и стажировки',
      'Каталог компаний',
      'Сигналы и дедлайны',
      'Профиль, отклики и резюме'
    ]);
    await expect(nav.locator('.sidebar__nav-item--active')).toHaveCount(1);
    await expect(nav.locator('.sidebar__count')).toHaveText(['4', '4']);
    expect(await nav.locator('.sidebar__nav-item').evaluateAll(items => items.map(item => item.getAttribute('href')))).toEqual([
      'index.html', 'companies.html', 'notifications.html', 'profile.html'
    ]);
    await page.locator('.header__select select').selectOption('itmo');
    await expect(page.locator('.header__select select')).toHaveValue('itmo');
    const brokenAnchors = await page.locator('a[href^="#"]').evaluateAll(links => links
      .map(link => link.getAttribute('href').slice(1))
      .filter(id => id && !document.getElementById(id)));
    expect(brokenAnchors).toEqual([]);
    if (file === 'index.html') {
      await expect(page.locator('.partners__head h2')).toHaveText('Наши партнёры');
      await expect(page.locator('.partners__head p')).toHaveText('Твой старт в лучших командах');
      await expect(page.locator('.partners__item')).toHaveText(['Yandex', 'СБЕР', 'VK', 'OZON', 'Т-Банк']);
    }
    if (file === 'profile.html') {
      expect(await page.locator('.data-table th').evaluateAll(headers => headers.every(header => header.scope === 'col'))).toBe(true);
      await expect.poll(() => page.locator('.data-table td').first().evaluate(cell => parseFloat(getComputedStyle(cell).fontSize))).toBeGreaterThanOrEqual(11);
      await expect(page.locator('.metric__label .metric__trend')).toHaveCount(4);
      await expect(page.locator('.metric__number .metric__trend')).toHaveCount(0);
      expect(await page.locator('.data-table tbody td:last-child').evaluateAll(cells => cells.every(cell => {
        const control = cell.firstElementChild;
        return getComputedStyle(cell).textAlign === 'center' && control.getBoundingClientRect().width >= cell.clientWidth - 21;
      }))).toBe(true);
    }
  }

  await page.goto('/hr.html');
  expect(await page.locator('.candidate-table th').evaluateAll(headers => headers.every(header => header.scope === 'col'))).toBe(true);
  await page.locator('.hr-topbar__company select').selectOption({ label: 'ООО Сбер' });
  await expect(page.locator('.hr-topbar__company select')).toHaveValue('ООО Сбер');
});

test('feed filters, reset, save, and local-only apply persist', async ({ page }) => {
  await page.goto('/index.html');
  const yandex = page.locator('[data-job-id="yandex-analyst"]');
  const sber = page.locator('[data-job-id="sber-java"]');
  const savedButton = yandex.locator('[data-job-action="save"]');
  await savedButton.click();
  await expect(savedButton).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(yandex.locator('[data-job-action="save"]')).toHaveAttribute('aria-pressed', 'true');
  await yandex.locator('[data-job-action="save"]').click();
  await expect(yandex.locator('[data-job-action="save"]')).toHaveAttribute('aria-pressed', 'false');

  const applyButton = sber.locator('[data-job-action="apply"]');
  await applyButton.click();
  await expect(applyButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.app-toast')).toContainText('Отправка работодателю недоступна в демо');

  await page.locator('[data-search-input]').fill('Java');
  await page.locator('[data-feed-specialty]').selectOption('development');
  await page.locator('[data-feed-format]').selectOption('remote');
  await expect(sber).toBeVisible();
  await expect(yandex).toBeHidden();
  await page.locator('[data-feed-format]').selectOption('hybrid');
  await expect(page.locator('[data-feed-empty]')).toBeVisible();
  await page.locator('[data-feed-reset]').last().click();
  await expect(page.locator('[data-job-id]')).toHaveCount(3);
  await expect(page.locator('[data-feed-empty]')).toBeHidden();
});

test('company category, search, and visible count update together', async ({ page }) => {
  await page.goto('/companies.html');
  await expect(page.locator('[data-company-count]')).toContainText('6 из 6 компаний');
  for (const category of ['it', 'analytics', 'engineering']) {
    await page.locator(`[data-company-filter="${category}"]`).click();
    await expect(page.locator('[data-company-card]:visible')).toHaveCount(2);
    await expect(page.locator('[data-company-count]')).toContainText('2 из 6 компаний');
  }
  await page.locator('[data-company-filter="all"]').click();
  await page.locator('[data-search-input]').last().fill('Yandex');
  await expect(page.locator('[data-company-card]:visible')).toHaveCount(1);
  await expect(page.locator('[data-company-count]')).toContainText('1 из 6 компаний');
  await page.locator('[data-search-input]').last().fill('no such company');
  await expect(page.locator('[data-companies-empty]')).toBeVisible();
  await page.locator('[data-search-input]').last().clear();
  await expect(page.locator('[data-company-card]:visible')).toHaveCount(6);
  await expect(page.locator('[data-company-count]')).toContainText('6 из 6 компаний');
});

test('profile applications filter by search and status and restore results', async ({ page }) => {
  await page.goto('/profile.html');
  const rows = page.locator('.data-table tbody tr');
  await page.locator('[data-application-status]').selectOption('Отказ');
  await expect(rows.filter({ hasText: 'Тестировщик' })).toBeVisible();
  await expect(rows.filter({ hasText: 'Python-разработчик' })).toBeHidden();
  await page.locator('[data-application-status]').selectOption('all');
  await page.locator('[data-search-input]').last().fill('Yandex');
  await expect(rows.filter({ hasText: 'Младший фронтенд-разработчик' })).toBeVisible();
  await page.locator('[data-search-input]').last().fill('no matching application');
  await expect(page.getByRole('status').filter({ hasText: 'Отклики не найдены' })).toBeVisible();
  await page.locator('[data-search-input]').last().clear();
  await expect(rows.filter({ visible: true })).toHaveCount(4);
});

test('HR candidate filters combine and restore results', async ({ page }) => {
  await page.goto('/hr.html');
  const rows = page.locator('.candidate-table tbody tr');
  await page.locator('[data-hr-status]').selectOption('interview');
  await expect(rows.filter({ hasText: 'Алина И.' })).toBeVisible();
  await expect(rows.filter({ hasText: 'Нур М.' })).toBeHidden();
  await page.locator('[data-hr-university]').selectOption('all');
  await page.locator('[data-search-input]').fill('Роман');
  await page.locator('[data-hr-status]').selectOption('review');
  await expect(rows.filter({ hasText: 'Роман С.' })).toBeVisible();
  await page.locator('[data-search-input]').fill('no matching candidate');
  await expect(page.getByRole('status').filter({ hasText: 'Кандидаты не найдены' })).toBeVisible();
  await page.locator('[data-search-input]').clear();
  await page.locator('[data-hr-status]').selectOption('all');
  await page.locator('[data-hr-university]').selectOption('kfu');
  await expect(rows.filter({ visible: true })).toHaveCount(5);
});

test('notification filters, dismissals, settings, channels, and read state persist', async ({ page }) => {
  await page.goto('/notifications.html');
  await page.locator('[data-notification-filter="deadline"]').click();
  await expect(page.locator('.timeline-card:visible')).toHaveCount(1);
  await page.locator('[data-notification-filter="recommendation"]').click();
  await expect(page.locator('.timeline-card:visible')).toHaveCount(2);
  await page.locator('[data-notification-filter="all"]').click();

  const setting = page.locator('[data-notification-setting]').first();
  const settingState = await setting.getAttribute('aria-pressed');
  await setting.click();
  await expect(setting).toHaveAttribute('aria-pressed', settingState === 'true' ? 'false' : 'true');
  const email = page.locator('[data-notification-channel]').last();
  await email.check();
  await expect(email).toBeChecked();
  const dismissedTitle = page.locator('.timeline-card').first().locator('.timeline-card__title');
  const title = await dismissedTitle.textContent();
  await page.locator('.timeline-card').first().locator('[data-dismiss-notification]').click();
  await expect(page.locator('.timeline-card').filter({ hasText: title.trim() })).toBeHidden();
  await page.locator('[data-mark-all-read]').click();
  await expect(page.locator('.timeline-card.is-read')).toHaveCount(4);

  await page.reload();
  await expect(page.locator('[data-notification-setting]').first()).toHaveAttribute('aria-pressed', settingState === 'true' ? 'false' : 'true');
  await expect(page.locator('[data-notification-channel]').last()).toBeChecked();
  await expect(page.locator('.timeline-card').filter({ hasText: title.trim() })).toBeHidden();
  await expect(page.locator('.timeline-card.is-read')).toHaveCount(4);
});

test('mobile navigation and company filters remain actionable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto('/index.html');
  await expect(page.locator('.sidebar__hr-link')).toBeVisible();
  await page.locator('.sidebar__hr-link').click();
  await expect(page).toHaveURL(/hr\.html$/);
  await expect(page.locator('h1')).toHaveText('Кандидаты и отклики');
  await page.locator('.hr-topbar__return').click();
  await expect(page).toHaveURL(/index\.html$/);

  await page.goto('/companies.html');
  await page.locator('[data-company-filter="analytics"]').click();
  await expect(page.locator('[data-company-card]:visible')).toHaveCount(2);
});

test('profile and HR tables support keyboard and touch scrolling on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const file of ['profile.html', 'hr.html']) {
    await page.goto(`/${file}`);
    const wrapper = page.locator('.table-scroll');
    await expect(wrapper).toBeVisible();
    const canScroll = await wrapper.evaluate(element => element.scrollWidth > element.clientWidth);
    expect(canScroll).toBe(true);
    await wrapper.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => wrapper.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    const box = await wrapper.boundingBox();
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width - 24, y: box.y + 36 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + 24, y: box.y + 36 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => wrapper.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await session.detach();
  }
});

test('applying on index.html dynamically creates application in profile and candidate in HR', async ({ page }) => {
  await page.goto('/index.html');
  const yandex = page.locator('[data-job-id="yandex-analyst"]');
  const applyBtn = yandex.locator('[data-job-action="apply"]');
  await applyBtn.click();
  await expect(applyBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.app-toast')).toBeVisible();

  // 1. Проверяем profile.html
  await page.goto('/profile.html');
  const profileRows = page.locator('.data-table tbody tr');
  await expect(profileRows).toHaveCount(5);
  await expect(profileRows.first()).toContainText('Стажёр-аналитик данных');

  // 2. Проверяем hr.html
  await page.goto('/hr.html');
  const candidateRows = page.locator('.candidate-table tbody tr');
  await expect(candidateRows).toHaveCount(6);
  await expect(candidateRows.first()).toContainText('Стажёр-аналитик данных');
  await expect(candidateRows.first()).toContainText('94%');
});

test('cancelling application on index.html cascades deletion to profile and HR candidates without 404 or data leak', async ({ page }) => {
  await page.goto('/index.html');
  const yandex = page.locator('[data-job-id="yandex-analyst"]');
  const applyBtn = yandex.locator('[data-job-action="apply"]');

  // 1. Откликаемся
  await applyBtn.click();
  await expect(applyBtn).toHaveAttribute('aria-pressed', 'true');

  // 2. Отменяем отклик (unapply)
  await applyBtn.click();
  await expect(applyBtn).toHaveAttribute('aria-pressed', 'false');
  await expect(applyBtn).toHaveText('Откликнуться');

  // 3. Проверяем profile.html: заявки нет, счетчик вернулся к 4
  await page.goto('/profile.html');
  const profileRows = page.locator('.data-table tbody tr');
  await expect(profileRows).toHaveCount(4);

  // 4. Проверяем hr.html: кандидата нет в пайплайне HR, счетчик вернулся к 5 (каскадное удаление без утечки данных)
  await page.goto('/hr.html');
  const candidateRows = page.locator('.candidate-table tbody tr');
  await expect(candidateRows).toHaveCount(5);
  await expect(page.locator('.candidate-table')).not.toContainText('94%');
});

test('DELETE /api/applications/:id handles cascade deletion and prevents 404', async ({ request }) => {
  // 1. Создаем отклик через API
  const postRes = await request.post('/api/applications', {
    data: {
      jobId: 'cascade-test-job',
      title: 'Cascade QA Engineer',
      company: 'Test Corp',
      location: 'Казань · Hybrid'
    }
  });
  expect(postRes.status()).toBe(201);
  const createdApp = await postRes.json();
  expect(createdApp.id).toBeDefined();

  // 2. Проверяем, что кандидат появился в HR пайплайне
  const getCandRes = await request.get('/api/candidates');
  const candidatesBefore = await getCandRes.json();
  const foundCand = candidatesBefore.find(c => c.jobId === 'cascade-test-job');
  expect(foundCand).toBeDefined();

  // 3. Удаляем по ID заявки DELETE /api/applications/:id
  const deleteRes = await request.delete('/api/applications/' + createdApp.id);
  expect(deleteRes.status()).toBe(200);
  const deleteData = await deleteRes.json();
  expect(deleteData.success).toBe(true);

  // 4. Проверяем каскадное удаление кандидата из db.candidates (отсутствие утечки данных)
  const getCandAfter = await request.get('/api/candidates');
  const candidatesAfter = await getCandAfter.json();
  expect(candidatesAfter.find(c => c.jobId === 'cascade-test-job')).toBeUndefined();

  // 5. Проверяем идемпотентность (повторный DELETE не падает с 404)
  const repeatDelete = await request.delete('/api/applications/' + createdApp.id);
  expect(repeatDelete.status()).toBe(200);
});

test('profile tabs switch panes and render saved jobs container', async ({ page }) => {
  await page.goto('/profile.html');
  const appPane = page.locator('#pane-applications');
  const savedPane = page.locator('#pane-saved');
  const stackPane = page.locator('#pane-stack');
  const analyticsPane = page.locator('#pane-analytics');

  await expect(appPane).toBeVisible();
  await expect(savedPane).toBeHidden();

  // Клик на вкладку "Сохранённые"
  await page.locator('.profile-tab-btn[data-tab="saved"]').click();
  await expect(savedPane).toBeVisible();
  await expect(appPane).toBeHidden();
  await expect(page.locator('.saved-empty')).toBeVisible();

  // Клик на вкладку "Мой профиль и стек"
  await page.locator('.profile-tab-btn[data-tab="stack"]').click();
  await expect(stackPane).toBeVisible();
  await expect(savedPane).toBeHidden();

  // Клик на вкладку "Аналитика"
  await page.locator('.profile-tab-btn[data-tab="analytics"]').click();
  await expect(analyticsPane).toBeVisible();
  await expect(stackPane).toBeHidden();

  // Возврат на "Мои отклики"
  await page.locator('.profile-tab-btn[data-tab="applications"]').click();
  await expect(appPane).toBeVisible();
  await expect(analyticsPane).toBeHidden();
});

test('profile tabs support deep linking with hash on initial load, F5 reload, and history navigation', async ({ page }) => {
  // 1. Прямой переход по ссылке с хэшем #saved
  await page.goto('/profile.html#saved');
  await expect(page.locator('.profile-tab-btn[data-tab="saved"]')).toHaveClass(/is-active/);
  await expect(page.locator('#pane-saved')).toBeVisible();
  await expect(page.locator('#pane-applications')).toBeHidden();

  // 2. Прямой переход по ссылке с хэшем #stack
  await page.goto('/profile.html#stack');
  await expect(page.locator('.profile-tab-btn[data-tab="stack"]')).toHaveClass(/is-active/);
  await expect(page.locator('#pane-stack')).toBeVisible();
  await expect(page.locator('#pane-saved')).toBeHidden();

  // 3. Прямой переход по ссылке с хэшем #analytics
  await page.goto('/profile.html#analytics');
  await expect(page.locator('.profile-tab-btn[data-tab="analytics"]')).toHaveClass(/is-active/);
  await expect(page.locator('#pane-analytics')).toBeVisible();
  await expect(page.locator('#pane-stack')).toBeHidden();

  // 4. Клик по вкладке обновляет хэш в URL
  await page.locator('.profile-tab-btn[data-tab="saved"]').click();
  await expect(page).toHaveURL(/#saved$/);

  // 5. Перезагрузка страницы (F5) сохраняет выбранную вкладку
  await page.reload();
  await expect(page.locator('.profile-tab-btn[data-tab="saved"]')).toHaveClass(/is-active/);
  await expect(page.locator('#pane-saved')).toBeVisible();
  await expect(page.locator('#pane-applications')).toBeHidden();

  // 6. Навигация стрелками клавиатуры (WAI-ARIA APG Tabs)
  const savedBtn = page.locator('.profile-tab-btn[data-tab="saved"]');
  await savedBtn.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.profile-tab-btn[data-tab="stack"]')).toHaveClass(/is-active/);
  await expect(page.locator('#pane-stack')).toBeVisible();
  await expect(page).toHaveURL(/#stack$/);
});

test('profile actions persist across reload (accept offer and interview slot)', async ({ page }) => {
  await page.goto('/profile.html');
  const rows = page.locator('.data-table tbody tr');

  // 1. Принять оффер
  const offerRow = rows.filter({ hasText: 'Python-разработчик' });
  const acceptBtn = offerRow.locator('button');
  await acceptBtn.click();
  await expect(acceptBtn).toHaveText('✓ Принято');
  await expect(acceptBtn).toBeDisabled();

  // 2. Выбрать время
  const interviewRow = rows.filter({ hasText: 'Младший фронтенд-разработчик' });
  const interviewBtn = interviewRow.locator('button');
  await interviewBtn.click();
  await expect(page.locator('.modal-backdrop')).toBeVisible();
  await page.locator('.modal-confirm-btn').click();
  await expect(interviewBtn).toContainText('✓');

  // 3. Перезагрузка страницы F5
  await page.reload();

  const reloadedRows = page.locator('.data-table tbody tr');
  await expect(reloadedRows.locator('button', { hasText: '✓ Принято' })).toBeVisible();
  await expect(reloadedRows.locator('button', { hasText: '✓ Принято' })).toBeDisabled();
  await expect(reloadedRows.filter({ hasText: 'Оффер принят' })).toBeVisible();
  await expect(reloadedRows.locator('button').filter({ hasText: '✓' })).toHaveCount(2);
});

test('profile edit modal updates profile and persists across reload', async ({ page }) => {
  await page.goto('/profile.html');

  // Открываем модалку редактирования
  await page.locator('[data-edit-profile-btn]').first().click();
  await expect(page.locator('.modal-backdrop')).toBeVisible();

  await page.locator('#edit-profile-role').fill('Product Lead & Architect');
  await page.locator('.modal-confirm-btn').click();
  await expect(page.locator('.modal-backdrop')).toBeHidden();

  await expect(page.locator('.student-card__identity small')).toContainText('Product Lead & Architect');

  // Перезагрузка страницы
  await page.reload();
  await expect(page.locator('.student-card__identity small')).toContainText('Product Lead & Architect');
});

test('profile editing via sidebar, short name format (Имя Ф.), and interactive skill levels', async ({ page }) => {
  // 1. Проверяем переход в редактирование из сайдбара на главной (index.html -> profile.html#edit)
  await page.goto('/index.html');
  await page.locator('.sidebar__user').click();
  await expect(page).toHaveURL(/profile\.html#edit$/);
  await expect(page.locator('.modal-backdrop')).toBeVisible();

  // 2. Вводим полное имя и фамилию
  await page.locator('#edit-profile-name').fill('Нурлан Мухамедов');
  await page.locator('.modal-confirm-btn').click();
  await expect(page.locator('.modal-backdrop')).toBeHidden();

  // 3. Проверяем форматирование: полное имя в карточке, сокращение «Имя Ф.» в сайдбаре и шапке
  await expect(page.locator('.student-card__identity h2')).toHaveText('Нурлан Мухамедов');
  await expect(page.locator('.sidebar__user-name')).toHaveText('Нурлан М.');
  await expect(page.locator('.header__profile')).toContainText('Нурлан М.');
  await expect(page.locator('.student-card__avatar')).toHaveText('НМ');

  // 4. Переходим на вкладку стека и проверяем интерактивное изменение уровней навыков
  await page.locator('.profile-tab-btn[data-tab="stack"]').click();
  const sqlRow = page.locator('#pane-stack .skill[data-skill-name="SQL"]');
  await expect(sqlRow).toBeVisible();
  const sqlBars = sqlRow.locator('.skill__bars i');
  await expect(sqlBars).toHaveCount(4);

  // Кликаем на 2-й уровень (2 из 4) в первой таблице (#pane-stack)
  await sqlBars.nth(1).click();
  await expect(sqlBars.nth(0)).toHaveClass(/is-filled/);
  await expect(sqlBars.nth(1)).toHaveClass(/is-filled/);
  await expect(sqlBars.nth(2)).not.toHaveClass(/is-filled/);
  await expect(sqlBars.nth(3)).not.toHaveClass(/is-filled/);

  // Синхронизация: проверяем, что во второй таблице/виджете (#stack) уровень SQL тоже изменился на 2 из 4
  const sideSqlBars = page.locator('#stack .skill[data-skill-name="SQL"] .skill__bars i');
  await expect(sideSqlBars.nth(0)).toHaveClass(/is-filled/);
  await expect(sideSqlBars.nth(1)).toHaveClass(/is-filled/);
  await expect(sideSqlBars.nth(2)).not.toHaveClass(/is-filled/);
  await expect(sideSqlBars.nth(3)).not.toHaveClass(/is-filled/);

  // Обратная синхронизация: меняем уровень Python в боковом виджете (#stack) на 1 из 4
  const sidePythonBars = page.locator('#stack .skill[data-skill-name="Python"] .skill__bars i');
  await sidePythonBars.nth(0).click();
  await expect(sidePythonBars.nth(0)).toHaveClass(/is-filled/);
  await expect(sidePythonBars.nth(1)).not.toHaveClass(/is-filled/);

  // Проверяем, что в основной таблице (#pane-stack) Python тоже стал 1 из 4
  const mainPythonBars = page.locator('#pane-stack .skill[data-skill-name="Python"] .skill__bars i');
  await expect(mainPythonBars.nth(0)).toHaveClass(/is-filled/);
  await expect(mainPythonBars.nth(1)).not.toHaveClass(/is-filled/);

  // 5. Перезагрузка: проверяем сохранение имени, сокращения и уровня стека
  await page.reload();
  await expect(page.locator('.student-card__identity h2')).toHaveText('Нурлан Мухамедов');
  await expect(page.locator('.sidebar__user-name')).toHaveText('Нурлан М.');
  await page.locator('.profile-tab-btn[data-tab="stack"]').click();
  const reloadedSqlBars = page.locator('#pane-stack .skill[data-skill-name="SQL"] .skill__bars i');
  await expect(reloadedSqlBars.nth(1)).toHaveClass(/is-filled/);
  await expect(reloadedSqlBars.nth(2)).not.toHaveClass(/is-filled/);

  // 6. Клик по сайдбару прямо на странице profile.html также открывает модалку
  await page.locator('.sidebar__user').click();
  await expect(page.locator('.modal-backdrop')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-backdrop')).toBeHidden();
});

test('vacancy deep links, title clicks, and cover modal view across pages', async ({ page }) => {
  // 1. Переход из companies.html по ссылке вакансии Яндекса
  await page.goto('/companies.html');
  const yandexAction = page.locator('.company-card').filter({ hasText: /Yandex|Яндекс/i }).locator('.company-card__action');
  await expect(yandexAction).toHaveAttribute('href', 'index.html#job-yandex-analyst');
  await yandexAction.click();

  // 2. Проверяем URL и открытие обложки вакансии в модалке
  await expect(page).toHaveURL(/index\.html#job-yandex-analyst$/);
  await expect(page.locator('.modal-backdrop')).toBeVisible();
  await expect(page.locator('.modal-dialog')).toContainText('Обложка вакансии · Yandex');
  await expect(page.locator('.modal-dialog')).toContainText('Стажёр-аналитик данных');
  await expect(page.locator('#modal-apply-btn')).toBeVisible();

  // 3. Откликаемся прямо из модалки обложки
  await page.locator('#modal-apply-btn').click();
  await expect(page.locator('#modal-apply-btn')).toHaveText('✓ Отклик отмечен');

  // Закрываем модалку
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-backdrop')).toBeHidden();

  // Кнопка на самой карточке в ленте тоже синхронизирована
  const yandexCard = page.locator('[data-job-id="yandex-analyst"]');
  await expect(yandexCard.locator('[data-job-action="apply"]')).toHaveAttribute('aria-pressed', 'true');

  // 4. Клик по заголовку карточки вакансии снова открывает обложку
  await yandexCard.locator('.job-card__title').click();
  await expect(page.locator('.modal-backdrop')).toBeVisible();
  await expect(page.locator('.modal-dialog')).toContainText('Стажёр-аналитик данных');
  await page.keyboard.press('Escape');
  await expect(page.locator('.modal-backdrop')).toBeHidden();
});

test('HR dashboard auto-syncs with backend database in real time', async ({ page, request }) => {
  // 1. Открываем hr.html и проверяем исходное количество кандидатов (5)
  await page.goto('/hr.html');
  const candidateRows = page.locator('.candidate-table tbody tr');
  await expect(candidateRows).toHaveCount(5);

  // 2. В фоне через REST API создаем новый отклик студента
  const postRes = await request.post('/api/applications', {
    data: {
      jobId: 'live-sync-test-job',
      title: 'Realtime Sync Candidate',
      company: 'Sync Corp',
      location: 'Казань · Remote'
    }
  });
  expect(postRes.status()).toBe(201);

  // 3. Проверяем, что в hr.html без перезагрузки страницы (F5) данные автоматически синхронизируются
  await expect(candidateRows).toHaveCount(6, { timeout: 10000 });
  await expect(page.locator('.candidate-table')).toContainText('Realtime Sync Candidate');
});

test('HR can publish a new job and it dynamically appears in the student feed on index.html', async ({ page }) => {
  // 1. HR открывает hr.html и размещает новую стажировку
  await page.goto('/hr.html');
  await page.locator('a[href="#post"]').click();
  await expect(page.locator('.modal-backdrop')).toBeVisible();

  const uniqueTitle = 'Стажёр Cloud AI & MLOps';
  await page.locator('#new-job-title').fill(uniqueTitle);
  await page.locator('#new-job-format').selectOption('remote');
  await page.locator('#new-job-salary').fill('140 000–180 000 ₽');
  await page.locator('.modal-confirm-btn').click();
  await expect(page.locator('.modal-backdrop')).toBeHidden();

  // 2. Студент открывает index.html — вакансия динамически отображается в ленте
  await page.goto('/index.html');
  const newJobCard = page.locator('.job-card').filter({ hasText: uniqueTitle });
  await expect(newJobCard).toBeVisible();
  await expect(newJobCard.locator('.job-card__response')).toContainText('Новая стажировка');
  await expect(newJobCard.locator('.job-card__salary')).toContainText('140 000–180 000 ₽');

  // 3. Студент может откликнуться на новую вакансию
  const applyBtn = newJobCard.locator('[data-job-action="apply"]');
  await applyBtn.click();
  await expect(applyBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.app-toast')).toBeVisible();

  // 4. Проверяем появление в profile.html
  await page.goto('/profile.html');
  await expect(page.locator('.data-table tbody tr').filter({ hasText: uniqueTitle })).toBeVisible();
});

test('saving a job on index.html reflects in profile saved tab and can be removed', async ({ page }) => {
  // 1. Сохраняем вакансию на index.html
  await page.goto('/index.html');
  const yandexCard = page.locator('[data-job-id="yandex-analyst"]');
  const saveBtn = yandexCard.locator('[data-job-action="save"]');
  await saveBtn.click();
  await expect(saveBtn).toHaveAttribute('aria-pressed', 'true');

  // 2. Открываем profile.html и переходим на вкладку "Сохранённые"
  await page.goto('/profile.html');
  await page.locator('.profile-tab-btn[data-tab="saved"]').click();
  await expect(page.locator('#pane-saved')).toBeVisible();

  // Карточка должна отображаться в сохраненных
  const savedCard = page.locator('.saved-jobs-container [data-job-id="yandex-analyst"]');
  await expect(savedCard).toBeVisible();
  await expect(page.locator('[data-saved-count]')).toHaveText('1');

  // 3. Удаляем из сохраненных прямо из вкладки профиля
  const removeSaveBtn = savedCard.locator('[data-job-action="save"]');
  await removeSaveBtn.click();
  await expect(page.locator('.saved-empty')).toBeVisible();
  await expect(page.locator('[data-saved-count]')).toHaveText('0');
});


test('modal dialog accessibility: closes on Escape and retains focus trap', async ({ page }) => {
  await page.goto('/profile.html');

  // Открываем модальное окно редактирования профиля
  const editBtn = page.locator('[data-edit-profile-btn]').first();
  await editBtn.click();
  const modal = page.locator('.modal-backdrop');
  await expect(modal).toBeVisible();

  // 1. Проверяем, что первый input сфокусирован
  await expect(page.locator('#edit-profile-name')).toBeFocused();

  // 2. Нажатие Escape мгновенно закрывает модальное окно
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();

  // 3. Фокус вернулся на кнопку открытия
  await expect(editBtn).toBeFocused();

  // 4. Проверяем Focus Trap: цикл внутри модалки
  await editBtn.click();
  await expect(modal).toBeVisible();

  // Фокусируемся на первом фокусируемом элементе модалки (.modal-close)
  await page.locator('.modal-close').focus();
  await expect(page.locator('.modal-close')).toBeFocused();

  // Shift+Tab с первого элемента оборачивает фокус на последний элемент (.modal-confirm-btn)
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('.modal-confirm-btn')).toBeFocused();

  // Tab с последнего элемента оборачивает фокус на первый элемент (.modal-close)
  await page.keyboard.press('Tab');
  await expect(page.locator('.modal-close')).toBeFocused();

  // Закрываем модалку по Escape
  await page.keyboard.press('Escape');
  await expect(modal).toBeHidden();
});

test('resume print styling hides shell and displays structured A4 resume', async ({ page }) => {
  await page.goto('/profile.html');

  // Переключаем медиа в print
  await page.emulateMedia({ media: 'print' });

  // 1. Проверяем, что веб-шелл скрыт
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.header')).toBeHidden();
  await expect(page.locator('.page-heading')).toBeHidden();
  await expect(page.locator('.profile-tabs')).toBeHidden();
  await expect(page.locator('.profile-controls')).toBeHidden();
  await expect(page.locator('.profile-tip')).toBeHidden();
  await expect(page.locator('.button').first()).toBeHidden();
  await expect(page.locator('.student-card__progress')).toBeHidden();

  // 2. Проверяем, что структура резюме отображается
  await expect(page.locator('.student-card')).toBeVisible();
  await expect(page.locator('.student-card__identity h2')).toContainText('Нур М.');
  await expect(page.locator('.student-card__contacts')).toBeVisible();
  await expect(page.locator('#pane-stack')).toBeVisible();
  await expect(page.locator('#pane-applications')).toBeVisible();
});

test('phase 3 UI polish: university selector on mobile, target university badges, empty states, and dynamic dates', async ({ page }) => {
  // 1. Селектор университета доступен на мобильных
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/index.html');
  const mobileUniSelect = page.locator('.header__select');
  await expect(mobileUniSelect).toBeVisible();
  await expect(page.locator('.header__select select')).toHaveValue('kfu');

  // 2. Десктоп: подсветка партнерских вакансий бейджем «Целевой ВУЗ»
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/index.html');
  await expect(page.locator('[data-job-id="yandex-analyst"] .badge--target-uni')).toBeVisible();
  await expect(page.locator('[data-job-id="sber-java"] .badge--target-uni')).toBeVisible();
  await expect(page.locator('[data-job-id="tbank-data"] .badge--target-uni')).toBeHidden();

  // Смена ВУЗа на ИТМО
  await page.locator('.header__select select').selectOption('itmo');
  await expect(page.locator('[data-job-id="yandex-analyst"] .badge--target-uni')).toBeVisible();
  await expect(page.locator('[data-job-id="sber-java"] .badge--target-uni')).toBeHidden();
  await expect(page.locator('[data-job-id="tbank-data"] .badge--target-uni')).toBeVisible();

  // 3. Тени таблицы table-scroll
  for (const file of ['profile.html', 'hr.html']) {
    await page.goto(`/${file}`);
    const shadow = await page.locator('.table-scroll').first().evaluate(el => getComputedStyle(el).boxShadow);
    expect(shadow).toContain('inset');
  }

  // 4. Оформление Empty State и рабочий CTA «Сбросить фильтры»
  await page.goto('/index.html');
  await page.locator('[data-feed-specialty]').selectOption('development');
  await page.locator('[data-feed-format]').selectOption('hybrid');
  const feedEmpty = page.locator('[data-feed-empty]');
  await expect(feedEmpty).toBeVisible();
  await expect(feedEmpty.locator('h3')).toContainText('стажировок не найдено');
  await expect(feedEmpty.locator('.empty-icon')).toBeVisible();
  // Клик по кнопке «Сбросить фильтры» внутри empty state
  await feedEmpty.locator('.empty-cta').click();
  await expect(feedEmpty).toBeHidden();
  await expect(page.locator('.feed-jobs .job-card')).toHaveCount(3);

  // 5. Компании: Empty State и сброс фильтров
  await page.goto('/companies.html');
  await page.locator('.header__search input').fill('NonExistentCorp123');
  const compEmpty = page.locator('[data-companies-empty]');
  await expect(compEmpty).toBeVisible();
  await compEmpty.locator('.empty-cta').click();
  await expect(compEmpty).toBeHidden();
  await expect(page.locator('[data-company-card]')).toHaveCount(6);

  // 6. Динамические даты и счетчики
  await page.goto('/index.html');
  const dateText = await page.locator('[data-live-date]').textContent();
  expect(dateText?.length).toBeGreaterThan(5);
  await expect(page.locator('[data-feed-banner-title]')).toContainText('стажиров');
  await expect(page.locator('[data-feed-section-subtext]')).toContainText('Показаны');
});

test('partner interactive filters toggle feed jobs and reset cleanly', async ({ page }) => {
  await page.goto('/index.html');

  // 1. Проверяем доступность кнопок партнеров
  const yandexBtn = page.locator('.partners__item--yandex');
  const sberBtn = page.locator('.partners__item--sber');
  const vkBtn = page.locator('.partners__item--vk');

  await expect(yandexBtn).toHaveAttribute('role', 'button');
  await expect(yandexBtn).toHaveAttribute('aria-pressed', 'false');

  // 2. Клик по Yandex — фильтрация ленты
  await yandexBtn.click();
  await expect(yandexBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(yandexBtn).toHaveClass(/partners__item--active/);
  await expect(page.locator('.feed-jobs .job-card:not([hidden])')).toHaveCount(1);
  await expect(page.locator('.feed-jobs .job-card[data-job-id="yandex-analyst"]')).toBeVisible();
  await expect(page.locator('.feed-jobs .job-card[data-job-id="sber-java"]')).toBeHidden();
  await expect(page.locator('[data-feed-section-subtext]')).toContainText('Показаны 1 из 3');

  // 3. Повторный клик по Yandex — снятие фильтра (toggle off)
  await yandexBtn.click();
  await expect(yandexBtn).toHaveAttribute('aria-pressed', 'false');
  await expect(yandexBtn).not.toHaveClass(/partners__item--active/);
  await expect(page.locator('.feed-jobs .job-card:not([hidden])')).toHaveCount(3);
  await expect(page.locator('[data-feed-section-subtext]')).toContainText('Показаны 3 из 3');

  // 4. Клик по Сбер, затем сброс через «Сбросить фильтры»
  await sberBtn.click();
  await expect(sberBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.feed-jobs .job-card:not([hidden])')).toHaveCount(1);
  await expect(page.locator('.feed-jobs .job-card[data-job-id="sber-java"]')).toBeVisible();

  await page.locator('[data-feed-reset]').first().click();
  await expect(sberBtn).toHaveAttribute('aria-pressed', 'false');
  await expect(sberBtn).not.toHaveClass(/partners__item--active/);
  await expect(page.locator('.feed-jobs .job-card:not([hidden])')).toHaveCount(3);

  // 5. Клавиатурная навигация (Enter / Space) и Empty State
  await vkBtn.focus();
  await page.keyboard.press('Enter');
  await expect(vkBtn).toHaveAttribute('aria-pressed', 'true');
  // Нет вакансий VK по умолчанию -> должен появиться feedEmpty
  const feedEmpty = page.locator('[data-feed-empty]');
  await expect(feedEmpty).toBeVisible();
  await feedEmpty.locator('.empty-cta').click();
  await expect(feedEmpty).toBeHidden();
  await expect(vkBtn).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.feed-jobs .job-card:not([hidden])')).toHaveCount(3);
});


test('mascot peeking styling, events vector icons, and cancel application button hover contrast', async ({ page }) => {
  await page.goto('/index.html');

  // 1. Проверяем выглядывающего маскота Buddie в блоке советов
  const mascotBox = page.locator('.feed-tip__mascot');
  await expect(mascotBox).toBeVisible();
  const mascotImg = mascotBox.locator('img');
  await expect(mascotImg).toBeVisible();
  const boxStyles = await mascotBox.evaluate(el => {
    const s = getComputedStyle(el);
    return { overflow: s.overflow, position: s.position, borderRadius: s.borderRadius };
  });
  expect(boxStyles.overflow).toBe('hidden');

  // 2. Проверяем векторные SVG иконки в «События и дедлайны» и их границы
  const noticeIcons = page.locator('.feed-notice__icon svg');
  await expect(noticeIcons).toHaveCount(4);
  await expect(page.locator('.feed-notice__icon--warning svg')).toBeVisible();
  await expect(page.locator('.feed-notice__icon--purple svg')).toBeVisible();
  await expect(page.locator('.feed-notice__icon--info svg')).toBeVisible();
  await expect(page.locator('.feed-notice__icon--success svg')).toBeVisible();

  // Проверяем, что иконки находятся строго внутри плашек и не вылезают за границы
  const iconsContained = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.feed-notice__icon')).every(span => {
      const svg = span.querySelector('svg');
      if (!svg) return false;
      const spanR = span.getBoundingClientRect();
      const svgR = svg.getBoundingClientRect();
      return (
        svgR.left >= spanR.left - 0.5 &&
        svgR.right <= spanR.right + 0.5 &&
        svgR.top >= spanR.top - 0.5 &&
        svgR.bottom <= spanR.bottom + 0.5
      );
    });
  });
  expect(iconsContained).toBe(true);

  // 3. Откликаемся на вакансию, затем проверяем читабельность кнопки отмены отклика при наведении
  const yandexCard = page.locator('[data-job-id="yandex-analyst"]');
  const applyBtn = yandexCard.locator('[data-job-action="apply"]');
  await applyBtn.click();
  await expect(applyBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(applyBtn).toHaveClass(/button--soft/);
  await expect(applyBtn).toHaveAttribute('title', 'Отменить отклик');

  // Наводим курсор на кнопку отмены отклика
  await applyBtn.hover();
  const hoverStyles = await applyBtn.evaluate(el => {
    const s = getComputedStyle(el);
    return { color: s.color, background: s.background || s.backgroundColor };
  });

  // Проверяем, что цвет текста белый rgb(255, 255, 255), обеспечивающий максимальную читабельность
  expect(hoverStyles.color).toBe('rgb(255, 255, 255)');
});


test('applied search filters are prominently highlighted, synchronized with chips, and clearable', async ({ page }) => {
  await page.goto('/index.html');

  const allJobsBtn = page.locator('.feed-filters button[data-feed-reset]');
  const formatSelect = page.locator('[data-feed-format]');
  const specialtySelect = page.locator('[data-feed-specialty]');
  const activeChips = page.locator('[data-active-chips]');
  const searchInput = page.locator('.header__search input');
  const searchWrapper = page.locator('.header__search');

  // Проверяем, что в панели фильтров нет дубликата кнопки сброса (только «Все стажировки»)
  await expect(page.locator('.feed-filters button')).toHaveCount(1);

  // 1. По умолчанию: активна кнопка «Все стажировки», селекты без подсветки, чипы скрыты
  await expect(allJobsBtn).toHaveClass(/filter-pill--active/);
  await expect(formatSelect).not.toHaveClass(/filter-pill--active/);
  await expect(specialtySelect).not.toHaveClass(/filter-pill--active/);
  await expect(formatSelect).toHaveAttribute('data-active-filter', 'false');
  await expect(activeChips).toBeHidden();

  // 2. Выбираем формат «Гибрид» -> проверяем появление мягкой неброской подсветки
  await formatSelect.selectOption('hybrid');
  await expect(formatSelect).toHaveClass(/filter-pill--active/);
  await expect(formatSelect).toHaveAttribute('data-active-filter', 'true');
  await expect(allJobsBtn).not.toHaveClass(/filter-pill--active/);

  // Проверяем вычисленные стили подсветки: мягкий лавандовый фон, читаемый цвет текста и неброскую тень
  await expect(formatSelect).toHaveCSS('background-color', 'rgb(243, 232, 255)');
  await expect(formatSelect).toHaveCSS('color', 'rgb(88, 28, 135)');
  await expect(formatSelect).toHaveCSS('font-weight', '700');
  const formatShadow = await formatSelect.evaluate(el => getComputedStyle(el).boxShadow);
  expect(formatShadow).not.toContain('0px 0px 0px 2px'); // тяжелый неоновый ореол убран

  // Проверяем отображение плашки активных фильтров с чипом формата
  await expect(activeChips).toBeVisible();
  const formatChip = activeChips.locator('[data-remove-filter="format"]');
  await expect(formatChip).toBeVisible();
  await expect(formatChip).toContainText('Формат:');
  await expect(formatChip).toContainText('Гибрид');
  await expect(activeChips.locator('.filter-chip')).toHaveCount(1);

  // 3. Выбираем также специальность «Разработка» -> оба фильтра подсвечены, в плашке 2 чипа
  await specialtySelect.selectOption('development');
  await expect(specialtySelect).toHaveClass(/filter-pill--active/);
  await expect(specialtySelect).toHaveAttribute('data-active-filter', 'true');
  await expect(activeChips.locator('.filter-chip')).toHaveCount(2);

  const specialtyChip = activeChips.locator('[data-remove-filter="specialty"]');
  await expect(specialtyChip).toBeVisible();
  await expect(specialtyChip).toContainText('Специальность:');
  await expect(specialtyChip).toContainText('Разработка');

  // 4. Удаляем только фильтр формата через крестик чипа
  await formatChip.click();
  await expect(formatSelect).not.toHaveClass(/filter-pill--active/);
  await expect(formatSelect).toHaveAttribute('data-active-filter', 'false');
  await expect(specialtySelect).toHaveClass(/filter-pill--active/);
  await expect(activeChips.locator('[data-remove-filter="format"]')).toHaveCount(0);
  await expect(activeChips.locator('[data-remove-filter="specialty"]')).toBeVisible();
  await expect(activeChips.locator('.filter-chip')).toHaveCount(1);

  // 5. Вводим поисковый запрос -> подсветка поисковой строки и появление чипа поиска
  await searchInput.fill('Java');
  await expect(searchWrapper).toHaveClass(/header__search--active/);
  const searchChip = activeChips.locator('[data-remove-filter="search"]');
  await expect(searchChip).toBeVisible();
  await expect(searchChip).toContainText('Поиск:');
  await expect(searchChip).toContainText('«java»');
  await expect(activeChips.locator('.filter-chip')).toHaveCount(2);

  // 6. Выбираем фильтр компании Сбер -> появляется чип компании
  const sberPartner = page.locator('[data-partner-filter="sber"]');
  await sberPartner.click();
  await expect(sberPartner).toHaveClass(/partners__item--active/);
  const partnerChip = activeChips.locator('[data-remove-filter="partner"]');
  await expect(partnerChip).toBeVisible();
  await expect(partnerChip).toContainText('Компания:');
  await expect(partnerChip).toContainText('Сбер');
  await expect(activeChips.locator('.filter-chip')).toHaveCount(3);

  // 7. Проверяем адаптивность и отсутствие горизонтального переполнения при активных чипах
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({ width, height: 700 });
    const hasOverflow = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return el.scrollWidth > window.innerWidth;
    });
    expect(hasOverflow, `Overflow detected at ${width}px with active filter chips`).toBe(false);
  }

  // 8. Сбрасываем все фильтры через кнопку «Сбросить всё ✕» в панели чипов
  await page.setViewportSize({ width: 1440, height: 900 });
  const clearAllChipsBtn = activeChips.locator('[data-feed-reset-chips]');
  await clearAllChipsBtn.click();

  await expect(formatSelect).not.toHaveClass(/filter-pill--active/);
  await expect(specialtySelect).not.toHaveClass(/filter-pill--active/);
  await expect(allJobsBtn).toHaveClass(/filter-pill--active/);
  await expect(activeChips).toBeHidden();
  await expect(searchInput).toHaveValue('');
  await expect(searchWrapper).not.toHaveClass(/header__search--active/);
  await expect(sberPartner).not.toHaveClass(/partners__item--active/);
  await expect(page.locator('.feed-jobs .job-card:not([hidden])')).toHaveCount(3);

  // 9. Проверяем подсветку фильтра статуса на странице профиля
  await page.goto('/profile.html');
  const appStatusSelect = page.locator('[data-application-status]');
  await expect(appStatusSelect).not.toHaveClass(/filter-pill--active/);

  await appStatusSelect.selectOption('Приглашение');
  await expect(appStatusSelect).toHaveClass(/filter-pill--active/);
  await expect(appStatusSelect).toHaveAttribute('data-active-filter', 'true');

  await appStatusSelect.selectOption('all');
  await expect(appStatusSelect).not.toHaveClass(/filter-pill--active/);
  await expect(appStatusSelect).toHaveAttribute('data-active-filter', 'false');

  // 10. Проверяем, что выбор университета кликабелен по всей своей площади
  await page.goto('/index.html');
  const uniWrapper = page.locator('.header__select');
  const uniSelect = page.locator('.header__select select');
  const uniSmall = page.locator('.header__select small');

  // Надпись «УНИВЕРСИТЕТ» пропускает клики сквозь себя на select
  const smallPointerEvents = await uniSmall.evaluate(el => getComputedStyle(el).pointerEvents);
  expect(smallPointerEvents).toBe('none');

  // select занимает 100% площади контейнера
  const wrapBox = await uniWrapper.boundingBox();
  const selBox = await uniSelect.boundingBox();
  expect(selBox.width).toBeGreaterThanOrEqual(wrapBox.width - 2);
  expect(selBox.height).toBeGreaterThanOrEqual(wrapBox.height - 2);

  // Клик в верхний левый угол плашки (зона заголовка) активирует выбор
  await uniWrapper.click({ position: { x: 8, y: 6 } });
  await uniSelect.selectOption('hse');
  await expect(uniSelect).toHaveValue('hse');
});


test('stage 1 UI resilience: long text overflow protection, tag collapse, empty zero-state, and mobile touch targets', async ({ page }) => {
  // 1. Проверяем переполнение длинными строками в profile.html
  await page.goto('/profile.html');
  const longName = 'Константинопольский-Длинноименнов Иннокентий Аристархович';
  const longRole = 'Старший архитектор высоконагруженных распределённых систем и микросервисов';
  await page.locator('[data-edit-profile-btn]').first().click();
  await page.locator('#edit-profile-name').fill(longName);
  await page.locator('#edit-profile-role').fill(longRole);
  await page.locator('.modal-confirm-btn').click();

  // Имя и роль отображаются и не вызывают горизонтального переполнения страницы
  const nameEl = page.locator('.student-card__identity h2');
  await expect(nameEl).toContainText('Константинопольский-Длинноименнов');
  const hasPageScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(hasPageScroll).toBe(false);

  // 2. Проверяем схлопывание >4 тегов в карточках на index.html
  await page.route('**/api/jobs', async route => {
    const jobs = [
      {
        id: 'job-many-tags',
        title: 'Fullstack разработчик с множеством навыков',
        company: 'Yandex',
        companyLetter: 'Я',
        rating: '⭐ 5.0 · Топ',
        salary: '120 000 ₽',
        format: 'remote',
        tags: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'Docker', 'Kubernetes'],
        description: 'Большой стек для тестирования бейджа +N тегов.',
        matchScore: '✧ 98% совпадение'
      }
    ];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(jobs)
    });
  });
  await page.goto('/index.html');
  const cardChips = page.locator('.job-card[data-job-id="job-many-tags"] .job-card__tags .chip');
  // 4 обычных тега + 1 счетчик (+2)
  await expect(cardChips).toHaveCount(5);
  const counterChip = page.locator('.job-card[data-job-id="job-many-tags"] .chip--counter');
  await expect(counterChip).toBeVisible();
  await expect(counterChip).toContainText('+2');

  // В модалке отображаются все 6 тегов без схлопывания
  await page.locator('.job-card[data-job-id="job-many-tags"] .job-card__title').click();
  await expect(page.locator('.modal-dialog .chip')).toHaveCount(6);
  await page.keyboard.press('Escape');

  // 3. Тестируем пустое состояние при 0 откликов в profile.html
  await page.route('**/api/applications', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });
  await page.addInitScript(() => {
    localStorage.setItem('buddie-applications-cache', JSON.stringify([]));
  });
  await page.goto('/profile.html');
  const emptyState = page.locator('.interaction-empty');
  await expect(emptyState).toBeVisible();
  await expect(emptyState).toContainText('У вас пока нет откликов');
  await expect(emptyState.locator('a.empty-cta')).toHaveAttribute('href', 'index.html');
  await page.unroute('**/api/applications');

  // 4. Тестируем мобильные тач-таргеты на 375px
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/index.html');
  // Проверяем высоту кнопки вакансии
  const smallBtn = page.locator('.button--small').first();
  const btnBox = await smallBtn.boundingBox();
  expect(btnBox.height).toBeGreaterThanOrEqual(44);

  // Проверяем тач-таргет кнопки закрытия модалки
  await page.locator('.job-card__title').first().click();
  const modalClose = page.locator('.modal-close');
  const closeBox = await modalClose.boundingBox();
  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
});

test('stage 2 network resilience: offline fallback for applications, candidates, job creation, and double action protection', async ({ page }) => {
  // Эмулируем оффлайн для эндпоинтов API
  await page.route('**/api/**', async route => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Service Unavailable' })
    });
  });

  // 1. Проверяем сохранение отклика при отключенном бэкенде
  await page.goto('/index.html');
  const firstCard = page.locator('.job-card').first();
  const firstApplyBtn = firstCard.locator('button[data-job-action="apply"]');
  await expect(firstApplyBtn).toBeVisible();
  await firstApplyBtn.click();
  await expect(firstApplyBtn).toContainText('Отклик отмечен');

  // Переходим в профиль — отклик должен отображаться из localStorage кеша
  await page.goto('/profile.html');
  const rows = page.locator('.data-table tbody tr');
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThanOrEqual(1);

  // 2. Проверяем создание вакансии HR при отключенном бэкенде
  await page.goto('/hr.html');
  await page.locator('a[href="#post"]').click();
  const modal = page.locator('.modal-dialog');
  await expect(modal).toBeVisible();
  await modal.locator('#new-job-title').fill('Offline QA Engineer');
  await modal.locator('#new-job-salary').fill('90 000 ₽');
  await modal.locator('.modal-confirm-btn').click();
  await expect(modal).toBeHidden();

  // 3. Защита от спам-кликов: проверяем атрибут aria-busy / отключение при отправке
  await page.goto('/index.html');
  const testCard = page.locator('.job-card').first();
  const applyBtn = testCard.locator('button:has-text("Откликнуться"), button:has-text("✓ Отклик отправлен")').first();
  await expect(applyBtn).toBeVisible();
});

test('stage 3 accessibility: keyboard focus retention on chip deletion, aria-live status announcements, and WCAG contrast', async ({ page }) => {
  // 1. Проверяем атрибуты динамических объявлений aria-live="polite"
  await page.goto('/index.html');
  const feedSubtext = page.locator('[data-feed-section-subtext]');
  await expect(feedSubtext).toHaveAttribute('role', 'status');
  await expect(feedSubtext).toHaveAttribute('aria-live', 'polite');

  await page.goto('/companies.html');
  const companyCount = page.locator('[data-company-count]');
  await expect(companyCount).toHaveAttribute('role', 'status');
  await expect(companyCount).toHaveAttribute('aria-live', 'polite');

  // 2. Фокус-менеджмент чипсов при их удалении
  await page.goto('/index.html');
  const specialtySelect = page.locator('[data-feed-specialty]');
  const formatSelect = page.locator('[data-feed-format]');
  await specialtySelect.selectOption('development');
  await formatSelect.selectOption('remote');

  const activeChips = page.locator('[data-active-chips]');
  await expect(activeChips.locator('.filter-chip')).toHaveCount(2);

  // Кликаем по первому чипсу
  const firstChip = activeChips.locator('.filter-chip').first();
  await firstChip.click();

  // Проверяем, что фокус НЕ сбросился в корень document.body
  const activeTag = await page.evaluate(() => document.activeElement ? document.activeElement.tagName.toLowerCase() : '');
  expect(activeTag).not.toBe('body');

  // 3. Проверяем цветовой контраст подсказок в модальном окне редактирования профиля
  await page.goto('/profile.html');
  await page.locator('[data-edit-profile-btn]').first().click();
  const modalSmall = page.locator('.modal-dialog small').first();
  await expect(modalSmall).toBeVisible();
  const smallColor = await modalSmall.evaluate(el => getComputedStyle(el).color);
  // #4A5568 -> rgb(74, 85, 104)
  expect(smallColor).toBe('rgb(74, 85, 104)');
  await page.keyboard.press('Escape');
});

test('stage 4 business logic: HR candidate job filter, student-recruiter chat persistence, and job creation validation', async ({ page }) => {
  // 1. Фильтрация кандидатов по вакансии в hr.html
  await page.goto('/hr.html');
  await page.locator('[data-hr-university]').selectOption('all');

  const jobSelect = page.locator('[data-hr-job]');
  await expect(jobSelect).toBeVisible();

  // Должна быть опция "Все вакансии" и конкретные роли
  const jobOptions = await jobSelect.locator('option').allTextContents();
  expect(jobOptions.length).toBeGreaterThan(1);
  expect(jobOptions[0]).toBe('Все вакансии');

  const rows = page.locator('.candidate-table tbody tr');
  const initialCount = await rows.filter({ visible: true }).count();
  expect(initialCount).toBeGreaterThan(0);

  // Выбираем конкретную должность из выпадающего списка
  const specificJob = jobOptions[1];
  await jobSelect.selectOption(specificJob);

  // Проверяем, что отображаются только кандидаты на выбранную роль
  const filteredRows = rows.filter({ visible: true });
  const filteredCount = await filteredRows.count();
  expect(filteredCount).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < filteredCount; i++) {
    const jobText = await filteredRows.nth(i).locator('td').nth(2).textContent();
    expect(jobText.trim().toLowerCase()).toContain(specificJob.toLowerCase());
  }

  // Сбрасываем фильтр обратно на 'all'
  await jobSelect.selectOption('all');
  const restoredCount = await rows.filter({ visible: true }).count();
  expect(restoredCount).toBe(initialCount);

  // 2. Чат с HR в profile.html: история диалога, валидация и сохранение
  await page.goto('/profile.html');
  const chatBtn = page.locator('.data-table tbody tr').filter({ hasText: 'Чат с HR' }).locator('button').first();
  await expect(chatBtn).toBeVisible();
  await chatBtn.click();

  const chatModal = page.locator('.modal-dialog');
  await expect(chatModal).toBeVisible();
  await expect(chatModal.locator('.modal-title')).toContainText('Чат с рекрутером');

  // Проверяем наличие сообщений от рекрутера в истории
  const chatHistory = chatModal.locator('.chat-history');
  await expect(chatHistory).toBeVisible();
  await expect(chatHistory).toContainText('Здравствуйте!');

  // Проверяем валидацию пустого ответа: форма не закрывается при пустом вводе
  const confirmBtn = chatModal.locator('.modal-confirm-btn');
  await confirmBtn.click();
  await expect(chatModal).toBeVisible();

  // Вводим ответ и отправляем
  const testReply = 'Здравствуйте! Да, я готов приступить к стажировке.';
  await chatModal.locator('#chat-reply-input').fill(testReply);
  await confirmBtn.click();
  await expect(chatModal).toBeHidden();

  // Открываем чат повторно и проверяем, что наш ответ сохранился в истории
  await chatBtn.click();
  await expect(chatModal).toBeVisible();
  await expect(chatModal.locator('.chat-history')).toContainText(testReply);
  await page.keyboard.press('Escape');

  // 3. Валидация формы публикации новой вакансии в hr.html
  await page.goto('/hr.html');
  await page.locator('a[href="#post"]').click();
  const postModal = page.locator('.modal-dialog');
  await expect(postModal).toBeVisible();
  await expect(postModal.locator('.modal-title')).toContainText('Размещение новой стажировки');

  // Попытка отправить пустую форму
  const postSubmitBtn = postModal.locator('.modal-confirm-btn');
  await postSubmitBtn.click();

  // Проверяем появление ошибок валидации и то, что модалка осталась открытой
  await expect(postModal).toBeVisible();
  const errors = postModal.locator('.field-error');
  await expect(errors).toHaveCount(2);
  await expect(errors.first()).toContainText('Укажите название роли');

  // Заполняем валидные данные
  await postModal.locator('#new-job-title').fill('DevOps Intern');
  await postModal.locator('#new-job-salary').fill('110 000 ₽');
  await postSubmitBtn.click();
  await expect(postModal).toBeHidden();

  // Проверяем, что новая вакансия появилась в фильтре вакансий [data-hr-job]
  const updatedJobOptions = await page.locator('[data-hr-job] option').allTextContents();
  expect(updatedJobOptions).toContain('DevOps Intern');
});

test('stage 5 badge synchronization: navigation counts reactively track applications and notification read state', async ({ page }) => {
  // 1. Проверяем исходное состояние счетчиков (4 уведомления, 4 отклика)
  await page.goto('/index.html');
  const navCounts = page.locator('.sidebar__count');
  await expect(navCounts).toHaveText(['4', '4']);
  await expect(page.locator('.header__bell span')).toHaveText('4');

  // 2. Откликаемся на вакансию и проверяем немедленное обновление бейджа откликов на 5
  const applyBtn = page.locator('[data-job-id="yandex-analyst"] [data-job-action="apply"]');
  await applyBtn.click();
  await expect(applyBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(navCounts).toHaveText(['4', '5']);

  // 3. Переходим в личный кабинет и проверяем синхронизацию всех счетчиков в профиле
  await page.goto('/profile.html');
  await expect(page.locator('.sidebar__count')).toHaveText(['4', '5']);
  await expect(page.locator('.profile-tab-btn[data-tab="applications"] .profile-tab-count')).toHaveText('5');
  await expect(page.locator('#pane-applications .company-rating')).toHaveText('5 откликов');

  // 4. Отменяем отклик и проверяем откат счетчика обратно на 4
  await page.goto('/index.html');
  await page.locator('[data-job-id="yandex-analyst"] [data-job-action="apply"]').click();
  await expect(applyBtn).toHaveText('Откликнуться');
  await expect(navCounts).toHaveText(['4', '4']);

  // 5. Переходим в уведомления и отмечаем всё прочитанным — счетчик уведомлений становится 0
  await page.goto('/notifications.html');
  await expect(page.locator('.sidebar__count')).toHaveText(['4', '4']);
  await page.locator('[data-mark-all-read]').click();
  await expect(page.locator('.sidebar__count')).toHaveText(['0', '4']);
  await expect(page.locator('.header__bell span')).toHaveText('0');

  // 6. Возвращаемся на главную и проверяем, что статус прочитанности уведомлений сохраняется в сайдбаре
  await page.goto('/index.html');
  await expect(page.locator('.sidebar__count')).toHaveText(['0', '4']);
  await expect(page.locator('.header__bell span')).toHaveText('0');
});


test('Sprint 1 security: XSS injection payloads are neutralized and safely escaped across jobs, modals, and candidate rows', async ({ page }) => {
  await page.goto('/hr.html');
  await page.locator('a[href="#post"]').click();
  const postModal = page.locator('.modal-dialog');
  await expect(postModal).toBeVisible();

  const xssTitle = '<img src="invalid-xss" onerror="window.__xssRun=1"><b id="xss-probe">Security Test</b>';
  await postModal.locator('#new-job-title').fill(xssTitle);
  await postModal.locator('#new-job-salary').fill('150 000 ₽');
  await postModal.locator('.modal-confirm-btn').click();
  await expect(postModal).toBeHidden();

  // Student feed on index.html
  await page.goto('/index.html');
  // Probe element with id="xss-probe" should NOT exist in the DOM as an HTML element
  await expect(page.locator('#xss-probe')).toHaveCount(0);
  const xssRun = await page.evaluate(() => window.__xssRun);
  expect(xssRun).toBeUndefined();

  // Card title should literally contain the escaped string
  const cardTitle = page.locator('.job-card__title').filter({ hasText: 'Security Test' });
  await expect(cardTitle).toBeVisible();
  expect(await cardTitle.innerText()).toContain('<img src="invalid-xss"');

  // Clicking the title opens the job details modal
  await cardTitle.click();
  const detailsModal = page.locator('.modal-dialog');
  await expect(detailsModal).toBeVisible();
  await expect(detailsModal.locator('#xss-probe')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(detailsModal).toBeHidden();
});

test('Sprint 2 state: URL query parameters synchronize with feed filters and persist across reload (F5)', async ({ page }) => {
  // Open index.html with initial query params
  await page.goto('/index.html?search=Java&specialty=development&format=remote&uni=kfu');
  await expect(page.locator('.header__search input')).toHaveValue('Java');
  await expect(page.locator('[data-feed-specialty]')).toHaveValue('development');
  await expect(page.locator('[data-feed-format]')).toHaveValue('remote');
  await expect(page.locator('.header__select select')).toHaveValue('kfu');

  // Change search in UI and verify URL query parameter updates
  await page.locator('.header__search input').fill('Python');
  await expect.poll(() => page.url()).toContain('search=Python');

  // Reload page (F5) and verify state restoration from URL
  await page.reload();
  await expect(page.locator('.header__search input')).toHaveValue('Python');
  await expect(page.locator('[data-feed-specialty]')).toHaveValue('development');
  await expect(page.locator('[data-feed-format]')).toHaveValue('remote');
  await expect(page.locator('.header__select select')).toHaveValue('kfu');

  // Reset filters using reset button
  const resetBtn = page.locator('[data-feed-reset]').first();
  await resetBtn.click();
  await expect(page.locator('.header__search input')).toHaveValue('');
  await expect.poll(() => page.url()).not.toContain('search=Python');
});

test('Sprint 2 UX: rejection status feedback button opens structured feedback modal dialog', async ({ page }) => {
  await page.goto('/profile.html');
  await page.locator('.profile-tab-btn[data-tab="applications"]').click();
  await expect(page.locator('#pane-applications')).toBeVisible();

  // Rejection row exists (VK application with status Отказ)
  const rejectionRow = page.locator('.data-table tbody tr').filter({ hasText: 'Отказ' });
  await expect(rejectionRow).toBeVisible();

  // Find feedback button
  const feedbackBtn = rejectionRow.locator('a.application-feedback, button.application-feedback');
  await expect(feedbackBtn).toBeVisible();
  await expect(feedbackBtn).toHaveText('Фидбек');

  // Click feedback button
  await feedbackBtn.click();
  const feedbackModal = page.locator('.modal-dialog');
  await expect(feedbackModal).toBeVisible();
  await expect(feedbackModal.locator('.modal-title')).toContainText('Обратная связь');
  await expect(feedbackModal.locator('.feedback-modal-content')).toContainText('Рекомендации ментора Buddie');
  await expect(feedbackModal.locator('.feedback-modal-content')).toContainText('кадровом резерве');

  // Close modal using Escape
  await page.keyboard.press('Escape');
  await expect(feedbackModal).toBeHidden();
});

test('Sprint 3 UX & a11y: print media hides navigation and analytics panes, mobile inputs meet 16px font size', async ({ page }) => {
  await page.goto('/profile.html');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#pane-analytics')).toBeHidden();
  await expect(page.locator('.sidebar')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });

  // Check mobile input font-size >= 16px to prevent iOS auto-zoom
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/index.html');
  const inputFontSize = await page.locator('.header__search input').evaluate(el => window.getComputedStyle(el).fontSize);
  expect(parseFloat(inputFontSize)).toBeGreaterThanOrEqual(16);

  const selectFontSize = await page.locator('.header__select select').evaluate(el => window.getComputedStyle(el).fontSize);
  expect(parseFloat(selectFontSize)).toBeGreaterThanOrEqual(16);

  // Check WCAG AA contrast on .job-card__response
  const responseBadge = page.locator('.job-card__response').first();
  await expect(responseBadge).toBeVisible();
  const responseColor = await responseBadge.evaluate(el => window.getComputedStyle(el).color);
  expect(responseColor).toBe('rgb(21, 128, 61)');
});

test('Phase 1 & Phase 2 Security & Backend Consistency: safe URI decoding, state guard, and relational synchronization', async ({ page, request }) => {
  // S4: PUT /api/state rejects attempts to overwrite protected collections
  const stateRes = await request.put('/api/state', {
    data: {
      jobs: [{ id: 'hacked-job', title: 'Hacked' }]
    }
  });
  expect(stateRes.status()).toBe(403);
  const stateBody = await stateRes.json();
  expect(stateBody.error).toContain('forbidden');

  // B1: Malformed URI encoding returns 400 Bad Request instead of 500
  const malformedJobRes = await request.get('/api/jobs/invalid%percent');
  expect(malformedJobRes.status()).toBe(400);
  const malformedJobBody = await malformedJobRes.json();
  expect(malformedJobBody.error).toBe('Invalid URL encoding');

  const malformedCandRes = await request.get('/api/candidates/invalid%FF');
  expect(malformedCandRes.status()).toBe(400);

  // B3: DELETE /api/jobs/:id cascade cleanup & 404 for non-existent
  const delete404 = await request.delete('/api/jobs/non-existent-job-xyz');
  expect(delete404.status()).toBe(404);

  // B4: Bi-directional candidate status synchronization
  const updateCandRes = await request.put('/api/candidates/cand-1', {
    data: { status: 'offer' }
  });
  expect(updateCandRes.status()).toBe(200);
  const getAppRes = await request.get('/api/applications/app-1');
  expect(getAppRes.status()).toBe(200);
  const appData = await getAppRes.json();
  expect(appData.status).toBe('Оффер');
});

test('Phase 1 & Phase 3 Security & UI Interactivity: XSS neutralization, interview reminder widget, and skip links', async ({ page, request }) => {
  // S1: Profile edit modal escapes stored XSS in profile data
  await request.put('/api/profile', {
    data: {
      name: '<script>alert("xss-name")</script>Иван',
      role: 'Product Lead',
      skills: ['Python', 'SQL'],
      about: 'Test About'
    }
  });

  await page.goto('/profile.html');
  await page.locator('[data-edit-profile-btn]').first().click();
  const editModal = page.locator('.modal-dialog');
  await expect(editModal).toBeVisible();
  const nameInputVal = await page.locator('#edit-profile-name').inputValue();
  expect(nameInputVal).toBe('<script>alert("xss-name")</script>Иван');
  await page.keyboard.press('Escape');
  await expect(editModal).toBeHidden();

  // F1: Interview reminder widget button opens interview modal
  const reminderBtn = page.locator('#btn-interview-reminder');
  await expect(reminderBtn).toBeVisible();
  await reminderBtn.click();
  const slotModal = page.locator('.modal-dialog');
  await expect(slotModal).toBeVisible();
  await expect(slotModal.locator('.modal-title')).toContainText('интервью');
  await page.keyboard.press('Escape');
  await expect(slotModal).toBeHidden();

  // F2: Company category filter reset on companies.html
  await page.goto('/companies.html');
  const itChip = page.locator('[data-company-filter="it"]');
  await itChip.click();
  await expect(page.locator('.company-card:visible')).toHaveCount(2);
  const resetBtn = page.locator('[data-company-filter="all"]');
  await resetBtn.click();
  await expect(page.locator('.company-card:visible')).toHaveCount(6);

  // F3: Skip link accessibility
  await page.goto('/index.html');
  const skipLink = page.locator('.skip-link');
  await expect(skipLink).toBeAttached();
  expect(await skipLink.getAttribute('href')).toBe('#main-content');
  const mainContent = page.locator('#main-content');
  await expect(mainContent).toBeAttached();
});
