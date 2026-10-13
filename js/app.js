const storage = {
  read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }
};

const toast = document.createElement('div');
toast.className = 'app-toast';
toast.setAttribute('role', 'status');
toast.setAttribute('aria-live', 'polite');
document.body.append(toast);
let toastTimeout;

function announce(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function setVisible(element, visible) {
  element.hidden = !visible;
}

const searchInputs = [...document.querySelectorAll('[data-search-input]')];
let searchTerm = '';

function updateSearch(value) {
  searchTerm = value.trim().toLocaleLowerCase('ru');
  searchInputs.forEach(input => {
    if (input.value !== value) input.value = value;
  });
  const visibleText = element => !searchTerm || element.textContent.toLocaleLowerCase('ru').includes(searchTerm);

  document.querySelectorAll('[data-job-id]').forEach(job => updateJobs(job));
  const resetFilter = document.querySelector('[data-feed-reset]');
  if (resetFilter) {
    const isDefault = !searchTerm && (document.querySelector('[data-feed-specialty]')?.value ?? 'all') === 'all' && (document.querySelector('[data-feed-format]')?.value ?? 'all') === 'all';
    resetFilter.classList.toggle('filter-pill--active', isDefault);
    resetFilter.setAttribute('aria-pressed', String(isDefault));
  }
  document.querySelectorAll('[data-company-card]').forEach(card => {
    const visible = visibleText(card) && matchesCompanyCategory(card);
    setVisible(card, visible);
  });
  const companyCards = [...document.querySelectorAll('[data-company-card]')];
  const visibleCompanies = companyCards.filter(card => !card.hidden);
  const companyCount = document.querySelector('[data-company-count]');
  if (companyCount) {
    const internships = visibleCompanies.reduce((total, card) => {
      return total + Number(card.querySelector('.company-card__count').textContent.match(/\d+/)?.[0] ?? 0);
    }, 0);
    companyCount.textContent = `${visibleCompanies.length} из ${companyCards.length} компаний · ${internships} активных стажировок`;
  }
  document.querySelectorAll('.data-table tbody tr').forEach(row => {
    setVisible(row, visibleText(row) && matchesApplicationStatus(row));
  });
  document.querySelectorAll('.candidate-table tbody tr').forEach(row => {
    setVisible(row, visibleText(row) && matchesHrFilters(row));
  });
  document.querySelectorAll('.timeline-card').forEach(card => {
    setVisible(card, visibleText(card) && matchesNotificationFilter(card) && !isDismissed(card));
  });
  updateEmptyStates();
}

function matchesCompanyCategory(card) {
  return currentCompanyCategory === 'all' || card.dataset.category === currentCompanyCategory;
}

function matchesApplicationStatus(row) {
  const selected = document.querySelector('[data-application-status]')?.value ?? 'all';
  return selected === 'all' || row.textContent.includes(selected);
}

function matchesHrFilters(row) {
  const university = document.querySelector('[data-hr-university]')?.value ?? 'all';
  const status = document.querySelector('[data-hr-status]')?.value ?? 'all';
  const text = row.textContent.toLocaleLowerCase('ru');
  const statusText = row.querySelector('.status-badge')?.textContent.toLocaleLowerCase('ru') ?? '';
  const matchesUniversity = university === 'all' || text.includes('кфу');
  const matchesStatus = status === 'all' || (status === 'new' && statusText.includes('нов')) || (status === 'interview' && statusText.includes('интервью')) || (status === 'review' && statusText.includes('рассмотр'));
  return matchesUniversity && matchesStatus;
}

let currentNotificationFilter = 'all';
function notificationType(card) {
  const meta = card.querySelector('.timeline-card__meta')?.textContent.toLocaleLowerCase('ru') ?? '';
  if (meta.includes('дедлайн')) return 'deadline';
  if (meta.includes('отклика')) return 'application';
  return 'recommendation';
}

function matchesNotificationFilter(card) {
  return currentNotificationFilter === 'all' || notificationType(card) === currentNotificationFilter;
}

function isDismissed(card) {
  const title = card.querySelector('.timeline-card__title')?.textContent.trim();
  return dismissedNotifications.has(title);
}

function updateJobs(job) {
  const specialty = document.querySelector('[data-feed-specialty]')?.value ?? 'all';
  const format = document.querySelector('[data-feed-format]')?.value ?? 'all';
  const matches = (!searchTerm || job.textContent.toLocaleLowerCase('ru').includes(searchTerm)) &&
    (specialty === 'all' || job.dataset.specialty === specialty) &&
    (format === 'all' || job.dataset.format === format);
  setVisible(job, matches);
}

function updateEmptyStates() {
  const feedJobs = [...document.querySelectorAll('[data-job-id]')];
  const companyCards = [...document.querySelectorAll('[data-company-card]')];
  const candidates = [...document.querySelectorAll('.candidate-table tbody tr')];
  const notifications = [...document.querySelectorAll('.timeline-card')];
  const applications = [...document.querySelectorAll('.data-table tbody tr')];
  const visibleCount = elements => elements.filter(element => !element.hidden).length;
  const feedEmpty = document.querySelector('[data-feed-empty]');
  const companiesEmpty = document.querySelector('[data-companies-empty]');
  const candidatesEmpty = document.querySelector('[data-candidates-empty]');
  if (feedEmpty) setVisible(feedEmpty, visibleCount(feedJobs) === 0);
  if (companiesEmpty) setVisible(companiesEmpty, visibleCount(companyCards) === 0);
  if (candidatesEmpty) setVisible(candidatesEmpty, visibleCount(candidates) === 0);
  updateTableEmptyMessage('.data-table', applications, 'Отклики не найдены.');
  updateTableEmptyMessage('.candidate-table', candidates, 'Кандидаты не найдены.');
  updateNotificationEmptyMessage(notifications);
}

function updateTableEmptyMessage(selector, rows, message) {
  const table = document.querySelector(selector);
  if (!table) return;
  let empty = table.parentElement.querySelector('.interaction-empty');
  if (!empty) {
    empty = document.createElement('p');
    empty.className = 'interaction-empty';
    empty.setAttribute('role', 'status');
    table.before(empty);
  }
  empty.textContent = message;
  setVisible(empty, rows.length > 0 && rows.every(row => row.hidden));
}

function updateNotificationEmptyMessage(cards) {
  const main = document.querySelector('.notifications-main');
  if (!main) return;
  let empty = main.querySelector('.interaction-empty');
  if (!empty) {
    empty = document.createElement('p');
    empty.className = 'interaction-empty';
    empty.setAttribute('role', 'status');
    main.append(empty);
  }
  empty.textContent = 'Уведомления не найдены.';
  setVisible(empty, cards.length > 0 && cards.every(card => card.hidden));
  main.querySelectorAll('section').forEach(section => {
    const cardsInSection = [...section.querySelectorAll('.timeline-card')];
    if (cardsInSection.length) setVisible(section, cardsInSection.some(card => !card.hidden));
  });
}

let currentCompanyCategory = 'all';
const companyFilters = [...document.querySelectorAll('[data-company-filter]')];
companyFilters.forEach(button => button.addEventListener('click', () => {
  currentCompanyCategory = button.dataset.companyFilter;
  companyFilters.forEach(filter => {
    const active = filter === button;
    filter.classList.toggle('filter-pill--active', active);
    filter.setAttribute('aria-pressed', String(active));
  });
  updateSearch(searchTerm);
}));

searchInputs.forEach(input => input.addEventListener('input', () => updateSearch(input.value)));
document.querySelector('[data-feed-specialty]')?.addEventListener('change', () => updateSearch(searchTerm));
document.querySelector('[data-feed-format]')?.addEventListener('change', () => updateSearch(searchTerm));
document.querySelectorAll('[data-feed-reset]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('[data-feed-specialty]').value = 'all';
  document.querySelector('[data-feed-format]').value = 'all';
  updateSearch('');
}));
document.querySelector('[data-application-status]')?.addEventListener('change', () => updateSearch(searchTerm));
document.querySelector('[data-hr-university]')?.addEventListener('change', () => updateSearch(searchTerm));
document.querySelector('[data-hr-status]')?.addEventListener('change', () => updateSearch(searchTerm));

