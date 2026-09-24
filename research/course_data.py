from pathlib import Path
import json
R=Path(__file__).parent
catalog=json.load(open(R/'verified-catalog.json')); byid={v['id']:v for v in catalog}; indexed=json.load(open(R/'channel-videos.json'))
stages=[]
def stage(title,note,rows):
 lessons=[]
 for line in rows.strip().splitlines():
  refs,topic,learn=line.split('|',2)
  ids=[] if refs=='-' else [indexed[int(x)]['id'] if x.isdigit() else x for x in refs.split(',')]
  for id in ids:assert byid[id]['verified'],id
  lessons.append(dict(id='g-'+(ids[0] if ids else str(len(stages))+'-'+str(len(lessons))),topic=topic,description=learn,video_ids=ids,status='verified' if ids else 'not-found'))
 stages.append(dict(id='stage-'+str(len(stages)+1),title=title,note=note,lessons=lessons))
stage('01 · Sentence foundations','Start here, or tick the basics you already understand. The first link is the main lesson; older alternatives are optional.',r'''
180,298|は + です: your first sentence|Build “X is Y” sentences and understand the role of a topic marker.
178|Questions with か|Ask yes/no and “what is…” questions in polite and casual speech.
175,296|これ・それ・あれ|Point to this, that, and things farther away; distinguish polite direction words.
152|この・その・あの + noun|Choose between a standalone demonstrative and a word placed before a noun.
142|Possession and noun links: の|Connect nouns to express possession and relationships.
295|Noun negation: じゃない|Say that something is not a particular thing, in casual and polite forms.
294|い-adjectives and な-adjectives|Describe things and attach the right kind of adjective to a noun.
293|Negative adjectives|Say “not expensive” or “not quiet” using the two adjective patterns.
292|Past and past-negative adjectives|Describe how things were and how they were not.
153|Adjective conjugation checkpoint|Test adjective negatives and past forms before adding more grammar.
232|ある・いる vs です; がない vs じゃない|Distinguish existence from identity and living things from other things.
-|Past noun sentences: だった・でした|Review “was” and “was not” for nouns; no dedicated matching public lesson found.
38|Pronouns and omitted subjects|Choose natural ways to refer to people and learn when pronouns are inappropriate.
''')
stage('02 · Verbs and basic particles','Learn the plain and polite forms that later lessons build on.',r'''
291|Verb basics and を|Recognize basic verbs and mark the thing affected by an action.
288|Polite verbs: ます|Turn dictionary forms into polite verb forms.
286|Polite negatives: ません|Say that you do not do something politely.
285|Polite past: ました・ませんでした|Talk about actions you did or did not do.
287|に・で・と: first uses|Mark destinations, places of action, tools, and companions.
52|Plain negatives: ない|Form informal negatives for the different verb groups.
50|Plain past negative: なかった|Say what did not happen in casual Japanese.
51|Negative-verb checkpoint|Check your recall of the plain negative conjugations.
289|Verb nominalization: の + adjective|Treat an action as a noun to say that doing it is fun or difficult.
266|上手・下手・得意・苦手|Describe skills and preferences without treating these expressions as interchangeable.
-|こと vs の: full nominalizer contrast|Distinguish where these nominalizers can be used; related coverage exists, but no dedicated matching public video was verified.
-|Adverbs: adjective く / に + verb|Describe how an action happens; no dedicated matching public lesson found.
227|に vs で: deeper comparison|Resolve location, destination, means, and other particle choices in context.
244|は vs が: deeper comparison|Distinguish topics, subjects, contrast, and new information.
99|Particle checkpoint, including へ・まで・から|Review the roles of common particles across complete sentences.
''')
stage('03 · The て-form toolkit','Make requests, link actions, and talk about ongoing actions and past experiences.',r'''
7,280,279,278,277|Conjugate the て-form|Learn the endings for each verb group; use the older group-by-group lessons if needed.
iNF7ntoPDCs|Requests with てください|Use the て-form for basic requests; this older lesson also introduces ongoing actions.
5|Ongoing actions: ている・ています|Describe what someone is doing using the plain and polite forms.
230|Present/future vs ている|Avoid using the simple non-past form when you mean an action in progress.
259|Not yet: ていない|Say an action has not happened yet using the negative of ている.
276,DSfohWiDsrw|ます and て-form checkpoint|Test conjugations; the short video offers a quick extra drill.
275|Plain past: た-form|Build informal past tense from familiar conjugation patterns.
274|Experience: たことがある|Say that you have done something before.
258|Representative actions: たり…たりする|List examples of things you do without giving an exhaustive list.
106|Connect adjectives with くて・で|Join descriptions without using the noun connector と.
34|Connect actions and ideas: て・と・や・し・も|Choose the right “and/also” construction for verbs, nouns, and reasons.
265|Permission: てもいい|Ask if you may do something and give permission.
185|Beginner verb overview: wants, invitations, “don’t”|Review common verb patterns together, including ways to tell someone not to do something.
-|Prohibition: てはいけない・ちゃだめ|Say an action is not allowed; no dedicated matching public lesson found.
-|ないで vs なくて|Distinguish doing something without an action from a negative connection or reason; no dedicated matching public lesson found.
''')
stage('04 · Wants, plans, and everyday choices','Use the forms you know to express what you want, can do, and intend to do.',r'''
273|Want to: たい|Express your wish to do an action.
272|Do not want to: たくない|Negate wishes and conjugate the たい expression.
254|Can: potential forms and ことができる|Express ability and distinguish verb-group potential endings.
149|Invitations and volitional forms|Make “let’s…” suggestions and “shall I…?” offers.
147|Plans: つもり・予定・ようと思う|Talk about intentions and arrangements, and compare how definite they sound.
17|Have to: obligation and necessity|Express duties and needs; the lesson also contrasts past obligations and regrets.
255|No need: なくてもいい|Say that someone does not have to do something.
156|Advice: たほうがいい・ないほうがいい|Recommend an action or advise against it.
251|Comparisons: より・ほうが|Say that one thing is more or better than another.
114|Only: だけ vs しか|Limit a statement while choosing the correct positive or negative form.
-|Want a thing: ほしい; others’ wishes: たがる|Distinguish wanting an object from an action and describing someone else’s desire; no dedicated matching public lesson found.
-|Go to do: verb stem + に行く|Express the purpose of a trip; Misa’s old #34 is documented, but its public video could not be verified.
-|Too much / easy or hard to do: すぎる・やすい・にくい|Add these productive endings to describe excess or difficulty; no dedicated matching public lesson found.
''')
stage('05 · Longer sentences','Combine clauses before moving on to more abstract meanings.',r'''
12|Relative clauses and word order|Put a descriptive clause before a noun to build longer Japanese sentences.
245|Reasons: から vs ので|Explain why something happens and compare natural ways to ask why.
137|Contrast: でも・けど・が・のに|Connect contrasting ideas and distinguish neutral “but” from unexpected results.
138|Before: 前に vs 前で|Distinguish time expressions from positions in front of something.
-|Quotation: と言う・と思う・って|Report statements and thoughts; some linked lessons use these forms, but no dedicated matching public lesson found.
-|Embedded questions: か・かどうか|Put “what/where…” or “whether…” inside another sentence; an official text article exists, but no matching public video found.
-|After: てから・たあとで|Place one event after another and clarify their sequence; no dedicated matching public lesson found.
-|Even if: ても・でも|Keep the result true despite a condition; no dedicated matching public lesson found.
''')
stage('06 · If, when, and purpose','Follow Misa’s four-part conditional sequence, then apply it to goals and wishes.',r'''
242|Conditional 1: と vs とき|Express regular consequences and compare “if” with “when.”
241|Conditional 2: たら|Use たら for conditions and events that happen after something else.
240|Conditional 3: なら|Respond to an assumed situation or information someone gives you.
236|Conditional 4: ば・もし|Form ば conditions, compare all four patterns, and introduce counterfactual wishes.
117|Purpose 1: ために vs ように|Distinguish intentional goals from desired outcomes.
116|Purpose 2: ように vs のに|Extend purpose expressions and compare their grammatical connections.
159|Hopes: といい・ますように|Express hopes for yourself and other people.
-|During / while there is time: 間・間に・うちに|Place actions within a time window; no dedicated matching public lesson found.
''')
stage('07 · Giving, receiving, and voice','Learn perspective before combining passive and causative grammar.',r'''
219|Giving and receiving: あげる・くれる・もらう|Choose the verb that matches the giver, receiver, and speaker’s viewpoint.
208|Favors: てあげる・てくれる・てもらう|Describe doing an action for someone and receiving a favor.
41|Want someone to: てほしい vs てもらいたい|Request or express a wish for someone else’s action.
222|Transitive vs intransitive verbs|Distinguish someone changing a thing from a thing changing on its own.
228|Passive: れる・られる|Describe what happens to someone and how an action affects them.
190|Causative 1: せる・させる|Say that someone makes another person do something.
189|Causative 2: permission and favors|Combine “let someone…” with giving and receiving expressions.
188|Causative-passive|Say that someone was made or forced to do something.
''')
stage('08 · Time, state, and change','Extend familiar verb forms to describe preparation, results, and intention.',r'''
203|Try: てみる vs ようとする|Distinguish trying an action out from attempting to do it.
174|Preparation: ておく・とく|Do something in advance and recognize the common spoken contraction.
171|Resulting states: てある vs ている vs ておく|Connect transitivity with results, current states, and preparation.
243|Completion or regret: てしまう・ちゃう|Describe finishing an action or doing something unintentionally.
100|Just did: たばかり vs たところ|Distinguish subjective recency from the immediate stage after an action.
89|Movement and change: ていく vs てくる|Express direction relative to the speaker and changes over time.
32|Unchanged state: まま vs ながら vs て|Describe an action done with a state continuing; compare simultaneous actions.
48|Decisions: ことにする vs ことになる|Distinguish a personal decision from something being decided or arranged.
146|Past intention: たつもり vs つもりだった|Contrast believing you did something with having intended to do it.
19|わかる vs 知っている|Distinguish understanding from having knowledge and use the appropriate aspect.
-|Become / make: くなる・になる・くする・にする|Describe changes in qualities and deliberate changes; no dedicated matching public lesson found.
-|New ability and habits: ようになる・ようにする|Describe becoming able to do something and making an effort to do it; no dedicated matching public lesson found.
-|Action stages: ところだ・ているところだ|Say an action is about to begin or is in progress; the linked たところ lesson does not verify full coverage of this family.
''')
stage('09 · Explanation and uncertainty','Add context, inference, appearance, and conversational expectations.',r'''
201|Explanatory の・んだ・んです|Give background, seek explanations, and soften how you enter a conversation.
198|じゃない・じゃん beyond negation|Recognize confirmation, surprise, and other conversational meanings.
196|んじゃない vs じゃないの|Express a guess and distinguish question or confirmation nuances.
135|でしょう・だろう|Express probability or seek agreement, and compare with ね.
151|かもしれない vs 多分|Express uncertainty and choose between “maybe” and “probably.”
158|Expected result: はず|Say what should be true based on the situation.
207|Appearance: そう|Say that something looks a certain way, including negative appearance forms.
206|Hearsay: そうだ vs らしい|Report information you heard and distinguish forms of indirect evidence.
191|Resemblance: みたい・よう・らしい・っぽい|Compare similarity, typical qualities, and tendencies.
''')
stage('10 · Intermediate nuance and selected N2 topics','These are later studies, not a complete N3/N2/N1 exam syllabus.',r'''
132|わけだ 1: “that explains it”|Make sense of new information by drawing a conclusion.
129|わけだ 2: “which means…”|Restate a consequence and summarize a line of reasoning.
128|わけではない・わけがない|Contrast “it does not mean…” with “there is no way…”.
155|べき vs はず vs ほうがいい|Distinguish a duty or judgment from an expectation or recommendation.
108|ばかり・てばかり|Describe doing only one thing and contrast other “only” expressions.
44|ほど…ない|Make “not as…” comparisons and express strong evaluations.
42|ほど vs ぐらい|Express degree and “so…that…” results.
125|ずにはいられない vs つい…ちゃう|Say you cannot help doing something or do it involuntarily.
67|どうしても|Express determination or an inability despite effort.
86|なんて vs なんか|Express surprise, dismissal, or a negative evaluation in conversation.
85|もの・もん・んだもん|Justify yourself or give an emotionally colored explanation.
81|ものだ・たものだ|Talk about general expectations and reminisce about past habits.
14|多い vs 多く vs いっぱい vs たくさん|Use quantities naturally with nouns and verbs.
15|More ways to say “a lot”|Compare common quantity expressions in context.
47|すべて・全部・みんな・ずっと|Distinguish “all/everything” expressions from continuity over time.
-|わけにはいかない|Express being unable to do something for social or situational reasons; no dedicated matching public lesson found.
-|たびに・につれて・とともに|Link repeated events or changes that progress together; no dedicated matching public lesson found.
-|おかげで・せいで|Attribute a positive or negative outcome to a cause; no dedicated matching public lesson found.
-|はずがない・に違いない・に決まっている|Extend expressions of strong inference and certainty; no dedicated matching public lesson found.
''')
stage('11 · Register and natural conversation','Apply the grammar in social situations; these lessons include usage as well as grammar.',r'''
237|Sentence endings: よ・ね・よね・っけ|Choose an ending for information, agreement, or recalling something.
30|When to use だ・だね・だな・だよ|Distinguish the plain copula from sentence-ending nuances.
25|Sentence-final ぞ|Recognize assertive or dramatic speech and its social implications.
84|Commands and なさい|Compare command forms with softer or conventional expressions.
90|Requests beyond ください|Choose a request that fits the situation and relationship.
131|Keigo: respectful and humble forms|Distinguish raising someone else’s status from lowering your own actions.
181|Restaurant speech and keigo in practice|Follow an order and recognize the polite forms used by staff and customers.
113|Short keigo review|Review a compact set of restaurant and café expressions.
75|Polite vs casual vs rude speech|Compare how the same communicative goal changes with register.
63|Tokyo casual speech|Recognize contractions and phrasing used in informal conversation.
70|Everyday casual expressions|Extend your informal conversation toolkit with common spoken expressions.
62|Kansai vs standard Japanese|Recognize regional forms after establishing standard Japanese grammar.
139|Changing the subject|Choose formal or casual ways to introduce a new topic.
''')
stage('12 · Grammar in context and review','Optional consolidation. Revisit these when you finish a stage rather than racing through every video.',r'''
102|N5 grammar checkpoint|Use a mixed grammar, vocabulary, and kanji test to find weak basics.
101|N4 grammar checkpoint|Check how intermediate-beginner grammar works in test questions.
168|N4 verb-pattern review|Practice たら, たり, てみる, ておく, and other learned patterns.
36|N5/N4 reading and listening review|Recognize familiar grammar while working through connected language.
118|Informal conversation practice|Listen for grammar as it appears in casual exchanges.
173|N4 conversation 1|Consolidate N4-level structures in a listening lesson.
169|N4 conversation 2|Continue applying the same structures in another conversation.
136|Formal and informal listening checkpoint|Test comprehension across contrasting speech styles.
8|N4 story practice: Hanasaka Jiisan|Read and listen to a folktale adapted for N4 practice.
6|N3 story practice: Hanasaka Jiisan|Revisit the story with more demanding language.
0|N3 grammar and integrated practice|Apply grammar in a combined vocabulary, reading, and listening lesson.
110|N3–N2 listening practice|Work through a longer listening lesson using more advanced language.
10|Travel phrases with grammar|Apply practical sentence patterns to travel situations.
9|Anime trailer analysis: DAN DA DAN|Notice grammar and natural phrasing in a short authentic clip.
122|Literature reading practice|Apply the course to a guided reading of The Restaurant of Many Orders.
''')
stage('13 · Further coverage gaps','Keep these later topics on your roadmap. No matching dedicated public Misa lesson was found; absence from this search is not proof that she never covered them.',r'''
-|ことはない・ことがある: frequency and necessity|Distinguish occasional occurrences and lack of necessity from past experience.
-|に対して・について・によって|Mark a target, topic, or varying basis in longer statements.
-|として・にとって|Express a role or the viewpoint from which something matters.
-|ばかりでなく・だけでなく・のみならず|Extend a statement with “not only… but also…”.
-|くせに・ものの・にもかかわらず|Express different kinds of unexpected contrast.
-|限り・さえ…ば・ない限り|Specify limits and minimum or necessary conditions.
-|Advanced formal patterns: に至る・を余儀なくされる|Recognize formal written grammar; no dedicated matching public lesson found.
''')
# Bunpro is a cross-check for prerequisites, not a copied course or full JLPT checklist.
additions={
 1:[('gap-subject-swap','が / の inside relative clauses','Recognize this subject-marker alternation after studying relative clauses; no dedicated matching public lesson found.'),('gap-adjective-nouns','Adjective nouns: さ','Turn a quality into a noun; no dedicated matching public lesson found.')],
 3:[('gap-indefinites','何か・誰か・何も・誰も','Express indefinite people or things and their negatives; no dedicated matching public lesson found.'),('gap-approximation','Approximate amounts: くらい・ぐらい・ごろ','Distinguish rough quantities from approximate times; no dedicated matching public comparison found.')],
 7:[('gap-phases','Action phases: 始める・出す・続ける・終わる','Describe starting, continuing, or finishing an action; no dedicated matching public lesson found.'),('gap-perception','見える・聞こえる vs potential forms','Distinguish visibility and audibility from ability; no dedicated matching public lesson found.')],
 8:[('gap-wonder','かな・かしら','Express wondering rather than asking a direct question; no dedicated matching public lesson found.')],
 9:[('gap-more-more','ば…ほど','Link increasing degrees; related degree lessons are available, but no dedicated matching public comparison found.')],
 10:[('gap-literary-copula','Formal writing: である','Recognize the written copula after learning ordinary plain and polite speech; no dedicated matching public lesson found.')]
}
for idx,items in additions.items():
 for lid,topic,description in items:
  stages[idx]['lessons'].append(dict(id=lid,topic=topic,description=description,video_ids=[],status='not-found',outline_reference='https://bunpro.jp/grammar_points'))
# Place the relative-clause alternation after the relative-clause lesson.
move=next(x for x in stages[1]['lessons'] if x['id']=='gap-subject-swap')
stages[1]['lessons'].remove(move);stages[4]['lessons'].insert(1,move)
(R.parent/'grammar-data.json').write_text(json.dumps(dict(checked='2026-09-13',stages=stages),ensure_ascii=False,indent=2))
assigned={id for s in stages for l in s['lessons'] for id in l['video_ids']}
print('stages',len(stages),'rows',sum(len(s['lessons']) for s in stages),'unique videos',len(assigned),'gaps',sum(not l['video_ids'] for s in stages for l in s['lessons']))
for v in catalog:
 if v['verified'] and v['id'] not in assigned and any(w in v.get('verified_title','').lower() for w in ['grammar','particle','verb','adjective','form','lesson',' vs ']):print('REVIEW EXCLUDED',v['id'],v['verified_title'])
