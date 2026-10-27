// ==========================================
// 1. Утилиты: storage, toast, debounce
// ==========================================

const storage = {
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  readArray(key) {
    try {
      const value = this.read(key, []);
      if (!Array.isArray(value)) return [];
      return value.filter(entry => typeof entry === 'string' && entry.length > 0);
    } catch {
      return [];
    }
  },
  readObject(key) {
    try {
      const value = this.read(key, {});
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
      return Object.fromEntries(
        Object.entries(value).filter(([, entry]) => typeof entry === 'boolean')
      );
    } catch {
      return {};
    }
  },
  readBoolean(key, fallback) {
    try {
      const value = this.read(key, fallback);
      return typeof value === 'boolean' ? value : fallback;
    } catch {
      return fallback;
    }
  },
  readString(key, fallback = '') {
    try {
      const value = this.read(key, fallback);
      return typeof value === 'string' ? value : fallback;
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

const savedJobs = new Set(storage.readArray('buddie-saved-jobs'));
const appliedJobs = new Set(storage.readArray('buddie-applied-jobs'));

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
const showToast = announce;

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
const DEFAULT_JOBS = [
  {
    id: "yandex-analyst",
    company: "Yandex",
    companyLogoClass: "company-logo--yandex",
    companyLetter: "Я",
    rating: "⭐ 4.7 · Отзывы студентов",
    matchScore: "✧ 96% совпадение",
    title: "Стажёр-аналитик данных",
    salary: "150 000–200 000 ₽",
    specialty: "analysis",
    format: "hybrid",
    tags: [
      "Стажировка",
      "Hybrid",
      "Python",
      "SQL"
    ],
    description: "Анализируй продуктовые данные пользователей и создавай визуализации для продуктовых команд.",
    location: "⌖ Москва",
    workload: "▣ 3 дня/неделю",
    postedTime: "◷ Сегодня",
    responseBadge: "● Быстрый отклик",
    targetUniversity: "kfu"
  },
  {
    id: "sber-java",
    company: "Sber",
    companyLogoClass: "company-logo--sber",
    companyLetter: "С",
    rating: "⭐ 4.6 · Отзывы студентов",
    matchScore: "✧ 91% совпадение",
    title: "Младший Java-разработчик",
    salary: "220–280 ₽/час",
    specialty: "development",
    format: "remote",
    tags: [
      "Full-time",
      "Удалёнка",
      "Java",
      "Spring Boot"
    ],
    description: "Разрабатывай высоконагруженные банковские сервисы вместе с опытной командой.",
    location: "⌖ Москва / Удалённо",
    workload: "▣ Удалённо",
    postedTime: "◷ Вчера",
    responseBadge: "● Быстрый отклик",
    targetUniversity: "kfu"
  },
  {
    id: "tbank-data",
    company: "Т-Банк",
    companyLogoClass: "company-logo--tbank",
    companyLetter: "Т",
    rating: "⭐ 4.8 · Отзывы студентов",
    matchScore: "✧ 88% совпадение",
    title: "Стажёр по анализу данных",
    salary: "80 000–120 000 ₽",
    specialty: "analysis",
    format: "hybrid",
    tags: [
      "Стажировка",
      "Hybrid",
      "ML",
      "SQL"
    ],
    description: "Развивай свои навыки анализа данных и работай с продуктовыми задачами Т-Банка.",
    location: "⌖ Москва",
    workload: "▣ 2 дня/неделю",
    postedTime: "◷ 2 часа назад",
    responseBadge: "● Дедлайн через 3 дня",
    responseBadgeClass: "job-card__response--warning",
    targetUniversity: "all"
  }
];

const ApiService = {
  async getDb() {
    try {
      const res = await fetch('/api/db');
      if (res.ok) {
        const data = await res.json();
        storage.write('buddie-db-cache', data);
        return data;
      }
    } catch (e) {
      console.warn('Network unavailable for db, using local fallback:', e);
    }
    return storage.read('buddie-db-cache', null);
  },

  async getJobs() {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const jobs = await res.json();
        if (Array.isArray(jobs) && jobs.length > 0) {
          storage.write('buddie-jobs-cache', jobs);
          return jobs;
        }
      }
    } catch (e) {
      console.warn('Network unavailable for jobs, using local fallback:', e);
    }
    const cached = storage.read('buddie-jobs-cache', null);
    if (Array.isArray(cached) && cached.length > 0) return cached;
    return DEFAULT_JOBS;
  },

  async createJob(jobData) {
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobData)
      });
      if (res.ok) {
        const created = await res.json();
        const cached = storage.read('buddie-jobs-cache', DEFAULT_JOBS);
        storage.write('buddie-jobs-cache', [created, ...cached]);
        return created;
      }
    } catch {}
    return null;
  },

  async applyJob(jobId, title, company, location) {
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, title, company, location })
      });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  },

  async removeApplication(id) {
    try {
      const res = await fetch('/api/applications/' + id, { method: 'DELETE' });
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

  async getApplications() {
    try {
      const res = await fetch('/api/applications');
      if (res.ok) return await res.json();
    } catch {}
    return [];
  },

  async getCandidates() {
    try {
      const res = await fetch('/api/candidates');
      if (res.ok) return await res.json();
    } catch {}
    return [];
  },

  async updateCandidate(id, data) {
    try {
      const res = await fetch('/api/candidates/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
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

const api = ApiService;


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
  starOutline: '<svg class="button__icon" aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-bookmark"></use></svg>',
  starFilled: '<svg class="button__icon" aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-saved"></use></svg>',
  check: '<svg class="button__icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg>',
  arrowUpRight: '<svg class="button__icon" aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-send"></use></svg>'
};

function setJobButton(button, active, label, isSave) {
  if (!button) return;
  button.setAttribute('aria-pressed', String(active));
  button.classList.toggle('button--soft', active);

  const isSaveAction = typeof isSave === 'boolean' ? isSave : button.dataset.jobAction === 'save';
  const iconSvg = isSaveAction ? (active ? ICONS.starFilled : ICONS.starOutline) : (active ? ICONS.check : ICONS.arrowUpRight);

  button.setAttribute('title', active
    ? (isSaveAction ? 'Удалить из сохранённых' : 'Отменить отклик')
    : (isSaveAction ? 'Сохранить вакансию' : 'Откликнуться на вакансию')
  );
  button.setAttribute('aria-label', active
    ? (isSaveAction ? 'Удалить вакансию из сохранённых' : 'Отменить отклик на вакансию')
    : (isSaveAction ? 'Сохранить вакансию' : 'Откликнуться на вакансию')
  );

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

let currentPartnerFilter = 'all';

function matchesPartner(job) {
  if (currentPartnerFilter === 'all') return true;
  const companyEl = job.querySelector('.company-name');
  const compText = (companyEl ? companyEl.textContent : job.textContent).toLocaleLowerCase('ru');
  const filter = currentPartnerFilter.toLowerCase();

  if (filter === 'yandex') return compText.includes('yandex') || compText.includes('яндекс');
  if (filter === 'sber') return compText.includes('sber') || compText.includes('сбер');
  if (filter === 'vk') return compText.includes('vk') || compText.includes('вк');
  if (filter === 'ozon') return compText.includes('ozon') || compText.includes('озон');
  if (filter === 'tbank') return compText.includes('т-банк') || compText.includes('t-bank') || compText.includes('tbank') || compText.includes('тинькофф') || compText.includes('tinkoff');

  return compText.includes(filter);
}

function updateJobs(job) {
  const specialty = document.querySelector('[data-feed-specialty]')?.value ?? 'all';
  const format = document.querySelector('[data-feed-format]')?.value ?? 'all';
  const matches = (!searchTerm || job.textContent.toLocaleLowerCase('ru').includes(searchTerm)) &&
    (specialty === 'all' || job.dataset.specialty === specialty) &&
    (format === 'all' || job.dataset.format === format) &&
    matchesPartner(job);
  setVisible(job, matches);
}

function updateTableEmptyMessage(selector, rows, message) {
  const table = document.querySelector(selector);
  if (!table) return;
  let empty = table.parentElement.querySelector('.interaction-empty');
  if (!empty) {
    empty = document.createElement('div');
    empty.className = 'interaction-empty';
    empty.setAttribute('role', 'status');
    table.before(empty);
  }
  const isCandidate = selector.includes('candidate');
  const icon = isCandidate ? '#icon-user' : '#icon-application';
  const resetAttr = isCandidate ? 'data-candidate-reset' : 'data-profile-reset';
  const subtitle = isCandidate ? 'Попробуйте изменить параметры вуза или статуса' : 'Попробуйте изменить статус отклика или текст поиска';

  empty.innerHTML = `
    <div class="empty-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><use href="${icon}"></use></svg></div>
    <h3>${message}</h3>
    <p>${subtitle}</p>
    <button class="button button--small empty-cta" type="button" ${resetAttr}>Сбросить фильтры</button>
  `;
  const resetBtn = empty.querySelector(`[${resetAttr}]`);
  if (resetBtn) {
    resetBtn.onclick = () => {
      const searchInput = document.querySelector('.header__search input') || document.querySelector('.profile-controls input') || document.querySelector('.hr-candidate-search');
      if (searchInput) {
        searchInput.value = '';
        searchTerm = '';
      }
      if (isCandidate) {
        const uni = document.querySelector('[data-hr-university]');
        const status = document.querySelector('[data-hr-status]');
        if (uni) uni.value = 'all';
        if (status) status.value = 'all';
      } else {
        const status = document.querySelector('[data-application-status]');
        if (status) status.value = 'all';
      }
      updateSearch('');
    };
  }
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
  const subtext = document.querySelector('[data-feed-section-subtext]');
  if (subtext) {
    const visibleJobs = document.querySelectorAll('.feed-jobs .job-card:not([hidden])').length;
    const totalJobs = document.querySelectorAll('.feed-jobs .job-card').length || 3;
    subtext.textContent = `Показаны ${visibleJobs} из ${totalJobs} персональных подборок · Buddie`;
  }

  const resetFilter = document.querySelector('[data-feed-reset]');
  if (resetFilter) {
    const isDefault = !searchTerm &&
      currentPartnerFilter === 'all' &&
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


// Phase 3: Header University selector and Empty State Resets
document.querySelectorAll('.header__select select').forEach(sel => {
  sel.addEventListener('change', (e) => {
    const val = e.target.value;
    storage.write('buddie-university', val);
    document.querySelectorAll('.header__select select').forEach(s => {
      if (s !== e.target) s.value = val;
    });
    updateTargetUniversityBadges(val);
    const uniName = e.target.selectedOptions[0]?.textContent || val;
    showToast('Выбран целевой вуз: ' + uniName);
    announce('Выбран целевой университет: ' + uniName);
  });
});

document.querySelectorAll('[data-companies-reset]').forEach(button => button.addEventListener('click', () => {
  const searchInput = document.querySelector('.header__search input');
  if (searchInput) {
    searchInput.value = '';
    searchTerm = '';
  }
  const allCategoryBtn = document.querySelector('[data-company-category="all"]');
  if (allCategoryBtn) allCategoryBtn.click();
  else updateSearch('');
}));

document.querySelectorAll('[data-feed-reset]').forEach(button => button.addEventListener('click', () => {
  const specialty = document.querySelector('[data-feed-specialty]');
  const format = document.querySelector('[data-feed-format]');
  if (specialty) specialty.value = 'all';
  if (format) format.value = 'all';
  currentPartnerFilter = 'all';
  document.querySelectorAll('.partners__item').forEach(item => {
    item.classList.remove('partners__item--active');
    item.setAttribute('aria-pressed', 'false');
  });
  updateSearch('');
}));

function setPartnerFilter(partnerKey) {
  if (currentPartnerFilter === partnerKey) {
    currentPartnerFilter = 'all';
  } else {
    currentPartnerFilter = partnerKey;
  }
  document.querySelectorAll('.partners__item').forEach(item => {
    const isActive = item.dataset.partnerFilter === currentPartnerFilter;
    item.classList.toggle('partners__item--active', isActive);
    item.setAttribute('aria-pressed', String(isActive));
  });
  updateSearch(searchTerm);
  const activeLabel = currentPartnerFilter === 'all' ? 'все компании' : currentPartnerFilter;
  announce(`Фильтр по компаниям: ${activeLabel}`);
}

document.querySelectorAll('.partners__item').forEach(item => {
  const filterKey = item.dataset.partnerFilter;
  if (!filterKey) return;
  item.addEventListener('click', () => {
    setPartnerFilter(filterKey);
  });
  item.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setPartnerFilter(filterKey);
    }
  });
});

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

// ==========================================

// ==========================================
// Phase 3: Target University & Dynamic Counters
// ==========================================
const UNIVERSITY_PARTNERS = {
  kfu: ['yandex-analyst', 'sber-java'],
  itmo: ['yandex-analyst', 'tbank-data'],
  hse: ['sber-java', 'tbank-data']
};

function isJobTargetForUniversity(jobOrCard, uni) {
  if (!uni || uni === 'all') return false;
  const rawId = typeof jobOrCard === 'string' ? jobOrCard : (jobOrCard.dataset?.jobId || jobOrCard.id || '');
  const id = rawId.replace(/^job-/, '');
  const target = jobOrCard.targetUniversity || jobOrCard.dataset?.targetUniversity;
  if (target && (target === uni || target === 'all')) return true;
  const list = UNIVERSITY_PARTNERS[uni] || [];
  return list.includes(id) || list.includes(rawId);
}

function updateTargetUniversityBadges(uni) {
  const activeUni = uni || storage.read('buddie-university', 'kfu');
  document.querySelectorAll('.feed-jobs .job-card').forEach(card => {
    const isTarget = isJobTargetForUniversity(card, activeUni);
    let badges = card.querySelector('.job-card__badges');
    if (!badges) {
      const matchBadge = card.querySelector('.match-badge');
      if (matchBadge) {
        badges = document.createElement('div');
        badges.className = 'job-card__badges';
        matchBadge.before(badges);
        badges.appendChild(matchBadge);
      }
    }
    let targetBadge = card.querySelector('.badge--target-uni');
    if (isTarget) {
      if (!targetBadge && badges) {
        targetBadge = document.createElement('span');
        targetBadge.className = 'badge badge--target-uni';
        targetBadge.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-graduation-cap"></use></svg> Целевой ВУЗ';
        badges.prepend(targetBadge);
      }
    } else {
      if (targetBadge) targetBadge.remove();
    }
  });
}

function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return `${n} ${many}`;
  if (mod10 === 1) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

function updateFeedCounters(count) {
  const total = count || document.querySelectorAll('.feed-jobs .job-card').length || 3;
  const bannerTitle = document.querySelector('[data-feed-banner-title]');
  if (bannerTitle) {
    bannerTitle.textContent = `Buddie подобрал ${pluralize(total, 'стажировку', 'стажировки', 'стажировок')} специально для тебя`;
  }
  const sectionSubtext = document.querySelector('[data-feed-section-subtext]');
  if (sectionSubtext) {
    const visibleCount = document.querySelectorAll('.feed-jobs .job-card:not([hidden])').length;
    sectionSubtext.textContent = `Показаны ${visibleCount} из ${total} персональных подборок · Buddie`;
  }
  const noticeStrong = document.querySelector('[data-feed-notice-count] strong');
  if (noticeStrong) {
    noticeStrong.textContent = pluralize(total, 'новая вакансия', 'новые вакансии', 'новых вакансий');
  }
}

function updateLiveDates() {
  try {
    const formatter = new Intl.DateTimeFormat('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
    const now = new Date();
    const formatted = formatter.format(now);
    const displayDate = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    document.querySelectorAll('[data-live-date]').forEach(el => {
      el.textContent = displayDate;
    });
  } catch (e) {
    console.warn('Live date format error:', e);
  }
}

// Phase 1: Data Layer & Dynamic Rendering Helpers
// ==========================================
function createJobCardHtml(j) {
  const isSaveActive = savedJobs.has(j.id);
  const isApplyActive = appliedJobs.has(j.id);
  const saveIcon = isSaveActive ? ICONS.starFilled : ICONS.starOutline;
  const applyIcon = isApplyActive ? ICONS.check : ICONS.arrowUpRight;
  const saveLabel = isSaveActive ? 'Сохранено' : 'Сохранить';
  const applyLabel = isApplyActive ? 'Отклик отмечен' : 'Откликнуться';
  const saveClass = isSaveActive ? 'button button--outline button--small button--soft' : 'button button--outline button--small';
  const applyClass = isApplyActive ? 'button button--small button--soft' : 'button button--small';
  const tagsHtml = (j.tags || ['Стажировка', j.format === 'remote' ? 'Remote' : 'Hybrid']).map(t => '<span class="chip">' + t + '</span>').join('');
  const respClass = j.responseBadgeClass ? ' ' + j.responseBadgeClass : (j.responseBadge && j.responseBadge.includes('Дедлайн') ? ' job-card__response--warning' : '');

  return '<article class="card job-card" data-job-id="' + j.id + '" data-specialty="' + (j.specialty || 'development') + '" data-format="' + (j.format || 'hybrid') + '">' +
    '<div class="job-card__top">' +
      '<div class="job-card__company">' +
        '<div class="company-logo ' + (j.companyLogoClass || 'company-logo--yandex') + '">' + (j.companyLetter || 'Я') + '</div>' +
        '<div>' +
          '<div class="company-name">' + (j.company || 'Компания') + '</div>' +
          '<div class="company-rating">' + (j.rating || '⭐ 5.0 · Новая аккредитация') + '</div>' +
        '</div>' +
      '</div>' +
      '<span class="match-badge">' + (j.matchScore || '✧ 95% совпадение') + '</span>' +
    '</div>' +
    '<div class="job-card__title-row">' +
      '<h3 class="job-card__title" role="button" tabindex="0" title="Подробнее о вакансии ' + j.title + '">' + j.title + '</h3>' +
      '<div class="job-card__salary">' + (j.salary || '') + '</div>' +
    '</div>' +
    '<div class="job-card__tags">' + tagsHtml + '</div>' +
    '<p class="job-card__description">' + (j.description || '') + '</p>' +
    '<div class="job-card__meta">' +
      '<span>' + (j.location || '⌖ Москва') + '</span>' +
      '<span>' + (j.workload || '▣ 3 дня/неделю') + '</span>' +
      '<span>' + (j.postedTime || '◷ Сегодня') + '</span>' +
    '</div>' +
    '<div class="job-card__footer">' +
      '<span class="job-card__response' + respClass + '">' + (j.responseBadge || '● Быстрый отклик') + '</span>' +
      '<div class="job-card__actions">' +
        '<button class="' + saveClass + '" type="button" data-job-action="save" aria-pressed="' + isSaveActive + '" aria-label="Сохранить вакансию">' +
          saveIcon + '<span>' + saveLabel + '</span>' +
        '</button>' +
        '<button class="' + applyClass + '" type="button" data-job-action="apply" aria-pressed="' + isApplyActive + '" aria-label="Откликнуться на вакансию">' +
          applyIcon + '<span>' + applyLabel + '</span>' +
        '</button>' +
      '</div>' +
    '</div>' +
  '</article>';
}

function bindJobCard(card) {
  const id = card.dataset.jobId;
  if (!id) return;
  const save = card.querySelector('[data-job-action="save"]');
  const apply = card.querySelector('[data-job-action="apply"]');
  if (savedJobs.has(id)) setJobButton(save, true, 'Сохранено', true);
  if (appliedJobs.has(id)) setJobButton(apply, true, 'Отклик отмечен', false);

  const title = card.querySelector('.job-card__title')?.textContent.trim() || 'Стажировка';
  const company = card.querySelector('.company-name')?.textContent.trim() || 'Компания';
  const location = card.querySelector('.job-card__meta span')?.textContent.trim() || 'Москва · Hybrid';

  const titleEl = card.querySelector('.job-card__title');
  if (titleEl && !titleEl._hasDetailClick) {
    titleEl._hasDetailClick = true;
    titleEl.style.cursor = 'pointer';
    const showDetail = () => {
      const dbJob = (window._currentJobs || DEFAULT_JOBS).find(j => j.id === id) || {
        id, title, company, location,
        salary: card.querySelector('.job-card__salary')?.textContent.trim() || '',
        description: card.querySelector('.job-card__description')?.textContent.trim() || '',
        rating: card.querySelector('.company-rating')?.textContent.trim() || '⭐ 4.8 · Аккредитованный партнёр',
        matchScore: card.querySelector('.match-badge')?.textContent.trim() || '✧ 95% совпадение',
        companyLetter: card.querySelector('.company-logo')?.textContent.trim() || company[0],
        companyLogoClass: card.querySelector('.company-logo')?.className.split(' ').find(c => c.startsWith('company-logo--')) || 'company-logo--yandex'
      };
      openJobDetailsModal(dbJob);
    };
    titleEl.addEventListener('click', showDetail);
    titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showDetail();
      }
    });
  }

  card.querySelectorAll('[data-job-action]').forEach(button => {
    if (button._hasJobAction) return;
    button._hasJobAction = true;
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        const isSave = button.dataset.jobAction === 'save';
        const collection = isSave ? savedJobs : appliedJobs;
        const active = !collection.has(id);

        if (active) collection.add(id); else collection.delete(id);
        storage.write(isSave ? 'buddie-saved-jobs' : 'buddie-applied-jobs', [...collection]);

        playButtonSpring(button);

        if (isSave) {
          if (active) await ApiService.saveJob(id); else await ApiService.removeSavedJob(id);
        } else {
          if (active) {
            await ApiService.applyJob(id, title, company, location);
          } else {
            await ApiService.removeApplication(id);
          }
        }

        setJobButton(button, active,
          isSave ? (active ? 'Сохранено' : 'Сохранить') : (active ? 'Отклик отмечен' : 'Откликнуться'),
          isSave
        );
        if (isSave && document.querySelector('.saved-jobs-container')) {
          renderSavedJobsInProfile();
        }
        announce(isSave
          ? (active ? 'Стажировка сохранена в этом браузере.' : 'Стажировка удалена из сохранённых.')
          : (active ? 'Отклик успешно сохранён! Отправка работодателю недоступна в демо.' : 'Отметка об отклике отменена.')
        );
      } finally {
        button.disabled = false;
      }
    });
  });
}

