'use strict';
// Panel Administracyjny / ESG. Zmiana modułu zachowuje wybór warstw,
// ale ukrywa nakładki nieaktywnego modułu.
(() => {
  const tabs = {
    admin: document.getElementById('tabAdmin'),
    esg: document.getElementById('tabEsg'),
    dem: document.getElementById('tabDem')
  };
  const panels = {
    admin: document.getElementById('moduleAdmin'),
    esg: document.getElementById('moduleEsg'),
    dem: document.getElementById('moduleDem')
  };
  const layerIds = {
    admin: ['layerToggle', 'citiesToggle', 'fuaToggle'],
    esg: ['floodingToggle', 'powodz10Toggle', 'powodz100Toggle', 'powodz500Toggle', 'windToggle'],
    dem: []
  };
  if (Object.values(tabs).some(v => !v) || Object.values(panels).some(v => !v)) {
    console.error('moduly.js: brak kart lub paneli w index.html.');
    return;
  }
  const saved = { admin: {}, esg: {} };
  let active = 'admin';
  function checkbox(id) { return document.getElementById(id); }
  function switchTo(next) {
    if (next === active) return;
    // Zapamiętaj zaznaczenia, wyłącz nakładki starego modułu przez click(),
    // aby istniejące moduły Leaflet dostały zdarzenie change.
    layerIds[active].forEach(id => {
      const input = checkbox(id);
      if (!input) return;
      saved[active][id] = input.checked;
      if (input.checked) input.click();
    });
    active = next;
    for (const key of Object.keys(tabs)) {
      const selected = key === next;
      tabs[key].classList.toggle('active', selected);
      tabs[key].setAttribute('aria-selected', String(selected));
      tabs[key].tabIndex = selected ? 0 : -1;
      panels[key].hidden = !selected;
    }
    layerIds[next].forEach(id => {
      const input = checkbox(id);
      if (input && !input.disabled && Boolean(saved[next][id]) !== input.checked) input.click();
    });
  }
  tabs.admin.addEventListener('click', () => switchTo('admin'));
  tabs.esg.addEventListener('click', () => switchTo('esg'));
  tabs.dem.addEventListener('click', () => switchTo('dem'));
  panels.admin.hidden = false;
  panels.esg.hidden = true;
})();
