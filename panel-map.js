'use strict';
// Geoportal DRK – obsługa prawego panelu bez ingerencji w analizy.
(() => {
  const panel = document.getElementById('mapTools');
  const toggle = document.getElementById('mapToolsToggle');
  const content = document.getElementById('mapToolsContent');
  const adminLayers = document.getElementById('rightLayersAdmin');
  const esgLayers = document.getElementById('rightLayersEsg');
  const zoomIn = document.getElementById('mapZoomIn');
  const zoomOut = document.getElementById('mapZoomOut');
  const zoomValue = document.getElementById('mapZoomValue');

  if (!panel || !toggle || !content || !adminLayers || !esgLayers ||
      !zoomIn || !zoomOut || !zoomValue || typeof map === 'undefined') {
    console.error('panel-map.js: brak elementów prawego panelu lub mapy Leaflet.');
    return;
  }

  // Usunięcie domyślnej kontrolki +/− (zastępują ją przyciski w panelu).
  if (map.zoomControl) map.zoomControl.remove();

  // Przenieś istniejącą skalę Leaflet z lewej do prawej dolnej części mapy.
  // Nie wymaga edycji app.js: zachowujemy odświeżanie skali przez Leaflet.
  const scale = document.querySelector('.leaflet-control-scale');
  const rightBottom = document.querySelector('.leaflet-bottom.leaflet-right');
  if (scale && rightBottom) rightBottom.appendChild(scale);

  // Przełączanie widoczności prawego panelu.
  function setCollapsed(collapsed) {
    content.hidden = collapsed;
    panel.classList.toggle('is-collapsed', collapsed);
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.textContent = collapsed ? 'Rozwiń' : 'Zwiń';
  }
  toggle.addEventListener('click', () => setCollapsed(!content.hidden));

  // Zmiana modułu po lewej synchronizuje grupę warstw po prawej.
  function syncModule() {
    const esgActive = document.getElementById('tabEsg')?.getAttribute('aria-selected') === 'true';
    const adminActive = document.getElementById('tabAdmin')?.getAttribute('aria-selected') === 'true';
    adminLayers.hidden = !adminActive;
    esgLayers.hidden = !esgActive;
  }
  document.getElementById('tabAdmin')?.addEventListener('click', syncModule);
  document.getElementById('tabEsg')?.addEventListener('click', syncModule);
  document.getElementById('tabDem')?.addEventListener('click', syncModule);
  syncModule();

  // Sterowanie przybliżeniem mapy.
  zoomIn.addEventListener('click', () => map.zoomIn(1));
  zoomOut.addEventListener('click', () => map.zoomOut(1));
  function syncZoom() {
    zoomValue.textContent = 'Zoom: ' + map.getZoom().toFixed(1);
    zoomIn.disabled = map.getZoom() >= map.getMaxZoom() - 0.001;
    zoomOut.disabled = map.getZoom() <= map.getMinZoom() + 0.001;
  }
  map.on('zoomend', syncZoom);
  syncZoom();

  // Nie pozwól przewijaniu prawego panelu przybliżać / przesuwać mapy.
  L.DomEvent.disableScrollPropagation(panel);
  L.DomEvent.disableClickPropagation(panel);

  // Na telefonie panel startuje zwinięty, aby nie zasłaniał mapy.
  if (window.matchMedia('(max-width: 700px)').matches) setCollapsed(true);
})();
