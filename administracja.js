
'use strict';

// Geoportal DRK — ocena administracyjna lokalizacji
(() => {
  const bufferResult = document.getElementById('bufferResult');
  const cityResult = document.getElementById('cityResult');

  if (!bufferResult || !cityResult ||
      typeof turf === 'undefined' ||
      typeof map === 'undefined') {
    console.error('administracja.js: brak wymaganych elementów.');
    return;
  }

  const states = {
    buffer: null,
    cities: null
  };

  let lastPoint = null;

  function update(element, message, level = 'unknown') {
    element.textContent = message;
    element.dataset.level = level;
  }

  function contains(data, point) {
    if (!data || !Array.isArray(data.features)) return null;

    return data.features.find(feature =>
      feature.geometry &&
      ['Polygon', 'MultiPolygon'].includes(feature.geometry.type) &&
      turf.booleanPointInPolygon(point, feature)
    );
  }

  // Ocena wskazanej lokalizacji
  function evaluate(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    lastPoint = { lat, lon };
    const point = turf.point([lon, lat]);

    // Bufory 30 km
    if (states.buffer) {
      try {
        const feature = contains(states.buffer, point);

        update(
          bufferResult,
          feature
            ? 'TAK — w buforze 30 km'
            : 'NIE — poza buforami 30 km',
          feature ? 'ok' : 'bad'
        );

      } catch (error) {
        console.error('Błąd oceny buforów:', error);
        update(bufferResult, 'BRAK MOŻLIWOŚCI OCENY');
      }
    } else {
      update(bufferResult, 'WCZYTYWANIE DANYCH...');
    }

    // Miasta z dostępnej warstwy
    if (states.cities) {
      try {
        const feature = contains(states.cities, point);

        update(
          cityResult,
          feature ? 'TAK' : 'NIE',
          feature ? 'ok' : 'bad'
        );

      } catch (error) {
        console.error('Błąd oceny miasta:', error);
        update(cityResult, 'BRAK MOŻLIWOŚCI OCENY');
      }
    } else {
      update(cityResult, 'WCZYTYWANIE DANYCH...');
    }
  }

  // Wczytywanie GeoJSON
  async function load(path, key, output) {
    try {
      const response = await fetch(path);

      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }

      const data = await response.json();

      if (data.type !== 'FeatureCollection' ||
          !Array.isArray(data.features)) {
        throw new Error('Nieprawidłowy GeoJSON');
      }

      states[key] = data;

      if (lastPoint) {
        evaluate(lastPoint.lat, lastPoint.lon);
      }

    } catch (error) {
      console.error('Błąd ładowania: ' + path, error);
      states[key] = null;
      update(output, 'BRAK DANYCH');
    }
  }

  // Ładowanie warstw
  load('./moja_warstwa.geojson', 'buffer', bufferResult);
  load('./miasta_300tys.geojson', 'cities', cityResult);

  // Kliknięcie na mapie
  map.on('click', event => {
    evaluate(event.latlng.lat, event.latlng.lng);
  });

  // Wyszukanie adresu
  document.addEventListener('drk:location-selected', event => {
    evaluate(
      Number(event.detail?.lat),
      Number(event.detail?.lon)
    );
  });

  // Reset analizy
  document.getElementById('resetBtn')
    ?.addEventListener('click', () => {
      lastPoint = null;
      update(bufferResult, 'NIE SPRAWDZONO');
      update(cityResult, 'NIE SPRAWDZONO');
    });
})();