function renderJobsFeed(jobs) {
  const container = document.querySelector('.feed-jobs');
  if (!container) return;

  const jobList = Array.isArray(jobs) && jobs.length > 0 ? jobs : DEFAULT_JOBS;
  window._currentJobs = jobList;
  container.innerHTML = jobList.map(j => createJobCardHtml(j)).join('');

  container.querySelectorAll('[data-job-id]').forEach(card => {
    bindJobCard(card);
  });
  updateFeedCounters(jobList.length);
  updateTargetUniversityBadges();
  updateSearch(searchTerm);
}

function createApplicationRowHtml(app) {
  const appsState = storage.read('buddie-applications-state', {});
  const appState = appsState[app.id || ''] || appsState[app.jobId || ''] || {};
  const currentStatus = appState.status || app.status;
  const currentStatusClass = appState.statusClass || app.statusClass;
  const currentSlot = appState.interviewSlot || app.interviewSlot;

  let badgeLabel = currentStatus;
  if (currentStatus === 'Приглашение') badgeLabel = '● Приглашение';
  else if (currentStatus === 'На рассмотрении') badgeLabel = '◷ На рассмотрении';
  else if (currentStatus === 'Отказ') badgeLabel = '● Отказ';
  else if (currentStatus === 'Оффер') badgeLabel = '✦ Оффер!';
  else if (currentStatus === 'Оффер принят') badgeLabel = '✓ Оффер принят';

  const isAccepted = currentStatus === 'Оффер принят';
  let actionHtml = '';

  if (isAccepted) {
    actionHtml = '<button class="button button--small button--soft" type="button" disabled>✓ Принято</button>';
  } else if (app.actionText === 'Фидбек' || currentStatus === 'Отказ') {
    actionHtml = '<a class="button button--outline button--small application-feedback" href="#feedback">Фидбек</a>';
  } else if (app.actionText === 'Чат с HR' || currentStatus === 'На рассмотрении') {
    actionHtml = '<button class="button button--outline button--small" type="button">Чат с HR</button>';
  } else if (app.actionText === 'Выбрать время' || currentStatus === 'Приглашение') {
    if (currentSlot) {
      actionHtml = '<button class="button button--small button--soft" type="button">✓ ' + currentSlot.split(',')[0] + '</button>';
    } else {
      actionHtml = '<button class="button button--small" type="button">Выбрать время</button>';
    }
  } else if (app.actionText === 'Принять' || currentStatus === 'Оффер') {
    actionHtml = '<button class="button button--small" type="button">Принять</button>';
  } else {
    actionHtml = '<button class="button button--small" type="button">' + (app.actionText || 'Подробнее') + '</button>';
  }

  const rowIdAttr = (app.rowId || (currentStatus === 'Отказ' ? 'feedback' : '')) ? ' id="' + (app.rowId || 'feedback') + '"' : '';
  const comp = app.company || 'Компания';
  const compLower = comp.toLowerCase();
  const logoClass = app.companyLogoClass || (compLower.includes('yandex') ? 'company-logo--yandex' : compLower.includes('sber') ? 'company-logo--sber' : compLower.includes('vk') ? 'company-logo--vk' : 'company-logo--tbank');
  const logoLetter = app.companyLetter || (compLower.includes('vk') ? 'VK' : comp[0].toUpperCase());

  return '<tr data-application-id="' + (app.id || '') + '" data-job-id="' + (app.jobId || '') + '"' + rowIdAttr + '>' +
    '<td>' +
      '<div class="application-company">' +
        '<span class="company-logo ' + logoClass + '">' + logoLetter + '</span>' +
        '<span>' +
          '<strong>' + app.title + '</strong>' +
          '<small>' + comp + ' · ' + (app.location || 'Москва · Hybrid') + '</small>' +
        '</span>' +
      '</div>' +
    '</td>' +
    '<td>' + (app.appliedDate || 'Сегодня') + '</td>' +
    '<td><span class="status-badge ' + (currentStatusClass || 'status-badge--warning') + '">' + badgeLabel + '</span></td>' +
    '<td>' + actionHtml + '</td>' +
  '</tr>';
}

