'use strict';
/*
 Geoportal DRK — PIG-PIB: mapa obszarów zagrożonych podtopieniami.
 WMS: wizualizacja. GetFeatureInfo: wyłącznie orientacyjna identyfikacja.
 Przy braku odpowiedzi lub braku obiektu wynik jest niejednoznaczny.
*/
(() => {
  if (typeof L === 'undefined' || typeof map === 'undefined') {
    console.error('PIG WMS: Leaflet lub zmienna map nie są dostępne.');
    return;
  }

  const SERVICE = 'https://cbdgmapa.pgi.gov.pl/arcgis/services/hydrogeologia/podtopienia/MapServer/WMSServer';
  const LAYER_ID = '0'; // z właściwości źródła w QGIS — parametr layers=0
  const toggle = document.getElementById('floodingToggle');
  const output = document.getElementById('floodingResult');
  const reset = document.getElementById('resetBtn');
  if (!toggle || !output) {
    console.error('PIG WMS: brak floodingToggle lub floodingResult w index.html.');
    return;
  }

  const overlay = L.tileLayer.wms(SERVICE, {
    layers: LAYER_ID,
    styles: '',
    format: 'image/png',
    transparent: true,
    version: '1.3.0',
    opacity: 0.70,
    attribution: 'PIG-PIB — podtopienia (WMS)'
  });
  function setVisibility() {
    if (toggle.checked) overlay.addTo(map);
    else map.removeLayer(overlay);
  }
  toggle.addEventListener('change', setVisibility);
  setVisibility();
  overlay.on('tileerror', e => console.warn('PIG WMS: nie udało się pobrać kafelka.', e));

  let revision = 0;
  let controller;
  const update = (msg, level = 'unknown') => {
    output.textContent = msg;
    output.dataset.level = level;
  };

  // Celowany obraz 256x256 w EPSG:3857 — punkt w środku.
  // Stały zoom 16, aby wynik nie zależał od aktualnego zbliżenia mapy.
  function featureInfoURL(lat, lon, infoFormat) {
    const xy = L.CRS.EPSG3857.project(L.latLng(lat, lon));
    const resolution = 156543.03392804097 / Math.pow(2, 16);
    const extent = resolution * 128;
    const p = new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetFeatureInfo',
      LAYERS: LAYER_ID, QUERY_LAYERS: LAYER_ID, STYLES: '',
      CRS: 'EPSG:3857',
      BBOX: [xy.x - extent, xy.y - extent, xy.x + extent, xy.y + extent].join(','),
      WIDTH: '256', HEIGHT: '256', I: '128', J: '128',
      FORMAT: 'image/png', TRANSPARENT: 'TRUE',
      INFO_FORMAT: infoFormat, FEATURE_COUNT: '5'
    });
    return `${SERVICE}?${p.toString()}`;
  }

  // Nie interpretuj dowolnego JSON jako trafienia: tylko FeatureCollection/Feature.
  function parseFeatureInfo(json) {
    if (json && json.type === 'FeatureCollection' && Array.isArray(json.features)) {
      return json.features.length > 0 ? 'hit' : 'empty';
    }
    if (json && json.type === 'Feature') return 'hit';
    // Czasem ArcGIS zwraca JSON z błędem usługi — nie jest to wynik negatywny.
    return 'unknown';
  }

  async function assess(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const id = ++revision;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    update('Sprawdzanie podtopień PIG (GetFeatureInfo)…');
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const url = featureInfoURL(lat, lon, 'application/geojson');
      const response = await fetch(url, { signal, headers: { Accept: 'application/geojson, application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const responseText = await response.text();
      let json;
      try { json = JSON.parse(responseText); }
      catch (_) { throw new Error('Odpowiedź nie jest GeoJSON (może to być XML/HTML błędu usługi).'); }
      if (id !== revision) return;
      const result = parseFeatureInfo(json);
      if (result === 'hit') {
        update('TAK — usługa PIG zwróciła obiekt dla wskazanego punktu (wynik orientacyjny).', 'yes');
      } else if (result === 'empty') {
        update('NIE WYKRYTO — WMS nie zwrócił obiektu. To nie potwierdza braku zagrożenia podtopieniami.', 'unknown');
      } else {
        throw new Error('Nieznana struktura odpowiedzi usługi.');
      }
    } catch (error) {
      if (id !== revision) return;
      console.warn('PIG GetFeatureInfo:', error);
      update('NIE USTALONO — nie można odczytać wiarygodnego wyniku z WMS PIG (np. CORS, format, uprawnienia GetFeatureInfo).', 'unknown');
    } finally {
      clearTimeout(timeout);
    }
  }

  map.on('click', e => assess(e.latlng.lat, e.latlng.lng));
  document.addEventListener('drk:location-selected', e => {
    const lat = Number(e.detail?.lat);
    const lon = Number(e.detail?.lon);
    assess(lat, lon);
  });
  reset?.addEventListener('click', () => {
    ++revision;
    controller?.abort();
    update('Kliknij mapę lub wyszukaj adres.');
  });
})();
