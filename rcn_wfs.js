'use strict';
// Geoportal DRK — RCN WFS: lista transakcji z otoczenia punktu.
// Uwaga: jest to BBOX wokol punktu, nie selekcja pojedynczego budynku.
(() => {
  const mapInstance = typeof map !== 'undefined' ? map : null;
  const status = document.getElementById('rcnStatus');
  const results = document.getElementById('rcnResults');
  const clear = document.getElementById('rcnClear');
  if (!mapInstance || !status || !results || !clear || typeof proj4 === 'undefined') {
    console.error('rcn_wfs.js: brak mapy, proj4 albo elementow RCN');
    return;
  }
  window.drkRcnWfsEnabled = true; // rcn_wms.js: wylacz odczyt WMS GetFeatureInfo
  proj4.defs('EPSG:2180', '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +units=m +no_defs +type=crs');
  const ENDPOINT = 'https://mapy.geoportal.gov.pl/wss/service/rcn';
  const PAGE_SIZE = 100;
  const MAX_RECORDS = 500;
  const RADIUS = 30; // metrow, okolica punktu; NIE granice budynku
  let generation = 0;
  let allRecords = [];
  let filterValue = 'mieszkalna';
  let truncated = false;
  let lastLatLng = null;
  const formatNum = (v, digits=0) => Number(v).toLocaleString('pl-PL', {minimumFractionDigits: digits, maximumFractionDigits: digits});
  function text(node, val) { node.textContent = String(val); return node; }
  function el(tag, className, content) { const n=document.createElement(tag); if(className)n.className=className; if(content!==undefined)text(n,content); return n; }
  function number(v) { const n = Number(String(v ?? '').trim().replace(/\s/g,'').replace(',','.')); return Number.isFinite(n) && n>0 ? n : null; }
  function field(obj, name) { return [...obj.children].find(n => n.localName === name)?.textContent?.trim() || ''; }
  function setStatus(msg) { status.textContent = msg; status.dataset.level = 'unknown'; }
  function updateFilterButtons() {
    document.querySelectorAll('#rcnWfsFilters button').forEach(button => {
      const active = button.dataset.filter === filterValue;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed',String(active));
    });
  }
  function getType(r) { return r.funkcja.toLocaleLowerCase('pl-PL') === 'mieszkalna' ? 'mieszkalna' : 'pozostale'; }
  function label(r, index) {
    const id = r.identyfikator;
    // Nie wymyslamy numeru lokalu. Ident. ewidencyjny jako pomocniczy opis.
    return (getType(r)==='mieszkalna'?'Lokal mieszkalny':r.funkcja||'Lokal') + ' #' + (index+1) + (id?' · '+id.split('.').slice(-1)[0]:'');
  }
  function render() {
    results.replaceChildren();
    const chosen = allRecords.filter(r => filterValue==='all' || getType(r)===filterValue);
    results.append(el('div','rcn-list-head', `RCN WFS: ${chosen.length} z ${allRecords.length} pobranych rekordów`));
    const note = el('p','rcn-detail-note', 'Wyniki z otoczenia punktu (promień prostokąta 30 m), niekoniecznie z jednego budynku. Data = data dokumentu, niekoniecznie data zawarcia transakcji.');
    results.append(note);
    if (truncated) results.append(el('p','rcn-detail-note','Uwaga: osiągnięto limit 500 rekordów. Lista może być niepełna.'));
    if (!chosen.length) { results.append(el('p','rcn-detail-note','Brak rekordów dla wybranego filtra.')); return; }
    chosen.forEach((r, i) => {
      const card=el('details','rcn-list-item');
      const summary=el('summary');
      summary.append(el('div','rcn-list-title',label(r,i)));
      const grid=el('div','rcn-list-grid');
      const fields=[['Powierzchnia',r.area===null?'Brak danych':formatNum(r.area,2)+' m²'],['Cena lokalu',r.price===null?'Brak danych':formatNum(r.price)+' zł'],['Cena za m²',r.unit===null?'Brak danych':formatNum(r.unit)+' zł/m²'],['Data dokumentu',r.date||'Brak danych']];
      for(const [k,v] of fields) { const cell=el('div','rcn-list-cell');cell.append(el('small','',k),el('strong','',v));grid.append(cell); }
      summary.append(grid);card.append(summary);
      const detail=el('div','rcn-detail');
      detail.append(el('p','rcn-detail-title','Wszystkie dostępne atrybuty WFS'));
      for(const [k,v] of Object.entries(r.props)) {
        if(k==='boundedBy'||k==='GEOMETRIA'||k==='geom')continue;
        const row=el('div','rcn-detail-row');row.append(el('span','',k),el('strong','',v||'—'));detail.append(row);
      }
      card.append(detail);results.append(card);
    });
  }
  function setupFilters() {
    let bar=document.getElementById('rcnWfsFilters');
    if(bar)return;
    bar=el('div','rcn-wfs-filters');bar.id='rcnWfsFilters';
    for(const [v,title] of [['mieszkalna','Mieszkalne'],['pozostale','Pozostałe'],['all','Wszystkie']]) {
      const btn=el('button','',title);btn.type='button';btn.dataset.filter=v;
      btn.addEventListener('click',()=>{filterValue=v;updateFilterButtons();render();});bar.append(btn);
    }
    results.parentElement.insertBefore(bar,results);
    updateFilterButtons();
  }
  function parseXml(xml) {
    if(xml.getElementsByTagName('parsererror').length)throw Error('Odpowiedź WFS nie jest poprawnym XML.');
    const root=xml.documentElement;
    if(root.localName==='ExceptionReport')throw Error(root.textContent.trim().slice(0,300));
    const members=[...xml.getElementsByTagName('*')].filter(n=>n.localName==='member'||n.localName==='featureMember');
    const records=[];
    for(const m of members) {
      const feature=m.firstElementChild;if(!feature)continue;
      const props={};for(const c of feature.children)props[c.localName]=c.textContent.trim();
      const price=number(props.LOK_CENA_BRUTTO),area=number(props.LOK_POW_UZYT);
      records.push({
        key: feature.getAttribute('gml:id') || feature.getAttributeNS('http://www.opengis.net/gml/3.2','id') || [props.TRAN_LOKALNY_ID_IIP,props.LOK_ID_LOKALU,props.DOK_OZNACZENIE].join('|'),
        identyfikator:props.LOK_ID_LOKALU||'',funkcja:props.LOK_FUNKCJA||'',date:props.DOK_DATA||'',area,price,
        unit:price!==null&&area!==null?Math.round(price/area):null, props
      });
    }
    return records;
  }
  async function fetchPage(filter, startIndex) {
    const params=new URLSearchParams({SERVICE:'WFS',VERSION:'2.0.0',REQUEST:'GetFeature',TYPENAMES:'ms:lokale',COUNT:String(PAGE_SIZE),STARTINDEX:String(startIndex),FILTER:filter});
    const res=await fetch(ENDPOINT+'?'+params);
    if(!res.ok)throw Error('WFS HTTP '+res.status);
    return parseXml(new DOMParser().parseFromString(await res.text(),'application/xml'));
  }
  function makeFilter(lat,lon) {
    const [x,y]=proj4('EPSG:4326','EPSG:2180',[lon,lat]);
    if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Błąd transformacji EPSG:2180');
    return `<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0" xmlns:gml="http://www.opengis.net/gml/3.2"><fes:BBOX><fes:ValueReference>geom</fes:ValueReference><gml:Envelope srsName="EPSG:2180"><gml:lowerCorner>${y-RADIUS} ${x-RADIUS}</gml:lowerCorner><gml:upperCorner>${y+RADIUS} ${x+RADIUS}</gml:upperCorner></gml:Envelope></fes:BBOX></fes:Filter>`;
  }
  async function search(lat,lon) {
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
    const mine=++generation;lastLatLng={lat,lon};allRecords=[];truncated=false;
    setStatus('Pobieram transakcje z WFS GUGiK…');results.textContent='Trwa pobieranie…';
    try {
      const filter=makeFilter(lat,lon);
      const seen=new Set();
      for(let start=0;start<MAX_RECORDS;start+=PAGE_SIZE) {
        const page=await fetchPage(filter,start);
        if(mine!==generation)return;
        for(const r of page)if(!seen.has(r.key)){seen.add(r.key);allRecords.push(r);}
        if(page.length<PAGE_SIZE)break;
        if(start+PAGE_SIZE===MAX_RECORDS)truncated=true;
      }
      if(mine!==generation)return;
      setStatus(allRecords.length?`Pobrano ${allRecords.length} rekordów WFS z otoczenia punktu${truncated?' (limit osiągnięty)':''}.`:'WFS nie zwrócił rekordów z otoczenia punktu.');
      render();
    } catch(e) {
      if(mine!==generation)return;
      console.error('RCN WFS:',e);
      setStatus('Błąd pobierania WFS: '+e.message);
      results.textContent='Nie udało się pobrać danych.';
    }
  }
  function reset() { ++generation; allRecords=[];lastLatLng=null;truncated=false;filterValue='mieszkalna';updateFilterButtons();results.textContent='Nie wybrano lokalizacji.';setStatus('Wyszukaj adres lub działkę albo kliknij mapę w module Rzeczoznawca.'); }
  setupFilters();
  clear.addEventListener('click',reset);
  document.getElementById('resetBtn')?.addEventListener('click',reset);
  document.addEventListener('drk:location-selected',e=>{
    const lat=Number(e.detail?.lat),lon=Number(e.detail?.lon);
    // Po wyszukaniu lokalizacji wykonuj analize także wtedy, gdy aktywny inny moduł.
    search(lat,lon);
  });
  mapInstance.on('click',e=>{
    if(document.getElementById('tabRcn')?.getAttribute('aria-selected')==='true')search(e.latlng.lat,e.latlng.lng);
  });
  // Po zmianie zakladki pokaz poprzednie wyniki, bez ponownego requestu.
})();
