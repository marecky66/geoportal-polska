
'use strict';

// Geoportal DRK - uproszczony panel wyników WMS

const riskResults = [
  ['floodingResult', 'pigShort'],
  ['powodz10Result', 'q10Short'],
  ['powodz100Result', 'q1Short'],
  ['powodz500Result', 'q02Short']
];

riskResults.forEach(([sourceId, targetId]) => {
  const source = document.getElementById(sourceId);
  const target = document.getElementById(targetId);

  if (!source || !target) return;

  function refresh() {
    const text = source.textContent.trim();
    let status = 'NIE SPRAWDZONO';
    let level = 'unknown';

    if (/^NIE WYKRYTO/i.test(text)) {
      status = 'NIE WYKRYTO ZAGROŻENIA';
      level = 'no';
    } else if (/^TAK\b/i.test(text)) {
      status = 'WYKRYTO ZAGROŻENIE';
      level = 'yes';
    } else if (/^NIE USTALONO/i.test(text)) {
      status = 'BRAK ODPOWIEDZI WMS';
    } else if (/^Sprawdzanie/i.test(text)) {
      status = 'SPRAWDZANIE...';
    } else if (
      text &&
      !/^(Kliknij|NIE SPRAWDZONO)/i.test(text)
    ) {
      status = 'BRAK ODPOWIEDZI WMS';
    }

    target.textContent = status;
    target.dataset.level = level;
  }

  new MutationObserver(refresh).observe(source, {
    childList: true,
    characterData: true,
    subtree: true
  });

  refresh();
});
