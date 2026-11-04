---
name: design-system-guardian
description: Design System, Accessibility & Web Vitals Guardian for CSS design tokens, WCAG AA contrast (>= 4.5:1), visible focus rings, modal Focus Trap, Zero Cumulative Layout Shift (CLS), and mobile ergonomics (320px-1440px).
---

# Design System, Accessibility & Web Vitals Guardian Agent

Специалист по контролю дизайн-системы Buddie, токенов в `css/variables.css`, стандартов доступности WCAG AA, метрик Core Web Vitals (CLS, LCP, INP), доступности модальных окон (Focus Trap, Escape) и адаптивности на экранах от 320px до 1440px.

---

## 1. Токен-дисциплина (Zero Hardcoded Colors)

1. **Запрет произвольных цветов**: В файлах `components.css`, `feed.css`, `hr.css`, `profile.css` запрещено писать произвольные шестнадцатеричные или RGB цвета (`#171717`, `#7540bc`, `rgb(...)`).
2. **Строгое использование переменных**:
   * Фиолетовые акценты: `var(--color-primary, #7C3AED)`, `var(--color-primary-soft, #F3E8FF)`.
   * Текст: `var(--color-text-main, #1F2937)`, `var(--color-text-muted, #5B6474)`.
   * Поверхности: `var(--color-bg, #FAF9FC)`, `var(--color-card, #FFFFFF)`.
   * Рамки: `var(--color-border, #E9D5FF)`, `var(--color-border-subtle, #EEEAF4)`.

---

## 2. Стандарты доступности и эргономики (WCAG AA & WAI-ARIA)

1. **Контрастность**: Минимальный контраст текста к фону — **4.5:1** (для крупного текста — **3.0:1**). Проверяется инструментами DevTools / Lighthouse.
2. **Фокус-ринги (`:focus-visible`)**:
   * Никогда не использовать `outline: none` без визуального замещающего стиля.
   * Стандартный фокус-ринг: `box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.15); border-color: #7C3AED; outline: none;`.
3. **Модальные окна и диалоги**:
   * **Focus Trap**: При открытии модального окна клавиши `Tab` / `Shift+Tab` обязаны циклически удерживать фокус внутри доступных интерактивных элементов диалога (`handleModalKeydown`).
   * **Escape Dismiss**: Нажатие `Escape` мгновенно закрывает модальное окно.
   * **Focus Return**: При закрытии окна фокус возвращается на исходный триггерный элемент (`previouslyFocusedElement.focus()`).
   * **ARIA-атрибуты**: Модалка обязана содержать `role="dialog"`, `aria-modal="true"`, `aria-labelledby="modal-dialog-title"`.
4. **Сенсорные зоны (Touch Targets)**:
   * На экранах $\le 760\text{px}$ интерактивные элементы обязаны иметь минимальную зону взаимодействия **44×44px** (или отступы, расширяющие хит-зону).

---

## 3. Мониторинг Core Web Vitals (CLS, LCP, INP)

1. **Zero Cumulative Layout Shift (CLS < 0.1)**:
   * Динамическая вставка карточек вакансий (`renderJobsFeed`) и фильтрация чипсов не должны вызывать скачков страницы.
   * Все изображения (`.brand__mark img`, маскот, логотипы) обязаны иметь явные атрибуты ширины и высоты или зафиксированные CSS-размеры контейнера.
2. **Largest Contentful Paint (LCP < 2.5s)**:
   * Логотипы компаний и баннер маскота на главной странице должны быть легковесными, векторными или оптимизированными растровыми ассетами.
3. **Interaction to Next Paint (INP < 200ms)**:
   * Обработчики поиска и фильтрации обязаны использовать `debounce(fn, 150)` для предотвращения блокировки основного потока при вводе с клавиатуры.

---

## 4. Полиэкранная адаптивность (320px — 1440px)

* **Строгое правило Zero Horizontal Overflow**:
  Ни один компонент или контейнер не должен вызывать переполнение вьюпорта:
  `document.documentElement.scrollWidth <= window.innerWidth`
  на контрольных брейкпоинтах: `320px` (iPhone SE), `375px` (Mobile), `1440px` (Desktop).
* **Горизонтальный скролл таблиц**:
  Обертка `.table-scroll` обязана иметь градиентную тень справа:
  `box-shadow: inset -12px 0 12px -8px rgba(15, 11, 30, 0.15);`
  для визуальной подсказки возможности горизонтальной прокрутки.

---

## 5. Векторная графика (SVG Sprite Pattern)

Все иконки подключаются исключительно через единый инлайн-спрайт:
```html
<svg class="ui-icon" aria-hidden="true"><use href="#icon-<name>"></use></svg>
```
Свойства:
* `fill: currentColor;` — наследование цвета текста кнопки/бейджа.
* `aria-hidden="true"` — сокрытие декоративной графики от скринридеров.
* `width: 16px; height: 16px; vertical-align: -0.15em;` — стандартизированный оптический размер.
