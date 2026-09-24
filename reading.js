'use strict';
(async () => {
  const storageKey = 'hirogaru-reading-progress-v1';
  const boxes = [...document.querySelectorAll('[data-reading-key]')];
  const warning = document.querySelector('#reading-storage-warning');
  const progress = window.StudyProgress;
  boxes.forEach(box => box.disabled = true);
  await progress.ready;
  boxes.forEach(box => box.disabled = false);
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
    box.checked = progress.get('article', box.dataset.readingKey); box.disabled=!progress.user&&progress.mode!=='local';
    box.addEventListener('change', () => {
      progress.set('article', box.dataset.readingKey, 'done', box.checked);
      update();
    });
  });
  document.querySelector('#continue-reading').addEventListener('click', () => {
    const next = boxes.find(box => !box.checked);
    if (next) { location.hash = next.closest('article').id; next.focus({preventScroll:true}); }
  });
  document.querySelector('#reading-date').addEventListener('change', event => { location.href = event.target.value; });
  progress.subscribe(() => {
    boxes.forEach(box => { box.checked = progress.get('article', box.dataset.readingKey); box.disabled=!progress.user&&progress.mode!=='local'; }); update();
  });
  update();
})();
