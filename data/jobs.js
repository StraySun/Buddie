// Data layer for Buddie Jobs (Local store & extensible schema)
const DEFAULT_JOBS = [
  {
    id: 'yandex-analyst',
    company: 'Yandex',
    companyLogoClass: 'company-logo--yandex',
    companyLetter: 'Я',
    rating: '⭐ 4.7 · Отзывы студентов',
    matchScore: '✧ 96% совпадение',
    title: 'Стажёр-аналитик данных',
    salary: '150 000–200 000 ₽',
    specialty: 'analysis',
    format: 'hybrid',
    tags: ['Стажировка', 'Hybrid', 'Python', 'SQL'],
    description: 'Анализируй продуктовые данные пользователей и создавай визуализации для продуктовых команд.',
    location: '⌖ Москва',
    workload: '▣ 3 дня/неделю',
    postedTime: '◷ Сегодня',
    responseBadge: '● Быстрый отклик'
  },
  {
    id: 'sber-java',
    company: 'Сбер',
    companyLogoClass: 'company-logo--sber',
    companyLetter: 'С',
    rating: '⭐ 4.8 · Аккредитованный партнёр КФУ',
    matchScore: '✧ 91% совпадение',
    title: 'Младший Java-разработчик',
    salary: '90 000–130 000 ₽',
    specialty: 'development',
    format: 'remote',
    tags: ['Junior', 'Remote', 'Java', 'Spring'],
    description: 'Разработка сервисов для корпоративных клиентов, написание интеграционных тестов и code review.',
    location: '⌖ Казань / Удалённо',
    workload: '▣ 40 ч/неделю',
    postedTime: '◷ Вчера',
    responseBadge: '● Оплата обучения'
  },
  {
    id: 'tbank-data',
    company: 'Т-Банк',
    companyLogoClass: 'company-logo--tbank',
    companyLetter: 'Т',
    rating: '⭐ 4.9 · Лучший работодатель для студентов',
    matchScore: '✧ 88% совпадение',
    title: 'Data Engineer Intern',
    salary: '110 000–140 000 ₽',
    specialty: 'analysis',
    format: 'hybrid',
    tags: ['Intern', 'Hybrid', 'ETL', 'Spark'],
    description: 'Построение витрин данных, оптимизация пайплайнов обработки и поддержка аналитических баз.',
    location: '⌖ Казань, ул. Баумана',
    workload: '▣ 20–30 ч/неделю',
    postedTime: '◷ 2 дня назад',
    responseBadge: '● Менторство'
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEFAULT_JOBS };
}
