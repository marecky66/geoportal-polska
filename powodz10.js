'use strict';
/* Geoportal DRK: MZP Q10% Wody Polskie, identyfikacja GetFeatureInfo. */
(() => {
  if (typeof map === 'undefined' || typeof L === 'undefined') return;
  const WMS_URL = 'https://wody.isok.gov.pl/gpservices/KZGW/MZP20_Glebokosc_WysokiePrawdopodPowodzi/MapServer/WMSServer';
  const toggle = document.getElementById('powodz10Toggle');
  const output = document.getElementById('powodz10Result');
  if (!toggle || !output) { console.warn('Q10: brak elementów HTML.'); return; }

  // WMS 1: głębokość wody (kolor), 2: granica zasięgu.
  const overlay = L.tileLayer.wms(WMS_URL, {
    layers: '1,2', format: 'image/png', transparent: true,
    version: '1.3.0', opacity: 0.72,
    attribution: 'PGW Wody Polskie — MZP Q10%'
  });
  toggle.addEventListener('change', () => {
    if (toggle.checked) overlay.addTo(map);
    else map.removeLayer(overlay);
  });
  if (toggle.checked) overlay.addTo(map);

  let serial = 0;
  let controller = null;
  function setResult(message, level = 'unknown') {
    output.textContent = message;
    output.dataset.level = level;
  }

  // Parametry żądania odpowiadają własnemu widokowi 256 x 256 px
  // w EPSG:3857, ze wskazanym punktem dokładnie w centrum.
  function makeFeatureInfoUrl(lat, lon) {
    const projected = L.CRS.EPSG3857.project(L.latLng(lat, lon));
    const zoom = Math.max(14, Math.min(18, map.getZoom()));
    const resolution = 156543.03392804097 / Math.pow(2, zoom);
    const radius = 128 * resolution;
    const params = new URLSearchParams({
      SERVICE: 'WMS', REQUEST: 'GetFeatureInfo', VERSION: '1.3.0',
      LAYERS: '2', QUERY_LAYERS: '2', STYLES: '',
      CRS: 'EPSG:3857', BBOX: [projected.x-radius, projected.y-radius, projected.x+radius, projected.y+radius].join(','),
      WIDTH: '256', HEIGHT: '256', I: '128', J: '128',
      INFO_FORMAT: 'application/geojson', FEATURE_COUNT: '10',
      FORMAT: 'image/png', TRANSPARENT: 'TRUE'
    });
    return `${WMS_URL}?${params.toString()}`;
  }

  async function assess(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const current = ++serial;
    if (controller) controller.abort();
    controller = new AbortController();
    const signal = controller.signal;
    setResult('Sprawdzanie Q10% w Wodach Polskich…');
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(makeFeatureInfoUrl(lat, lon), {
        signal, headers: { Accept: 'application/geojson, application/json' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.text();
      let data;
      try { data = JSON.parse(raw); }
      catch (_) { throw new Error('Usługa nie zwróciła GeoJSON (np. XML z błędem WMS).'); }
      if (current !== serial) return;
      if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
        if (data.features.length > 0) {
          setResult('TAK — serwer WMS zwrócił obiekt strefy Q10% w punkcie. Wynik orientacyjny (GetFeatureInfo).', 'yes');
        } else {
          setResult('NIE WYKRYTO — zapytanie WMS nie zwróciło obiektu Q10%. Nie jest to potwierdzenie braku zagrożenia.', 'no');
        }
      } else if (data && data.type === 'Feature') {
        setResult('TAK — serwer WMS zwrócił obiekt strefy Q10% w punkcie (wynik orientacyjny).', 'yes');
      } else {
        throw new Error('Nieoczekiwany format odpowiedzi WMS.');
      }
    } catch (e) {
      if (current !== serial) return;
      console.warn('Q10 GetFeatureInfo:', e);
      setResult('NIE USTALONO — brak możliwej do odczytania odpowiedzi WMS (CORS, limit skali, serwer lub format).', 'unknown');
    } finally { clearTimeout(timeout); }
  }

  map.on('click', e => assess(e.latlng.lat, e.latlng.lng));
  document.addEventListener('drk:location-selected', e => {
    const {lat, lon} = e.detail || {};
    assess(Number(lat), Number(lon));
  });
  document.getElementById('resetBtn')?.addEventListener('click', () => {
    ++serial;
    if (controller) controller.abort();
    setResult('Kliknij mapę lub wyszukaj adres.');
  });
})();
