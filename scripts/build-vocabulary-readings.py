"""Extract verified canonical-form/readings from JMdict, including re_restr/re_nokanji.
Run JMDICT_PATH=/absolute/path/JMdict_e.gz python3 scripts/build-vocabulary-readings.py.
Normal Node builds use the committed subset and never guess a missing reading.
"""
import gzip, hashlib, json, os, re, xml.etree.ElementTree as ET
from pathlib import Path
root=Path(__file__).resolve().parent.parent
source=Path(os.environ['JMDICT_PATH'])
catalog=json.loads((root/'server/vocabulary-catalog.json').read_text())
def hiragana(s):
    return ''.join(chr(ord(c)-0x60) if '\u30a1'<=c<='\u30f6' else c for c in s)
result={}
for _,entry in ET.iterparse(gzip.open(source),events=('end',)):
    if entry.tag!='entry': continue
    eid=entry.findtext('ent_seq')
    if eid in catalog:
        word=catalog[eid]['word']
        forms=[e.text for e in entry.findall('k_ele/keb')]
        candidates=[]
        for r in entry.findall('r_ele'):
            reading=r.findtext('reb'); restrictions=[e.text for e in r.findall('re_restr')]
            if reading not in catalog[eid]['readings']: continue
            if word in forms and r.find('re_nokanji') is None and (not restrictions or word in restrictions): candidates.append(reading)
            elif not re.search('[\u3400-\u9fff々]',word) and word==reading: candidates.append(reading)
        if candidates: result[eid]={'word':word,'reading':hiragana(candidates[0])}
    entry.clear()
output={'source':'https://www.edrdg.org/pub/Nihongo/JMdict_e.gz','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'method':'Canonical form matched against JMdict re_restr/re_nokanji; katakana readings transliterated to hiragana. Whole-word ruby; no guessed segmentation.','entries':result}
(root/'vocabulary-readings.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
missing=[eid for eid,e in catalog.items() if re.search('[\u3400-\u9fff々]',e['word']) and eid not in result]
print('Verified reading pairs:',len(result),'Kanji entries without verified reading:',len(missing))
