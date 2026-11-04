'use strict';
/* Geoportal DRK: nakładka podtopień PIG dla województwa mazowieckiego.
   Wymaga obecnych zmiennych map i marker z app.js (zwykłe skrypty, bez type=module).
   Wymaga Turf.js i pliku data/PodtopieniaMaz.geojson.
*/
(() => {
  const checkbox = document.getElementById('floodingToggle');
  const result = document.getElementById('floodingResult');
  const DATA_URL = 'data/PodtopieniaMaz.geojson';
  let features = [];
  let layer = null;
  let loaded = false;
  let clickMarker = null;
  let lastAnalyzedMarker = null;
  let lastAnalyzedCoords = null;

  function setResult(message, level = 'unknown') {
    result.textContent = message;
    result.dataset.level = level;
  }

  function formatCoords(p) {
    return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  }

  function checkPoint(p) {
    if (!loaded) {
      setResult('Warstwa podtopień nie została jeszcze wczytana — nie można ocenić lokalizacji.');
      return;
    }
    if (!window.turf || !window.turf.booleanPointInPolygon) {
      setResult('Nie można wykonać analizy: biblioteka Turf nie jest dostępna.');
      return;
    }
    const pt = window.turf.point([p.lng, p.lat]);
    let hit = false;
    try {
      for (const feature of features) {
        if (!feature?.geometry) continue;
        const t = feature.geometry.type;
        if (t !== 'Polygon' && t !== 'MultiPolygon') continue;
        if (window.turf.booleanPointInPolygon(pt, feature, { ignoreBoundary: false })) {
          hit = true;
          break;
        }
      }
    } catch (e) {
      console.error('Błąd analizy geometrii:', e);
      setResult('Nie udało się ocenić lokalizacji z powodu błędu geometrii.');
      return;
    }
    if (hit) {
      setResult(`TAK — punkt (${formatCoords(p)}) znajduje się w poligonie podtopień PIG.`, 'yes');
    } else {
      setResult(`NIE WYKRYTO — punkt (${formatCoords(p)}) nie przecina poligonów wczytanej warstwy. Dane obejmują tylko Mazowsze; poza zakresem danych wynik nie oznacza braku zagrożenia.`, 'no');
    }
  }

  // Kliknięcie mapy ocenia dokładnie wskazany punkt, bez zmiany istniejącego adresu.
  map.on('click', (e) => {
    if (!clickMarker) {
      clickMarker = L.circleMarker(e.latlng, { radius: 7, color: '#15384d', weight: 2, fillColor: '#ffffff', fillOpacity: 1 }).addTo(map);
    } else {
      clickMarker.setLatLng(e.latlng);
    }
    checkPoint(e.latlng);
  });

  // Oryginalna wyszukiwarka w app.js tworzy marker i ustawia widok.
  // Po jej zakończeniu zdarzenie moveend pozwala ocenić współrzędne markera.
  map.on('moveend', () => {
    if (typeof marker === 'undefined' || !marker) return;
    const pos = marker.getLatLng();
    const coords = `${pos.lat},${pos.lng}`;
    if (marker === lastAnalyzedMarker && coords === lastAnalyzedCoords) return;
    lastAnalyzedMarker = marker;
    lastAnalyzedCoords = coords;
    if (clickMarker) { map.removeLayer(clickMarker); clickMarker = null; }
    checkPoint(pos);
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (clickMarker) { map.removeLayer(clickMarker); clickMarker = null; }
    lastAnalyzedMarker = null;
    lastAnalyzedCoords = null;
    setResult('Kliknij punkt na mapie lub wyszukaj adres.');
  });

  checkbox.addEventListener('change', () => {
    if (!layer) return;
    if (checkbox.checked) layer.addTo(map);
    else map.removeLayer(layer);
  });

  async function init() {
    setResult('Wczytywanie warstwy podtopień…');
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${DATA_URL}`);
      const geojson = await response.json();
      if (!geojson || geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
        throw new Error('Plik nie zawiera prawidłowej kolekcji GeoJSON.');
      }
      features = geojson.features;
      layer = L.geoJSON(geojson, {
        interactive: false,
        style: {color: '#8b4aab', weight: 1.3, opacity: 0.9, fillColor: '#b98add', fillOpacity: 0.35}
      });
      loaded = true;
      if (checkbox.checked) layer.addTo(map);
      setResult('Warstwa gotowa. Kliknij punkt na mapie lub wyszukaj adres.');
      if (typeof marker !== 'undefined' && marker) checkPoint(marker.getLatLng());
    } catch (e) {
      console.error('Błąd wczytania warstwy podtopień:', e);
      checkbox.disabled = true;
      checkbox.checked = false;
      setResult(`Nie udało się załadować warstwy podtopień (${e.message}). Sprawdź plik ${DATA_URL}.`);
    }
  }
  init();
})();