function bindApplicationRow(row) {
  const btn = row.querySelector('.button');
  if (!btn || btn._hasAppAction) return;
  btn._hasAppAction = true;

  const rowText = row.textContent || '';
  const appId = row.dataset.applicationId || (
    rowText.includes('Python') ? 'app-4' :
    rowText.includes('фронтенд') ? 'app-1' :
    rowText.includes('Аналитик') ? 'app-2' :
    rowText.includes('Тестировщик') ? 'app-3' : 'app-1'
  );
  const jobId = row.dataset.jobId || (
    appId === 'app-4' ? 'tbank-python' :
    appId === 'app-1' ? 'yandex-frontend' :
    appId === 'app-2' ? 'sber-analyst' : 'vk-qa'
  );

  const appsState = storage.read('buddie-applications-state', {});
  const savedState = appsState[appId] || (jobId ? appsState[jobId] : null);
  if (savedState) {
    if (savedState.status === 'Оффер принят') {
      btn.textContent = '✓ Принято';
      btn.classList.add('button--soft');
      btn.disabled = true;
      const statusBadge = row.querySelector('.status-badge');
      if (statusBadge) {
        statusBadge.textContent = '✓ Оффер принят';
        statusBadge.className = 'status-badge status-badge--success';
      }
    }
    if (savedState.interviewSlot) {
      btn.textContent = '✓ ' + savedState.interviewSlot.split(',')[0];
      btn.classList.add('button--soft');
    }
  }

  if (btn.textContent.trim() === 'Принять' || btn.textContent.trim() === '✓ Принято') {
    btn.addEventListener('click', async () => {
      btn.textContent = '✓ Принято';
      btn.classList.add('button--soft');
      btn.disabled = true;
      const statusBadge = row.querySelector('.status-badge');
      if (statusBadge) {
        statusBadge.textContent = '✓ Оффер принят';
        statusBadge.className = 'status-badge status-badge--success';
      }

      const currentAppsState = storage.read('buddie-applications-state', {});
      currentAppsState[appId] = Object.assign(currentAppsState[appId] || {}, { status: 'Оффер принят', statusClass: 'status-badge--success' });
      if (jobId) currentAppsState[jobId] = currentAppsState[appId];
      storage.write('buddie-applications-state', currentAppsState);

      if (appId) {
        await api.updateApplication(appId, { status: 'Оффер принят', statusClass: 'status-badge--success' });
      }
      announce('Поздравляем! Вы приняли оффер компании!');
    });
  } else if (btn.textContent.includes('Чат с HR')) {
    btn.addEventListener('click', () => {
      const company = row.querySelector('strong')?.textContent.trim() || 'HR';
      openModal(
        'Чат с рекрутером ' + company,
        '<p>Задайте интересующие вопросы рекрутеру или согласуйте дату старта.</p>' +
        '<div class="form-group">' +
          '<textarea placeholder="Здравствуйте! Уточните, пожалуйста, необходимые документы..."></textarea>' +
        '</div>',
        () => announce('Сообщение отправлено рекрутеру!'),
        'Отправить'
      );
    });
  } else if (btn.textContent.includes('Выбрать время') || btn.textContent.includes('✓')) {
    btn.addEventListener('click', () => {
      openModal(
        'Выбор слота интервью',
        '<p>Выберите удобное время для онлайн-встречи с командой:</p>' +
        '<div class="form-group">' +
          '<select id="interview-time-slot">' +
            '<option>Завтра, 14:00 (МСК)</option>' +
            '<option>Завтра, 16:30 (МСК)</option>' +
            '<option>Пятница, 11:00 (МСК)</option>' +
          '</select>' +
        '</div>',
        async (modal) => {
          const slot = modal.querySelector('#interview-time-slot').value;
          btn.textContent = '✓ ' + slot.split(',')[0];
          btn.classList.add('button--soft');

          const appsState = storage.read('buddie-applications-state', {});
          appsState[appId] = Object.assign(appsState[appId] || {}, { interviewSlot: slot });
          if (jobId) appsState[jobId] = appsState[appId];
          storage.write('buddie-applications-state', appsState);

          if (appId) {
            await api.updateApplication(appId, { interviewSlot: slot });
          }
          announce('Интервью успешно назначено: ' + slot + '!');
        },
        'Подтвердить встречу'
      );
    });
  }
}

