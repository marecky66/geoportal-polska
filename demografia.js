'use strict';
// Geoportal DRK — prognoza demograficzna gmin wg GUS, bez warstwy na mapie.
// Identyfikacja gminy z punktu: GUGiK ULDK / PRG (GetCommuneByXY).
(() => {
  const byId = id => document.getElementById(id);
  const status = byId('demStatus');
  const details = byId('demDetails');
  const yearSelect = byId('demYear');
  const clearBtn = byId('demClear');
  if (!status || !details || !yearSelect || !clearBtn) {
    console.error('demografia.js: brak elementów modułu.');
    return;
  }

  let records = null;
  let selectedRecord = null;
  let lastLocation = null;
  let generation = 0;
  const cache = new Map();
  const formatNumber = n => Number(n).toLocaleString('pl-PL');

  function setMessage(message, level = 'unknown') {
    status.textContent = message;
    status.dataset.level = level;
    status.hidden = false;
  }

  function draw() {
    if (!selectedRecord) return;
    const year = yearSelect.value;
    const base = Number(selectedRecord['2025']);
    const forecast = Number(selectedRecord[year]);
    if (!Number.isFinite(base) || !Number.isFinite(forecast) || base <= 0) {
      setMessage('Brak poprawnych danych prognozy dla wybranej gminy.');
      details.hidden = true;
      return;
    }
    byId('demGmina').textContent =
      selectedRecord.gmina + ' (' + selectedRecord.typ + '), pow. ' +
      selectedRecord.powiat + ', woj. ' + selectedRecord.wojewodztwo;
    byId('demBase').textContent = formatNumber(base);
    byId('demForecast').textContent = formatNumber(forecast);
    byId('demForecastYear').textContent = year;
    byId('demChangeYear').textContent = year;
    const change = 100 * (forecast - base) / base;
    const changeEl = byId('demChange');
    changeEl.dataset.level = change >= 0 ? 'ok' : 'bad';
    changeEl.textContent = (change > 0 ? '+' : '') +
      change.toLocaleString('pl-PL', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) + '%';
    details.hidden = false;
    status.hidden = true;
  }

  // Identyfikator gminy ULDK: 146501_1 -> 1465011 (TERYT w danych GUS).
  function extractCode(body) {
    const lines = body.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length || lines[0] !== '0') {
      throw new Error('Nie udało się ustalić gminy w usłudze ULDK.');
    }
    const remaining = lines.slice(1).join('|');
    const match = remaining.match(/(?:^|[^\d])(\d{6})_([1-5])(?:[^\d]|$)/) ||
                  remaining.match(/(?:^|[^\d])(\d{7})(?:[^\d]|$)/);
    if (!match) throw new Error('ULDK nie zwrócił rozpoznawalnego kodu TERYT gminy.');
    return match[2] ? match[1] + match[2] : match[1];
  }

  async function locateCommune(lat, lon) {
    const key = lat.toFixed(6) + ',' + lon.toFixed(6);
    if (cache.has(key)) return cache.get(key);
    const params = new URLSearchParams({
      request: 'GetCommuneByXY',
      xy: lon + ',' + lat + ',4326',
      result: 'id,commune'
    });
    const response = await fetch('https://uldk.gugik.gov.pl/?' + params.toString());
    if (!response.ok) throw new Error('Usługa ULDK: HTTP ' + response.status);
    const code = extractCode(await response.text());
    cache.set(key, code);
    return code;
  }

  async function evaluate(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    lastLocation = {lat, lon};
    selectedRecord = null;
    details.hidden = true;
    const ticket = ++generation;
    setMessage('Sprawdzanie gminy i wczytywanie prognozy GUS…');
    try {
      const [code] = await Promise.all([
        locateCommune(lat, lon),
        dataPromise
      ]);
      if (ticket !== generation) return;
      if (!records) throw new Error('Nie udało się wczytać danych GUS.');
      const record = records[code];
      if (!record) {
        setMessage('Brak prognozy dla gminy TERYT ' + code + ' w załączonej tabeli GUS.');
        return;
      }
      selectedRecord = record;
      draw();
    } catch (error) {
      if (ticket !== generation) return;
      console.error('Demografia — problem identyfikacji gminy:', error);
      setMessage(error instanceof TypeError
        ? 'Brak połączenia z usługą identyfikacji gmin GUGiK (sieć lub CORS).'
        : (error.message || 'Nie udało się przeprowadzić analizy demograficznej.'));
    }
  }

  const dataPromise = fetch('./prognoza_gus.json')
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status + ' dla prognoza_gus.json');
      return response.json();
    })
    .then(payload => {
      if (!payload.data || typeof payload.data !== 'object') throw new Error('Nieprawidłowy JSON prognozy.');
      records = payload.data;
    });


  // Analiza po wyszukaniu adresu lub działki
  document.addEventListener('drk:location-selected', event => {
    evaluate(
      Number(event.detail?.lat),
      Number(event.detail?.lon)
    );
  });

  // Analiza po kliknięciu na mapie
  map.on('click', event => {
    evaluate(event.latlng.lat, event.latlng.lng);
  });


  yearSelect.addEventListener('change', draw);
  clearBtn.addEventListener('click', () => {
    ++generation;
    selectedRecord = null;
    lastLocation = null;
    details.hidden = true;
    yearSelect.value = '2040';
    setMessage('Wyszukaj adres lub działkę, aby wyświetlić prognozę dla gminy.');
  });
  byId('resetBtn')?.addEventListener('click', () => {
    ++generation;
    selectedRecord = null;
    lastLocation = null;
    details.hidden = true;
    setMessage('Wyszukaj adres lub działkę, aby wyświetlić prognozę dla gminy.');
  });
  
// Wybór roku prognozy za pomocą przycisków
const yearButtons = document.querySelectorAll(
  '#demYearButtons button[data-year]'
);

yearButtons.forEach(button => {
  button.addEventListener('click', () => {
    const year = button.dataset.year;

    // Aktualizacja dotychczasowego wyboru roku
    yearSelect.value = year;
    yearSelect.dispatchEvent(
      new Event('change', { bubbles: true })
    );

    // Zaznaczenie aktywnego przycisku
    yearButtons.forEach(btn => {
      btn.classList.toggle(
        'active',
        btn.dataset.year === year
      );
    });
  });
});

})();
