"""Local JMdict lookup, inflection analysis, and conservative word alignment."""
from pathlib import Path
from collections import defaultdict
import gzip,xml.etree.ElementTree as ET,json,re,html,unicodedata
from sudachipy import dictionary,tokenizer
import os
DICTIONARY_PATH=Path(os.environ['JMDICT_PATH'])
TOK=dictionary.Dictionary().create()
def hira(s):return ''.join(chr(ord(c)-96) if 'ァ'<=c<='ヶ' else c for c in s)
def norm(s):return ''.join(c.lower() for c in unicodedata.normalize('NFKC',s) if c.isalnum() or c in 'ー々')
INDEX=defaultdict(list);ENTRIES={}
for _,e in ET.iterparse(gzip.open(DICTIONARY_PATH),events=('end',)):
 if e.tag!='entry':continue
 eid=e.findtext('ent_seq');forms=[x.text for x in e.findall('k_ele/keb')];reads=[x.text for x in e.findall('r_ele/reb')]
 senses=[];pos=[]
 for sense in e.findall('sense'):
  pos=[x.text for x in sense.findall('pos')] or pos
  gloss=[x.text for x in sense.findall('gloss') if x.get('{http://www.w3.org/XML/1998/namespace}lang','eng')=='eng']
  if gloss:senses.append(dict(gloss=gloss,pos=pos,forms=[x.text for x in sense.findall('stagk')],readings=[x.text for x in sense.findall('stagr')]))
 if senses:
  entry=dict(id=eid,forms=forms,readings=reads,senses=senses,common=bool(e.findall('k_ele/ke_pri')+e.findall('r_ele/re_pri')))
  ENTRIES[eid]=entry
  for key in forms+reads:INDEX[key].append(eid)
 e.clear()
USED={}
def lookup(keys,reading,pos=""):
 expected={"助詞":"particle","動詞":"verb","形容詞":"adjective","代名詞":"pronoun","助動詞":"auxiliary"}.get(pos,"")
 ids=[]
 for key in keys:
  for eid in INDEX.get(key,[]):
   if eid not in ids:ids.append(eid)
 # Matching reading first, then common entries. Other senses remain available.
 ids.sort(key=lambda eid:((bool(expected) and not any(expected in p for sense in ENTRIES[eid]['senses'] for p in sense['pos'])),hira(reading) not in [hira(r) for r in ENTRIES[eid]['readings']],not ENTRIES[eid]['common']))
 for eid in ids[:4]:USED[eid]=ENTRIES[eid]
 return ids[:4]
def tokenize(text):
 raw=list(TOK.tokenize(text,tokenizer.Tokenizer.SplitMode.C));result=[];i=0
 while i<len(raw):
  first=raw[i];j=i+1;surface=first.surface();lemma=first.dictionary_form();reading=first.reading_form();keys=[surface,lemma,first.normalized_form()]
  # Match registered compounds over tokenizer boundaries, never punctuation.
  for end in range(min(len(raw),i+5),i+1,-1):
   group=raw[i:end]
   if any(t.part_of_speech()[0] in ['補助記号','空白','助詞','助動詞'] for t in group):continue
   compound=''.join(t.surface() for t in group)
   if compound in INDEX:
    j=end;surface=compound;lemma=compound;reading=''.join(t.reading_form() for t in group);keys=[compound];break
  # Attach inflection endings to the lexical stem, including suru nouns.
  if j==i+1:
   verbal=first.part_of_speech()[0] in ['動詞','形容詞']
   if first.part_of_speech()[0]=='名詞' and j<len(raw) and raw[j].dictionary_form()=='する':
    verbal=True;j+=1
   if verbal:
    while j<len(raw) and (raw[j].part_of_speech()[0]=='助動詞' or raw[j].surface() in ['て','で']):j+=1
    surface=''.join(t.surface() for t in raw[i:j]);reading=''.join(t.reading_form() for t in raw[i:j]);keys=[surface,lemma,first.normalized_form()]
  lexical=bool(re.search('[ぁ-ゖァ-ヶ一-龯々]',surface))
  ids=lookup(keys,reading,first.part_of_speech()[0]) if lexical else []
  result.append(dict(surface=surface,lemma=lemma,reading=hira(reading),entries=ids,lexical=lexical,begin=first.begin(),end=raw[j-1].end()))
  i=j
 assert ''.join(t['surface'] for t in result)==text
 return result
