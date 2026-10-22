# Geoportal Polska — Leaflet + GitHub Pages

Prototyp geoportalu: OSM, geokodowanie adresu, pinezka, powrót do widoku Polski, granica kraju i przełączana warstwa GeoJSON.

## Publikacja na GitHub Pages
1. Zaloguj się na https://github.com i utwórz nowe repozytorium `geoportal-polska` jako **Public**.
2. Prześlij **zawartość folderu** geoportal_leaflet do głównego katalogu repozytorium (plik `index.html` musi znaleźć się w katalogu głównym).
3. Otwórz **Settings → Pages → Build and deployment → Deploy from a branch**.
4. Wybierz `main`, katalog `/(root)` i naciśnij **Save**.
5. Adres docelowy: `https://TWOJ_LOGIN.github.io/geoportal-polska/` (publikacja może wymagać kilku minut).

## Lokalny podgląd
Po rozpakowaniu w folderze uruchom `python -m http.server 8000`, a następnie otwórz http://localhost:8000. Samo dwukrotne kliknięcie `index.html` może nie pozwolić na pobranie warstw przez `fetch`.

## Eksport warstwy z QGIS
1. Kliknij prawym przyciskiem warstwę → **Eksportuj → Zapisz obiekty jako…**.
2. Format **GeoJSON**, układ współrzędnych **EPSG:4326 (WGS 84)**.
3. Zapisz jako `data/moja_warstwa.geojson` i zastąp plik przykładowy.
4. Po ponownym wgraniu na GitHub nowe dane pojawią się na stronie. W pliku `index.html` zmień etykietę "Moja warstwa QGIS (przykład)" na własną.
5. Dane udostępnione w publicznym repozytorium są jawne. Nie umieszczaj tam danych klienta, banku ani poufnych lokalizacji.

## Uwagi
- Granica pochodzi z poglądowego zbioru Natural Earth (niska szczegółowość), nie jest oficjalnym państwowym przebiegiem granicy. Do dokładniejszych analiz zastąp ją właściwymi danymi PRG.
- Usługa publiczna Nominatim: https://operations.osmfoundation.org/policies/nominatim/ — maks. 1 żądanie/sekundę dla całej witryny, brak autouzupełniania, tylko wyszukiwanie uruchomione przez użytkownika. Projekt nadaje się do małej demonstracji, nie do większego ruchu. Geokodowane adresy są przesyłane do zewnętrznej usługi.
- Kafelki OSM: https://operations.osmfoundation.org/policies/tiles/ — zachowaj atrybucję i politykę cachowania; dla większego ruchu wybierz komercyjnego dostawcę kafelków.
- Leaflet wczytywany z CDN. Do działania mapy i wyszukiwania potrzebne jest połączenie z internetem.
