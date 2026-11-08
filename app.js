'use strict';
// Publiczne serwery OSM i Nominatim służą wyłącznie do małego projektu demonstracyjnego.


const POLAND_VIEW = L.latLngBounds(
  [49.0, 14.0],
  [54.9, 24.3]
);

// Obszar, po którym można przesuwać mapę
// Polska i niewielkie otoczenie
const MAP_LIMITS = L.latLngBounds(
  [47.5, 12.0],
  [56.0, 26.5]
);

const map = L.map('map', {
  zoomControl: true,
  maxZoom: 19,
  maxBounds: MAP_LIMITS,
  maxBoundsViscosity: 1.0,
  zoomSnap: 0.1
});

// Początkowy widok Polski
map.fitBounds(POLAND_VIEW, {
  padding: [15, 15]
});

// Największe dopuszczalne oddalenie
const START_ZOOM = map.getZoom();
map.setMinZoom(START_ZOOM);

console.log('Minimalny zoom:', map.getMinZoom());



/* Podkłady mapowe */


const basemaps = {

  osm: L.tileLayer(
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }
  ),

  satelita: L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri and contributors'
    }
  ),

  // GUGiK — standardowa ortofotomapa

gugik: L.tileLayer(
  'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMTS/StandardResolution' +
  '?SERVICE=WMTS' +
  '&REQUEST=GetTile' +
  '&VERSION=1.0.0' +
  '&LAYER=ORTOFOTOMAPA' +
  '&STYLE=default' +
  '&TILEMATRIXSET=EPSG:3857' +
  '&TILEMATRIX={z}' +
  '&TILEROW={y}' +
  '&TILECOL={x}' +
  '&FORMAT=image/jpeg',
  {
    maxZoom: 19,
    maxNativeZoom: 18,
    tileSize: 256,
    attribution: 'Ortofotomapa © GUGiK'
  }
),


  // GUGiK — wysoka rozdzielczość
  gugikHD: L.tileLayer.wms(
    'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/HighResolution',
    {
      layers: '3,2,1',
      format: 'image/png',
      transparent: false,
      version: '1.1.1',
      attribution: 'Ortofotomapa HD &copy; GUGiK'
    }
  )
};


// Domyślny podkład
basemaps.osm.addTo(map);

// Zmiana podkładu
function changeBasemap(name) {
  Object.values(basemaps).forEach(layer => {
    if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });


if (basemaps[name]) {
  basemaps[name].addTo(map);
  basemaps[name].bringToBack();
}

}
document.getElementById('basemapSelect')
  .addEventListener('change', function () {
    changeBasemap(this.value);
  });

L.control.scale({ imperial: false }).addTo(map);
const statusEl = document.getElementById('message');
const borderToggle = document.getElementById('borderToggle');
const layerToggle = document.getElementById('layerToggle');
layerToggle.checked = false;
let borderLayer = null, qgisLayer = null, marker = null;
const showStatus = (text) => { statusEl.textContent = text; };
const safeText = (value) => String(value ?? '').slice(0, 250);
async function loadGeoJSON(path) {
 const response = await fetch(path);
 if (!response.ok) throw new Error(`Nie udało się pobrać ${path} (HTTP ${response.status})`);
 return response.json();
}

async function initLayers() {

  // Granica Polski
  try {
    const borders = await loadGeoJSON('data/granica_polski.geojson');

    borderLayer = L.geoJSON(borders, {
      interactive: false,
      style: {
        color: '#df3554',
        weight: 2.5,
        opacity: 0.9,
        fillOpacity: 0
      }
    });

    if (borderToggle.checked) {
      borderLayer.addTo(map);
    }

  } catch (e) {
    borderToggle.disabled = true;
    showStatus('Błąd wczytania granicy Polski.');
    console.error(e);
  }

  // Bufory 30 km
  try {
    const data = await loadGeoJSON('moja_warstwa.geojson');

    qgisLayer = L.geoJSON(data, {
      style: {
        color: '#964B00',
        weight: 2,
        fillColor: '#d99555',
        fillOpacity: 0.35
      },

      pointToLayer: (_feature, latlng) =>
        L.circleMarker(latlng, {
          radius: 7,
          color: '#066d68',
          fillColor: '#18a999',
          fillOpacity: 0.8
        }),

      onEachFeature(feature, layer) {
        layer.bindPopup(
          '<strong>Odległość 30 km od granic miast powyżej 300 tys. mieszk.</strong>'
        );
      }
    });

    // Bufory domyślnie wyłączone
    layerToggle.checked = false;

    if (map.hasLayer(qgisLayer)) {
      map.removeLayer(qgisLayer);
    }

  } catch (e) {
    layerToggle.disabled = true;
    showStatus('Błąd wczytywania buforów: ' + e.message);
    console.error(e);
  }
}

