 'use strict';
// Geoportal DRK — RCN, lista rekordów zwróconych przez WMS GetFeatureInfo.
// WMS nie zapewnia kompletnego zestawu transakcji budynku; do tego planujemy WFS.
(() => {
  if (typeof L === 'undefined' || typeof map === 'undefined') return;
  const ENDPOINT = 'https://mapy.geoportal.gov.pl/wss/service/rcn';
  const entries = [
    ['rcnPlotsToggle', 'dzialki', 'Działka'],
    ['rcnBuildingsToggle', 'budynki', 'Budynek'],
    ['rcnUnitsToggle', 'lokale', 'Lokal']
  ];
  const status = document.getElementById('rcnStatus');
  const results = document.getElementById('rcnResults');
  const clear = document.getElementById('rcnClear');
  if (!status || !results || !clear) return;
  if (!map.getPane('rcnPane')) map.createPane('rcnPane');
  map.getPane('rcnPane').style.zIndex = '540';
  map.getPane('rcnPane').style.pointerEvents = 'none';
  if (!map.getPane('rcnSelectionPane')) map.createPane('rcnSelectionPane');
  map.getPane('rcnSelectionPane').style.zIndex = '710';
  map.getPane('rcnSelectionPane').style.pointerEvents = 'none';

  let ticket = 0;
  let highlight = null;
  function setStatus(message) { status.textContent = message; status.dataset.level = 'unknown'; }
  function removeHighlight() { if (highlight) map.removeLayer(highlight); highlight = null; }
  function markClick(latlng) {
    removeHighlight();
    highlight = L.layerGroup([
      L.circleMarker(latlng, {pane:'rcnSelectionPane',radius:15,color:'#172e44',weight:5,fill:false,interactive:false}),
      L.circleMarker(latlng, {pane:'rcnSelectionPane',radius:14,color:'#ffe22d',weight:3,fillColor:'#ffe22d',fillOpacity:.12,interactive:false}),
      L.circleMarker(latlng, {pane:'rcnSelectionPane',radius:3,color:'#fff',weight:1,fillColor:'#172e44',fillOpacity:1,interactive:false})
    ]).addTo(map);
  }
  const layers = new Map();
  for (const [id, name] of entries) {
    const check = document.getElementById(id);
    if (!check) continue;
    const layer = L.tileLayer.wms(ENDPOINT, {
      layers:name, format:'image/png', transparent:true, version:'1.1.1', styles:'',
      pane:'rcnPane', attribution:'RCN © GUGiK', opacity:.9
    });
    layers.set(id, layer);
    check.checked = false;
    check.addEventListener('change', () => {
      check.checked ? layer.addTo(map) : map.removeLayer(layer);
      if (check.checked && map.getZoom()<14) setStatus('Przybliż mapę do skali około 1:5000.');
      removeHighlight();
    });
    layer.on('tileerror', () => setStatus('Błąd pobierania części obrazu RCN WMS.'));
  }
  function reset() {
    ++ticket;
    results.textContent = 'Nie wybrano transakcji.';
    setStatus('Włącz warstwę RCN, przybliż mapę i kliknij obiekt transakcji.');
    removeHighlight();
  }
  clear.addEventListener('click', reset);
  document.getElementById('resetBtn')?.addEventListener('click', reset);
  for (const id of ['tabAdmin','tabEsg','tabDem'])
    document.getElementById(id)?.addEventListener('click', removeHighlight);

  function normalize(s) { return String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim(); }
  function plain(s) {
    const d = new DOMParser().parseFromString(s,'text/html');
    d.querySelectorAll('script,style,svg').forEach(n=>n.remove());
    return normalize(d.body?.textContent || s.replace(/<[^>]+>/g,' '));
  }
  // Extract structured fields from HTML tables (one row per key-value pair),
  // and preserve *all* returned fields, not only a preset subset.
  function htmlFields(html) {
    const doc = new DOMParser().parseFromString(html,'text/html');
    const fields = [];
    for (const tr of doc.querySelectorAll('tr')) {
      const cells = Array.from(tr.querySelectorAll(':scope > th, :scope > td'));
      if (cells.length===2) {
        const k=normalize(cells[0].textContent).replace(/[:：]$/,'');
        const v=normalize(cells[1].textContent);
        if (k && v && k.length<110) fields.push([k,v]);
      }
    }
    return fields;
  }
  // Split by actual repeating feature headers where present. If service returns
  // only a single feature without delimiters, keep it as one record.
  function splitFeatures(html) {
    const doc = new DOMParser().parseFromString(html,'text/html');
    const blocks = Array.from(doc.querySelectorAll('table'));
    const likely = blocks.filter(node => /TRAN_CENA_BRUTTO|NIER_CENA_BRUTTO|LOK_ID_LOKALU|DZI_ID_DZIALKI/i.test(node.textContent));
    if (likely.length>1) return likely.map(node=>node.outerHTML);
    // Some GetFeatureInfo responses use repeated headings instead of tables.
    const text = plain(html);
    const markers = Array.from(text.matchAll(/Rejestr Cen Nieruchomości\s*(?:Lokal|Działka|Budynek)\s*:/gi));
    if (markers.length>1) return markers.map((m,i)=>text.slice(m.index,markers[i+1]?.index??text.length));
    // Multiple feature records may repeat a transaction ID, without headers.
    // Avoid guessing boundaries; do not fabricate separate transactions.
    return [html];
  }
  function parseFields(html) {
    const structured = htmlFields(html);
    if (structured.length>=2) return structured;
    const text=plain(html);
    // Recognize KEY: value KEY2: value, preserving original field names.
    const pattern=/(?:^|\s)([A-ZĄĆĘŁŃÓŚŹŻ][A-Z0-9_ĄĆĘŁŃÓŚŹŻ]{2,}|(?:Cena|Powierzchnia|Data)\s+[^:]{0,32})\s*[:：]\s*/g;
    const found=Array.from(text.matchAll(pattern));
    if (!found.length) return [['Opis WMS', text]];
    return found.map((m,i)=>[m[1],normalize(text.slice(m.index+m[0].length, found[i+1]?.index??text.length))]).filter(([,v])=>v);
  }
  function getField(fields, names) {
    for (const key of names) {
      const found=fields.find(([k])=>normalize(k).toUpperCase()===key.toUpperCase());
      if (found && found[1]) return found[1];
    }
    return null;
  }
  function numberFrom(value) {
    if (!value) return null;
    const raw=String(value).replace(/\s/g,'').match(/^-?\d+(?:[,.]\d+)?/);
    if (!raw) return null;
    const n=Number(raw[0].replace(',','.'));
    return Number.isFinite(n) ? n : null;
  }
  function currency(s) {
    const n=numberFrom(s); return n===null ? (s||'Brak danych') : n.toLocaleString('pl-PL',{maximumFractionDigits:2})+' zł';
  }
  function square(s) {
    const n=numberFrom(s); return n===null ? (s||'Brak danych') : n.toLocaleString('pl-PL',{maximumFractionDigits:2})+' m²';
  }
  function makeRecord(html, label, idx) {
    const fields=parseFields(html);
    let price=getField(fields,['TRAN_CENA_BRUTTO','NIER_CENA_BRUTTO','Cena transakcji (brutto)','Cena nieruchomości (brutto)']);
    if (!price) price=plain(html).match(/\bCena\s*[:：]\s*(\d[\d\s,.]*)/i)?.[1]||null;
    const dateTransaction=getField(fields,['TRAN_DATA','TRAN_DATA_TRANS','DATA_TRANSAKCJI']);
    const dateDocument=getField(fields,['DOK_DATA','Data sporządzenia dokumentu']);
    const id=getField(fields, label==='Lokal' ? ['LOK_ID_LOKALU'] : label==='Działka' ? ['DZI_ID_DZIALKI'] : ['BUD_ID_BUDYNKU']) || getField(fields,['TRAN_LOKALNY_ID_IIP']);
    const area=getField(fields,label==='Lokal' ? ['LOK_POW_UZYT','LOK_POWIERZCHNIA'] : label==='Działka' ? ['DZI_POW_EWID','NIER_POW_GRUNTU'] : ['BUD_POW_UZYT']);
    const unitNumber=getField(fields,['LOK_NUMER','LOK_NR_LOKALU','Numer']);
    const parcelNumber=getField(fields,['DZI_NUMER','DZI_NR_DZIALKI']);
    const title=label==='Lokal' ? 'Lokal '+(unitNumber|| (id?.match(/(?:\.|_)LOK[._-]?(\d+)$/i)?.[1]) || '#' + idx) :
      label==='Działka' ? 'Działka '+(parcelNumber||id||'#'+idx) : 'Budynek '+(id||'#'+idx);
    const p=numberFrom(price), a=numberFrom(area);
    const unit=p!==null&&a!==null&&a>0 ? (p/a).toLocaleString('pl-PL',{maximumFractionDigits:2})+' zł/m²' : 'Brak danych';
    return { title, type:label, area:square(area), price:currency(price), unit,
      date:dateTransaction||dateDocument||'Brak danych', dateLabel:dateTransaction?'Data transakcji':dateDocument?'Data dokumentu':'Data',
      fields, key:[label,id||'',price||'',dateTransaction||dateDocument||'',area||''].join('|'), raw:plain(html) };
  }
  function render(records) {
    results.replaceChildren();
    const header=document.createElement('div');
    header.className='rcn-list-head';
    header.textContent='Rekordy zwrócone przez WMS: '+records.length;
    results.append(header);
    records.forEach((record,i)=>{
      const card=document.createElement('details');
      card.className='rcn-list-item';
      const summary=document.createElement('summary');
      const title=document.createElement('div'); title.className='rcn-list-title'; title.textContent=record.title;
      summary.append(title);
      const grid=document.createElement('div'); grid.className='rcn-list-grid';
      for (const [name,value] of [['Powierzchnia',record.area],['Cena',record.price],['Cena za m²',record.unit],[record.dateLabel,record.date]]) {
        const cell=document.createElement('div'); cell.className='rcn-list-cell';
        const lab=document.createElement('small'); lab.textContent=name;
        const v=document.createElement('strong'); v.textContent=value;
        cell.append(lab,v); grid.append(cell);
      }
      summary.append(grid); card.append(summary);
      const detail=document.createElement('div'); detail.className='rcn-detail';
      const detailTitle=document.createElement('p'); detailTitle.className='rcn-detail-title'; detailTitle.textContent='Wszystkie atrybuty udostępnione przez WMS';
      detail.append(detailTitle);
      for (const [name,value] of record.fields) {
        const row=document.createElement('div');row.className='rcn-detail-row';
        const key=document.createElement('span');key.textContent=name;
        const val=document.createElement('strong');val.textContent=value;
        row.append(key,val);detail.append(row);
      }
      if(!record.fields.length) { const p=document.createElement('p');p.textContent=record.raw;detail.append(p); }
      if(record.dateLabel==='Data dokumentu') {
        const note=document.createElement('p');note.className='rcn-detail-note';
        note.textContent='DOK_DATA oznacza datę dokumentu, a niekoniecznie datę zawarcia transakcji.';
        detail.append(note);
      }
      card.append(detail); results.append(card);
    });
    const note=document.createElement('p'); note.className='rcn-detail-note';
    note.textContent='Lista obejmuje jedynie obiekty zwrócone przez WMS w punkcie kliknięcia. Nie jest kompletną listą wszystkich transakcji budynku. Żółty pierścień oznacza punkt kliknięcia.';
    results.append(note);
  }
  function buildUrl(layer,latlng) {
    const bounds=map.getBounds(), sw=map.options.crs.project(bounds.getSouthWest()),ne=map.options.crs.project(bounds.getNorthEast());
    const p=map.latLngToContainerPoint(latlng),size=map.getSize();
    const params=new URLSearchParams({
      SERVICE:'WMS',VERSION:'1.1.1',REQUEST:'GetFeatureInfo',LAYERS:layer,QUERY_LAYERS:layer,STYLES:'',
      SRS:'EPSG:3857',BBOX:`${sw.x},${sw.y},${ne.x},${ne.y}`,WIDTH:String(size.x),HEIGHT:String(size.y),
      X:String(Math.round(p.x)),Y:String(Math.round(p.y)),FORMAT:'image/png',INFO_FORMAT:'text/html',FEATURE_COUNT:'50'
    });
    return ENDPOINT+'?'+params;
  }
  map.on('click',async(event)=>{
    if(document.getElementById('tabRcn')?.getAttribute('aria-selected')!=='true')return;
    const enabled=entries.filter(([id])=>document.getElementById(id)?.checked);
    if(!enabled.length){setStatus('Włącz co najmniej jedną warstwę RCN w prawym panelu.');return;}
    if(map.getZoom()<14){setStatus('Przybliż mapę, a następnie kliknij obiekt RCN.');return;}
    const current=++ticket;removeHighlight();setStatus('Pobieranie rekordów RCN…');results.textContent='Trwa identyfikacja…';
    try{
      const answers=await Promise.all(enabled.map(async ([,name,label])=>{
        const response=await fetch(buildUrl(name,event.latlng));
        if(!response.ok)throw new Error('HTTP '+response.status);
        return {label,html:await response.text()};
      }));
      if(current!==ticket)return;
      const out=[],seen=new Set();
      for(const {label,html} of answers){
        for(const fragment of splitFeatures(html)){
          const body=plain(fragment);
          if(!body || /^(?:no features|no results|brak obiekt|brak wynik)/i.test(body))continue;
          if(!/(?:TRAN_CENA_BRUTTO|NIER_CENA_BRUTTO|TRAN_LOKALNY_ID_IIP|LOK_ID_LOKALU|BUD_ID_BUDYNKU|DZI_ID_DZIALKI|Rejestr Cen Nieruchomości)/i.test(body))continue;
          const r=makeRecord(fragment,label,out.length+1);
          if(!seen.has(r.key)){seen.add(r.key);out.push(r);}
        }
      }
      if(!out.length){results.textContent='W tym punkcie nie znaleziono obiektów RCN w aktywnych warstwach.';setStatus('Brak wyniku identyfikacji.');removeHighlight();return;}
      render(out);markClick(event.latlng);
      setStatus('Odczytano '+out.length+' rekordów z odpowiedzi WMS. Kliknij wiersz, aby rozwinąć szczegóły.');
    }catch(err){if(current!==ticket)return;console.warn('RCN GetFeatureInfo:',err);
      setStatus('Odczyt WMS nie powiódł się (usługa, sieć lub CORS).');
      results.textContent='Spróbuj ponownie później.';removeHighlight();}
  });
})();
