
'use strict';

// Geoportal DRK — pobieranie RCN WFS z lokalizacji
(() => {
  const url = 'https://mapy.geoportal.gov.pl/wss/service/rcn';

  proj4.defs(
    'EPSG:2180',
    '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 ' +
    '+x_0=500000 +y_0=-5300000 +ellps=GRS80 ' +
    '+units=m +no_defs'
  );

  let requestNumber = 0;

  async function searchRCN(lat, lon) {
    const ticket = ++requestNumber;
    const [x, y] = proj4('EPSG:4326', 'EPSG:2180', [lon, lat]);
    const r = 30;

    const filter = `
      <fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0"
                  xmlns:gml="http://www.opengis.net/gml/3.2">
        <fes:BBOX>
          <fes:ValueReference>geom</fes:ValueReference>
          <gml:Envelope srsName="EPSG:2180">
            <gml:lowerCorner>${y-r} ${x-r}</gml:lowerCorner>
            <gml:upperCorner>${y+r} ${x+r}</gml:upperCorner>
          </gml:Envelope>
        </fes:BBOX>
      </fes:Filter>`;

    const params = new URLSearchParams({
      SERVICE: 'WFS',
      VERSION: '2.0.0',
      REQUEST: 'GetFeature',
      TYPENAMES: 'ms:lokale',
      COUNT: '100',
      FILTER: filter
    });

    try {
      const response = await fetch(url + '?' + params);
      if (!response.ok) throw new Error('HTTP ' + response.status);

      const xml = new DOMParser().parseFromString(
        await response.text(),
        'application/xml'
      );

      if (xml.querySelector('parsererror')) {
        throw new Error('Nieprawidłowy XML');
      }

      const members = [...xml.getElementsByTagName('*')]
        .filter(el => el.localName === 'member');

      const records = members.map(member => {
        const obj = member.firstElementChild;
        const get = name =>
          [...obj.children].find(el => el.localName === name)
            ?.textContent.trim() || '';

        return {
          identyfikator: get('LOK_ID_LOKALU'),
          adres: get('LOK_ADRES'),
          funkcja: get('LOK_FUNKCJA'),
          powierzchnia: get('LOK_POW_UZYT'),
          cena: get('LOK_CENA_BRUTTO'),
          dokument: get('DOK_OZNACZENIE'),
          data: get('DOK_DATA')
        };
      });

      if (ticket !== requestNumber) return;

      console.log('RCN WFS — lokalizacja:', lat, lon);
      
const mieszkania = records
  .filter(r =>
    r.funkcja?.trim().toLowerCase() === 'mieszkalna'
  )
  .map(r => {
    const powierzchnia = Number(
      String(r.powierzchnia).replace(',', '.')
    );

    const cena = Number(
      String(r.cena).replace(',', '.')
    );

    return {
      ...r,
      cenaM2:
        powierzchnia > 0 && cena > 0
          ? Math.round(cena / powierzchnia)
          : null
    };
  });

console.log('Lokale mieszkalne:', mieszkania.length);
console.table(mieszkania);

      console.log('Liczba pobranych rekordów:', records.length);
      console.table(records);

      document.dispatchEvent(new CustomEvent('drk:rcn-wfs-results', {
        detail: { lat, lon, records }
      }));
    } catch (error) {
      if (ticket === requestNumber) {
        console.error('RCN WFS:', error);
      }
    }
  }

  // Wyszukiwarka adresów i działek
  document.addEventListener('drk:location-selected', e => {
    searchRCN(Number(e.detail.lat), Number(e.detail.lon));
  });

  // Kliknięcie mapy
  map.on('click', e => {
    searchRCN(e.latlng.lat, e.latlng.lng);
  });
})();