function renderApplicationsTable(applications) {
  const tbody = document.querySelector('.data-table tbody');
  if (!tbody) return;

  const appList = Array.isArray(applications) ? applications : [];

  if (appList.length === 0) {
    tbody.innerHTML = '';
    updateTableEmptyMessage('.data-table', [], 'Отклики не найдены');
    const footSpan = document.querySelector('.profile-applications__foot span');
    if (footSpan) footSpan.textContent = 'Показаны 0 из 0 откликов';
    return;
  }

  tbody.innerHTML = appList.map(app => createApplicationRowHtml(app)).join('');
  tbody.querySelectorAll('tr').forEach(row => bindApplicationRow(row));

  const footSpan = document.querySelector('.profile-applications__foot span');
  if (footSpan) {
    footSpan.textContent = 'Показаны ' + appList.length + ' из ' + appList.length + ' откликов';
  }

  updateSearch(searchTerm);
}

function createCandidateRowHtml(cand) {
  const skillsHtml = (cand.skills || ['Python', 'SQL']).map(s => '<span>' + s + '</span>').join('');
  const uni = cand.university || 'КФУ · 3-й курс';
  const uniData = uni.includes('КФУ') ? 'kfu' : (uni.includes('ИТМО') ? 'itmo' : (uni.includes('ВШЭ') ? 'hse' : 'all'));
  const isNew = (cand.status === 'new' || (cand.statusLabel && cand.statusLabel.toLowerCase().includes('нов')));
  const btnClass = isNew ? 'button button--small' : 'button button--outline button--small';
  const btnText = isNew ? 'Открыть' : 'Профиль';
  const avatarClass = cand.avatarClass ? ' ' + cand.avatarClass : '';

  return '<tr data-candidate-id="' + (cand.id || '') + '" data-university="' + uniData + '" data-status="' + (cand.status || 'new') + '">' +
    '<td>' +
      '<div class="candidate">' +
        '<span class="candidate__avatar' + avatarClass + '">' + (cand.initials || 'К') + '</span>' +
        '<span>' +
          '<strong>' + cand.name + '</strong>' +
          '<small>' + (cand.role || 'Соискатель') + '</small>' +
        '</span>' +
      '</div>' +
    '</td>' +
    '<td>' + uni + '</td>' +
    '<td>' + (cand.jobTitle || 'Стажёр') + '</td>' +
    '<td><span class="match-score">' + (cand.matchScore || '90%') + '</span></td>' +
    '<td><div class="hr-skills">' + skillsHtml + '</div></td>' +
    '<td><span class="status-badge ' + (cand.statusClass || 'status-badge--success') + '">' + (cand.statusLabel || 'Новый') + '</span></td>' +
    '<td><button class="' + btnClass + '">' + btnText + '</button></td>' +
  '</tr>';
}

