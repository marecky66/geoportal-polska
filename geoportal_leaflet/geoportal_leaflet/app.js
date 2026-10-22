'use strict';
// Publiczne serwery OSM i Nominatim służą wyłącznie do małego projektu demonstracyjnego.
const map = L.map('map', { zoomControl: true, maxZoom: 19 });
const POLAND_VIEW = [[49.0, 14.0], [54.9, 24.3]];
map.fitBounds(POLAND_VIEW, { padding: [15, 15] });
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
  maxZoom: 19
}).addTo(map);
L.control.scale({ imperial: false }).addTo(map);
const statusEl = document.getElementById('message');
const borderToggle = document.getElementById('borderToggle');
const layerToggle = document.getElementById('layerToggle');
let borderLayer = null, qgisLayer = null, marker = null;
const showStatus = (text) => { statusEl.textContent = text; };
const safeText = (value) => String(value ?? '').slice(0, 250);
async function loadGeoJSON(path) {
 const response = await fetch(path);
 if (!response.ok) throw new Error(`Nie udało się pobrać ${path} (HTTP ${response.status})`);
 return response.json();
}
async function initLayers() {
 try {
  const borders = await loadGeoJSON('data/granica_polski.geojson');
  borderLayer = L.geoJSON(borders, { interactive: false, style: { color:'#df3554', weight:2.5, opacity:.9, fillOpacity:0 }});
  if (borderToggle.checked) borderLayer.addTo(map);
 } catch(e) { borderToggle.disabled=true; showStatus('Błąd wczytania granicy Polski.'); console.error(e); }
 try {
  const data = await loadGeoJSON('data/moja_warstwa.geojson');
  qgisLayer = L.geoJSON(data, {
   style: { color:'#066d68', weight:2, fillColor:'#18a999', fillOpacity:.3 },
   pointToLayer: (_feature, latlng) => L.circleMarker(latlng, { radius:7,color:'#066d68', fillColor:'#18a999',fillOpacity:.8 }),
   onEachFeature(feature, layer) {
    const properties = feature.properties || {};
    const summary = Object.entries(properties).slice(0, 12).map(([k,v]) => `${safeText(k)}: ${safeText(v)}`).join('\n');
    if (summary) layer.bindPopup(document.createTextNode(summary));
   }
  });
  if(layerToggle.checked)qgisLayer.addTo(map);
 } catch(e) { layerToggle.disabled=true; showStatus('Błąd wczytania warstwy QGIS.'); console.error(e); }
}
borderToggle.addEventListener('change', () => { if(borderLayer) borderToggle.checked? borderLayer.addTo(map):map.removeLayer(borderLayer); });
layerToggle.addEventListener('change', () => { if(qgisLayer) layerToggle.checked? qgisLayer.addTo(map):map.removeLayer(qgisLayer); });
document.getElementById('resetBtn').addEventListener('click', () => {
 if(marker){map.removeLayer(marker);marker=null;}
 document.getElementById('address').value=''; showStatus('');
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
  map.setView([lat,lon],17,{animate:true});
  showStatus('');
 } catch(e){showStatus(e.message || 'Nie udało się wyszukać adresu.'); console.error(e);}
 finally {searchBtn.disabled=false;}
});
initLayers();
