'use strict';
// Geoportal DRK — prognoza demograficzna GUS, bez nowej warstwy mapy.
// Gmina rozpoznawana przez GUGiK ULDK / PRG (GetCommuneByXY).
(() => {
  const byId = id => document.getElementById(id);
  const status = byId('demStatus');
  const details = byId('demDetails');
  const yearSelect = byId('demYear');
  const clearBtn = byId('demClear');
  const yearButtons = [...document.querySelectorAll('#demYearButtons button[data-year]')];

  if (!status || !details || !yearSelect || !clearBtn) {
    console.error('demografia.js: brak elementów modułu.');
    return;
  }

  let records = null;
  let selectedRecord = null;
  let generation = 0;
  const cache = new Map();
  const formatNumber = n => Number(n).toLocaleString('pl-PL');

  function setMessage(message, level = 'unknown') {
    status.textContent = message;
    status.dataset.level = level;
    status.hidden = false;
  }

  function setYear(year) {
    if (!['2030', '2040', '2050', '2060'].includes(String(year))) return;
    yearSelect.value = String(year);
    yearButtons.forEach(button => {
      const active = button.dataset.year === yearSelect.value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    draw();
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

  // Kod ULDK np. 146501_1 odpowiada siedmiocyfrowemu TERYT 1465011.
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

  const dataPromise = fetch('./prognoza_gus.json')
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status + ' dla prognoza_gus.json');
      return response.json();
    })
    .then(payload => {
      if (!payload.data || typeof payload.data !== 'object') {
        throw new Error('Nieprawidłowy JSON prognozy.');
      }
      records = payload.data;
    });

  // Zachowaj błąd dla evaluate(), ale uniknij nieobsłużonego odrzucenia Promise.
  dataPromise.catch(error => console.error('Błąd ładowania prognozy GUS:', error));

  async function evaluate(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    selectedRecord = null;
    details.hidden = true;
    const ticket = ++generation;
    setMessage('Sprawdzanie gminy i wczytywanie prognozy GUS…');
    try {
      const [code] = await Promise.all([locateCommune(lat, lon), dataPromise]);
      if (ticket !== generation) return;
      const record = records?.[code];
      if (!record) {
        setMessage('Brak prognozy dla gminy TERYT ' + code + ' w tabeli GUS.');
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

  // Wyszukanie adresu lub działki.
  document.addEventListener('drk:location-selected', event => {
    evaluate(Number(event.detail?.lat), Number(event.detail?.lon));
  });

  // Kliknięcie na mapie.
  if (typeof map !== 'undefined' && map?.on) {
    map.on('click', event => evaluate(event.latlng.lat, event.latlng.lng));
  }

  yearButtons.forEach(button => {
    button.addEventListener('click', () => setYear(button.dataset.year));
  });
  yearSelect.addEventListener('change', () => setYear(yearSelect.value));

  function clearAnalysis() {
    ++generation;
    selectedRecord = null;
    details.hidden = true;
    setYear('2040');
    setMessage('Wyszukaj adres, działkę lub kliknij mapę, aby wyświetlić prognozę dla gminy.');
  }
  clearBtn.addEventListener('click', clearAnalysis);
  byId('resetBtn')?.addEventListener('click', clearAnalysis);
  setYear(yearSelect.value);
})();
