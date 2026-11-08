
'use strict';

// Geoportal DRK — granice administracyjne GUGiK PRG
(() => {

  if (typeof L === 'undefined' || typeof map === 'undefined') {
    console.error('Brak Leaflet lub mapy.');
    return;
  }

  const WMS_URL =
    'https://mapy.geoportal.gov.pl/wss/service/PZGIK/PRG/WMS/AdministrativeBoundaries';

  // Osobny panel graficzny dla granic administracyjnych
  if (!map.getPane('prgPane')) {
    map.createPane('prgPane');
    map.getPane('prgPane').style.zIndex = 450;
    map.getPane('prgPane').style.pointerEvents = 'none';
  }

  function createLayer(layerName) {
    return L.tileLayer.wms(WMS_URL, {
      layers: layerName,
      styles: '',
      format: 'image/png',
      transparent: true,
      version: '1.1.1',
      pane: 'prgPane',
      attribution: 'Granice administracyjne © GUGiK / PRG'
    });
  }

  const layers = {
    wojToggle: createLayer('A01_Granice_wojewodztw'),
    powToggle: createLayer('A02_Granice_powiatow'),
    gmiToggle: createLayer('A03_Granice_gmin')
  };

  // Obsługa trzech niezależnych przełączników
  Object.entries(layers).forEach(([id, layer]) => {

    const checkbox = document.getElementById(id);

    if (!checkbox) {
      console.warn('Nie znaleziono checkboxa: ' + id);
      return;
    }

    checkbox.checked = false;

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        layer.addTo(map);
      } else {
        map.removeLayer(layer);
      }
    });

    layer.on('tileerror', event => {
      console.warn(
        'Błąd kafelka WMS GUGiK:',
        id,
        event
      );
    });
  });

})();
