'use strict';
// Przyblizona skala liczbowa przy zalozeniu 96 CSS px/cal (zalezy od ekranu).
(() => {
  if(typeof map === 'undefined')return;
  const target=document.getElementById('mapZoomValue');
  if(!target)return;
  const span=document.createElement('span');span.id='rcnScaleRatio';target.after(span);
  function draw(){
    const center=map.getCenter();
    const p=map.latLngToContainerPoint(center);
    const a=map.containerPointToLatLng(p),b=map.containerPointToLatLng([p.x+100,p.y]);
    const metersPerCssPixel=map.distance(a,b)/100;
    const denominator=metersPerCssPixel*96/0.0254;
    if(Number.isFinite(denominator))span.textContent='Skala ≈ 1:'+Math.round(denominator).toLocaleString('pl-PL');
  }
  map.on('zoomend moveend resize',draw);draw();
})();
