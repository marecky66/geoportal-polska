'use strict';
// Geoportal DRK: wyszukiwanie działek po pełnym identyfikatorze EGiB przez ULDK GUGiK.
// ULDK zwraca status w pierwszej linii, a geometrię WKT w kolejnej.
(() => {
  const form = document.getElementById('parcelSearchForm');
  const input = document.getElementById('parcelId');
  const button = document.getElementById('parcelSearchBtn');
  const result = document.getElementById('parcelMessage');
  if (!form || !input || !button || !result || typeof map === 'undefined' || typeof turf === 'undefined') {
    console.error('dzialki.js: brak formularza, mapy lub Turf.js.');
    return;
  }

  const setStatus = (msg) => { result.textContent = msg; };
  let parcelLayer = null;
  let requestNumber = 0;

  // Bezpieczny parser WKT: POLYGON i MULTIPOLYGON, z otworami oraz wieloma częściami.
  function splitTopLevel(content) {
    const pieces = [];
    let depth = 0, start = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '(') depth++;
      if (content[i] === ')') depth--;
      if (depth < 0) throw new Error('Uszkodzona geometria WKT.');
      if (content[i] === ',' && depth === 0) {
        pieces.push(content.slice(start, i).trim());
        start = i + 1;
      }
    }
    if (depth !== 0) throw new Error('Uszkodzona geometria WKT.');
    pieces.push(content.slice(start).trim());
    return pieces;
  }

  function unwrap(text) {
    const s = text.trim();
    if (!s.startsWith('(') || !s.endsWith(')')) {
      throw new Error('Nieprawidłowy format geometrii WKT.');
    }
    return s.slice(1, -1).trim();
  }

  function ring(text) {
    const points = splitTopLevel(unwrap(text)).map(pair => {
      const values = pair.trim().split(/\s+/).map(Number);
      if (values.length < 2 || !values.slice(0, 2).every(Number.isFinite)) {
        throw new Error('Nieprawidłowe współrzędne działki.');
      }
      return [values[0], values[1]]; // EPSG:4326 => długość, szerokość
    });
    if (points.length < 4) throw new Error('Zbyt mało punktów granicy działki.');
    return points;
  }

  function polygon(text) {
    return splitTopLevel(unwrap(text)).map(ring);
  }

  function wktToGeometry(rawWkt) {
    const wkt = rawWkt.trim().replace(/^SRID=\d+;/i, '');
    const match = /^(MULTIPOLYGON|POLYGON)\s*(?:ZM|Z|M)?\s*(\(.*\))\s*$/is.exec(wkt);
    if (!match) throw new Error('ULDK zwrócił nieobsługiwany typ geometrii.');
    const kind = match[1].toUpperCase();
    return kind === 'POLYGON'
      ? { type: 'Polygon', coordinates: polygon(match[2]) }
      : { type: 'MultiPolygon', coordinates: splitTopLevel(unwrap(match[2])).map(polygon) };
  }

  function parseULDK(body) {
    const lines = body.replace(/^\uFEFF/, '').trim().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lines[0] !== '0') {
      throw new Error('Nie znaleziono działki lub usługa ULDK zwróciła błąd (status: ' +
        (lines[0] || 'brak') + ').');
    }
    if (!lines[1]) throw new Error('ULDK nie zwrócił geometrii działki.');
    // Przy result=geom_wkt,teryt kolejne wartości w wierszu są oddzielone znakiem |.
    const [wkt, parcelId] = lines.slice(1).join('').split('|');
    return { geometry: wktToGeometry(wkt), parcelId: (parcelId || '').trim() };
  }

  function clearParcel() {
    requestNumber++;
    if (parcelLayer) {
      map.removeLayer(parcelLayer);
      parcelLayer = null;
    }
    setStatus('');
    button.disabled = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = input.value.trim().replace(/\s+/g, '');
    // Pełny identyfikator; dopuszcza numer arkusza oraz numer łamany działki.
    if (!/^\d{6}_[1-5]\.\d{4}\.(?:AR_\d+\.)?\d+(?:\/\d+)?$/i.test(id)) {
      setStatus('Podaj pełny identyfikator EGiB, np. 141201_1.0001.6509.');
      return;
    }

    const currentRequest = ++requestNumber;
    button.disabled = true;
    setStatus('Wyszukiwanie działki w ULDK...');

    const params = new URLSearchParams({
      request: 'GetParcelById',
      id,
      result: 'geom_wkt,teryt',
      srid: '4326'
    });

    try {
      const response = await fetch('https://uldk.gugik.gov.pl/?' + params.toString());
      if (!response.ok) throw new Error('Błąd HTTP ' + response.status + ' usługi ULDK.');
      const payload = parseULDK(await response.text());
      if (currentRequest !== requestNumber) return;

      const feature = {
        type: 'Feature',
        properties: { identyfikator: payload.parcelId || id },
        geometry: payload.geometry
      };
      const polygon = L.geoJSON(feature, {
        style: { color: '#e11d48', weight: 3, fillColor: '#fb7185', fillOpacity: 0.18 },
        onEachFeature: (_f, layer) => {
          const el = document.createElement('div');
          el.textContent = 'Działka: ' + (payload.parcelId || id);
          layer.bindPopup(el);
        }
      });
      const bounds = polygon.getBounds();
      if (!bounds.isValid()) throw new Error('Nieprawidłowy zasięg działki.');

      // Turf pointOnFeature zwraca punkt należący do geometrii, również dla działki wklęsłej.
      const representative = turf.pointOnFeature(feature);
      const [lon, lat] = representative.geometry.coordinates;
      if (![lat, lon].every(Number.isFinite)) throw new Error('Nie można wyznaczyć punktu działki.');

      if (parcelLayer) map.removeLayer(parcelLayer);
      parcelLayer = polygon.addTo(map);
      map.fitBounds(bounds.pad(0.8), { maxZoom: 18, padding: [40, 40] });
      setStatus('Znaleziono działkę: ' + (payload.parcelId || id));

      // Uruchamia istniejące skrypty: Administracyjny, FUA, ESG i marker punktu.
      document.dispatchEvent(new CustomEvent('drk:location-selected', {
        detail: { lat, lon }
      }));
    } catch (error) {
      if (currentRequest !== requestNumber) return;
      console.error('Wyszukiwanie działki:', error);
      setStatus(error instanceof TypeError
        ? 'Nie udało się odczytać ULDK z przeglądarki (sieć lub CORS).'
        : (error.message || 'Nie udało się znaleźć działki.'));
    } finally {
      if (currentRequest === requestNumber) button.disabled = false;
    }
  });

  document.getElementById('resetBtn')?.addEventListener('click', clearParcel);
})();
