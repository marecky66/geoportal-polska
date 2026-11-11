'use strict';
// Geoportal DRK - RCN WFS, transakcje, statystyki, promien i lista.
(() => {
  const mapInstance = typeof map !== 'undefined' ? map : null;
  const status = document.getElementById('rcnStatus');
  const results = document.getElementById('rcnResults');
  const clear = document.getElementById('rcnClear');
  if (!mapInstance || !status || !results || !clear || typeof proj4 === 'undefined') {
    console.error('rcn_wfs.js: brak mapy, proj4 lub elementow RCN'); return;
  }
  window.drkRcnWfsEnabled = true;
  proj4.defs('EPSG:2180', '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +units=m +no_defs +type=crs');
  const ENDPOINT = 'https://mapy.geoportal.gov.pl/wss/service/rcn';
  const PAGE_SIZE = 100, MAX_RECORDS = 1000;
  let generation = 0, allRecords = [], selected = 'mieszkalna';
  let skippedGeometry = 0, diagnostic = null, bboxFallback = false;
  let truncated = false, lastLocation = null, radius = 30, running = false;
  const fmt = (n,d=0) => Number(n).toLocaleString('pl-PL',{useGrouping:true,minimumFractionDigits:d,maximumFractionDigits:d}).replace(/[\u202f\u00a0]/g,'\u00a0');
  const esc = x => String(x??'');
  const elt = (tag,cls,txt) => {const n=document.createElement(tag); if(cls)n.className=cls; if(txt!==undefined)n.textContent=esc(txt); return n;};
  const numeric = raw => {const s=String(raw??'').replace(/\s/g,'').replace(',','.'); if(!s)return null; const n=Number(s);return Number.isFinite(n)&&n>0?n:null;};
  const dateISO = raw => { const m=String(raw||'').match(/\d{4}-\d{2}-\d{2}/); return m?m[0]:''; };
  const missing = x => x === null || x === undefined || x === '';

const getKind = r => {
  const f = (r.funkcja || '').trim().toLowerCase();

  if (f === 'mieszkalna') return 'mieszkalna';

  if (/garaż|garaz|postoj/.test(f)) {
    return 'postojowe';
  }

  return 'pozostale';
};

  // Elementy sa tworzone w JS, nie wymagaja podmiany calego index.html.
  const heading = document.querySelector('#moduleRcn .risk-heading');
  if(heading)heading.textContent='Rejestr Cen Nieruchomości';
  const control = elt('div','rcn-radius-control');
  const lbl = elt('label','rcn-radius-label','Promień wyszukiwania RCN');
  lbl.htmlFor='rcnRadius';
  const slider = elt('input'); slider.type='range';slider.id='rcnRadius';slider.min='0';slider.max='500';slider.step='5';slider.value=String(radius);
  const sliderValue=elt('strong','rcn-radius-value',radius+' m');
  const sliderRow=elt('div','rcn-radius-line'); sliderRow.append(slider,sliderValue);
  const endLabels=elt('div','rcn-radius-ends');endLabels.append(elt('span','','0 m'),elt('span','','500 m'));
  control.append(lbl,sliderRow,endLabels);
  // Slajder pomiedzy tytulem a "Identyfikacja transakcji RCN".
  const section = document.getElementById('moduleRcn');
  if(heading)heading.after(control);else section?.prepend(control);
  const stats = elt('div','rcn-stats'); stats.id='rcnStats';stats.hidden=true;
  const listTitle = [...(section?.querySelectorAll('.risk-title')||[])].find(x => x.textContent.includes('Lista transakcji RCN'));
  if(listTitle)listTitle.before(stats);else results.before(stats);
  const fmtPrice = n => n===null?'Brak danych':fmt(n)+' zł';
  function addPair(target, name, value){const row=elt('div','rcn-detail-row');row.append(elt('span','',name),elt('strong','',missing(value)?'—':value));target.append(row);}
  const detailFields=[
    ['TRAN_RODZAJ_TRANS','Rodzaj transakcji'],['TRAN_RODZAJ_RYNKU','Rodzaj Rynku'],
    ['TRAN_SPRZEDAJACY','Sprzedający'],['TRAN_KUPUJACY','Kupujący'],
    ['TRAN_CENA_BRUTTO','Cena z Aktu notarialnego'],['LOK_CENA_BRUTTO','Cena lokalu'],
    ['DOK_DATA','Data transakcji'],['NIER_UDZIAL','Udział w nieruchomości'],
    ['LOK_FUNKCJA','Funkcja lokalu'],['LOK_LICZBA_IZB','Liczba izb'],
    ['LOK_NR_KOND','Kondygnacja'],['LOK_POW_UZYT','Pow. użytkowa'],
    ['LOK_POW_PRZYN','Pow. przynależna']
  ];
  function findAddress(raw, record) {
    const text = String(raw || '');
    const field = name => {
      const match = text.match(new RegExp('(?:^|[;,])\\s*'+name+':\\s*([^;,]+)','i'));
      return match?.[1]?.trim() || '';
    };
    const city = field('MSC') || field('MIEJSCOWOSC');
    const street = field('UL').replace(/^(ulica|ul\.)\s+/i,'').trim();
    const building = field('NR_PORZ');
    // Numer lokalu pokazujemy tylko, gdy WFS przekazał go jawnie.
    // Końcówka LOK_ID_LOKALU nie musi być numerem porządkowym mieszkania.
    const unit = field('NR_LOK') || field('NR_LOKALU');
    if (city && street && building) return `${city}, ${street} ${building}${unit ? '/'+unit : ''}`;
    return text.replace(/;/g, ', ').replace(/\b(MSC|UL|NR_PORZ|NR_LOK):/gi,'').trim()
      || 'Adres nieudostępniony w RCN';
  }
  function titleFor(r,i){return (getKind(r)==='mieszkalna'?'Lokal mieszkalny':r.funkcja?'Lokal '+r.funkcja:'Lokal')+' #'+(i+1);}
  function selectRecords() {
  return allRecords
    .filter(r => getKind(r) === selected)
    .sort((a, b) =>
      b.date.localeCompare(a.date) ||
      String(a.key).localeCompare(String(b.key))
    );
}
  // Jednostkowa cena lokalu = cena przypisana lokalowi / powierzchnia lokalu.
  // TRAN_CENA_BRUTTO jest widoczna jedynie w szczegółach, bez doliczania garażu.
  function applyPackagePrices(items) {
    for (const r of items) {
      r.effectivePrice = r.price;
      r.priceBasis = 'lokal';
      r.unit = r.area !== null && r.area > 0 && r.price !== null
        ? r.price / r.area : null;
    }
  }
  function renderStats(records) {
    stats.replaceChildren();
    stats.hidden = true;
    if (bboxFallback) return;
    if (records.length <= 1) return;
    const parking = selected === 'postojowe';
    const valid = records.filter(r =>
      ['2025', '2026'].includes(r.date.slice(0, 4)) &&
      (parking ? r.price !== null : r.unit !== null)
    );
    const label = parking ? 'Ceny całkowite' : 'Ceny jednostkowe';
    stats.append(
      elt('div','rcn-stats-title',`${label} — transakcje 2025–2026`),
      elt('p','rcn-stats-sub',`Statystyka dotyczy wybranego filtra i otoczenia punktu dla ${valid.length} rekordów.`)
    );
    if (!valid.length) {
      stats.append(elt('p','rcn-stats-sub','Brak danych do wyliczenia statystyk.'));
      stats.hidden = false;
      return;
    }
    const values = valid.map(r => parking ? r.price : r.unit).sort((a,b) => a-b);
    const n = values.length;
    const mean = values.reduce((a,b)=>a+b,0) / n;
    const median = n%2 ? values[(n-1)/2] : (values[n/2-1]+values[n/2])/2;
    const measures = [['Średnia',mean],['Mediana',median],['Minimum',values[0]],['Maksimum',values[n-1]]];
    const grid = elt('div','rcn-stats-grid');
    for (const [name,value] of measures) {
      const cell = elt('div','rcn-stat');
      cell.append(elt('small','',name),elt('strong','',fmt(Math.round(value)) + (parking ? ' zł' : ' zł/m²')));
      grid.append(cell);
    }
    stats.append(grid);
    stats.hidden = false;
  }
  function render(){
    results.replaceChildren();const chosen=selectRecords();renderStats(chosen);
    results.append(elt('div','rcn-list-head',`RCN WFS: ${chosen.length} z ${allRecords.length} pobranych rekordów`));
    results.append(elt('p','rcn-detail-note',`Wyniki z otoczenia punktu (promień ${radius} m), niekoniecznie z jednego budynku.`));
    if(bboxFallback)results.append(elt('p','rcn-detail-note', 'UWAGA: wyświetlono dane z prostokąta BBOX, nie potwierdzono przynależności do koła. Statystyki wyłączono.'));
    if(skippedGeometry)results.append(elt('p','rcn-detail-note',`Pominięto ${skippedGeometry} rekordów bez współrzędnych, których nie można zweryfikować względem bufora.`));
    if(truncated)results.append(elt('p','rcn-detail-note',`Osiągnięto limit ${MAX_RECORDS} rekordów. Wyniki i statystyki mogą być niepełne.`));
    if(!chosen.length){results.append(elt('p','rcn-detail-note','Brak rekordów dla wybranego filtra.'));return;}
    for(const [i,r] of chosen.entries()){
      const card=elt('details','rcn-list-item');const summary=elt('summary');
      summary.append(elt('div','rcn-list-title',titleFor(r,i)));
      summary.append(elt('div','rcn-list-address',findAddress(r.props.LOK_ADRES, r)));
      const grid=elt('div','rcn-list-grid');
      const vals=[['Powierzchnia',r.area===null?'Brak danych':fmt(r.area,2)+' m²'],['Cena',fmtPrice(r.effectivePrice)],['Cena za m²',r.unit===null?'Brak danych':fmt(Math.round(r.unit))+' zł/m²'],['Data transakcji',r.date||'Brak danych']];
      for(const [k,v] of vals){const cell=elt('div','rcn-list-cell');cell.append(elt('small','',k),elt('strong','',v));grid.append(cell);}
      summary.append(grid);card.append(summary);
      const detail=elt('div','rcn-detail');
      detail.append(elt('p','rcn-detail-title','Dane transakcji RCN'));
            for(const [key,label] of detailFields){let val=r.props[key]||'';
        if(key==='LOK_CENA_BRUTTO')val=missing(val)?'—':fmtPrice(numeric(val));
        if(key==='TRAN_CENA_BRUTTO')val=missing(val)?'—':fmtPrice(numeric(val));
        if(key==='LOK_POW_UZYT'||key==='LOK_POW_PRZYN')val=missing(val)?'—':(numeric(val)===null?val:fmt(numeric(val),2)+' m²');
        if(key==='LOK_CENA_BRUTTO'&&getKind(r)==='mieszkalna')addPair(detail,'Cena lokalu mieszkalnego',val);
        else addPair(detail,label,val);
      }
      card.append(detail);results.append(card);
    }
  }
  function setupFilters(){let bar=document.getElementById('rcnWfsFilters');if(bar)return;bar=elt('div','rcn-wfs-filters');bar.id='rcnWfsFilters';for(const [v,title] of [
  ['mieszkalna','Mieszkalne'],
  ['postojowe','Miejsca postojowe'],
  ['pozostale','Pozostałe']
]){const btn=elt('button','',title);btn.type='button';btn.dataset.filter=v;btn.addEventListener('click',()=>{selected=v;updateFilter();render();});bar.append(btn);}results.parentElement.insertBefore(bar,results);updateFilter();}
  function updateFilter(){document.querySelectorAll('#rcnWfsFilters button').forEach(b=>{const active=b.dataset.filter===selected;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
  function parseXml(xml){
    if(xml.getElementsByTagName('parsererror').length)throw Error('Nieprawidłowy XML WFS');
    if(xml.documentElement.localName==='ExceptionReport')throw Error(xml.documentElement.textContent.trim().slice(0,300));
    const members=[...xml.getElementsByTagName('*')].filter(n=>n.localName==='member'||n.localName==='featureMember');
    return members.map(member=>{
      const obj=member.firstElementChild;if(!obj)return null;const props={};for(const c of obj.children)props[c.localName]=c.textContent.trim();
      const area=numeric(props.LOK_POW_UZYT),price=numeric(props.LOK_CENA_BRUTTO),transactionPrice=numeric(props.TRAN_CENA_BRUTTO);
      const geom = [...obj.children].find(c=>c.localName==='GEOMETRIA');
      const posText = geom && [...geom.getElementsByTagName('*')].find(c=>c.localName==='pos')?.textContent.trim();
      const pair = posText?.split(/\s+/).map(Number);
      const point2180 = pair?.length>=2 && pair.slice(0,2).every(Number.isFinite)
        ? {x: pair[1], y: pair[0]} : null;
      return {key:obj.getAttributeNS('http://www.opengis.net/gml/3.2','id')||obj.getAttribute('gml:id')||[props.TRAN_LOKALNY_ID_IIP,props.LOK_ID_LOKALU,props.DOK_OZNACZENIE].join('|'),identyfikator:props.LOK_ID_LOKALU||'',funkcja:props.LOK_FUNKCJA||'',date:dateISO(props.DOK_DATA),area,price,transactionPrice,point2180,props};
    }).filter(Boolean);
  }
  async function fetchPage(filter,offset){const q=new URLSearchParams({SERVICE:'WFS',VERSION:'2.0.0',REQUEST:'GetFeature',TYPENAMES:'ms:lokale',COUNT:String(PAGE_SIZE),STARTINDEX:String(offset),FILTER:filter});const response=await fetch(ENDPOINT+'?'+q);if(!response.ok)throw Error('WFS HTTP '+response.status);return parseXml(new DOMParser().parseFromString(await response.text(),'application/xml'));}
  function makeFilter(lat,lon){const [x,y]=proj4('EPSG:4326','EPSG:2180',[lon,lat]);if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Błąd transformacji do EPSG:2180');const r=Math.max(0.5,radius);return `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0" xmlns:gml="http://www.opengis.net/gml/3.2"><fes:BBOX><fes:ValueReference>geom</fes:ValueReference><gml:Envelope srsName="EPSG:2180"><gml:lowerCorner>${y-r} ${x-r}</gml:lowerCorner><gml:upperCorner>${y+r} ${x+r}</gml:upperCorner></gml:Envelope></fes:BBOX></fes:Filter>`;}
  async function search(lat,lon){
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
    const mine=++generation;
    lastLocation={lat,lon};allRecords=[];truncated=false;skippedGeometry=0;
    bboxFallback=false;diagnostic=null;running=true;updateBuffer();
    stats.hidden=true;setStatus('Pobieranie rekordów RCN…');results.textContent='Trwa pobieranie…';
    try {
      const filter=makeFilter(lat,lon),seen=new Set();
      let complete=false;
      const [cx,cy]=proj4('EPSG:4326','EPSG:2180',[lon,lat]);
      const bboxRecords=[];
      const counts={received:0,unique:0,inside:0,outside:0,missingGeometry:0};
      const sample=[];
      for(let offset=0;offset<MAX_RECORDS;offset+=PAGE_SIZE){
        const page=await fetchPage(filter,offset);
        if(mine!==generation)return;
        counts.received+=page.length;
        for(const r of page){
          if(seen.has(r.key))continue;
          seen.add(r.key);counts.unique++;
          bboxRecords.push(r);
          if(!r.point2180){counts.missingGeometry++;continue;}
          const dx=r.point2180.x-cx,dy=r.point2180.y-cy;
          const dist=Math.hypot(dx,dy);
          if(sample.length<5)sample.push({key:r.key,x:r.point2180.x,y:r.point2180.y,distance_m:Math.round(dist)});
          if(dist<=Math.max(0.5,radius)){allRecords.push(r);counts.inside++;}
          else counts.outside++;
        }
        if(page.length<PAGE_SIZE){complete=true;break;}
      }
      if(mine!==generation)return;
      truncated=!complete;
      skippedGeometry=counts.missingGeometry;
      diagnostic={lat,lon,radius,center2180:{x:cx,y:cy},counts,sample};
      window.drkRcnWfsDebug=diagnostic;
      console.info('RCN WFS DIAGNOSTYKA:',diagnostic);
      if(allRecords.length===0 && bboxRecords.length>0){
        bboxFallback=true;
        allRecords=bboxRecords;
        skippedGeometry=0;
      }
      applyPackagePrices(allRecords);running=false;
      if(bboxFallback){
        setStatus(`WFS zwrócił ${bboxRecords.length} rekordów, ale filtr kołowy nie potwierdził żadnego. Pokazano BBOX (wynik poglądowy).`);
      }else{
        setStatus(allRecords.length
          ? `${allRecords.length} rekordów z otoczenia punktu${truncated?' (osiągnięto limit)':''}.`
          : `Brak rekordów WFS w buforze ${radius} m. Sprawdź diagnostykę.`);
      }
      render();
    }catch(error){
      if(mine!==generation)return;
      running=false;console.error('RCN WFS',error);
      setStatus('Błąd pobierania danych: '+error.message);
      results.textContent='Nie udało się pobrać danych.';
    }
  }

  function reset(){++generation;allRecords=[];lastLocation=null;truncated=false;skippedGeometry=0;bboxFallback=false;diagnostic=null;running=false;updateBuffer();selected='mieszkalna';updateFilter();stats.hidden=true;results.textContent='Nie wybrano lokalizacji.';setStatus('Wyszukaj adres, działkę lub kliknij mapę w module Rzeczoznawca.');}
  // Półprzezroczysty, rzeczywisty bufor pomiarowy w Leaflet.
  // WFS używa BBOX tylko do pobrania kandydatów, powyżej stosujemy filtr kołowy.
  const bufferPane = 'rcnBufferPane';
  if (!mapInstance.getPane(bufferPane)) {
    mapInstance.createPane(bufferPane);
    mapInstance.getPane(bufferPane).style.zIndex = 420;
    mapInstance.getPane(bufferPane).style.pointerEvents = 'none';
  }
  let bufferLayer = null;
  function updateBuffer() {
    if (bufferLayer) { mapInstance.removeLayer(bufferLayer); bufferLayer = null; }
    const active = document.getElementById('tabRcn')?.getAttribute('aria-selected') === 'true';
    if (!active || !lastLocation || radius <= 0) return;
    bufferLayer = L.circle([lastLocation.lat,lastLocation.lon], {
      pane: bufferPane, radius, color: '#26738c', weight: 2,
      opacity: 0.85, fillColor: '#26738c', fillOpacity: 0.12,
      interactive: false
    }).addTo(mapInstance);
  }
  ['tabAdmin','tabEsg','tabDem','tabRcn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => setTimeout(updateBuffer,0));
  });
  slider.addEventListener('input',()=>{radius=Number(slider.value);sliderValue.textContent=radius+' m';updateBuffer();});
  slider.addEventListener('change',()=>{if(lastLocation)search(lastLocation.lat,lastLocation.lon);});
  setupFilters();clear.addEventListener('click',reset);document.getElementById('resetBtn')?.addEventListener('click',reset);
  document.addEventListener('drk:location-selected',event=>search(Number(event.detail?.lat),Number(event.detail?.lon)));
  mapInstance.on('click',event=>{if(document.getElementById('tabRcn')?.getAttribute('aria-selected')==='true')search(event.latlng.lat,event.latlng.lng);});
})();
