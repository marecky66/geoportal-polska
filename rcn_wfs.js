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
  let truncated = false, lastLocation = null, radius = 30, running = false;
  const fmt = (n,d=0) => Number(n).toLocaleString('pl-PL',{minimumFractionDigits:d,maximumFractionDigits:d});
  const esc = x => String(x??'');
  const elt = (tag,cls,txt) => {const n=document.createElement(tag); if(cls)n.className=cls; if(txt!==undefined)n.textContent=esc(txt); return n;};
  const numeric = raw => {const s=String(raw??'').replace(/\s/g,'').replace(',','.'); if(!s)return null; const n=Number(s);return Number.isFinite(n)&&n>0?n:null;};
  const dateISO = raw => { const m=String(raw||'').match(/\d{4}-\d{2}-\d{2}/); return m?m[0]:''; };
  const missing = x => x === null || x === undefined || x === '';
  const getKind = r => (r.funkcja||'').trim().toLowerCase()==='mieszkalna'?'mieszkalna':'pozostale';
  function setStatus(value){status.textContent=value;status.dataset.level='unknown';}
  // Elementy sa tworzone w JS, nie wymagaja podmiany calego index.html.
  const heading = document.querySelector('#moduleRcn .risk-heading');
  if(heading)heading.textContent='Rejestr Cen Nieruchomości';
  const control = elt('div','rcn-radius-control');
  const lbl = elt('label','rcn-radius-label','Promień wyszukiwania RCN');
  lbl.htmlFor='rcnRadius';
  const slider = elt('input'); slider.type='range';slider.id='rcnRadius';slider.min='0';slider.max='100';slider.step='5';slider.value=String(radius);
  const sliderValue=elt('strong','rcn-radius-value',radius+' m');
  const sliderRow=elt('div','rcn-radius-line'); sliderRow.append(slider,sliderValue);
  const endLabels=elt('div','rcn-radius-ends');endLabels.append(elt('span','','0 m'),elt('span','','100 m'));
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
  function findAddress(raw) {
    let s=String(raw||'').replace(/^(MSC:|MIEJSCOWOSC:)/i,'').replace(/;/g,', ').replace(/\bUL:/gi,'ul. ').replace(/\bNR_PORZ:/gi,'').replace(/\s+/g,' ').trim();
    s=s.replace(/,\s*,/g,',').replace(/\s+,/g,',').replace(/\s*:\s*/g,' ');
    const chunks=s.split(',').map(x=>x.trim()).filter(Boolean);
    if(!chunks.length)return 'Adres nieudostępniony w RCN';
    // Znane pola MSC:Warszawa;UL:ulica Sokołowska;NR_PORZ:9;NR_LOK:259
    let city=(raw.match(/(?:^|[;,])\s*MSC:([^;,]+)/i)||[])[1];
    let street=(raw.match(/(?:^|[;,])\s*UL:([^;,]+)/i)||[])[1];
    let no=(raw.match(/(?:^|[;,])\s*NR_PORZ:([^;,]+)/i)||[])[1];
    let unit=(raw.match(/(?:^|[;,])\s*NR_LOK:([^;,]+)/i)||[])[1];
    if(city&&street&&no){street=street.replace(/^ulica\s+/i,'').trim();return `${city.trim()}, ${street.trim()} ${no.trim()}${unit?'/'+unit.trim():''}`;}
    return s;
  }
  function titleFor(r,i){return (getKind(r)==='mieszkalna'?'Lokal mieszkalny':r.funkcja?'Lokal '+r.funkcja:'Lokal')+' #'+(i+1);}
  function selectRecords(){return allRecords.filter(r=>selected==='all'||getKind(r)===selected).sort((a,b)=>b.date.localeCompare(a.date)||String(a.key).localeCompare(String(b.key)));}
  // Laczenie skladnikow tej samej czynnosci. Najpierw ID transakcji, potem akt+data+strony.
  // Sam numer repertorium nie wystarcza: rozni notariusze moga stosowac takie same numery.
  function groupKey(r){
    const p=r.props;
    const tx=(p.TRAN_LOKALNY_ID_IIP||'').trim();
    const doc=(p.DOK_OZNACZENIE||'').trim(), date=r.date;
    const creator=(p.DOK_TWORCA||'').trim(), county=(p.TERYT||'').trim();
    const total=r.transactionPrice;
    // Rozne obiekty moga miec oddzielne identyfikatory, ale wspolny akt.
    // Bez autora dokumentu nie laczymy na podstawie samego numeru repertorium.
    if(doc && date && creator && total!==null)
      return 'act|'+doc+'|'+date+'|'+creator+'|'+county+'|'+total.toFixed(2);
    return tx?'tx|'+tx:'';
  }
  function applyPackagePrices(items){
    const groups = new Map();
    for(const r of items){r.effectivePrice=r.price;r.priceBasis='lokal';r.packageCount=1; r.packagePrice=null;
      const k=groupKey(r);if(k){if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}}
    for(const group of groups.values()){
      // Obecność innych skladnikow (np. garazu) wymaga co najmniej dwoch ROZNYCH lokali.
      const ids=new Set(group.map(r=>r.identyfikator||r.key));
      if(ids.size<2)continue;
      const totalPrices=group.map(r=>r.transactionPrice).filter(x=>x!==null);
      if(!totalPrices.length)continue;
      // Cena transakcji jest czesto powtorzona na kazdym skladniku; NIE sumujemy jej.
      const uniqueTotals=[...new Set(totalPrices.map(n=>n.toFixed(2)))];
      if(uniqueTotals.length!==1)continue;
      const total=totalPrices[0];
      // Nie stosujemy ceny lacznej do rekordow, gdy nie ma potwierdzenia wieloskladnikowej transakcji.
      // Gdy cena lokalu = cena laczna, nie ma podstaw do doliczania dalszej kwoty.
      const hasAncillary=group.some(r=>/gara[zż]|postoj/i.test(r.funkcja));
      if(!hasAncillary)continue;
      // Lokal glowny: mieszkalny lub inny NIEgarazowy. Ceny pakietu nie przypisujemy miejscom postojowym.
      const mains=group.filter(r=>!/gara[zż]|postoj/i.test(r.funkcja)&&r.area!==null);
      // Nie wolno przypisac jednej ceny kilku samodzielnym lokalom glownym.
      if(mains.length!==1)continue;
      const principal=mains[0];
      principal.effectivePrice=total;principal.priceBasis='akt_łączny';principal.packageCount=ids.size;principal.packagePrice=total;
    }
    for(const r of items)r.unit=r.area!==null&&r.effectivePrice!==null?Math.round(r.effectivePrice/r.area):null;
  }
  function renderStats(records){
    stats.replaceChildren();stats.hidden=true;
    if(allRecords.length<=1)return;
    const valid=records.filter(r=>['2025','2026'].includes(r.date.slice(0,4))&&r.unit!==null&&Number.isFinite(r.unit));
    const hdr=elt('div','rcn-stats-title','Ceny jednostkowe — transakcje 2025–2026');
    const sub=elt('p','rcn-stats-sub',`Liczba rekordów z ceną i powierzchnią: ${valid.length}. Statystyka dotyczy wybranego filtra i otoczenia punktu.`);
    stats.append(hdr,sub);
    if(!valid.length){stats.append(elt('p','rcn-stats-sub','Brak danych do wyliczenia statystyk.'));stats.hidden=false;return;}
    const ordered=valid.map(r=>r.unit).sort((a,b)=>a-b);
    const sum=ordered.reduce((a,b)=>a+b,0),n=ordered.length;
    const med=n%2?ordered[(n-1)/2]:(ordered[n/2-1]+ordered[n/2])/2;
    const values=[['Średnia',sum/n],['Mediana',med],['Minimum',ordered[0]],['Maksimum',ordered[n-1]]];
    const grid=elt('div','rcn-stats-grid');for(const [k,v] of values){const item=elt('div','rcn-stat');item.append(elt('small','',k),elt('strong','',fmt(Math.round(v))+' zł/m²'));grid.append(item);}stats.append(grid);stats.hidden=false;
  }
  function render(){
    results.replaceChildren();const chosen=selectRecords();renderStats(chosen);
    results.append(elt('div','rcn-list-head',`RCN WFS: ${chosen.length} z ${allRecords.length} pobranych rekordów`));
    results.append(elt('p','rcn-detail-note',`Wyniki z otoczenia punktu (promień ${radius} m), niekoniecznie z jednego budynku.`));
    if(truncated)results.append(elt('p','rcn-detail-note',`Osiągnięto limit ${MAX_RECORDS} rekordów. Wyniki i statystyki mogą być niepełne.`));
    if(!chosen.length){results.append(elt('p','rcn-detail-note','Brak rekordów dla wybranego filtra.'));return;}
    for(const [i,r] of chosen.entries()){
      const card=elt('details','rcn-list-item');const summary=elt('summary');
      summary.append(elt('div','rcn-list-title',titleFor(r,i)));
      summary.append(elt('div','rcn-list-address',findAddress(r.props.LOK_ADRES)));
      const grid=elt('div','rcn-list-grid');
      const vals=[['Powierzchnia',r.area===null?'Brak danych':fmt(r.area,2)+' m²'],['Cena',fmtPrice(r.effectivePrice)],['Cena za m²',r.unit===null?'Brak danych':fmt(r.unit)+' zł/m²'],['Data transakcji',r.date||'Brak danych']];
      for(const [k,v] of vals){const cell=elt('div','rcn-list-cell');cell.append(elt('small','',k),elt('strong','',v));grid.append(cell);}
      summary.append(grid);card.append(summary);
      const detail=elt('div','rcn-detail');
      detail.append(elt('p','rcn-detail-title','Dane transakcji RCN'));
      if(r.priceBasis==='akt_łączny')detail.append(elt('p','rcn-package-note',`Cena jednostkowa liczona z łącznej ceny aktu (${fmtPrice(r.packagePrice)}) i powierzchni lokalu głównego. Powiązanych lokali: ${r.packageCount}.`));
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
  function setupFilters(){let bar=document.getElementById('rcnWfsFilters');if(bar)return;bar=elt('div','rcn-wfs-filters');bar.id='rcnWfsFilters';for(const [v,title] of [['mieszkalna','Mieszkalne'],['pozostale','Pozostałe'],['all','Wszystkie']]){const btn=elt('button','',title);btn.type='button';btn.dataset.filter=v;btn.addEventListener('click',()=>{selected=v;updateFilter();render();});bar.append(btn);}results.parentElement.insertBefore(bar,results);updateFilter();}
  function updateFilter(){document.querySelectorAll('#rcnWfsFilters button').forEach(b=>{const active=b.dataset.filter===selected;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
  function parseXml(xml){
    if(xml.getElementsByTagName('parsererror').length)throw Error('Nieprawidłowy XML WFS');
    if(xml.documentElement.localName==='ExceptionReport')throw Error(xml.documentElement.textContent.trim().slice(0,300));
    const members=[...xml.getElementsByTagName('*')].filter(n=>n.localName==='member'||n.localName==='featureMember');
    return members.map(member=>{
      const obj=member.firstElementChild;if(!obj)return null;const props={};for(const c of obj.children)props[c.localName]=c.textContent.trim();
      const area=numeric(props.LOK_POW_UZYT),price=numeric(props.LOK_CENA_BRUTTO),transactionPrice=numeric(props.TRAN_CENA_BRUTTO);
      return {key:obj.getAttributeNS('http://www.opengis.net/gml/3.2','id')||obj.getAttribute('gml:id')||[props.TRAN_LOKALNY_ID_IIP,props.LOK_ID_LOKALU,props.DOK_OZNACZENIE].join('|'),identyfikator:props.LOK_ID_LOKALU||'',funkcja:props.LOK_FUNKCJA||'',date:dateISO(props.DOK_DATA),area,price,transactionPrice,props};
    }).filter(Boolean);
  }
  async function fetchPage(filter,offset){const q=new URLSearchParams({SERVICE:'WFS',VERSION:'2.0.0',REQUEST:'GetFeature',TYPENAMES:'ms:lokale',COUNT:String(PAGE_SIZE),STARTINDEX:String(offset),FILTER:filter});const response=await fetch(ENDPOINT+'?'+q);if(!response.ok)throw Error('WFS HTTP '+response.status);return parseXml(new DOMParser().parseFromString(await response.text(),'application/xml'));}
  function makeFilter(lat,lon){const [x,y]=proj4('EPSG:4326','EPSG:2180',[lon,lat]);if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Błąd transformacji do EPSG:2180');const r=Math.max(.01,radius);return `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0" xmlns:gml="http://www.opengis.net/gml/3.2"><fes:BBOX><fes:ValueReference>geom</fes:ValueReference><gml:Envelope srsName="EPSG:2180"><gml:lowerCorner>${y-r} ${x-r}</gml:lowerCorner><gml:upperCorner>${y+r} ${x+r}</gml:upperCorner></gml:Envelope></fes:BBOX></fes:Filter>`;}
  async function search(lat,lon){if(!Number.isFinite(lat)||!Number.isFinite(lon))return;const mine=++generation;lastLocation={lat,lon};allRecords=[];truncated=false;running=true;stats.hidden=true;setStatus('Pobieranie rekordów RCN…');results.textContent='Trwa pobieranie…';
    try{const filter=makeFilter(lat,lon),seen=new Set();let complete=false;
      for(let offset=0;offset<MAX_RECORDS;offset+=PAGE_SIZE){const page=await fetchPage(filter,offset);if(mine!==generation)return;for(const r of page)if(!seen.has(r.key)){seen.add(r.key);allRecords.push(r);}if(page.length<PAGE_SIZE){complete=true;break;}}
      if(mine!==generation)return;truncated=!complete;applyPackagePrices(allRecords);running=false;setStatus(allRecords.length?`${allRecords.length} rekordów z otoczenia punktu${truncated?' (osiągnięto limit)':''}.`:'Nie znaleziono rekordów z otoczenia punktu.');render();
    }catch(error){if(mine!==generation)return;running=false;console.error('RCN WFS',error);setStatus('Błąd pobierania danych: '+error.message);results.textContent='Nie udało się pobrać danych.';}
  }
  function reset(){++generation;allRecords=[];lastLocation=null;truncated=false;running=false;selected='mieszkalna';updateFilter();stats.hidden=true;results.textContent='Nie wybrano lokalizacji.';setStatus('Wyszukaj adres, działkę lub kliknij mapę w module Rzeczoznawca.');}
  slider.addEventListener('input',()=>{radius=Number(slider.value);sliderValue.textContent=radius+' m';});
  slider.addEventListener('change',()=>{if(lastLocation)search(lastLocation.lat,lastLocation.lon);});
  setupFilters();clear.addEventListener('click',reset);document.getElementById('resetBtn')?.addEventListener('click',reset);
  document.addEventListener('drk:location-selected',event=>search(Number(event.detail?.lat),Number(event.detail?.lon)));
  mapInstance.on('click',event=>{if(document.getElementById('tabRcn')?.getAttribute('aria-selected')==='true')search(event.latlng.lat,event.latlng.lng);});
})();