document.querySelectorAll('[data-notification-filter]').forEach(button => button.addEventListener('click', () => {
  currentNotificationFilter = button.dataset.notificationFilter;
  document.querySelectorAll('[data-notification-filter]').forEach(filter => {
    const active = filter === button;
    filter.classList.toggle('filter-pill--active', active);
    filter.setAttribute('aria-pressed', String(active));
  });
  updateSearch(searchTerm);
}));

const savedJobs = new Set(storage.read('buddie-saved-jobs', []));
const appliedJobs = new Set(storage.read('buddie-applied-jobs', []));
document.querySelectorAll('[data-job-id]').forEach(job => {
  const id = job.dataset.jobId;
  const save = job.querySelector('[data-job-action="save"]');
  const apply = job.querySelector('[data-job-action="apply"]');
  if (savedJobs.has(id)) setJobButton(save, true, '✓ Сохранено');
  if (appliedJobs.has(id)) setJobButton(apply, true, '✓ Отклик отмечен');
});

document.querySelectorAll('[data-job-action]').forEach(button => button.addEventListener('click', () => {
  const id = button.closest('[data-job-id]').dataset.jobId;
  const isSave = button.dataset.jobAction === 'save';
  const collection = isSave ? savedJobs : appliedJobs;
  const active = !collection.has(id);
  if (active) collection.add(id); else collection.delete(id);
  storage.write(isSave ? 'buddie-saved-jobs' : 'buddie-applied-jobs', [...collection]);
  setJobButton(button, active, isSave ? (active ? '✓ Сохранено' : '☆ Сохранить') : (active ? '✓ Отклик отмечен' : '↗ Откликнуться'));
  announce(isSave ? (active ? 'Стажировка сохранена в этом браузере.' : 'Стажировка удалена из сохранённых.') : (active ? 'Отклик отмечен в этом браузере. Отправка работодателю недоступна в демо.' : 'Отметка об отклике отменена.'));
}));

