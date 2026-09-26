const test = require('node:test');
const assert = require('node:assert/strict');
const {bindAudioProgress, STORAGE_KEY} = require('../src/core/audio.cjs');
class Element extends EventTarget { fire(name) { this.dispatchEvent(new Event(name)); } }
function fixture(seed = {}) {
  let value = JSON.stringify(seed), writes = 0, time = 0;
  const storage = {getItem: () => value, setItem: (_, next) => { value = next; writes++; }};
  const audio = Object.assign(new Element(), {duration: 100, currentTime: 0, paused: true, ended: false, seeking: false});
  const checkbox = Object.assign(new Element(), {checked: false});
  const messages = [];
  const controller = bindAudioProgress({audio, checkbox, storage, id: 'episode', now: () => time, status: s => messages.push(s)});
  return {audio, checkbox, storage, controller, messages, data: () => JSON.parse(value), writes: () => writes, advance: ms => time += ms};
}
test('restores position and done without autoplay or writes', () => {
  const f = fixture({episode: {position: 42, done: true}});
  assert.equal(f.audio.currentTime, 42); assert.equal(f.checkbox.checked, true);
  assert.equal(f.audio.paused, true); assert.equal(f.writes(), 0);
});
test('throttles playback; flushes on pause, seek and navigation', () => {
  const f = fixture(); f.audio.paused = false;
  for (let i = 1; i <= 10; i++) { f.audio.currentTime = i; f.audio.fire('timeupdate'); f.advance(1000); }
  assert.equal(f.writes(), 2);
  f.audio.paused = true; f.audio.fire('pause'); assert.equal(f.data().episode.position, 10);
  f.audio.currentTime = 72; f.audio.fire('seeked'); assert.equal(f.data().episode.position, 72);
  f.audio.currentTime = 73; f.controller.save(); assert.equal(f.data().episode.position, 73);
});
test('done toggles preserve other episodes and simultaneous position updates', () => {
  const f = fixture({other: {done: true}, episode: {position: 40}});
  f.checkbox.checked = true; f.checkbox.fire('change'); assert.equal(f.data().episode.position, 40);
  f.storage.setItem(STORAGE_KEY, JSON.stringify({...f.data(), episode: {position: 45, done: false}}));
  f.audio.currentTime = 50; f.controller.save(); assert.equal(f.data().episode.done, false);
  assert.deepEqual(f.data().other, {done: true});
  f.controller.refreshDone(); assert.equal(f.checkbox.checked, false);
});
test('finished recording restarts at zero without marking completion implicitly', () => {
  const f = fixture(); f.audio.currentTime = 100; f.audio.ended = true; f.audio.fire('ended');
  assert.equal(f.data().episode.position, 0); assert.equal(f.data().episode.ended, true);
  assert.equal(f.checkbox.checked, false);
  const fresh = fixture(f.data()); assert.equal(fresh.audio.currentTime, 0);
});
test('metadata and duration guards avoid invalid seeks', () => {
  for (const position of [-8, 99.9, 500]) assert.equal(fixture({episode: {position}}).audio.currentTime, 0);
  const audio = Object.assign(new Element(), {duration: NaN, currentTime: 0, paused: true});
  const checkbox = new Element(); const storage = {getItem: () => JSON.stringify({episode: {position: 20}}), setItem: () => assert.fail('no initial writes')};
  bindAudioProgress({audio, checkbox, storage, id: 'episode'});
  audio.duration = 100; audio.fire('loadedmetadata'); assert.equal(audio.currentTime, 20);
});
test('unreadable storage is preserved and reported', () => {
  const f = fixture(); f.storage.getItem = () => '{broken';
  f.checkbox.checked = true; f.checkbox.fire('change'); assert.equal(f.writes(), 0);
  assert.match(f.messages.at(-1), /could not be read/);
});
test('account audio uses shared progress and cannot carry position into a different account',()=>{
 const audio=Object.assign(new Element(),{duration:100,currentTime:0,paused:true,ended:false,seeking:false,pause(){this.paused=true;this.fire('pause');}}),checkbox=new Element(),writes=[];
 const progress={user:{id:'A'},get:(kind,id,field)=>field==='done'?false:{seconds:progress.user.id==='A'?30:8,duration:100,ended:false},set:(...args)=>writes.push({owner:progress.user.id,args})};
 const c=bindAudioProgress({audio,checkbox,progress,id:'episode'});assert.equal(audio.currentTime,30);
 audio.paused=false;audio.currentTime=45;audio.fire('timeupdate');assert.equal(writes[0].args[3].seconds,45);
 progress.user={id:'B'};c.refreshDone();assert.equal(audio.paused,true);assert.equal(audio.currentTime,8);assert.equal(writes.length,1);
 checkbox.checked=true;checkbox.fire('change');assert.equal(writes[1].owner,'B');assert.deepEqual(writes[1].args,['audio','episode','done',true]);
});
test('account switch waits for loaded data and paused playback follows refreshed account position',()=>{
 const audio=Object.assign(new Element(),{duration:100,currentTime:0,paused:true,ended:false,seeking:false,pause(){this.paused=true;this.fire('pause');}}),checkbox=new Element();let loaded=true,seconds=30;
 const progress={user:{id:'A'},canEdit:()=>loaded,get:(_,id,field)=>field==='done'?false:{seconds,duration:100,ended:false},set:()=>assert.fail('refresh must not write')};
 const c=bindAudioProgress({audio,checkbox,progress,id:'episode'});assert.equal(audio.currentTime,30);
 loaded=false;progress.user={id:'B'};seconds=0;c.refreshDone();assert.equal(audio.currentTime,0);
 loaded=true;seconds=8;c.refreshDone();assert.equal(audio.currentTime,8);seconds=24;c.refreshDone();assert.equal(audio.currentTime,24);
 audio.paused=false;seconds=40;c.refreshDone();assert.equal(audio.currentTime,24);
});