function bindCandidateRow(row) {
  const openBtn = row.querySelector('.button');
  if (!openBtn || openBtn._hasCandAction) return;
  openBtn._hasCandAction = true;

  const name = row.querySelector('strong')?.textContent.trim() || 'Кандидат';
  const role = row.querySelector('.candidate small')?.textContent.trim() || '';
  const score = row.querySelector('.match-score')?.textContent.trim() || '';
  const skills = [...row.querySelectorAll('.hr-skills span')].map(s => s.textContent).join(', ');

  openBtn.addEventListener('click', () => {
    openModal(
      'Профиль кандидата: ' + name,
      '<p><strong>Специализация:</strong> ' + role + '</p>' +
      '<p><strong>AI Match Score:</strong> ' + score + '</p>' +
      '<p><strong>Ключевые навыки:</strong> ' + skills + '</p>' +
      '<div class="form-group" style="margin-top:16px;">' +
        '<label>Сообщение или приглашение на интервью:</label>' +
        '<textarea placeholder="Добрый день! Приглашаем вас пройти техническое интервью..."></textarea>' +
      '</div>',
      () => {
        announce('Приглашение успешно отправлено кандидату ' + name + '!');
      },
      'Пригласить на интервью'
    );
  });
}

function renderCandidatesTable(candidates) {
  const tbody = document.querySelector('.candidate-table tbody');
  if (!tbody) return;

  const candList = Array.isArray(candidates) ? candidates : [];

  if (candList.length === 0) {
    tbody.innerHTML = '';
    updateTableEmptyMessage('.candidate-table', [], 'Кандидаты не найдены');
    const footSpan = document.querySelector('.hr-table-foot span');
    if (footSpan) footSpan.textContent = 'Показаны 0 из 0 кандидатов';
    return;
  }

  tbody.innerHTML = candList.map(c => createCandidateRowHtml(c)).join('');
  tbody.querySelectorAll('tr').forEach(row => bindCandidateRow(row));

  const footSpan = document.querySelector('.hr-table-foot span');
  if (footSpan) {
    footSpan.textContent = 'Показаны ' + candList.length + ' из 48 кандидатов';
  }

  updateSearch(searchTerm);
}


// ==========================================
// 13. Обложка и детальный просмотр вакансии (Якоря #job-...)
// ==========================================
function openJobDetailsModal(j) {
  if (!j) return;
  const isSaveActive = savedJobs.has(j.id);
  const isApplyActive = appliedJobs.has(j.id);
  const tagsHtml = (j.tags || ['Стажировка', j.format === 'remote' ? 'Remote' : 'Hybrid']).map(t => '<span class="chip">' + t + '</span>').join('');

  openModal(
    'Обложка вакансии · ' + j.company,
    '<div class="job-cover-modal">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;">' +
        '<div style="display:flex;align-items:center;gap:10px;">' +
          '<div class="company-logo ' + (j.companyLogoClass || 'company-logo--yandex') + '">' + (j.companyLetter || j.company?.[0] || 'Я') + '</div>' +
          '<div>' +
            '<div style="font-weight:700;font-size:15px;color:var(--color-text-main,#2d3748);">' + j.company + '</div>' +
            '<div style="font-size:12px;color:#5B6474;">' + (j.rating || '⭐ 5.0 · Аккредитованная компания') + '</div>' +
          '</div>' +
        '</div>' +
        '<span class="match-badge">' + (j.matchScore || '✧ 95% совпадение') + '</span>' +
      '</div>' +
      '<div style="margin-bottom:12px;">' +
        '<h3 style="font-size:18px;font-weight:800;color:#1a202c;margin:0 0 4px;">' + j.title + '</h3>' +
        '<div style="font-size:16px;font-weight:700;color:#8b50dc;">' + (j.salary || 'По договорённости') + '</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;">' + tagsHtml + '</div>' +
      '</div>' +
      '<div style="background:#faf8fd;border:1px solid #f0eaf8;padding:12px 14px;border-radius:10px;margin-bottom:14px;font-size:13px;line-height:1.6;color:#2d3748;">' +
        '<div style="font-weight:700;margin-bottom:6px;color:#4a5568;">О стажировке и задачах:</div>' +
        '<p style="margin:0;">' + (j.description || 'Приглашаем студентов присоединиться к нашей команде и получить реальный опыт работы над масштабными задачами.') + '</p>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;font-size:12px;color:#5B6474;margin-bottom:16px;background:#f7fafc;padding:10px 12px;border-radius:8px;">' +
        '<div><strong style="display:block;color:#4a5568;">Локация:</strong>' + (j.location || '⌖ Москва') + '</div>' +
        '<div><strong style="display:block;color:#4a5568;">Занятость:</strong>' + (j.workload || '▣ Гибкий график') + '</div>' +
        '<div><strong style="display:block;color:#4a5568;">Формат:</strong>' + (j.format === 'remote' ? 'Удалённо' : (j.format === 'office' ? 'В офисе' : 'Гибридный')) + '</div>' +
        '<div><strong style="display:block;color:#4a5568;">Публикация:</strong>' + (j.postedTime || '◷ Недавно') + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;align-items:center;flex-wrap:wrap;">' +
        '<button class="button button--outline" type="button" id="modal-save-btn">' + (isSaveActive ? '✓ В сохранённых' : '⭐ Сохранить') + '</button>' +
        '<button class="button' + (isApplyActive ? ' button--soft' : '') + '" type="button" id="modal-apply-btn">' + (isApplyActive ? '✓ Отклик отмечен' : 'Откликнуться на стажировку') + '</button>' +
      '</div>' +
    '</div>',
    null,
    'Закрыть'
  );

  const newHash = '#job-' + j.id;
  if (window.location.hash !== newHash) {
    if (window.history && window.history.pushState) {
      window.history.pushState(null, '', newHash);
    }
  }

  setTimeout(() => {
    const modalApply = document.querySelector('#modal-apply-btn');
    const modalSave = document.querySelector('#modal-save-btn');
    const card = document.querySelector('[data-job-id="' + j.id + '"]');

    if (modalApply && card) {
      modalApply.addEventListener('click', () => {
        const cardApplyBtn = card.querySelector('[data-job-action="apply"]');
        if (cardApplyBtn) {
          cardApplyBtn.click();
          setTimeout(() => {
            const active = appliedJobs.has(j.id);
            modalApply.textContent = active ? '✓ Отклик отмечен' : 'Откликнуться на стажировку';
            modalApply.classList.toggle('button--soft', active);
          }, 50);
        }
      });
    }

    if (modalSave && card) {
      modalSave.addEventListener('click', () => {
        const cardSaveBtn = card.querySelector('[data-job-action="save"]');
        if (cardSaveBtn) {
          cardSaveBtn.click();
          setTimeout(() => {
            const active = savedJobs.has(j.id);
            modalSave.textContent = active ? '✓ В сохранённых' : '⭐ Сохранить';
          }, 50);
        }
      });
    }
  }, 50);
}

function handleJobDeepLink() {
  const hash = window.location.hash;
  if (!hash) return;
  const cleanId = hash.replace(/^#job-/, '').replace(/^#/, '');
  if (!cleanId || cleanId === 'recommendations' || cleanId === 'applications' || cleanId === 'saved' || cleanId === 'stack' || cleanId === 'analytics' || cleanId === 'edit') return;

  const card = document.querySelector('[data-job-id="' + cleanId + '"]') || document.querySelector('#job-' + cleanId);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('job-card--highlighted');
    setTimeout(() => {
      const dbJob = (window._currentJobs || DEFAULT_JOBS).find(j => j.id === cleanId) || {
        id: cleanId,
        title: card.querySelector('.job-card__title')?.textContent.trim() || 'Стажировка',
        company: card.querySelector('.company-name')?.textContent.trim() || 'Компания',
        location: card.querySelector('.job-card__meta span')?.textContent.trim() || 'Москва',
        salary: card.querySelector('.job-card__salary')?.textContent.trim() || '',
        description: card.querySelector('.job-card__description')?.textContent.trim() || '',
        rating: card.querySelector('.company-rating')?.textContent.trim() || '⭐ 4.8 · Аккредитованный партнёр',
        matchScore: card.querySelector('.match-badge')?.textContent.trim() || '✧ 95% совпадение',
        companyLetter: card.querySelector('.company-logo')?.textContent.trim() || 'Я',
        companyLogoClass: card.querySelector('.company-logo')?.className.split(' ').find(c => c.startsWith('company-logo--')) || 'company-logo--yandex'
      };
      openJobDetailsModal(dbJob);
    }, 200);
  }
}

