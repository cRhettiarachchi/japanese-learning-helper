const fs = require('node:fs');
const path = require('node:path');
const {marked} = require('marked');

const escape = text => text.replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const nav = '<nav class="site-nav" aria-label="Study pages"><a href="/index.html">Reading articles</a><a href="/grammar.html">Grammar course</a><a href="/listening/teppei-1586.html">Listening</a><a href="/revisions.html" aria-current="page">Revisions</a></nav>';
function shell(title, content) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Japanese learner</title><link rel="stylesheet" href="/grammar.css"><link rel="stylesheet" href="/revisions.css"><script src="/revisions.js" defer></script></head><body><a class="skip" href="#main">Skip to content</a><header class="topbar"><a class="brand" href="/index.html">Japanese learner</a>${nav}</header><main id="main" class="revision-layout">${content}</main></body></html>`;
}
function render(root, out) {
  fs.mkdirSync(path.join(out, 'revisions'), {recursive:true});
  const lessons = JSON.parse(fs.readFileSync(path.join(root,'grammar-data.json'),'utf8')).stages.flatMap(stage=>stage.lessons);
  for (const kind of ['test','answers']) {
    const source = `revision-1-${kind}.md`;
    const markdown = fs.readFileSync(path.join(root,'revisions',source),'utf8');
    let html = marked.parse(markdown, {gfm:true});
    const headings = [];
    html = html.replace(/<h2>(.*?)<\/h2>/g, (_,label) => {
      const id = `section-${headings.length+1}`;
      headings.push({id,label});
      return `<h2 id="${id}" tabindex="-1">${label}</h2>`;
    });
    // Keep the mapping accessible at narrow widths without losing any columns.
    html = html.replace(/<table>/g,'<div class="revision-table" role="region" aria-label="Lesson review mapping" tabindex="0"><table>').replace(/<\/table>/g,'</table></div>');
    if (kind === 'answers') {
      html = html.replace(/<td>(\d{3})(.*?)<\/td>/g, (match,n,rest) => {
        const lesson=lessons[Number(n)-1];
        return lesson ? `<td><a href="/grammar.html#${escape(lesson.id)}">${n}</a>${rest}</td>` : match;
      });
    }
    const other = kind === 'test' ? '<a href="/revisions/revision-1-answers.html">Finished? Open answer guide →</a>' : '<a href="/revisions/revision-1-test.html">← Return to the test</a>';
    const toc = headings.map(h=>`<a href="#${h.id}">${h.label}</a>`).join('');
    const content = `<a class="back-link" href="/revisions.html">← All revisions</a><p class="eyebrow">Revision 1 · ${kind==='test'?'Test':'Answer guide · spoilers'}</p><div class="revision-tools"><button type="button" data-print hidden>Print ${kind==='test'?'test':'answer guide'}</button><a href="/revisions/${source}" download>Download Markdown</a>${other}</div><nav class="revision-toc" aria-label="${kind==='test'?'Test':'Answer guide'} sections">${toc}</nav><article class="revision-document">${html}</article><footer class="revision-tools">${other}<a href="#main">Back to top ↑</a></footer>`;
    fs.writeFileSync(path.join(out,'revisions',`revision-1-${kind}.html`),shell(`Revision 1 · ${kind==='test'?'Test':'Answer guide'}`,content));
  }
  const landing = `<p class="eyebrow">Practice & review</p><h1>Revisions</h1><p class="intro">Check what you can use, find the lessons to revisit, and decide when you’re ready to move on. Work on paper, then open the answer guide to grade your answers.</p><section class="revision-card" aria-labelledby="revision-one"><p class="eyebrow">Revision 1</p><h2 id="revision-one">Your first 37 grammar lessons</h2><p>44 questions · 100 points · 55–60 minutes</p><p>Meaning, conjugation, corrections, reading, and short writing. Covers the app’s numbered rows 001–037, ending with <span lang="ja">たことがある</span>.</p><p class="revision-note">Four rows have no dedicated lesson: 012, 024, 025, and 029. The guide scores those coverage gaps separately from the taught material.</p><div class="revision-tools"><a class="primary-link" href="/revisions/revision-1-test.html">Start Revision 1 →</a><a href="/revisions/revision-1-answers.html">Open answer guide (spoilers)</a></div><p class="intro">Answers live on a separate page. The guide includes accepted alternatives, partial credit, links back to each lesson, readiness guidance, and a delayed retest.</p></section>`;
  fs.writeFileSync(path.join(out,'revisions.html'),shell('Revisions',landing));
}
module.exports = {render};
