'use strict';
(() => {
 const key = 'hirogaru-misa-grammar-v1';
 const boxes = [...document.querySelectorAll('input[data-lesson]')];
 const rows = [...document.querySelectorAll('tr[data-topic]')];
 const stages = [...document.querySelectorAll('.stage')];
 const warning = document.querySelector('#storage-warning');
 let done = {};
 try { const saved = JSON.parse(localStorage.getItem(key) || '{}'); if (saved && typeof saved === 'object' && !Array.isArray(saved)) done = saved; }
 catch { warning.hidden = false; }
 const update = () => {
  let count = 0;
  boxes.forEach(box => { box.closest('tr').classList.toggle('complete',box.checked); if(box.checked) count++; });
  document.querySelector('#progress-label').textContent = `${count} of ${boxes.length} lessons complete`;
  document.querySelector('#progress').value = count;
  document.querySelector('#continue').textContent = count === boxes.length ? 'All linked lessons complete' : 'Continue learning →';
  document.querySelector('#continue').disabled = count === boxes.length;
  stages.forEach(section => {
   const items = [...section.querySelectorAll('input[data-lesson]')];
   section.querySelector('.stage-count').textContent = items.length ? `${items.filter(x=>x.checked).length} / ${items.length} complete` : 'Coverage gaps';
  });
 };
 const filter = () => {
  const text = document.querySelector('#search').value.trim().toLocaleLowerCase();
  const status = document.querySelector('#status').value;
  let shown = 0;
  rows.forEach(row => {
   const box = row.querySelector('input[data-lesson]');
   const matchesStatus = status === 'all' || (status === 'todo' && box && !box.checked) || (status === 'done' && box && box.checked) || (status === 'gaps' && !box);
   row.hidden = !(row.dataset.topic.includes(text) && matchesStatus);
   if (!row.hidden) shown++;
  });
  stages.forEach(s => {s.hidden = ![...s.querySelectorAll('tr[data-topic]')].some(r=>!r.hidden);});
  document.querySelector('#results').textContent = `${shown} of ${rows.length} entries shown · Lesson order stays the same`;
  document.querySelector('#empty').hidden = shown !== 0;
 };
 boxes.forEach(box => {
  box.checked = done[box.dataset.lesson] === true;
  box.addEventListener('change',() => {
   if (box.checked) done[box.dataset.lesson] = true; else delete done[box.dataset.lesson];
   try {localStorage.setItem(key,JSON.stringify(done));} catch {warning.hidden = false;}
   update();filter();
  });
 });
 document.querySelector('#search').addEventListener('input',filter);
 document.querySelector('#status').addEventListener('change',filter);
 const clearFilters = () => {document.querySelector('#search').value='';document.querySelector('#status').value='all';filter();};
 document.querySelector('#continue').addEventListener('click',() => {
  const next=boxes.find(x=>!x.checked); if(!next)return;
  clearFilters();location.hash=next.closest('tr').id;next.focus({preventScroll:true});
 });
 document.querySelectorAll('.stages a').forEach(a=>a.addEventListener('click',clearFilters));
 update();filter();
})();