// ==========================================
// 14. Автосинхронизация HR-партнёра с базой
// ==========================================
function initHrAutoSync() {
  const candTable = document.querySelector('.candidate-table');
  if (!candTable) return;

  let isSyncing = false;
  let lastDataHash = '';

  async function syncHrData() {
    if (isSyncing || document.hidden) return;
    isSyncing = true;
    try {
      const [cands, jobs] = await Promise.all([
        ApiService.getCandidates(),
        ApiService.getJobs()
      ]);

      if (Array.isArray(cands)) {
        const dataHash = JSON.stringify(cands.map(c => [c.id, c.status, c.jobTitle, c.university]));
        if (dataHash !== lastDataHash) {
          lastDataHash = dataHash;
          renderCandidatesTable(cands);
        }
      }

      // Обновляем числовые метрики в hr.html
      const metricNumbers = document.querySelectorAll('.hr-metric__number');
      if (metricNumbers.length >= 4) {
        if (Array.isArray(jobs) && jobs.length > 0) metricNumbers[0].textContent = jobs.length;
        if (Array.isArray(cands)) {
          metricNumbers[1].textContent = cands.length;
          const interviews = cands.filter(c => c.status === 'interview' || (c.statusLabel && c.statusLabel.toLowerCase().includes('интервью'))).length;
          metricNumbers[2].textContent = interviews;
        }
      }
    } catch (e) {
      console.warn('HR auto-sync error:', e);
    } finally {
      isSyncing = false;
    }
  }

  // Периодическая проверка раз в 3.5 секунды
  setInterval(syncHrData, 3500);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncHrData();
  });
}

async function loadInitialData() {
  // 1. Таблица откликов в profile.html
  const appTable = document.querySelector('.data-table');
  if (appTable) {
    appTable.querySelectorAll('tbody tr').forEach(row => bindApplicationRow(row));

    try {
      const apps = await ApiService.getApplications();
      if (Array.isArray(apps) && apps.length > 0) {
        renderApplicationsTable(apps);
      }
    } catch (e) {
      console.warn('loadInitialData applications fetch error:', e);
    }
  }

  // 2. Таблица кандидатов в hr.html
  const candTable = document.querySelector('.candidate-table');
  if (candTable) {
    candTable.querySelectorAll('tbody tr').forEach(row => bindCandidateRow(row));

    try {
      const cands = await ApiService.getCandidates();
      if (Array.isArray(cands) && cands.length > 0) {
        renderCandidatesTable(cands);
      }
    } catch (e) {
      console.warn('loadInitialData candidates fetch error:', e);
    }
  }

  // 3. Лента вакансий в index.html
  const container = document.querySelector('.feed-jobs');
  if (container) {
    try {
      const jobs = await ApiService.getJobs();
      if (Array.isArray(jobs) && jobs.length > 0) {
        const currentCards = [...container.querySelectorAll('[data-job-id]')];
        const currentIds = currentCards.map(el => el.dataset.jobId);
        const newIds = jobs.map(j => j.id);
        const isDifferent = currentIds.length !== newIds.length || currentIds.some((id, idx) => id !== newIds[idx]);
        if (isDifferent) {
          storage.write('buddie-jobs-cache', jobs);
          renderJobsFeed(jobs);
        }
      }
    } catch (e) {
      console.warn('loadInitialData jobs fetch error:', e);
    }
  }
}

// ==========================================
// 7. Кнопки вакансий (сохранить / откликнуться)
// ==========================================
document.querySelectorAll('[data-job-id]').forEach(card => bindJobCard(card));


// ==========================================
// 8. Уведомления: mark-all-read
// ==========================================

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

document.querySelectorAll('[data-dismiss-notification]').forEach(button => button.addEventListener('click', () => {
  const card = button.closest('.timeline-card');
  const title = card?.querySelector('.timeline-card__title')?.textContent.trim();
  if (!card || !title) return;
  dismissedNotifications.add(title);
  storage.write('buddie-dismissed-notifications', [...dismissedNotifications]);
  setVisible(card, false);
  updateEmptyStates();
  announce('Напоминание скрыто.');
}));


// ==========================================
// 11. Модальные окна
// ==========================================
let previouslyFocusedElement = null;
let modalKeydownHandler = null;

function handleModalKeydown(e) {
  const modal = document.querySelector('.modal-backdrop.is-open');
  if (!modal) return;

  // 1. Быстрое закрытие любого открытого окна по Escape
  if (e.key === 'Escape' || e.key === 'Esc') {
    e.preventDefault();
    closeModal();
    return;
  }

  // 2. Focus Trap при нажатии Tab / Shift+Tab
  if (e.key === 'Tab') {
    const dialog = modal.querySelector('.modal-dialog');
    if (!dialog) return;

    const focusableSelectors = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(', ');

    const focusable = Array.from(dialog.querySelectorAll(focusableSelectors))
      .filter(el => !el.hasAttribute('disabled') && (el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement));

    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first || !dialog.contains(document.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last || !dialog.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }
  }
}

function openModal(title, contentHtml, onConfirm, confirmText = 'Подтвердить') {
  previouslyFocusedElement = document.activeElement;

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

  // Защита от спам-кликов (Double Submit): блокировка кнопки во время запроса
  newConfirmBtn.addEventListener('click', async () => {
    if (newConfirmBtn.disabled) return;
    newConfirmBtn.disabled = true;
    newConfirmBtn.classList.add('is-loading');
    try {
      if (onConfirm) await onConfirm(modal);
      closeModal();
    } catch (err) {
      console.error('Modal confirmation error:', err);
    } finally {
      newConfirmBtn.disabled = false;
      newConfirmBtn.classList.remove('is-loading');
    }
  });

  // Enter на текстовых полях отправляет форму
  modal.querySelectorAll('.modal-body input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        newConfirmBtn.click();
      }
    });
  });

  // Подключение глобального слушателя Escape и Focus Trap
  if (!modalKeydownHandler) {
    modalKeydownHandler = handleModalKeydown;
    document.addEventListener('keydown', modalKeydownHandler);
  }

  modal.style.display = 'flex';
  modal.classList.add('is-open');

  // Автофокус на первое доступное поле или кнопку подтверждения
  const firstInput = modal.querySelector('.modal-body input:not([disabled]), .modal-body select:not([disabled]), .modal-body textarea:not([disabled])');
  if (firstInput) {
    firstInput.focus();
  } else {
    newConfirmBtn.focus();
  }
}

function closeModal() {
  const modal = document.querySelector('.modal-backdrop');
  if (modal) {
    modal.classList.remove('is-open');
    modal.style.display = 'none';
  }
  if (modalKeydownHandler) {
    document.removeEventListener('keydown', modalKeydownHandler);
    modalKeydownHandler = null;
  }
  if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
    try {
      previouslyFocusedElement.focus();
    } catch (_) {}
    previouslyFocusedElement = null;
  }
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
      async (modal) => {
        const title = modal.querySelector('#new-job-title').value.trim() || 'Новая стажировка';
        const format = modal.querySelector('#new-job-format').value || 'hybrid';
        const salary = modal.querySelector('#new-job-salary').value.trim() || '100 000–140 000 ₽';
        const companySelect = document.querySelector('.hr-topbar__company select');
        const company = (companySelect && companySelect.value) ? companySelect.value : 'ООО Партнёр КФУ';

        await api.createJob({
          title,
          format,
          salary,
          company,
          description: 'Новая стажировка, созданная HR-специалистом для студентов университета.',
          targetUniversity: 'kfu'
        });
        announce(`Стажировка «${title}» успешно размещена в базе данных!`);
      },
      'Опубликовать стажировку'
    );
  });
}

// Профиль студента: форматирование имени, навыки и редактирование
function formatShortName(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const second = parts[1];
  const initial = second.endsWith('.') ? second : (second[0].toUpperCase() + '.');
  return `${first} ${initial}`;
}

