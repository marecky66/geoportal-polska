'use strict';
// Geoportal DRK - ICEYE powodz historyczna 2024 (publiczny WMS GUGiK).
// Dynamicznie pobiera nazwy warstw GetCapabilities, bez zgadywania identyfikatorow.
(() => {
  const mapRef = typeof map !== 'undefined' ? map : null;
  const esg = document.getElementById('moduleEsg');
  if (!mapRef || !esg || typeof L === 'undefined') return;
  if (document.getElementById('iceye2024Section')) return;

  const ENDPOINT = 'https://mapy.geoportal.gov.pl/wss/ext/ObszaryICEYE';
  const section = document.createElement('section');
  section.id = 'iceye2024Section';
  section.className = 'iceye-2024-section';
  section.innerHTML = `
    <div class="risk-heading">Powódź historyczna 2024 — ICEYE</div>
    <p class="iceye-2024-note">Dane historyczne z września 2024 r. — odrębne od map zagrożenia powodziowego Wód Polskich.</p>
    <label class="iceye-2024-label" for="iceye2024Layer">Warstwa / obserwacja ICEYE</label>
    <select id="iceye2024Layer" disabled><option value="">Ładowanie warstw GUGiK…</option></select>
    <label class="iceye-2024-check"><input type="checkbox" id="iceye2024Visible" disabled> Pokaż wybraną warstwę na mapie</label>
    <div class="risk-title">Ocena historycznego zalania — ICEYE</div>
    <div id="iceye2024Result" class="risk-box" data-level="unknown" aria-live="polite">Wczytywanie informacji o dostępnych warstwach…</div>
    <button type="button" id="iceye2024Clear" class="secondary iceye-2024-clear">Wyczyść wynik ICEYE</button>
    <p class="module-note">Źródło: GUGiK / ICEYE, powódź z września 2024 r. Brak odpowiedzi lub brak pokrycia danymi nie oznacza braku zalania. Głębokość podajemy tylko wtedy, gdy usługa jednoznacznie zwróci wartość z jednostką.</p>`;

  // Sekcja po pozostałych ocenach, ale nad notatką końcową modułu ESG.
  const tailNote = esg.querySelector('.module-note');
  if (tailNote) tailNote.before(section); else esg.append(section);
  const sel = section.querySelector('#iceye2024Layer');
  const toggle = section.querySelector('#iceye2024Visible');
  const result = section.querySelector('#iceye2024Result');
  const clear = section.querySelector('#iceye2024Clear');
  let wms = null, layers = [], currentPoint = null, ticket = 0;

  function setResult(message, level = 'unknown') {
    result.textContent = message; result.dataset.level = level;
  }
  function activeLayer() { return layers.find(l => l.name === sel.value); }
  function removeMapLayer() { if (wms) mapRef.removeLayer(wms); wms = null; }
  function drawLayer() {
    removeMapLayer();
    if (!toggle.checked || !sel.value) return;
    wms = L.tileLayer.wms(ENDPOINT, {
      layers: sel.value, format: 'image/png', transparent: true,
      version: '1.1.1', opacity: 0.65,
      attribution: 'ICEYE / GUGiK — powódź 2024'
    }).addTo(mapRef);
  }

  function directChildText(node, name) {
    return [...node.children].find(c => c.localName === name)?.textContent?.trim() || '';
  }
  function parseCapabilities(xml) {
    const root = xml.documentElement;
    if (!root || xml.getElementsByTagName('parsererror').length ||
        !/WMS_Capabilities|WMT_MS_Capabilities/.test(root.localName)) {
      throw new Error('Serwer nie zwrócił poprawnego WMS GetCapabilities.');
    }
    const candidates = [...xml.getElementsByTagName('*')].filter(e => e.localName === 'Layer');
    return candidates.map(node => {
      const name = directChildText(node, 'Name');
      if (!name) return null;
      const title = directChildText(node, 'Title') || name;
      let queryable = false;
      // queryable moze dziedziczyc z nadrzednego Layer.
      for (let el = node; el; el = el.parentElement) {
        if (el.localName === 'Layer' && el.hasAttribute('queryable')) {
          queryable = el.getAttribute('queryable') === '1'; break;
        }
      }
      return { name, title, queryable };
    }).filter(Boolean);
  }
  async function init() {
    try {
      const url = new URL(ENDPOINT);
      url.search = new URLSearchParams({ SERVICE:'WMS', REQUEST:'GetCapabilities' });
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('HTTP '+response.status);
      const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
      layers = parseCapabilities(xml);
      if (!layers.length) throw new Error('WMS nie zgłosił nazwanych warstw.');
      sel.replaceChildren();
      layers.forEach(l => {
        const opt = document.createElement('option'); opt.value = l.name;
        opt.textContent = l.title; sel.append(opt);
      });
      sel.disabled = false; toggle.disabled = false;
      setResult('Wybierz obserwację i wskaż punkt na mapie lub wyszukaj adres.');
    } catch (e) {
      console.warn('ICEYE WMS GetCapabilities:', e);
      sel.replaceChildren(new Option('Nie udało się pobrać listy warstw', ''));
      setResult('Nie można pobrać metadanych WMS ICEYE (usługa lub CORS). Warstwy nie zostały podłączone.');
    }
  }
  function parseDepth(body) {
    // Nigdy nie interpretujemy przypadkowej liczby jako glebokosci.
    const match = body.match(/(?:g[łl]ęboko[śs][ćc]|water\s*depth|flood\s*depth|depth)\s*(?:wody)?\s*[:=<>-]?\s*(\d+(?:[.,]\d+)?)\s*(m|cm)\b/i);
    if (!match) return null;
    const value = Number(match[1].replace(',','.'));
    if (!Number.isFinite(value)) return null;
    return match[2].toLowerCase() === 'cm' ? value / 100 : value;
  }
  async function assess(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    currentPoint = {lat,lon};
    const seq = ++ticket;
    const lyr = activeLayer();
    if (!lyr) {setResult('Wybierz warstwę ICEYE, aby sprawdzić lokalizację.'); return;}
    if (!lyr.queryable) {
      setResult('Wybrana warstwa WMS nie udostępnia identyfikacji punktowej (GetFeatureInfo). Można ją oglądać na mapie, ale nie można potwierdzić głębokości.');
      return;
    }
    setResult('Sprawdzanie informacji dla wskazanej lokalizacji…');
    // Parametry GetFeatureInfo odpowiadaja WMS 1.1.1 w EPSG:3857.
    const p = L.CRS.EPSG3857.project(L.latLng(lat,lon));
    const offset = 15; const bbox = [p.x-offset,p.y-offset,p.x+offset,p.y+offset].join(',');
    const q = new URLSearchParams({SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetFeatureInfo',
      LAYERS:lyr.name,QUERY_LAYERS:lyr.name,STYLES:'',SRS:'EPSG:3857',
      BBOX:bbox,WIDTH:'101',HEIGHT:'101',X:'50',Y:'50',FEATURE_COUNT:'10',INFO_FORMAT:'text/plain'});
    try {
      const res = await fetch(ENDPOINT+'?'+q);
      if (!res.ok) throw new Error('HTTP '+res.status);
      const body = await res.text();
      if (seq !== ticket) return;
      if (/(ServiceException|ExceptionReport|InvalidFormat)/i.test(body.slice(0,600)))
        throw new Error('WMS odrzucił format lub zapytanie GetFeatureInfo');
      const depth = parseDepth(body);
      if (depth !== null) {
        setResult('WYKRYTO INFORMACJĘ O GŁĘBOKOŚCI: '+ depth.toLocaleString('pl-PL',{maximumFractionDigits:2}) + ' m. Warstwa: '+lyr.title, 'yes');
      } else {
        setResult('Brak jednoznacznej głębokości w odpowiedzi WMS dla punktu. Nie można potwierdzić ani wykluczyć zalania.');
        console.info('ICEYE GetFeatureInfo (do weryfikacji metody):', body.slice(0,1200));
      }
    } catch (error) {
      if (seq !== ticket) return;
      console.warn('ICEYE GetFeatureInfo:', error);
      setResult('Nie udało się pobrać oceny punktu z WMS ICEYE. Nie oznacza to braku zalania.');
    }
  }
  sel.addEventListener('change', () => { ++ticket; drawLayer(); if(currentPoint)assess(currentPoint.lat,currentPoint.lon); });
  toggle.addEventListener('change', drawLayer);
  clear.addEventListener('click', () => {++ticket;currentPoint=null;setResult('Wyszukaj adres lub kliknij mapę, aby sprawdzić lokalizację.');});
  document.addEventListener('drk:location-selected', e => assess(Number(e.detail?.lat), Number(e.detail?.lon)));
  mapRef.on('click', e => assess(e.latlng.lat, e.latlng.lng));
  document.getElementById('resetBtn')?.addEventListener('click',()=>{++ticket;currentPoint=null;setResult('Wyszukaj adres lub kliknij mapę, aby sprawdzić lokalizację.');});
  init();
})();
