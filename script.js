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
  // Спільні опції для всіх селектів
  const commonChoicesOptions = {
      shouldSort: false,
      itemSelectText: 'Вибрати',
      removeItemButton: false,
      searchEnabled: true, // Пошук увімкнено для всіх
      searchFloor: 1,
      searchResultLimit: 150,
      searchPlaceholderValue: "Введіть для пошуку...", // Спільний плейсхолдер пошуку
      fuseOptions: {
          keys: ['label'],
          threshold: 0.3
      },
      // Не встановлюємо 'placeholder: true' глобально,
      // керуватимемо плейсхолдером через setChoices
  };

  // --- Ініціалізація екземплярів Choices.js ---
  const choicesTechType = new Choices(selectTechTypeElement, commonChoicesOptions);
  const choicesBrand = new Choices(selectBrandElement, commonChoicesOptions);
  const choicesModel = new Choices(selectModelElement, {
      ...commonChoicesOptions, // Копіюємо базові опції
      // Для моделей початкові опції будуть встановлені в `initialize` та `resetModelSelect`
  });

  // Змінна для відкладеного запиту (debounce) при пошуку моделей
  let modelSearchTimeout;

  // --- Допоміжні функції ---

  /**
   * Виконує запит до API n8n
   * @param {string} endpoint - Шлях до API (напр., '/api/tech-types')
   * @param {object} [params] - Об'єкт з query параметрами
   * @returns {Promise<Array|null>} - Масив даних або null у разі помилки
   */
  async function fetchData(endpoint, params = {}) {
      const url = new URL(`${N8N_BASE_URL}/webhook${endpoint}`);
      Object.keys(params).forEach(key => {
           // Переконуємось, що не додаємо порожні параметри, особливо search
           if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
               url.searchParams.append(key, params[key]);
           }
       });

      let responseText = ''; // Оголошуємо тут, щоб була доступна в catch
      try {
          console.log("Fetching data from:", url.toString()); // Логуємо URL запиту
          const response = await fetch(url);
          if (!response.ok) {
              console.error(`HTTP error! status: ${response.status} for ${url}`);
              return null;
          }
          responseText = await response.text();
          if (!responseText) {
              console.log(`Empty response received from ${url}`);
              return [];
          }
          const data = JSON.parse(responseText);
          if (!Array.isArray(data)) {
              console.error('Invalid data format received from API. Expected an array.', data);
              return null;
          }
          console.log("Data received for", endpoint, ":", data.length, "items"); // Логуємо кількість отриманих елементів
          return data;
      } catch (error) {
          if (error instanceof SyntaxError) {
               console.error('JSON Parsing error:', error);
               console.error('Received text for URL', url.toString(), ':', responseText);
          } else {
               console.error('Fetch error for URL', url.toString(), ':', error);
          }
          return null;
      }
  }

  /**
   * Заповнює екземпляр Choices (для Типу та Бренду)
   * @param {Choices} choicesInstance - Екземпляр Choices.js
   * @param {Array<{value: string|number, name: string}>} options - Масив опцій з API
   * @param {string} placeholderText - Текст для placeholder
   */
  function populateSelect(choicesInstance, options, placeholderText) {
      choicesInstance.clearStore(); // Повністю очистити перед заповненням

      const choicesData = [
          { value: '', label: placeholderText, placeholder: true, disabled: true, selected: true },
          ...(options || []).map(option => ({
              value: option.value,
              label: option.name // 'label' використовується Choices.js
          }))
      ];

      choicesInstance.setChoices(choicesData, 'value', 'label', true); // true = замінити існуючі

      if (options && options.length > 0) {
          choicesInstance.enable();
      } else {
           choicesInstance.setChoices(
               [{ value: '', label: 'Немає доступних опцій', placeholder: true, disabled: true, selected: true }],
               'value',
               'label',
               true
           );
          choicesInstance.disable();
      }
      choicesInstance.setChoiceByValue(''); // Встановлюємо плейсхолдер як вибраний
  }

 /**
  * Очищує селект Choices.js (для Типу та Бренду) і встановлює placeholder
  * @param {Choices} choicesInstance - Екземпляр Choices.js
  * @param {string} placeholderText - Текст для неактивної опції
  */
 function resetSelect(choicesInstance, placeholderText) {
     choicesInstance.clearStore();
     choicesInstance.setChoices(
          [{ value: '', label: placeholderText, placeholder: true, disabled: true, selected: true }],
          'value',
          'label',
          true
     );
     choicesInstance.disable();
     choicesInstance.setChoiceByValue('');
 }

 /**
  * Очищує селект Моделей і встановлює плейсхолдер (для асинхронного пошуку)
  */
 function resetModelSelect(placeholderText) {
     choicesModel.clearStore();
     choicesModel.setChoices(
          [{ value: '', label: placeholderText, placeholder: true, disabled: true, selected: true }],
          'value',
          'label',
          true
     );
     choicesModel.disable(); // Деактивуємо за замовчуванням
     choicesModel.setChoiceByValue('');
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

          const linkCell = row.insertCell();
          if (part.productUrl) {
              const linkButton = document.createElement('a');
              linkButton.href = part.productUrl;
              linkButton.textContent = 'Купити';
              linkButton.classList.add('buy-button');
              linkButton.target = '_blank';
              linkCell.appendChild(linkButton);
          } else {
              linkCell.textContent = '-';
          }
      });
  }

  // --- Обробники подій ---

  selectTechTypeElement.addEventListener('change', async () => {
      const techId = selectTechTypeElement.value;
      console.log(`Tech Type selected: ${techId}`);

      resetSelect(choicesBrand, 'Завантаження брендів...');
      resetModelSelect('Виберіть бренд'); // Скидаємо і деактивуємо селект моделей
      resultsTableBody.innerHTML = '';
      resultsTable.style.display = 'none';
      noResultsMessage.style.display = 'none';

      if (techId) {
          const brands = await fetchData('/api/brands', { tech_id: techId });
          populateSelect(choicesBrand, brands, 'Виберіть бренд');
      }
  });

  selectBrandElement.addEventListener('change', () => {
      const brandId = selectBrandElement.value;
      console.log(`Brand selected: ${brandId}`);

      // Скидаємо селект моделей і готуємо до пошуку
      resetModelSelect('Введіть модель для пошуку...');
      if (brandId) {
          console.log("Enabling model select for search");
          choicesModel.enable(); // Активуємо для введення пошуку
      } else {
          choicesModel.disable(); // Деактивуємо, якщо бренд скинуто
      }
      // Очищуємо таблицю
      resultsTableBody.innerHTML = '';
      resultsTable.style.display = 'none';
      noResultsMessage.style.display = 'none';
  });

  // АСИНХРОННИЙ ПОШУК МОДЕЛЕЙ
  selectModelElement.addEventListener('search', (event) => {
      const searchTerm = event.detail.value;
      const techId = selectTechTypeElement.value;
      const brandId = selectBrandElement.value;

      clearTimeout(modelSearchTimeout); // Скасувати попередній таймер debounce

      if (!techId || !brandId) {
          console.log("Tech or Brand not selected for model search");
          return; // Виходимо, якщо не вибрано тип або бренд
      }

      const minSearchLength = 2; // Мінімальна довжина для початку пошуку

      // Очищаємо список, якщо пошук недостатньо довгий або порожній
      if (!searchTerm || searchTerm.length < minSearchLength) {
          choicesModel.clearChoices();
           choicesModel.setChoices(
               [{ value: '', label: `Введіть ще ${minSearchLength - (searchTerm?.length || 0)} симв...`, placeholder: true, disabled: true, selected: true }],
               'value',
               'label',
               true
           );
           choicesModel.setChoiceByValue('');
          return;
      }

      // Показати індикатор завантаження
      choicesModel.clearChoices();
      choicesModel.setChoices(
           [{ value: '', label: 'Пошук моделей...', placeholder: true, disabled: true, selected: true }],
           'value',
           'label',
           true
      );
      choicesModel.setChoiceByValue('');

      // Запускаємо пошук з затримкою
      modelSearchTimeout = setTimeout(async () => {
          console.log(`Searching models with term: "${searchTerm}"`);
          try {
              const models = await fetchData('/api/models', {
                  tech_id: techId,
                  brand_id: brandId,
                  search: searchTerm // Передаємо пошуковий термін
              });

              if (models === null) { // Перевірка на помилку fetch
                  throw new Error("Failed to fetch models (fetchData returned null)");
              }

              const choicesData = models.map(m => ({
                  value: m.value, // ID моделі
                  label: m.name  // Назва моделі
              }));

              choicesModel.clearChoices(); // Очищуємо "Пошук..."

              if (choicesData.length > 0) {
                  console.log(`Found ${choicesData.length} models, setting choices.`);
                  choicesModel.setChoices(choicesData, 'value', 'label', false); // false = Додати (не замінювати повністю)
                  // choicesModel.showDropdown(); // Можна спробувати відкрити список програмно
              } else {
                  console.log("No models found for the search term.");
                  choicesModel.setChoices(
                       [{ value: '', label: 'Моделі не знайдено', placeholder: true, disabled: true, selected: true }],
                       'value',
                       'label',
                       true
                  );
                   choicesModel.setChoiceByValue('');
              }

          } catch (error) {
              console.error("Error during model search/setting choices:", error);
              choicesModel.clearStore();
              choicesModel.setChoices(
                   [{ value: '', label: 'Помилка пошуку', placeholder: true, disabled: true, selected: true }],
                   'value',
                   'label',
                   true
              );
              choicesModel.setChoiceByValue('');
          }
      }, 350); // Затримка 350 мс
  });


  selectModelElement.addEventListener('change', async () => {
      const modelId = selectModelElement.value;
       console.log(`Model selected: ${modelId}`);

      resultsTableBody.innerHTML = '';
      resultsTable.style.display = 'none';
      noResultsMessage.style.display = 'none';

      // Робимо запит тільки якщо вибрано реальне значення ID моделі
      if (modelId) {
          loadingMessage.style.display = 'block';
          const parts = await fetchData('/api/parts', { model_id: modelId });
          displayParts(parts);
      } else {
           console.log("Model selection cleared or placeholder selected.");
      }
  });

  // --- Ініціалізація при завантаженні сторінки ---
  async function initialize() {
      console.log("Initializing form...");
      // Встановлюємо початкові стани плейсхолдерів
      resetSelect(choicesTechType, 'Завантаження типів...');
      resetSelect(choicesBrand, 'Виберіть тип техніки');
      resetModelSelect('Виберіть бренд'); // Початковий стан селекту моделей

      // Завантажуємо типи техніки
      const techTypes = await fetchData('/api/tech-types');
      if (techTypes) {
           populateSelect(choicesTechType, techTypes, 'Виберіть тип техніки');
           console.log("Tech types loaded.");
      } else {
           resetSelect(choicesTechType, 'Помилка завантаження типів');
           console.error("Failed to load initial tech types.");
      }
  }

  // Запускаємо ініціалізацію
  initialize();

  // --- Логіка Перемикання Теми (якщо є) ---
  const themeToggleButton = document.getElementById('theme-toggle-button');
  if (themeToggleButton) {
      const currentTheme = localStorage.getItem('theme');
      if (currentTheme === 'dark') {
          document.body.classList.add('dark-theme');
      } else {
           document.body.classList.remove('dark-theme');
      }

      themeToggleButton.addEventListener('click', () => {
          document.body.classList.toggle('dark-theme');
          let theme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
          localStorage.setItem('theme', theme);
      });
  }

}); // Кінець DOMContentLoaded
