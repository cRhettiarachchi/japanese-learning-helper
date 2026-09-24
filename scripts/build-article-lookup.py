"""Add local word lookup without rewriting source text or ruby markup.
Run with SudachiPy + SudachiDict-core and JMDICT_PATH pointing to JMdict_e.gz.
Generated HTML/data are committed; the ordinary Node/Vercel build needs no Python.
"""
from pathlib import Path
from html.parser import HTMLParser
from dataclasses import dataclass, field
import html, json, re, hashlib
import japanese_dictionary as lex
ROOT = Path(__file__).resolve().parent.parent
VOID = {'br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'wbr', 'area', 'base', 'embed', 'param', 'track', 'col'}
PROTECTED = {'a', 'button', 'input', 'select', 'textarea', 'script', 'style', 'rt', 'rp'}

@dataclass
class Node:
    tag: str
    start: int
    end: int
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)
    parent: object = None

class Document(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = [0] + [m.end() for m in re.finditer('\n', source)]
        self.root = Node('root', 0, len(source))
        self.stack = [self.root]
        self.feed(source)
    def pos(self):
        line, col = self.getpos()
        return self.lines[line-1] + col
    def add(self, node):
        node.parent = self.stack[-1]
        node.parent.children.append(node)
    def handle_starttag(self, tag, attrs):
        start = self.pos()
        node = Node(tag, start, start+len(self.get_starttag_text()), dict(attrs))
        self.add(node)
        if tag not in VOID:
            self.stack.append(node)
    def handle_startendtag(self, tag, attrs):
        self.add(Node(tag, self.pos(), self.pos()+len(self.get_starttag_text()), dict(attrs)))
    def handle_endtag(self, tag):
        end = self.source.index('>', self.pos())+1
        for index in range(len(self.stack)-1, 0, -1):
            if self.stack[index].tag == tag:
                self.stack[index].end = end
                del self.stack[index:]
                break
    def handle_data(self, data):
        self.add(Node('#text', self.pos(), self.pos()+len(data)))
    def handle_entityref(self, name):
        self.add(Node('#text', self.pos(), self.pos()+len(name)+2))
    def handle_charref(self, name):
        self.add(Node('#text', self.pos(), self.pos()+len(name)+3))


def walk(node):
    yield node
    for child in node.children:
        yield from walk(child)


def ancestors(node):
    while node.parent:
        node = node.parent
        yield node


def visible(node, source):
    if node.tag in {'rt', 'rp'}:
        return ''
    if node.tag == '#text':
        return html.unescape(source[node.start:node.end])
    return ''.join(visible(child, source) for child in node.children)


def atom(node, source):
    if node.tag == 'ruby':
        text = visible(node, source)
        return text, [(node.start, node.end)]*len(text)
    raw = source[node.start:node.end]
    text, offsets = '', []
    for match in re.finditer(r'&(?:#[xX][0-9A-Fa-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);|.', raw, re.S):
        value = html.unescape(match.group())
        text += value
        offsets.extend([(node.start+match.start(), node.start+match.end())]*len(value))
    return text, offsets


def annotate(source):
    # Idempotently remove only this generator's wrappers and data, retaining their contents.
    source = re.sub(r'<button class="word article-word"[^>]*>(.*?)</button>', r'\1', source, flags=re.S)
    source = re.sub(r'<script id="article-lookup-data" type="application/json">.*?</script>', '', source, flags=re.S)
    doc = Document(source)
    tokens, edits, counts = {}, [], {}
    for node in walk(doc.root):
        parents = list(ancestors(node))
        article = next((p for p in parents if p.tag == 'article'), None)
        if not article or node.tag not in {'p', 'h2', 'figcaption'}:
            continue
        if not (node.tag in {'h2', 'figcaption'} or any('prose' in p.attrs.get('class', '').split() for p in parents)):
            continue
        if any(p.tag in PROTECTED for p in parents):
            continue
        key = next((p.attrs['data-reading-key'] for p in walk(article) if 'data-reading-key' in p.attrs), article.attrs.get('id', ''))
        prefix = 'article-'+hashlib.sha256(key.encode()).hexdigest()[:16]
        counts.setdefault(prefix, 0)
        def process(run):
            if not run:
                return
            text, offsets = '', []
            for child in run:
                value, spans = atom(child, source)
                text += value
                offsets.extend(spans)
            if not text:
                return
            grouped = []
            for token in lex.tokenize(text):
                if token['end'] <= token['begin']:
                    continue
                a, b = offsets[token['begin']][0], offsets[token['end']-1][1]
                if grouped and a < grouped[-1]['rawEnd']:
                    previous = grouped[-1]
                    previous['rawEnd'] = max(previous['rawEnd'], b)
                    previous['end'] = token['end']
                    previous['merged'] = True
                else:
                    grouped.append({**token, 'rawStart': a, 'rawEnd': b, 'merged': False})
            for token in grouped:
                surface = text[token['begin']:token['end']]
                if not re.search('[ぁ-ゖァ-ヶ一-龯々]', surface):
                    continue
                ids = lex.lookup([surface], '') if token['merged'] else token['entries']
                tid = prefix+'-'+str(counts[prefix])
                counts[prefix] += 1
                tokens[tid] = dict(surface=surface, lemma=surface if token['merged'] else token['lemma'], entries=ids)
                opening = f'<button class="word article-word" type="button" data-article-word data-word="{tid}" aria-label="Look up {html.escape(surface, quote=True)}">'
                edits.append((token['rawStart'], token['rawEnd'], opening))
        def visit(parent):
            run = []
            for child in parent.children:
                if child.tag in {'#text', 'ruby'}:
                    run.append(child)
                else:
                    process(run)
                    run = []
                    if child.tag not in PROTECTED:
                        visit(child)
            process(run)
        visit(node)
    for a, b, opening in sorted(edits, reverse=True):
        source = source[:a]+opening+source[a:b]+'</button>'+source[b:]
    assets = '<link rel="stylesheet" href="/dictionary.css"><script src="/dictionary.js" defer></script><script src="/article-lookup.js" defer></script>'
    if '/article-lookup.js' not in source:
        source = source.replace('</head>', assets+'</head>')
    payload = json.dumps(tokens, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
    source = source.replace('</body>', f'<script id="article-lookup-data" type="application/json">{payload}</script></body>')
    if 'article-dictionary-credit' not in source:
        credit = '<p class="article-dictionary-credit dictionary-credit">Dictionary: <a href="https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html" target="_blank" rel="noopener">JMdict</a> © James William Breen and EDRDG. Adapted English subset under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener">CC BY-SA 4.0</a>. <a href="/listening/dictionary.json" download>Dictionary data</a>.</p>'
        source = source.replace('<script id="article-lookup-data"', credit+'<script id="article-lookup-data"')
    return source, tokens

if __name__ == '__main__':
    for path in [ROOT/'index.html', *sorted((ROOT/'readings').glob('*.html'))]:
        before = path.read_text()
        after, tokens = annotate(before)
        # Original ruby annotations must remain byte-for-byte identical and in the same order.
        assert re.findall(r'<ruby\b.*?</ruby>', before, re.S) == re.findall(r'<ruby\b.*?</ruby>', after, re.S), path
        path.write_text(after)
        print(f'{path.name}: {len(tokens)} tappable words, {sum(bool(t["entries"]) for t in tokens.values())} with dictionary entries')
    path = ROOT/'listening/dictionary.json'
    dictionary = json.loads(path.read_text())
    dictionary['entries'].update(lex.USED)
    dictionary['changes'] = 'Selected entries and fields for personal study articles and transcripts'
    path.write_text(json.dumps(dictionary, ensure_ascii=False, separators=(',', ':')))
