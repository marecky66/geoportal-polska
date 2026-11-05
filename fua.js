
'use strict';

// Geoportal DRK — FUA GUS 2024
(() => {
  const toggle = document.getElementById('fuaToggle');
  const output = document.getElementById('fuaResult');

  if (!toggle || !output) return;

  let fuaLayer = null;
  let fuaData = null;
  let lastPoint = null;

  function update(message, level = 'unknown') {
    output.textContent = message;
    output.dataset.level = level;
  }

  // Wczytanie danych FUA
  fetch('./FUA_2024.geojson')
    .then(response => {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      if (data.type !== 'FeatureCollection' ||
          !Array.isArray(data.features) ||
          data.features.length === 0) {
        throw new Error('Nieprawidłowy lub pusty GeoJSON');
      }

      fuaData = data;

      fuaLayer = L.geoJSON(data, {
        style: {
          color: '#7042a2',
          weight: 1.5,
          fillColor: '#a880d7',
          fillOpacity: 0.3
        },

        onEachFeature(feature, layer) {
          const props = feature.properties || {};
          const name = props.nazwa_fua || 'FUA';
          const gmina = props.nazwa_gminy || '';

          const popup = document.createElement('div');
          const strong = document.createElement('strong');
          strong.textContent = name;
          popup.appendChild(strong);

          if (gmina) {
            const description = document.createElement('div');
            description.textContent = 'Gmina: ' + gmina;
            popup.appendChild(description);
          }

          layer.bindPopup(popup);
        }
      });

      if (toggle.checked) fuaLayer.addTo(map);

      if (lastPoint) {
        assess(lastPoint.lat, lastPoint.lon);
      }
    })
    .catch(error => {
      console.error('Błąd FUA:', error);
      toggle.disabled = true;
      update('BRAK DANYCH — nie udało się wczytać FUA.');
    });

  // Włączanie i wyłączanie warstwy
  toggle.addEventListener('change', () => {
    if (!fuaLayer) return;

    if (toggle.checked) {
      fuaLayer.addTo(map);
    } else {
      map.removeLayer(fuaLayer);
    }
  });

  // Analiza wskazanej lokalizacji
  function assess(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    lastPoint = { lat, lon };

    if (!fuaData) {
      update('WCZYTYWANIE DANYCH FUA...');
      return;
    }

    try {
      const point = turf.point([lon, lat]);

      const match = fuaData.features.find(feature =>
        feature.geometry &&
        ['Polygon', 'MultiPolygon'].includes(feature.geometry.type) &&
        turf.booleanPointInPolygon(point, feature)
      );

      if (match) {
        const props = match.properties || {};

        const name = props.nazwa_fua || 'FUA';
        const gmina = props.nazwa_gminy || '';

        update(
          name + (gmina ? ' — gmina: ' + gmina : ''),
          'no'
        );
      } else {
        update('POZA OBSZARAMI FUA ZAWARTYMI W WARSTWIE');
      }
    } catch (error) {
      console.error('Błąd analizy FUA:', error);
      update('BRAK MOŻLIWOŚCI OCENY FUA');
    }
  }

  map.on('click', event => {
    assess(event.latlng.lat, event.latlng.lng);
  });

  document.addEventListener('drk:location-selected', event => {
    assess(Number(event.detail?.lat),
           Number(event.detail?.lon));
  });

  document.getElementById('resetBtn')
    ?.addEventListener('click', () => {
      lastPoint = null;
      update('NIE SPRAWDZONO');
    });
})();
