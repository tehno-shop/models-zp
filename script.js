document.addEventListener('DOMContentLoaded', () => {
  // ЗАМІНІТЬ ЦЕ НА ВАШУ РЕАЛЬНУ БАЗОВУ URL n8n !!!
  const N8N_BASE_URL = 'https://n8n.tehno-shop.co.ua'; // ВАША БАЗОВА URL

  // --- Отримання HTML елементів ---
  const selectTechTypeElement = document.getElementById('selectTechType');
  const selectBrandElement = document.getElementById('selectBrand');
  const selectModelElement = document.getElementById('selectModel');
  const resultsTable = document.getElementById('resultsTable');
  const resultsTableBody = document.getElementById('resultsTableBody');
  const loadingMessage = document.getElementById('loadingMessage');
  const noResultsMessage = document.getElementById('noResultsMessage');

  // --- Конфігурація Choices.js ---
  const choicesOptions = {
      searchEnabled: true,        // Увімкнути пошук
      shouldSort: false,          // Не сортувати опції автоматично
      itemSelectText: 'Вибрати',  // Текст кнопки вибору
      removeItemButton: false,    // Не показувати кнопку видалення для single select
      placeholder: true,          // Вказуємо, що будемо використовувати плейсхолдер

      // --- Опції Пошуку ---
      searchFloor: 1,             // Показувати поле пошуку, якщо є хоча б 1 опція
      searchResultLimit: 150,     // Макс. кількість результатів пошуку
      searchPlaceholderValue: "Введіть для пошуку...", // Текст у полі пошуку
      fuseOptions: {              // Налаштування для Fuse.js (пошуковий рушій)
          keys: ['label'],        // Шукати за полем 'label' наших даних
          threshold: 0.3          // Чутливість пошуку (0=точно, 1=будь-що)
      }
  };

  // --- Ініціалізація екземплярів Choices.js ---
  // Ініціалізуємо з базовими опціями. Текст плейсхолдера встановимо через populate/reset.
  const choicesTechType = new Choices(selectTechTypeElement, choicesOptions);
  const choicesBrand = new Choices(selectBrandElement, choicesOptions);
  const choicesModel = new Choices(selectModelElement, choicesOptions);


  // --- Допоміжні функції ---

  /**
   * Виконує запит до API n8n
   * @param {string} endpoint - Шлях до API (напр., '/api/tech-types')
   * @param {object} [params] - Об'єкт з query параметрами
   * @returns {Promise<Array|null>} - Масив даних або null у разі помилки
   */
  async function fetchData(endpoint, params = {}) {
      const url = new URL(`${N8N_BASE_URL}/webhook${endpoint}`);
      Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
      try {
          const response = await fetch(url);
          if (!response.ok) {
              console.error(`HTTP error! status: ${response.status} for ${url}`);
              return null;
          }
          // Додамо перевірку на порожню відповідь перед JSON.parse
          const text = await response.text();
          if (!text) {
              console.log(`Empty response received from ${url}`);
              return []; // Повертаємо порожній масив, якщо відповідь порожня
          }
          const data = JSON.parse(text); // Парсимо текст

          if (!Array.isArray(data)) {
              console.error('Invalid data format received from API. Expected an array.', data);
              return null;
          }
          return data;
      } catch (error) {
          // Додамо логування помилки JSON.parse
          if (error instanceof SyntaxError) {
               console.error('JSON Parsing error:', error);
               console.error('Received text:', text); // Покажемо текст, який не вдалося розпарсити
          } else {
               console.error('Fetch error:', error);
          }
          return null;
      }
  }

  /**
   * Заповнює екземпляр Choices опціями
   * @param {Choices} choicesInstance - Екземпляр Choices.js
   * @param {Array<{value: string|number, name: string}>} options - Масив опцій з API
   * @param {string} placeholderText - Текст для placeholder
   */
  function populateSelect(choicesInstance, options, placeholderText) {
      // Очищаємо тільки опції, залишаючи конфігурацію
      choicesInstance.clearChoices();

      // Готуємо масив опцій для Choices.js, використовуючи 'label' для тексту
      const choicesData = (options || []).map(option => ({
          value: option.value,
          label: option.name // Текст опції
      }));

      // Додаємо опції до списку
      choicesInstance.setChoices(choicesData, 'value', 'label', false); // false = додати, не замінювати

      // Встановлюємо плейсхолдер (зробимо це через resetSelect, який викликається перед populate)
      // Але якщо опцій немає, покажемо відповідний текст
      if (options && options.length > 0) {
          choicesInstance.enable();
      } else {
          // Якщо опцій немає, очищаємо ще раз і ставимо "немає опцій"
          choicesInstance.clearStore();
           choicesInstance.setChoices(
                [{ value: '', label: 'Немає доступних опцій', placeholder: true, disabled: true, selected: true }],
                'value',
                'label',
                true // Замінити все
           );
          choicesInstance.disable();
      }
      // Встановлюємо значення '' (плейсхолдер) як поточне
      choicesInstance.setChoiceByValue('');
  }

   /**
    * Очищує селект Choices.js і встановлює placeholder
    * @param {Choices} choicesInstance - Екземпляр Choices.js
    * @param {string} placeholderText - Текст для неактивної опції
    */
   function resetSelect(choicesInstance, placeholderText) {
       choicesInstance.clearStore(); // Очистити все: опції, вибір, результати пошуку
       // Встановлюємо опції, що містять ТІЛЬКИ плейсхолдер
       choicesInstance.setChoices(
            [{ value: '', label: placeholderText, placeholder: true, disabled: true, selected: true }],
            'value',
            'label',
            true // Замінити все на цей єдиний елемент
       );
       choicesInstance.disable(); // Деактивувати
       choicesInstance.setChoiceByValue(''); // Переконатись, що значення скинуто на плейсхолдер
   }

  /**
   * Відображає знайдені запчастини у таблиці
   * @param {Array<object>} parts - Масив об'єктів запчастин
   */
  function displayParts(parts) {
    resultsTableBody.innerHTML = '';
    loadingMessage.style.display = 'none';

    if (!parts || parts.length === 0) {
        resultsTable.style.display = 'none';
        noResultsMessage.style.display = 'block';
        return;
    }

    resultsTable.style.display = 'table';
    noResultsMessage.style.display = 'none';

    parts.forEach(part => {
        const row = resultsTableBody.insertRow();
        row.insertCell().textContent = part.modelName || '-';
        row.insertCell().textContent = part.categoryName || '-';
        row.insertCell().textContent = part.partName || '-';
        row.insertCell().textContent = part.partNumber || '-';

        // --- ЗМІНИ ТУТ ---
        const linkCell = row.insertCell();
        if (part.productUrl) {
            // Створюємо посилання, яке виглядатиме як кнопка
            const linkButton = document.createElement('a');
            linkButton.href = part.productUrl;
            linkButton.textContent = 'Купити'; // Текст кнопки
            linkButton.classList.add('buy-button'); // Додаємо клас для стилізації
            linkButton.target = '_blank'; // Відкривати в новій вкладці
            // linkButton.rel = 'noopener noreferrer'; // Хороша практика для target="_blank"

            linkCell.appendChild(linkButton); // Додаємо кнопку-посилання в комірку
        } else {
            // Якщо посилання немає, можна залишити прочерк або нічого не додавати
            linkCell.textContent = '-';
        }
        // --- Кінець змін ---
    });
}

  // --- Обробники подій для оригінальних <select> елементів ---

  selectTechTypeElement.addEventListener('change', async () => {
      const techId = selectTechTypeElement.value;

      // Скидання наступних селектів
      resetSelect(choicesBrand, 'Завантаження брендів...'); // Встановлюємо текст під час скидання
      resetSelect(choicesModel, 'Виберіть бренд');
      resultsTableBody.innerHTML = '';
      resultsTable.style.display = 'none';
      noResultsMessage.style.display = 'none';

      if (techId) {
          const brands = await fetchData('/api/brands', { tech_id: techId });
          // Заповнення другого селекту
          populateSelect(choicesBrand, brands, 'Виберіть бренд'); // Передаємо текст плейсхолдера
      }
  });

  selectBrandElement.addEventListener('change', async () => {
      const brandId = selectBrandElement.value;
      const techId = selectTechTypeElement.value;

      // Скидання селекту моделі
      resetSelect(choicesModel, 'Завантаження моделей...');
      resultsTableBody.innerHTML = '';
      resultsTable.style.display = 'none';
      noResultsMessage.style.display = 'none';

      if (brandId && techId) {
          const models = await fetchData('/api/models', { tech_id: techId, brand_id: brandId });
          // Заповнення третього селекту
          populateSelect(choicesModel, models, 'Виберіть модель');
      }
  });

  selectModelElement.addEventListener('change', async () => {
      const modelId = selectModelElement.value;
      resultsTableBody.innerHTML = '';
      resultsTable.style.display = 'none';
      noResultsMessage.style.display = 'none';

      // Робимо запит тільки якщо вибрано реальне значення (не плейсхолдер)
      if (modelId) {
          loadingMessage.style.display = 'block';
          const parts = await fetchData('/api/parts', { model_id: modelId });
          displayParts(parts);
      }
  });

  // --- Ініціалізація при завантаженні сторінки ---
  async function initialize() {
      // Встановлюємо початковий плейсхолдер для першого селекту
      resetSelect(choicesTechType, 'Завантаження типів...');
      // Скидаємо інші селекти
      resetSelect(choicesBrand, 'Виберіть тип техніки');
      resetSelect(choicesModel, 'Виберіть бренд');

      // Завантажуємо типи техніки
      const techTypes = await fetchData('/api/tech-types');
      // Заповнюємо перший селект
      populateSelect(choicesTechType, techTypes, 'Виберіть тип техніки');
  }

  // Запускаємо ініціалізацію
  initialize();
});