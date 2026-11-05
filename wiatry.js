
'use strict';

(() => {
  const toggle = document.getElementById('windToggle');
  const output = document.getElementById('windResult');

  if (!toggle || !output) return;

  let windLayer = null;
  let windData = null;

  const update = (text, level = 'unknown') => {
    output.textContent = text;
    output.dataset.level = level;
  };

  fetch('./SilneWiatry.geojson')
    .then(response => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(data => {
      windData = data;

      windLayer = L.geoJSON(data, {
        style: {
          color: '#c46b12',
          weight: 1.5,
          fillColor: '#f4a340',
          fillOpacity: 0.4
        },
        onEachFeature(feature, layer) {
          const name =
            feature.properties?.JPT_NAZWA_ ||
            'Powiat o podwyższonym zagrożeniu';

          const popup = document.createElement('div');
          popup.textContent =
            name + ' — podwyższone zagrożenie silnymi wiatrami';

          layer.bindPopup(popup);
        }
      });

      if (toggle.checked) windLayer.addTo(map);
    })
    .catch(error => {
      console.error('Błąd wczytywania warstwy wiatru:', error);
      toggle.disabled = true;
      update('BRAK DANYCH — nie można wczytać warstwy.');
    });

  toggle.addEventListener('change', () => {
    if (!windLayer) return;

    if (toggle.checked) windLayer.addTo(map);
    else map.removeLayer(windLayer);
  });

  function assess(lat, lon) {
    if (!windData) {
      update('BRAK DANYCH — warstwa nie została wczytana.');
      return;
    }

    const point = turf.point([lon, lat]);

    const inside = windData.features.some(feature => {
      if (!feature.geometry) return false;
      return turf.booleanPointInPolygon(point, feature);
    });

    if (inside) {
      update('WYKRYTO PODWYŻSZONE ZAGROŻENIE', 'yes');
    } else {
      update('POZA WYBRANYMI POWIATAMI PODWYŻSZONEGO ZAGROŻENIA', 'no');
    }
  }

  map.on('click', e => {
    assess(e.latlng.lat, e.latlng.lng);
  });

  document.addEventListener('drk:location-selected', e => {
    assess(Number(e.detail.lat), Number(e.detail.lon));
  });

  document.getElementById('resetBtn')
    .addEventListener('click', () => {
      update('Kliknij punkt na mapie lub wyszukaj adres.');
    });
})();