function getInitials(fullName) {
  if (!fullName) return 'НМ';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'НМ';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function bindSkillBars(container) {
  if (!container) return;
  container.querySelectorAll('.skill').forEach(skillRow => {
    const skillName = skillRow.dataset.skillName || skillRow.querySelector('span')?.textContent.trim();
    if (!skillName) return;

    skillRow.querySelectorAll('.skill__bars i').forEach(bar => {
      if (bar._hasSkillAction) return;
      bar._hasSkillAction = true;

      const setLevel = async (level) => {
        const cachedProf = storage.read('buddie-profile-data', {}) || {};
        cachedProf.skillLevels = cachedProf.skillLevels || {};
        cachedProf.skillLevels[skillName] = level;

        // Синхронизируем уровень владения навыком во ВСЕХ блоках стека на странице (#pane-stack и #stack)
        document.querySelectorAll('.skill').forEach(row => {
          const rowSkillName = row.dataset.skillName || row.querySelector('span')?.textContent.trim();
          if (rowSkillName === skillName) {
            const bars = row.querySelectorAll('.skill__bars i');
            bars.forEach((b, idx) => {
              b.classList.toggle('is-filled', (idx + 1) <= level);
            });
            const barsGroup = row.querySelector('.skill__bars');
            if (barsGroup) {
              barsGroup.setAttribute('aria-label', `Уровень владения ${skillName}: ${level} из 4`);
            }
          }
        });

        storage.write('buddie-profile-data', cachedProf);
        await api.updateState({ profile: cachedProf });
        announce(`Уровень навыка ${skillName} изменён на ${level} из 4`);
      };

      bar.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const level = parseInt(bar.dataset.barLevel, 10) || 1;
        setLevel(level);
      });

      bar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const level = parseInt(bar.dataset.barLevel, 10) || 1;
          setLevel(level);
        }
      });
    });
  });
}

function updateProfileDom(prof) {
  if (!prof) return;

  // 1. Имя студента в карточке, шапке и сайдбаре (с сокращением «Имя Ф.»)
  if (prof.name) {
    const shortName = formatShortName(prof.name);
    const initials = getInitials(prof.name);

    document.querySelectorAll('.student-card__identity h2').forEach(el => {
      el.textContent = prof.name;
    });

    document.querySelectorAll('.sidebar__user-name').forEach(el => {
      el.textContent = shortName;
    });

    const headerProf = document.querySelector('.header__profile');
    if (headerProf) {
      const course = prof.course || '3-й курс';
      headerProf.innerHTML = `<span class="avatar">${initials}</span><span>${shortName}<small>${course}</small></span>`;
    }

    document.querySelectorAll('.student-card__avatar, .sidebar__user .avatar').forEach(avatarEl => {
      avatarEl.textContent = initials;
    });
  }

  // 2. Вуз и курс
  const courseEl = document.querySelector('.student-card__identity p');
  if (courseEl && (prof.university || prof.course)) {
    courseEl.textContent = (prof.university || 'Казанский федеральный университет') + ' · ' + (prof.course || '3-й курс');
  }
  const sidebarMeta = document.querySelector('.sidebar__user-meta');
  if (sidebarMeta && (prof.university || prof.course)) {
    const uniShort = (prof.university || '').includes('ИТМО') ? 'ИТМО' : ((prof.university || '').includes('ВШЭ') ? 'ВШЭ' : 'КФУ');
    sidebarMeta.textContent = `${uniShort} · ${prof.course || '3-й курс'}`;
  }

  // 3. Роль / карьерный фокус
  const roleEl = document.querySelector('.student-card__identity small');
  if (roleEl && prof.role) {
    roleEl.textContent = prof.role + ' · Открыт к стажировкам';
  }

  document.querySelectorAll('.stack-focus-title, .stack-focus strong').forEach(el => {
    if (prof.role) el.textContent = prof.role;
  });

  const aboutEl = document.querySelector('.student-card__about');
  if (aboutEl && prof.about) {
    aboutEl.textContent = prof.about;
  }

  // 4. Стек навыков с интерактивными уровнями
  const skills = Array.isArray(prof.skills) && prof.skills.length > 0
    ? prof.skills
    : ['Python', 'SQL', 'Figma', 'Git'];
  const cachedProfData = storage.read('buddie-profile-data', {}) || {};
  const skillLevels = (prof && prof.skillLevels) || cachedProfData.skillLevels || { 'Python': 4, 'SQL': 4, 'Figma': 2, 'Git': 3, 'Pandas': 4, 'Tableau': 3 };

  document.querySelectorAll('.skill-list').forEach(skillList => {
    const levelLabels = ['Базовый', 'Уверенный', 'Продвинутый', 'Эксперт'];
    skillList.innerHTML = skills.map(skill => {
      const level = (skillLevels && typeof skillLevels[skill] === 'number') ? skillLevels[skill] : (skillLevels[skill] || 4);
      let barsHtml = '';
      for (let i = 1; i <= 4; i++) {
        const isFilled = i <= level ? ' is-filled' : '';
        barsHtml += `<i class="${isFilled}" data-bar-level="${i}" role="button" tabindex="0" aria-label="${skill}: уровень ${i} из 4 (${levelLabels[i-1]})" title="${skill}: ${levelLabels[i-1]} (${i}/4)"></i>`;
      }
      return `<div class="skill" data-skill-name="${skill}"><span>${skill}</span><span class="skill__bars" role="group" aria-label="Уровень владения ${skill}: ${level} из 4">${barsHtml}</span></div>`;
    }).join('');

    bindSkillBars(skillList);
  });
}

async function openProfileEditModal() {
  const db = await api.getDb();
  const currentProf = (db && db.profile) || storage.read('buddie-profile-data', {
    name: 'Нур М.',
    role: 'Аналитика данных',
    course: '3-й курс',
    university: 'Казанский федеральный университет',
    skills: ['Python', 'SQL', 'Pandas', 'Tableau', 'Git'],
    about: 'Студент 3-го курса КФУ, открыт к стажировкам.'
  });

  const skillsStr = Array.isArray(currentProf.skills) ? currentProf.skills.join(', ') : 'Python, SQL, Git';

  openModal(
    'Редактирование профиля студента',
    '<div class="form-group" style="margin-bottom:12px;">' +
      '<label style="display:block;margin-bottom:4px;font-size:12px;font-weight:600;color:#5B6474;">Имя и фамилия:</label>' +
      '<input type="text" id="edit-profile-name" value="' + (currentProf.name || 'Нур М.') + '" placeholder="Например: Иван Иванов" style="width:100%;padding:8px 12px;border:1px solid #e9e6ed;border-radius:8px;font-size:13px;">' +
      '<small style="display:block;margin-top:3px;font-size:11px;color:#718096;">В меню и шапке будет автоматически сокращаться до формата «Имя Ф.»</small>' +
    '</div>' +
    '<div class="form-group" style="margin-bottom:12px;">' +
      '<label style="display:block;margin-bottom:4px;font-size:12px;font-weight:600;color:#5B6474;">Специальность / Карьерный фокус:</label>' +
      '<input type="text" id="edit-profile-role" value="' + (currentProf.role || 'Frontend-разработчик') + '" style="width:100%;padding:8px 12px;border:1px solid #e9e6ed;border-radius:8px;font-size:13px;">' +
    '</div>' +
    '<div class="form-group" style="margin-bottom:12px;">' +
      '<label style="display:block;margin-bottom:4px;font-size:12px;font-weight:600;color:#5B6474;">Стек технологий (через запятую):</label>' +
      '<input type="text" id="edit-profile-skills" value="' + skillsStr + '" style="width:100%;padding:8px 12px;border:1px solid #e9e6ed;border-radius:8px;font-size:13px;">' +
      '<small style="display:block;margin-top:3px;font-size:11px;color:#718096;">Уровни владения технологиями можно интерактивно кликать в блоке стека профиля</small>' +
    '</div>' +
    '<div class="form-group">' +
      '<label style="display:block;margin-bottom:4px;font-size:12px;font-weight:600;color:#5B6474;">О себе / Контакты:</label>' +
      '<textarea id="edit-profile-about" style="width:100%;min-height:60px;padding:8px 12px;border:1px solid #e9e6ed;border-radius:8px;font-size:13px;">' + (currentProf.about || 'Студент КФУ, открыт к стажировкам.') + '</textarea>' +
    '</div>',
    async (modal) => {
      const name = modal.querySelector('#edit-profile-name')?.value.trim() || currentProf.name;
      const role = modal.querySelector('#edit-profile-role')?.value.trim() || currentProf.role;
      const rawSkills = modal.querySelector('#edit-profile-skills')?.value || '';
      const skills = rawSkills.split(',').map(s => s.trim()).filter(Boolean);
      const about = modal.querySelector('#edit-profile-about')?.value.trim() || currentProf.about;

      const cachedProfData = storage.read('buddie-profile-data', {}) || {};
      const skillLevels = currentProf.skillLevels || cachedProfData.skillLevels || {};
      const updatedProfile = Object.assign({}, currentProf, { name, role, skills, about, skillLevels });

      updateProfileDom(updatedProfile);
      storage.write('buddie-profile-data', updatedProfile);
      await api.updateState({ profile: updatedProfile });
      announce('Изменения профиля успешно сохранены!');
    },
    'Сохранить изменения'
  );
}