borderToggle.addEventListener('change', () => { if(borderLayer) borderToggle.checked? borderLayer.addTo(map):map.removeLayer(borderLayer); });
layerToggle.addEventListener('change', () => { if(qgisLayer) layerToggle.checked? qgisLayer.addTo(map):map.removeLayer(qgisLayer); });
document.getElementById('resetBtn').addEventListener('click', () => {
 if(marker){map.removeLayer(marker);marker=null;}
 document.getElementById('address').value=''; showStatus('');
 
if (clickedMarker) {
  map.removeLayer(clickedMarker);
  clickedMarker = null;
}

  map.fitBounds(POLAND_VIEW, {padding:[15,15]});
});
const cache = new Map();
let lastSearchAt = 0;
document.getElementById('searchForm').addEventListener('submit', async event => {
 event.preventDefault();
 const input = document.getElementById('address').value.trim();
 if(input.length < 3) {showStatus('Podaj co najmniej 3 znaki.');return;}
 const searchBtn = document.getElementById('searchBtn');
 if(searchBtn.disabled)return;
 if(Date.now()-lastSearchAt < 1100 && !cache.has(input.toLowerCase())) {showStatus('Odczekaj chwilę przed kolejnym wyszukiwaniem.'); return;}
 searchBtn.disabled = true;showStatus('Wyszukiwanie adresu…');
 try {
  let results = cache.get(input.toLowerCase());
  if(!results){
   lastSearchAt=Date.now();
   const params = new URLSearchParams({q:input,format:'jsonv2',limit:'5',countrycodes:'pl',addressdetails:'1'});
   const response=await fetch(`https://nominatim.openstreetmap.org/search?${params}`,{headers:{'Accept':'application/json'}});
   if(!response.ok) throw new Error('Serwis adresowy jest chwilowo niedostępny.');
   results=await response.json();cache.set(input.toLowerCase(),results);
  }
  if(!results.length){showStatus('Nie znaleziono adresu. Spróbuj podać miasto i ulicę.');return;}
  const result=results[0], lat=Number(result.lat),lon=Number(result.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error('Nieprawidłowe współrzędne adresu.');
  if(marker)map.removeLayer(marker);
  marker=L.marker([lat,lon]).addTo(map);
  const label = document.createElement('div');label.textContent = safeText(result.display_name);
  marker.bindPopup(label).openPopup();


map.setView([lat, lon], 17, { animate: true });

document.dispatchEvent(
  new CustomEvent('drk:location-selected', {
    detail: { lat, lon }
  })
);

showStatus('');

 } catch(e){showStatus(e.message || 'Nie udało się wyszukać adresu.'); console.error(e);}
 finally {searchBtn.disabled=false;}
    });

initLayers();
let citiesLayer = null;

const citiesToggle = document.getElementById('citiesToggle');

async function loadCities() {
  try {
    const response = await fetch('./miasta_300tys.geojson');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

const data = await response.json();

// Osobna warstwa rysowania dla miast
if (!map.getPane('citiesPane')) {
  map.createPane('citiesPane');
  map.getPane('citiesPane').style.zIndex = 450;
}

citiesLayer = L.geoJSON(data, {
  pane: 'citiesPane',
      style: {
        color: '#0055AA',
        weight: 2,
        fillColor: '#3399FF',
        fillOpacity: 0.45
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties || {};
        const name = props.JPT_NAZWA_ || props.name || 'Miasto';
        layer.bindPopup(String(name));
      }
    });

 if (citiesToggle.checked) {
  citiesLayer.addTo(map);
  citiesLayer.bringToFront();
}

    console.log('Warstwa miast została wczytana.');

  } catch (error) {
    console.error('Błąd wczytywania miast:', error);
    citiesToggle.checked = false;
    citiesToggle.disabled = true;
    showStatus('Nie udało się wczytać warstwy miast.');
  }
}

citiesToggle.addEventListener('change', () => {
  if (!citiesLayer) return;

  if (citiesToggle.checked) {
    citiesLayer.addTo(map);
  } else {
    map.removeLayer(citiesLayer);
  }
});

loadCities();


/* Oznaczenie punktu kliknięcia na mapie */


/* Oznaczenie analizowanego punktu */

// Osobna warstwa nad wszystkimi WMS
map.createPane('analysisMarkerPane');
map.getPane('analysisMarkerPane').style.zIndex = 700;
map.getPane('analysisMarkerPane').style.pointerEvents = 'none';

let clickedMarker = null;

function showClickedMarker(lat, lon) {
  if (clickedMarker) {
    map.removeLayer(clickedMarker);
  }

  clickedMarker = L.circleMarker([lat, lon], {
    pane: 'analysisMarkerPane',
    radius: 9,
    color: '#ffffff',
    weight: 3,
    fillColor: '#e63946',
    fillOpacity: 1,
    interactive: false
  }).addTo(map);

  console.log('Zaznaczono punkt:', lat, lon);
}

// Kliknięcie w mapę
map.on('click', function (e) {
  showClickedMarker(e.latlng.lat, e.latlng.lng);
});

// Wyszukanie adresu
document.addEventListener('drk:location-selected', function (e) {
  const lat = Number(e.detail?.lat);
  const lon = Number(e.detail?.lon);

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    showClickedMarker(lat, lon);
  }
});
