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