function initProfileEdit() {
  document.querySelectorAll('[data-edit-profile-btn], .stack-card .button').forEach(btn => {
    if (btn._hasEditAction) return;
    btn._hasEditAction = true;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openProfileEditModal();
    });
  });

  // Клик по боковой панели пользователя (.sidebar__user)
  document.querySelectorAll('.sidebar__user').forEach(userEl => {
    if (userEl._hasUserClick) return;
    userEl._hasUserClick = true;
    userEl.setAttribute('role', 'button');
    userEl.setAttribute('tabindex', '0');
    userEl.setAttribute('aria-label', 'Редактировать профиль');
    userEl.setAttribute('title', 'Редактировать профиль');

    const handleAction = (e) => {
      e.preventDefault();
      if (document.querySelector('.student-card') || window.location.pathname.includes('profile')) {
        openProfileEditModal();
      } else {
        window.location.href = 'profile.html#edit';
      }
    };

    userEl.addEventListener('click', handleAction);
    userEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        handleAction(e);
      }
    });
  });

  // Клик по ссылке «Дополнить профиль →» в сайдбаре
  document.querySelectorAll('.sidebar__link').forEach(link => {
    if (link.textContent.includes('Дополнить профиль')) {
      if (link._hasProfileLink) return;
      link._hasProfileLink = true;
      link.addEventListener('click', (e) => {
        if (document.querySelector('.student-card') || window.location.pathname.includes('profile')) {
          e.preventDefault();
          openProfileEditModal();
        }
      });
    }
  });

  // Автоматическое открытие при переходе по ссылке #edit
  if ((document.querySelector('.student-card') || window.location.pathname.includes('profile')) && window.location.hash === '#edit') {
    setTimeout(() => {
      openProfileEditModal();
    }, 150);
  }
}

// Кнопка скачать резюме PDF
document.querySelectorAll('.button').forEach(btn => {
  if (btn.textContent.includes('Скачать резюме')) {
    btn.addEventListener('click', () => {
      announce('Формирование PDF резюме…');
      setTimeout(() => window.print(), 300);
    });
  }
});

// ==========================================
// 12. Табы в профиле студента с поддержкой Deep Linking (#saved, #stack, #analytics)
// ==========================================
function initProfileTabs() {
  const tabBtns = Array.from(document.querySelectorAll('.profile-tab-btn'));
  const tabPanes = Array.from(document.querySelectorAll('.tab-pane'));
  if (!tabBtns.length) return;

  function getTabFromHash(hash) {
    if (!hash) return null;
    const clean = String(hash).replace(/^#/, '').toLowerCase().trim();
    const validTabs = ['applications', 'saved', 'stack', 'analytics'];
    if (validTabs.includes(clean)) return clean;
    if (clean.startsWith('pane-')) {
      const sub = clean.replace('pane-', '');
      if (validTabs.includes(sub)) return sub;
    }
    if (clean === 'feedback') return 'applications';
    return null;
  }

  function switchTab(target, updateHash = true, animate = false) {
    const validTabs = ['applications', 'saved', 'stack', 'analytics'];
    const activeTab = validTabs.includes(target) ? target : 'applications';

    tabBtns.forEach(b => {
      const isMatch = b.dataset.tab === activeTab;
      b.classList.toggle('is-active', isMatch);
      b.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    });

    tabPanes.forEach(pane => {
      const isMatch = pane.id === 'pane-' + activeTab;
      pane.style.display = isMatch ? '' : 'none';
      pane.classList.toggle('is-active', isMatch);
      if (isMatch && animate && typeof anime !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        anime({
          targets: pane,
          opacity: [0, 1],
          translateY: [10, 0],
          duration: 300,
          easing: 'easeOutCubic'
        });
      }
    });

    if (activeTab === 'saved') {
      renderSavedJobsInProfile();
    }

    if (updateHash) {
      const targetHash = '#' + activeTab;
      if (window.location.hash !== targetHash) {
        if (window.history && window.history.pushState) {
          window.history.pushState(null, '', targetHash);
        } else {
          window.location.hash = targetHash;
        }
      }
    }
  }

  tabBtns.forEach((btn, index) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(btn.dataset.tab, true, true);
    });

    // WAI-ARIA APG Tabs Keyboard Navigation
    btn.addEventListener('keydown', (e) => {
      let nextIndex = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextIndex = (index + 1) % tabBtns.length;
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        nextIndex = (index - 1 + tabBtns.length) % tabBtns.length;
      } else if (e.key === 'Home') {
        nextIndex = 0;
      } else if (e.key === 'End') {
        nextIndex = tabBtns.length - 1;
      }
      if (nextIndex !== null) {
        e.preventDefault();
        const nextBtn = tabBtns[nextIndex];
        nextBtn.focus();
        switchTab(nextBtn.dataset.tab, true, true);
      }
    });
  });

  window.addEventListener('hashchange', () => {
    const tabFromHash = getTabFromHash(window.location.hash);
    if (tabFromHash) {
      switchTab(tabFromHash, false, true);
    }
  });

  window.addEventListener('popstate', () => {
    const tabFromHash = getTabFromHash(window.location.hash) || 'applications';
    switchTab(tabFromHash, false, true);
  });

  // Deep linking при начальной загрузке страницы (F5, переход по прямой ссылке с хэшем)
  const initialTab = getTabFromHash(window.location.hash);
  if (initialTab) {
    switchTab(initialTab, false, false);
  }
  renderSavedJobsInProfile();
}

async function renderSavedJobsInProfile() {
  const container = document.querySelector('.saved-jobs-container');
  const emptyMsg = document.querySelector('.saved-empty');
  const countBadge = document.querySelector('[data-saved-count]');
  const badgeRating = document.querySelector('[data-saved-badge]');
  if (!container) return;

  const db = await api.getDb();
  const localSaved = storage.readArray('buddie-saved-jobs');
  const serverSaved = (db && Array.isArray(db.savedJobs)) ? db.savedJobs : [];
  const savedIds = [...new Set([...localSaved, ...serverSaved])];

  if (countBadge) countBadge.textContent = savedIds.length;
  if (badgeRating) badgeRating.textContent = savedIds.length + ' вакансий';

  if (!savedIds.length) {
    container.innerHTML = '';
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }

  if (emptyMsg) emptyMsg.style.display = 'none';

  const allJobs = (db && db.jobs && db.jobs.length > 0) ? db.jobs : DEFAULT_JOBS;
  const savedItems = allJobs.filter(j => savedIds.includes(j.id));

  container.innerHTML = savedItems.map(j => createJobCardHtml(j)).join('');
  container.querySelectorAll('[data-job-id]').forEach(card => bindJobCard(card));
}

// Загрузка сохранённого профиля
const cachedProf = storage.read('buddie-profile-data', null);
if (cachedProf) {
  updateProfileDom(cachedProf);
}
api.getDb().then(db => {
  if (db && db.profile) {
    updateProfileDom(db.profile);
  }
});
initProfileEdit();

initProfileTabs();

// Phase 3 initialization
updateLiveDates();
const currentUni = storage.read('buddie-university', 'kfu');
document.querySelectorAll('.header__select select').forEach(s => { s.value = currentUni; });
updateTargetUniversityBadges(currentUni);
updateFeedCounters();

loadInitialData();
updateSearch(searchTerm);

initHrAutoSync();
handleJobDeepLink();
window.addEventListener('hashchange', () => {
  if (window.location.hash.startsWith('#job-')) {
    handleJobDeepLink();
  }
});
