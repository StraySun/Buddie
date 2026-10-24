// ==========================================
// 1. Утилиты: storage, toast, debounce
// ==========================================

const storage = {
  read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  readArray(key) {
    const value = this.read(key, []);
    return Array.isArray(value) ? value.filter(entry => typeof entry === 'string') : [];
  },
  readObject(key) {
    const value = this.read(key, {});
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry === 'boolean'));
  },
  readBoolean(key, fallback) {
    const value = this.read(key, fallback);
    return typeof value === 'boolean' ? value : fallback;
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

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function setVisible(element, visible) {
  element.hidden = !visible;
}


// ==========================================
// 2. REST API & Database Integration Layer
// ==========================================
const api = {
  async getDb() {
    try {
      const res = await fetch('/api/db');
      if (res.ok) return await res.json();
    } catch {}
    return null;
  },
  async createJob(jobData) {
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobData)
      });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  },
  async applyJob(jobId, title, company) {
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, title, company })
      });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  },
  async saveJob(jobId) {
    try {
      const res = await fetch('/api/saved-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  },
  async removeSavedJob(jobId) {
    try {
      const res = await fetch('/api/saved-jobs/' + jobId, { method: 'DELETE' });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  },
  async updateState(state) {
    try {
      const res = await fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state)
      });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  },
  async updateApplication(id, data) {
    try {
      const res = await fetch('/api/applications/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }
};


// ==========================================
// 3. Anime.js Micro-Animations
// ==========================================
function playEntranceAnimations() {
  if (typeof anime === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const cards = document.querySelectorAll('.job-card, .company-card, .timeline-card, .candidate-table tbody tr');
  if (cards.length) {
    anime({
      targets: cards,
      translateY: [16, 0],
      opacity: [0, 1],
      delay: anime.stagger(50),
      easing: 'easeOutCubic',
      duration: 500
    });
  }

  document.querySelectorAll('.match-score, .match-badge, .metric__number').forEach(el => {
    const text = el.textContent;
    const matchNum = text.match(/\d+/);
    if (matchNum) {
      const targetVal = parseInt(matchNum[0], 10);
      const isPercent = text.includes('%');
      const obj = { val: 0 };
      anime({
        targets: obj,
        val: targetVal,
        round: 1,
        easing: 'easeOutExpo',
        duration: 900,
        update: () => {
          if (isPercent) {
            el.textContent = text.replace(/\d+%/, obj.val + '%');
          } else if (text.trim() === matchNum[0]) {
            el.textContent = obj.val;
          }
        }
      });
    }
  });
}

function playButtonSpring(element) {
  if (typeof anime === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  anime({
    targets: element.querySelector('svg') || element,
    scale: [1, 1.45, 1],
    rotate: [0, -15, 0],
    duration: 450,
    easing: 'easeOutElastic(1, .5)'
  });
}


// ==========================================
// 4. Иконки и кнопки вакансий
// ==========================================
const ICONS = {
  starOutline: '<svg class="button__icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  starFilled: '<svg class="button__icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" fill="currentColor"/></svg>',
  check: '<svg class="button__icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg>',
  arrowUpRight: '<svg class="button__icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M7 17L17 7M17 7H7M17 7V17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

function setJobButton(button, active, label, isSave) {
  if (!button) return;
  button.setAttribute('aria-pressed', String(active));
  button.classList.toggle('button--soft', active);

  let iconSvg = '';
  if (typeof isSave === 'boolean') {
    iconSvg = isSave ? (active ? ICONS.starFilled : ICONS.starOutline) : (active ? ICONS.check : ICONS.arrowUpRight);
  } else {
    const isSaveAction = button.dataset.jobAction === 'save';
    iconSvg = isSaveAction ? (active ? ICONS.starFilled : ICONS.starOutline) : (active ? ICONS.check : ICONS.arrowUpRight);
  }

  button.innerHTML = iconSvg + '<span>' + (label || '') + '</span>';
}


// ==========================================
// 5. Поиск и фильтры
// ==========================================
const searchInputs = [...document.querySelectorAll('[data-search-input]')];
let searchTerm = '';
let currentCompanyCategory = 'all';
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

const dismissedNotifications = new Set(storage.readArray('buddie-dismissed-notifications'));

function isDismissed(card) {
  const title = card.querySelector('.timeline-card__title')?.textContent.trim();
  return dismissedNotifications.has(title);
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
  const rowUni = row.dataset.university || (text.includes('кфу') ? 'kfu' : (text.includes('итмо') ? 'itmo' : (text.includes('вшэ') ? 'hse' : '')));
  const matchesUniversity = university === 'all' || rowUni === university || (university === 'kfu' && text.includes('кфу'));
  const rowStatus = row.dataset.status || '';
  const matchesStatus = status === 'all' ||
    (status === 'new' && (rowStatus === 'new' || statusText.includes('нов'))) ||
    (status === 'interview' && (rowStatus === 'interview' || statusText.includes('интервью'))) ||
    (status === 'review' && (rowStatus === 'review' || statusText.includes('рассмотр')));
  return matchesUniversity && matchesStatus;
}

function updateJobs(job) {
  const specialty = document.querySelector('[data-feed-specialty]')?.value ?? 'all';
  const format = document.querySelector('[data-feed-format]')?.value ?? 'all';
  const matches = (!searchTerm || job.textContent.toLocaleLowerCase('ru').includes(searchTerm)) &&
    (specialty === 'all' || job.dataset.specialty === specialty) &&
    (format === 'all' || job.dataset.format === format);
  setVisible(job, matches);
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

function updateSearch(value) {
  searchTerm = value.trim().toLocaleLowerCase('ru');
  searchInputs.forEach(input => {
    if (input.value !== value) input.value = value;
  });
  const visibleText = element => !searchTerm || element.textContent.toLocaleLowerCase('ru').includes(searchTerm);

  document.querySelectorAll('[data-job-id]').forEach(job => updateJobs(job));

  const resetFilter = document.querySelector('[data-feed-reset]');
  if (resetFilter) {
    const isDefault = !searchTerm &&
      (document.querySelector('[data-feed-specialty]')?.value ?? 'all') === 'all' &&
      (document.querySelector('[data-feed-format]')?.value ?? 'all') === 'all';
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


// ==========================================
// 6. Подписка на события фильтров
// ==========================================
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

const debouncedSearch = debounce(val => updateSearch(val), 150);
searchInputs.forEach(input => input.addEventListener('input', () => debouncedSearch(input.value)));

document.querySelector('[data-feed-specialty]')?.addEventListener('change', () => updateSearch(searchTerm));
document.querySelector('[data-feed-format]')?.addEventListener('change', () => updateSearch(searchTerm));

document.querySelectorAll('[data-feed-reset]').forEach(button => button.addEventListener('click', () => {
  const specialty = document.querySelector('[data-feed-specialty]');
  const format = document.querySelector('[data-feed-format]');
  if (specialty) specialty.value = 'all';
  if (format) format.value = 'all';
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


// ==========================================
// 7. Кнопки вакансий (сохранить / откликнуться)
// ==========================================
const savedJobs = new Set(storage.readArray('buddie-saved-jobs'));
const appliedJobs = new Set(storage.readArray('buddie-applied-jobs'));

document.querySelectorAll('[data-job-id]').forEach(job => {
  const id = job.dataset.jobId;
  const save = job.querySelector('[data-job-action="save"]');
  const apply = job.querySelector('[data-job-action="apply"]');
  if (savedJobs.has(id)) setJobButton(save, true, 'Сохранено', true);
  if (appliedJobs.has(id)) setJobButton(apply, true, 'Отклик отмечен', false);
});

document.querySelectorAll('[data-job-action]').forEach(button => button.addEventListener('click', async () => {
  const card = button.closest('[data-job-id]');
  const id = card.dataset.jobId;
  const isSave = button.dataset.jobAction === 'save';
  const collection = isSave ? savedJobs : appliedJobs;
  const active = !collection.has(id);

  if (active) collection.add(id); else collection.delete(id);
  storage.write(isSave ? 'buddie-saved-jobs' : 'buddie-applied-jobs', [...collection]);

  playButtonSpring(button);

  if (isSave) {
    if (active) await api.saveJob(id); else await api.removeSavedJob(id);
  } else {
    if (active) {
      const title = card.querySelector('.job-card__title')?.textContent.trim() || 'Стажёр';
      const company = card.querySelector('.company-name')?.textContent.trim() || 'Компания';
      await api.applyJob(id, title, company);
    }
  }

  setJobButton(button, active,
    isSave ? (active ? 'Сохранено' : 'Сохранить') : (active ? 'Отклик отмечен' : 'Откликнуться'),
    isSave
  );
  announce(isSave
    ? (active ? 'Стажировка сохранена в этом браузере.' : 'Стажировка удалена из сохранённых.')
    : (active ? 'Отклик отмечен в этом браузере. Отправка работодателю недоступна в демо.' : 'Отметка об отклике отменена.')
  );
}));


// ==========================================
// 8. Уведомления: dismiss, mark-all-read
// ==========================================
document.querySelectorAll('[data-dismiss-notification]').forEach(button => {
  button.addEventListener('click', () => {
    const card = button.closest('.timeline-card');
    if (!card) return;
    const title = card.querySelector('.timeline-card__title')?.textContent.trim();
    if (title) {
      dismissedNotifications.add(title);
      storage.write('buddie-dismissed-notifications', [...dismissedNotifications]);
    }
    updateSearch(searchTerm);
    announce('Уведомление скрыто.');
  });
});

document.querySelector('[data-mark-all-read]')?.addEventListener('click', event => {
  storage.write('buddie-notifications-read', true);
  event.currentTarget.textContent = '✓ Всё прочитано';
  document.querySelectorAll('.timeline-card').forEach(card => card.classList.add('is-read'));
  announce('Уведомления отмечены прочитанными.');
});

if (storage.readBoolean('buddie-notifications-read', false)) {
  document.querySelector('[data-mark-all-read]')?.replaceChildren('✓ Всё прочитано');
  document.querySelectorAll('.timeline-card').forEach(card => card.classList.add('is-read'));
}


// ==========================================
// 9. Настройки и каналы уведомлений
// ==========================================
function setSettingButton(button, active) {
  button.classList.toggle('toggle--on', active);
  button.setAttribute('aria-pressed', String(active));
}

const settings = storage.readObject('buddie-notification-settings');
document.querySelectorAll('[data-notification-setting]').forEach((button, index) => {
  const label = button.closest('.setting-row')?.querySelector('span')?.textContent.trim();
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

const channels = storage.readObject('buddie-notification-channels');
document.querySelectorAll('[data-notification-channel]').forEach((input, index) => {
  const key = input.closest('label')?.textContent.trim() || String(index);
  if (typeof channels[key] === 'boolean') input.checked = channels[key];
  input.addEventListener('change', () => {
    channels[key] = input.checked;
    storage.write('buddie-notification-channels', channels);
    announce('Каналы уведомлений сохранены в этом браузере.');
  });
});


// ==========================================
// 10. Синхронизация выбранного университета
// ==========================================
const savedUniversity = storage.read('buddie-selected-university', 'kfu');
document.querySelectorAll('.header__select select').forEach(select => {
  if (savedUniversity) select.value = savedUniversity;
  select.addEventListener('change', () => {
    storage.write('buddie-selected-university', select.value);
    document.querySelectorAll('.header__select select').forEach(s => {
      if (s !== select) s.value = select.value;
    });
  });
});


// ==========================================
// 11. Модальные окна
// ==========================================
function openModal(title, contentHtml, onConfirm, confirmText = 'Подтвердить') {
  let modal = document.querySelector('.modal-backdrop');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal-dialog" role="dialog" aria-modal="true">
        <div class="modal-header">
          <h3 class="modal-title"></h3>
          <button class="modal-close" aria-label="Закрыть">&times;</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-footer">
          <button class="button button--outline button--small modal-cancel-btn">Отмена</button>
          <button class="button button--small modal-confirm-btn"></button>
        </div>
      </div>
    `;
    document.body.append(modal);

    modal.querySelector('.modal-close').addEventListener('click', () => closeModal());
    modal.querySelector('.modal-cancel-btn').addEventListener('click', () => closeModal());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  modal.querySelector('.modal-title').textContent = title;
  modal.querySelector('.modal-body').innerHTML = contentHtml;
  const confirmBtn = modal.querySelector('.modal-confirm-btn');
  confirmBtn.textContent = confirmText;

  const newConfirmBtn = confirmBtn.cloneNode(true);
  confirmBtn.replaceWith(newConfirmBtn);

  newConfirmBtn.addEventListener('click', () => {
    if (onConfirm) onConfirm(modal);
    closeModal();
  });

  modal.classList.add('is-open');
}

function closeModal() {
  const modal = document.querySelector('.modal-backdrop');
  if (modal) modal.classList.remove('is-open');
}

// Кнопки кандидатов в hr.html
document.querySelectorAll('.candidate-table tr').forEach(row => {
  const openBtn = row.querySelector('.button');
  if (!openBtn) return;
  const name = row.querySelector('strong')?.textContent.trim() || 'Кандидат';
  const role = row.querySelector('.candidate small')?.textContent.trim() || '';
  const score = row.querySelector('.match-score')?.textContent.trim() || '';
  const skills = [...row.querySelectorAll('.hr-skills span')].map(s => s.textContent).join(', ');

  openBtn.addEventListener('click', () => {
    openModal(
      `Профиль кандидата: ${name}`,
      `<p><strong>Специализация:</strong> ${role}</p>
        <p><strong>AI Match Score:</strong> ${score}</p>
        <p><strong>Ключевые навыки:</strong> ${skills}</p>
        <div class="form-group" style="margin-top:16px;">
          <label>Сообщение или приглашение на интервью:</label>
          <textarea placeholder="Добрый день! Приглашаем вас пройти техническое интервью..."></textarea>
        </div>`,
      () => {
        announce(`Приглашение успешно отправлено кандидату ${name}!`);
      },
      'Пригласить на интервью'
    );
  });
});

// Кнопка «+ Разместить стажировку» в hr.html
const postJobBtn = document.querySelector('a[href="#post"]');
if (postJobBtn) {
  postJobBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(
      'Размещение новой стажировки',
      `<div class="form-group">
          <label>Название вакансии / роли:</label>
          <input type="text" id="new-job-title" placeholder="например, ML Intern или Frontend Developer" required style="padding:8px 12px; border:1px solid var(--border-color); border-radius:var(--radius-md);">
        </div>
        <div class="form-group">
          <label>Формат работы:</label>
          <select id="new-job-format">
            <option value="hybrid">Гибридный (Hybrid)</option>
            <option value="remote">Удалённый (Remote)</option>
            <option value="office">Офис (Казань)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Зарплатная вилка / стипендия:</label>
          <input type="text" id="new-job-salary" placeholder="например, 80 000–120 000 ₽" style="padding:8px 12px; border:1px solid var(--border-color); border-radius:var(--radius-md);">
        </div>`,
      (modal) => {
        const title = modal.querySelector('#new-job-title').value.trim() || 'Новая стажировка';
        const format = modal.querySelector('#new-job-format').value || 'hybrid';
        const salary = modal.querySelector('#new-job-salary').value.trim() || '100 000–140 000 ₽';

        api.createJob({
          title,
          format,
          salary,
          company: 'ООО Партнёр КФУ',
          description: 'Новая стажировка, созданная HR-специалистом для студентов университета.',
          targetUniversity: 'kfu'
        }).then(() => {
          announce(`Стажировка «${title}» успешно размещена в базе данных!`);
        });
      },
      'Опубликовать стажировку'
    );
  });
}

// Кнопки в профиле студента (profile.html)
document.querySelectorAll('.button').forEach(btn => {
  if (btn.textContent.includes('Скачать резюме')) {
    btn.addEventListener('click', () => {
      announce('Формирование PDF резюме…');
      setTimeout(() => window.print(), 300);
    });
  }
  if (btn.textContent.includes('Редактировать профиль')) {
    btn.addEventListener('click', () => {
      openModal(
        'Редактирование профиля студента',
        `<div class="form-group">
            <label>Специальность / Целевая роль:</label>
            <input type="text" value="Frontend-разработчик" style="padding:8px 12px; border:1px solid var(--border-color); border-radius:var(--radius-md);">
          </div>
          <div class="form-group">
            <label>Стек технологий (через запятую):</label>
            <input type="text" value="React, TypeScript, CSS, Playwright" style="padding:8px 12px; border:1px solid var(--border-color); border-radius:var(--radius-md);">
          </div>`,
        () => announce('Изменения профиля успешно сохранены!'),
        'Сохранить изменения'
      );
    });
  }
});

document.querySelectorAll('.data-table tr').forEach(row => {
  const btn = row.querySelector('.button');
  if (btn && btn.textContent.trim() === 'Принять') {
    btn.addEventListener('click', () => {
      btn.textContent = '✓ Принято';
      btn.classList.add('button--soft');
      btn.disabled = true;
      const statusBadge = row.querySelector('.status-badge');
      if (statusBadge) {
        statusBadge.textContent = 'Оффер принят';
        statusBadge.className = 'status-badge status-badge--success';
      }
      announce('Поздравляем! Вы приняли оффер компании!');
    });
  }
  if (btn && btn.textContent.includes('Чат с HR')) {
    btn.addEventListener('click', () => {
      const company = row.querySelector('strong')?.textContent.trim() || 'HR';
      openModal(
        `Чат с рекрутером ${company}`,
        `<p>Задайте интересующие вопросы рекрутеру или согласуйте дату старта.</p>
          <div class="form-group">
            <textarea placeholder="Здравствуйте! Уточните, пожалуйста, необходимые документы..."></textarea>
          </div>`,
        () => announce('Сообщение отправлено рекрутеру!'),
        'Отправить'
      );
    });
  }
  if (btn && btn.textContent.includes('Выбрать время')) {
    btn.addEventListener('click', () => {
      openModal(
        'Выбор слота интервью',
        `<p>Выберите удобное время для онлайн-встречи с командой:</p>
          <div class="form-group">
            <select id="interview-time-slot">
              <option>Завтра, 14:00 (МСК)</option>
              <option>Завтра, 16:30 (МСК)</option>
              <option>Пятница, 11:00 (МСК)</option>
            </select>
          </div>`,
        (modal) => {
          const slot = modal.querySelector('#interview-time-slot').value;
          btn.textContent = '✓ ' + slot.split(',')[0];
          btn.classList.add('button--soft');
          announce(`Интервью успешно назначено: ${slot}!`);
        },
        'Подтвердить встречу'
      );
    });
  }
});


// ==========================================
// 12. Табы в профиле студента
// ==========================================
function initProfileTabs() {
  const tabBtns = document.querySelectorAll('.profile-tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  if (!tabBtns.length) return;

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.toggle('is-active', b === btn));
      tabPanes.forEach(pane => {
        const match = pane.id === 'pane-' + target;
        pane.style.display = match ? 'block' : 'none';
        if (match && typeof anime !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          anime({
            targets: pane,
            opacity: [0, 1],
            translateY: [10, 0],
            duration: 300,
            easing: 'easeOutCubic'
          });
        }
      });
    });
  });

  renderSavedJobsInProfile();
}

async function renderSavedJobsInProfile() {
  const container = document.querySelector('.saved-jobs-container');
  const emptyMsg = document.querySelector('.saved-empty');
  const countBadge = document.querySelector('[data-saved-count]');
  const badgeRating = document.querySelector('[data-saved-badge]');
  if (!container) return;

  const db = await api.getDb();
  const savedIds = (db && db.savedJobs) || [...savedJobs];

  if (countBadge) countBadge.textContent = savedIds.length;
  if (badgeRating) badgeRating.textContent = savedIds.length + ' вакансий';

  if (!savedIds.length) {
    container.innerHTML = '';
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';

  const allJobs = (db && db.jobs) || [];
  const savedItems = allJobs.filter(j => savedIds.includes(j.id));

  container.innerHTML = savedItems.map(j => `
    <article class="card job-card" data-job-id="${j.id}" style="margin:0;">
      <div class="job-card__top">
        <div class="job-card__company">
          <div class="company-logo ${j.companyLogoClass || 'company-logo--yandex'}">${j.companyLetter || 'Я'}</div>
          <div>
            <div class="company-name">${j.company}</div>
            <div class="company-rating">${j.rating || ''}</div>
          </div>
        </div>
        <span class="match-badge">${j.matchScore || '90%'}</span>
      </div>
      <div class="job-card__title-row">
        <h3 class="job-card__title">${j.title}</h3>
        <div class="job-card__salary">${j.salary || ''}</div>
      </div>
      <p class="job-card__description">${j.description || ''}</p>
      <div class="job-card__footer">
        <span class="job-card__response">${j.responseBadge || '● Быстрый отклик'}</span>
        <div class="job-card__actions">
          <button class="button button--small" type="button" data-job-action="apply" aria-pressed="false">
            ↗ Откликнуться
          </button>
        </div>
      </div>
    </article>
  `).join('');
}

// ==========================================
// 13. Инициализация
// ==========================================
updateSearch('');
playEntranceAnimations();
initProfileTabs();
