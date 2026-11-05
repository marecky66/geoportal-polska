'use strict';
// Przecięcie punktu z GeoJSON buforów 30 km i z aktualną warstwą miast.
// FUA analizuje osobny istniejący moduł fua.js.
(() => {
  const bufferResult = document.getElementById('bufferResult');
  const cityResult = document.getElementById('cityResult');
  if (!bufferResult || !cityResult || typeof turf === 'undefined' || typeof map === 'undefined') {
    console.error('administracja.js: brak kontrolek, Turf.js lub mapy.');
    return;
  }
  const states = { buffer: null, cities: null };
  let lastPoint = null;
  let generation = 0;
  const update = (el, message, level = 'unknown') => {
    el.textContent = message;
    el.dataset.level = level;
  };
  function contains(data, point) {
    if (!data || !Array.isArray(data.features)) return null;
    return data.features.find(f => f.geometry &&
      (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') &&
      turf.booleanPointInPolygon(point, f));
  }
  function evaluate(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    lastPoint = { lat, lon };
    const point = turf.point([lon, lat]);
    if (states.buffer) {
      try {
        const feature = contains(states.buffer, point);
        update(bufferResult, feature ? 'TAK — w buforze 30 km' : 'NIE — poza buforami 30 km', feature ? 'yes' : 'no');
      } catch (error) {
        console.error('Błąd oceny buforów', error);
        update(bufferResult, 'BRAK MOŻLIWOŚCI OCENY');
      }
    } else {
      update(bufferResult, 'WCZYTYWANIE WARSTWY...');
    }
    if (states.cities) {
      try {
        const feature = contains(states.cities, point);
        if (feature) {
          const props = feature.properties || {};
          const name = props.JPT_NAZWA_ || props.name || props.nazwa || 'miasto';
          update(cityResult, 'TAK — ' + String(name) + ' (w warstwie miast)', 'yes');
        } else {
          update(cityResult, 'NIE WYKRYTO w warstwie miast (niepełny wykaz miast wojewódzkich)', 'unknown');
        }
      } catch (error) {
        console.error('Błąd oceny miast', error);
        update(cityResult, 'BRAK MOŻLIWOŚCI OCENY');
      }
    } else {
      update(cityResult, 'WCZYTYWANIE WARSTWY...');
    }
  }
  async function load(path, key, output) {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error('Oczekiwano GeoJSON FeatureCollection');
      }
      states[key] = data;
      if (lastPoint) evaluate(lastPoint.lat, lastPoint.lon);
    } catch (error) {
      console.error('Błąd danych administracyjnych: ' + path, error);
      states[key] = null;
      update(output, 'BRAK DANYCH — nie udało się wczytać warstwy');
    }
  }
  load('./moja_warstwa.geojson', 'buffer', bufferResult);
  load('./miasta_300tys.geojson', 'cities', cityResult);
  map.on('click', e => evaluate(e.latlng.lat, e.latlng.lng));
  document.addEventListener('drk:location-selected', e => {
    evaluate(Number(e.detail?.lat), Number(e.detail?.lon));
  });
  document.getElementById('resetBtn')?.addEventListener('click', () => {
    lastPoint = null;
    ++generation;
    update(bufferResult, 'NIE SPRAWDZONO');
    update(cityResult, 'NIE SPRAWDZONO');
  });
})();