function setJobButton(button, active, label) {
  button.setAttribute('aria-pressed', String(active));
  button.textContent = label;
  button.classList.toggle('button--soft', active);
}

const settings = storage.read('buddie-notification-settings', {});
document.querySelectorAll('[data-notification-setting]').forEach((button, index) => {
  const label = button.closest('.setting-row').querySelector('span').textContent.trim();
  const key = label || String(index);
  if (typeof settings[key] === 'boolean') setSettingButton(button, settings[key]);
  button.addEventListener('click', () => {
    const active = button.getAttribute('aria-pressed') !== 'true';
    settings[key] = active;
    storage.write('buddie-notification-settings', settings);
    setSettingButton(button, active);
    announce('Настройки уведомлений сохранены в этом браузере.');
  });
});

function setSettingButton(button, active) {
  button.classList.toggle('toggle--on', active);
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? 'Включено' : 'Выключено');
}

const channels = storage.read('buddie-notification-channels', {});
document.querySelectorAll('[data-notification-channel]').forEach((input, index) => {
  const key = input.closest('label').textContent.trim() || String(index);
  if (typeof channels[key] === 'boolean') input.checked = channels[key];
  input.addEventListener('change', () => {
    channels[key] = input.checked;
    storage.write('buddie-notification-channels', channels);
    announce('Каналы уведомлений сохранены в этом браузере.');
  });
});

const dismissedNotifications = new Set(storage.read('buddie-dismissed-notifications', []));
document.querySelectorAll('[data-dismiss-notification]').forEach(button => button.addEventListener('click', () => {
  const card = button.closest('.timeline-card');
  const title = card.querySelector('.timeline-card__title').textContent.trim();
  dismissedNotifications.add(title);
  storage.write('buddie-dismissed-notifications', [...dismissedNotifications]);
  setVisible(card, false);
  updateEmptyStates();
  announce('Напоминание скрыто.');
}));

document.querySelector('[data-mark-all-read]')?.addEventListener('click', event => {
  storage.write('buddie-notifications-read', true);
  event.currentTarget.textContent = '✓ Всё прочитано';
  document.querySelectorAll('.timeline-card').forEach(card => card.classList.add('is-read'));
  announce('Уведомления отмечены прочитанными.');
});
if (storage.read('buddie-notifications-read', false)) {
  document.querySelector('[data-mark-all-read]')?.replaceChildren('✓ Всё прочитано');
  document.querySelectorAll('.timeline-card').forEach(card => card.classList.add('is-read'));
}

updateSearch('');
