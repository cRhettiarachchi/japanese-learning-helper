'use strict';
(() => {
  const storageKey = 'hirogaru-reading-progress-v1';
  const boxes = [...document.querySelectorAll('[data-reading-key]')];
  const warning = document.querySelector('#reading-storage-warning');
  let saved = {};
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) saved = value;
  } catch { warning.hidden = false; }
  const update = () => {
    let count = 0;
    boxes.forEach(box => {
      if (box.checked) count++;
      box.closest('article').classList.toggle('is-read', box.checked);
      document.querySelectorAll('[data-read-indicator]').forEach(indicator => {
        if (indicator.dataset.readIndicator === box.dataset.readingKey) indicator.textContent = box.checked ? '· Read ✓' : '';
      });
    });
    document.querySelector('#reading-progress').textContent = `${count} of ${boxes.length} articles read`;
    const next = document.querySelector('#continue-reading');
    next.disabled = count === boxes.length;
    next.textContent = next.disabled ? 'This set is complete ✓' : 'Continue reading →';
  };
  boxes.forEach(box => {
    box.checked = saved[box.dataset.readingKey] === true;
    box.addEventListener('change', () => {
      // Merge other pages' updates without resetting earlier reading sets.
      try {
        const latest = JSON.parse(localStorage.getItem(storageKey) || '{}');
        if (latest && typeof latest === 'object' && !Array.isArray(latest)) saved = latest;
        if (box.checked) saved[box.dataset.readingKey] = true;
        else delete saved[box.dataset.readingKey];
        localStorage.setItem(storageKey, JSON.stringify(saved));
      } catch { warning.hidden = false; }
      update();
    });
  });
  document.querySelector('#continue-reading').addEventListener('click', () => {
    const next = boxes.find(box => !box.checked);
    if (next) { location.hash = next.closest('article').id; next.focus({preventScroll:true}); }
  });
  document.querySelector('#reading-date').addEventListener('change', event => { location.href = event.target.value; });
  window.addEventListener('storage', event => {
    if (event.key !== storageKey && event.key !== null) return;
    try {
      const value = JSON.parse(event.newValue || '{}');
      saved = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      boxes.forEach(box => { box.checked = saved[box.dataset.readingKey] === true; }); update();
    } catch { warning.hidden = false; }
  });
  update();
})();
