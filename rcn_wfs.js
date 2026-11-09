
'use strict';

// Geoportal DRK — WFS Rejestru Cen Nieruchomości GUGiK
// Etap 1: sprawdzenie dostępnych warstw i formatów.

(() => {
  const WFS_URL =
    'https://mapy.geoportal.gov.pl/wss/service/rcn';

  async function checkWFS() {
    const params = new URLSearchParams({
      SERVICE: 'WFS',
      REQUEST: 'GetCapabilities'
    });

    try {
      const response = await fetch(
        WFS_URL + '?' + params.toString()
      );

      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }

      const xmlText = await response.text();
      const xml = new DOMParser().parseFromString(
        xmlText,
        'application/xml'
      );

      if (xml.querySelector('parsererror')) {
        throw new Error('Nieprawidłowa odpowiedź XML.');
      }

      const root = xml.documentElement;

      if (!root.localName.includes('Capabilities')) {
        throw new Error('Odpowiedź nie jest GetCapabilities WFS.');
      }

      const layers = Array.from(
        xml.getElementsByTagName('*')
      )
        .filter(el => el.localName === 'FeatureType')
        .map(el => {
          const name = Array.from(el.children)
            .find(child => child.localName === 'Name');

          return name?.textContent?.trim();
        })
        .filter(Boolean);

      console.log('RCN WFS — dostępne warstwy:', layers);

      window.drkRcnWfsInfo = {
        url: WFS_URL,
        layers
      };

    } catch (error) {
      console.error(
        'RCN WFS — problem z połączeniem:',
        error
      );
    }
  }

  checkWFS();
})();
