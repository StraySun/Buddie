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
      if (message.type() === 'error') errors.push(message.text());
    });
    await use(page);
    expect(errors).toEqual([]);
  }
});

test.beforeEach(async () => {
  fs.writeFileSync(DB_PATH, INITIAL_DB, 'utf8');
});

test.afterAll(async () => {
  fs.writeFileSync(DB_PATH, INITIAL_DB, 'utf8');
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
    await expect(nav.locator('.sidebar__count')).toHaveText(['5', '4']);
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
