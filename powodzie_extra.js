'use strict';
/* Geoportal DRK — Wody Polskie: powódź rzeczna Q1% i Q0,2%.
   WMS: wizualizacja warstw 16 (głębokość) i 17 (zasięg).
   GetFeatureInfo: orientacyjna identyfikacja obiektów z warstwy 17.
   Nie zastępuje analiz poligonowych ani weryfikacji urzędowej. */
(() => {
  if (typeof L === 'undefined' || typeof map === 'undefined') {
    console.error('Powodzie: Leaflet / mapa nie są dostępne.');
    return;
  }

  const scenarios = [
    {
      key: 'q1', label: 'Q1% (100-letnia)',
      url: 'https://wody.isok.gov.pl/gpservices/KZGW/MZP20_Glebokosc_SredniePrawdopodPowodzi/MapServer/WMSServer',
      toggleId: 'powodz100Toggle', resultId: 'powodz100Result'
    },
    {
      key: 'q02', label: 'Q0,2% (500-letnia)',
      url: 'https://wody.isok.gov.pl/gpservices/KZGW/MZP20_Glebokosc_NiskiePrawdopodPowodzi/MapServer/WMSServer',
      toggleId: 'powodz500Toggle', resultId: 'powodz500Result'
    }
  ];

  // Osobna warstwa na WMS — nad OSM, lecz poniżej znaczników.
  if (!map.getPane('floodWmsPane')) {
    map.createPane('floodWmsPane');
    map.getPane('floodWmsPane').style.zIndex = '430';
    map.getPane('floodWmsPane').style.pointerEvents = 'none';
  }

  function makeFeatureInfoUrl(url, lat, lon) {
    // Własny, niewielki bbox wokół badanego punktu. Nie zależy od widoku mapy.
    const p = L.CRS.EPSG3857.project(L.latLng(lat, lon));
    const zoom = 16; // skala pozwalająca testować szczegółową warstwę WMS
    const resolution = 156543.03392804097 / (2 ** zoom);
    const r = 128 * resolution;
    const qs = new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.3.0', REQUEST: 'GetFeatureInfo',
      LAYERS: '17', QUERY_LAYERS: '17', STYLES: '',
      CRS: 'EPSG:3857',
      BBOX: [p.x-r, p.y-r, p.x+r, p.y+r].join(','),
      WIDTH: '256', HEIGHT: '256', I: '128', J: '128',
      INFO_FORMAT: 'application/geojson', FEATURE_COUNT: '10',
      FORMAT: 'image/png', TRANSPARENT: 'TRUE'
    });
    return url + '?' + qs.toString();
  }

  for (const scenario of scenarios) {
    const toggle = document.getElementById(scenario.toggleId);
    const result = document.getElementById(scenario.resultId);
    if (!toggle || !result) {
      console.warn('Powodzie: brak elementu', scenario.toggleId, scenario.resultId);
      continue;
    }

    const overlay = L.tileLayer.wms(scenario.url, {
      layers: '16,17', format: 'image/png', transparent: true,
      version: '1.3.0', opacity: 0.7, pane: 'floodWmsPane',
      attribution: 'PGW Wody Polskie — ' + scenario.label
    });
    overlay.on('tileerror', e => console.warn('WMS — błąd kafelka ' + scenario.label, e));
    const syncVisibility = () => toggle.checked ? overlay.addTo(map) : map.removeLayer(overlay);
    toggle.addEventListener('change', syncVisibility);
    syncVisibility();

    let seq = 0;
    let controller = null;
    const setStatus = (message, level='unknown') => {
      result.textContent = message;
      result.dataset.level = level;
    };

    async function assess(lat, lon) {
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const current = ++seq;
      if (controller) controller.abort();
      controller = new AbortController();
      const active = controller;
      const timer = setTimeout(() => active.abort(), 15000);
      setStatus('Sprawdzanie ' + scenario.label + ' w Wodach Polskich…');
      try {
        const response = await fetch(makeFeatureInfoUrl(scenario.url, lat, lon), {
          signal: active.signal,
          headers: { Accept: 'application/geojson, application/json' }
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const raw = await response.text();
        let geojson;
        try { geojson = JSON.parse(raw); }
        catch (_) { throw new Error('Serwer nie zwrócił poprawnego JSON (możliwy błąd WMS).'); }
        if (current !== seq) return;
        if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
          throw new Error('Nieoczekiwana struktura odpowiedzi GetFeatureInfo.');
        }
        if (geojson.features.length > 0) {
          setStatus('TAK — WMS zwrócił obiekt strefy ' + scenario.label + ' dla wskazanego punktu. Wynik orientacyjny.', 'yes');
        } else {
          setStatus('NIE WYKRYTO — WMS nie zwrócił obiektu ' + scenario.label + '. To nie potwierdza braku zagrożenia.', 'no');
        }
      } catch (err) {
        if (current !== seq) return;
        console.warn('GetFeatureInfo ' + scenario.label + ':', err);
        setStatus('NIE USTALONO — brak możliwej do odczytania odpowiedzi ' + scenario.label + ' (CORS, serwer lub format).', 'unknown');
      } finally {
        clearTimeout(timer);
        if (current === seq) controller = null;
      }
    }

    map.on('click', e => assess(e.latlng.lat, e.latlng.lng));
    document.addEventListener('drk:location-selected', e => {
      const lat = Number(e.detail?.lat), lon = Number(e.detail?.lon);
      assess(lat, lon);
    });
    document.getElementById('resetBtn')?.addEventListener('click', () => {
      ++seq;
      if (controller) controller.abort();
      setStatus('Kliknij mapę lub wyszukaj adres.');
    });
  }
})();
