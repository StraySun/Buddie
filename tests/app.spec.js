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
