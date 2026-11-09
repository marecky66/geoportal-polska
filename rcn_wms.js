'use strict';
// Geoportal DRK: WMS RCN GUGiK — wizualizacja i próba identyfikacji GetFeatureInfo.
// Nie pobiera transakcji do statystyk i nie realizuje doboru nieruchomości podobnych.
(() => {
  if (typeof L === 'undefined' || typeof map === 'undefined') return;
  const ENDPOINT = 'https://mapy.geoportal.gov.pl/wss/service/rcn';
  const entries = [
    ['rcnPlotsToggle', 'dzialki', 'działki'],
    ['rcnBuildingsToggle', 'budynki', 'budynki'],
    ['rcnUnitsToggle', 'lokale', 'lokale']
  ];
  const status = document.getElementById('rcnStatus');
  const results = document.getElementById('rcnResults');
  const clear = document.getElementById('rcnClear');
  if (!status || !results || !clear) return;

  map.createPane('rcnPane');
  const pane = map.getPane('rcnPane');
  pane.style.zIndex = '540';
  pane.style.pointerEvents = 'none';

  const layers = new Map();
  for (const [id, name] of entries) {
    const checkbox = document.getElementById(id);
    if (!checkbox) continue;
    // WMS w krajowej usłudze RCN: nazwy warstw zwyczajowo dzialki / budynki / lokale.
    const layer = L.tileLayer.wms(ENDPOINT, {
      layers: name,
      format: 'image/png', transparent: true,
      version: '1.1.1', styles: '', pane: 'rcnPane',
      attribution: 'RCN © GUGiK', opacity: 0.85
    });
    layers.set(id, layer);
    checkbox.checked = false;
    checkbox.addEventListener('change', () => {
      checkbox.checked ? layer.addTo(map) : map.removeLayer(layer);
      if (checkbox.checked && map.getZoom() < 14) {
        status.textContent = 'Przybliż mapę do nieruchomości — RCN prezentuje obiekty dopiero w dużej skali (ok. 1:5000).';
      }
    });
    layer.on('tileerror', () => {
      status.textContent = 'Nie udało się pobrać części obrazu WMS RCN. Sprawdź dostępność usługi GUGiK i nazwy warstw.';
    });
  }

  let ticket = 0;
  function reset() {
    ticket++;
    results.textContent = 'Nie wybrano transakcji.';
    results.dataset.level = 'unknown';
    status.textContent = 'Włącz warstwę RCN i kliknij obiekt transakcji na mapie.';
    status.dataset.level = 'unknown';
  }
  clear.addEventListener('click', reset);
  document.getElementById('resetBtn')?.addEventListener('click', reset);

  function plainText(text) {
    // Wyświetlamy wyłącznie tekst — nigdy nie wstawiamy HTML serwera do strony.
    if (/<\s*(?:html|body|table|div|p|span|br|h[1-6])\b/i.test(text)) {
      const doc = new DOMParser().parseFromString(text, 'text/html');
      return (doc.body?.innerText || doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
    }
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function buildUrl(layer, latlng) {
    const bounds = map.getBounds();
    const sw = map.options.crs.project(bounds.getSouthWest());
    const ne = map.options.crs.project(bounds.getNorthEast());
    const p = map.latLngToContainerPoint(latlng);
    const size = map.getSize();
    const params = new URLSearchParams({
      SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo',
      LAYERS: layer, QUERY_LAYERS: layer, STYLES: '',
      SRS: 'EPSG:3857', BBOX: `${sw.x},${sw.y},${ne.x},${ne.y}`,
      WIDTH: String(size.x), HEIGHT: String(size.y),
      X: String(Math.round(p.x)), Y: String(Math.round(p.y)),
      FORMAT: 'image/png', INFO_FORMAT: 'text/html', FEATURE_COUNT: '5'
    });
    return ENDPOINT + '?' + params.toString();
  }

  map.on('click', async (event) => {
    if (document.getElementById('tabRcn')?.getAttribute('aria-selected') !== 'true') return;
    const enabled = entries.filter(([id]) => document.getElementById(id)?.checked);
    if (!enabled.length) {
      status.textContent = 'Włącz co najmniej jedną warstwę RCN w prawym panelu.';
      return;
    }
    if (map.getZoom() < 14) {
      status.textContent = 'Przybliż mapę (wymagana skala ok. 1:5000), a następnie kliknij transakcję.';
      return;
    }
    const current = ++ticket;
    status.textContent = 'Pobieranie informacji RCN (GetFeatureInfo)…';
    results.textContent = 'Trwa identyfikacja…';
    try {
      const answers = await Promise.all(enabled.map(async ([,name,label]) => {
        const response = await fetch(buildUrl(name, event.latlng));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { label, body: plainText(await response.text()) };
      }));
      if (current !== ticket) return;
      const found = answers.filter(x => x.body && !/^(no features|no results|brak obiekt|brak wynik)/i.test(x.body));
      if (!found.length) {
        results.textContent = 'W tym punkcie nie znaleziono informacji o transakcji w aktywnych warstwach.';
      } else {
        results.textContent = found.map(x => `RCN — ${x.label}:\n${x.body}`).join('\n\n');
      }
      status.textContent = 'Odczyt zakończony. Dane udostępnia GUGiK; zweryfikuj atrybuty i zakres transakcji w źródle.';
    } catch (err) {
      if (current !== ticket) return;
      console.warn('RCN GetFeatureInfo:', err);
      status.textContent = 'Nie udało się odczytać atrybutów RCN (usługa może blokować odczyt z przeglądarki — CORS — albo nie obsługiwać wybranego formatu).';
      results.textContent = 'Warstwy mapowe mogą nadal działać. Dane transakcyjne możemy później pobierać przez własne API/WFS.';
    }
  });
})();
