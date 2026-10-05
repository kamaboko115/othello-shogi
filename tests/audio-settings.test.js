import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import vm from 'node:vm';
import {createEffectsVolume,effectsVolumeKey} from '../dist/audio-settings.js';
import {createParadoxSounds} from '../dist/paradox.js';
import {createMusic} from '../dist/music.js';
import {binaryAssets,textAssets} from '../worker/static-assets.js';

class AudioStub extends EventTarget{
 constructor(src){super();this.src=src;this.volume=1;this.currentTime=0;this.loads=0;this.plays=0;}
 load(){this.loads++;}
 play(){this.plays++;return Promise.resolve();}
 pause(){}
 cloneNode(){return new AudioStub(this.src);}
}
const storage=()=>{const saved=new Map();return {getItem:key=>saved.get(key)??null,setItem:(key,value)=>saved.set(key,value)};};
const makeVolume=disk=>createEffectsVolume({storage:()=>disk});

test('effect volume defaults to the original levels, persists zero and tolerates blocked storage',()=>{
 const disk=storage(),volume=makeVolume(disk);assert.equal(volume.value,100);
 volume.set(42);assert.equal(makeVolume(disk).value,42);
 volume.set(0);assert.equal(makeVolume(disk).value,0);
 volume.set(200);assert.equal(volume.value,100);volume.set(-1);assert.equal(volume.value,0);
 disk.setItem(effectsVolumeKey,'corrupt');assert.equal(makeVolume(disk).value,100);
 const blocked=createEffectsVolume({storage:()=>{throw Error('blocked');}});assert.equal(blocked.value,100);assert.doesNotThrow(()=>blocked.set(0));assert.equal(blocked.value,0);
});

test('currently playing media changes volume immediately, preserves relative balance and releases ended clips',()=>{
 const volume=makeVolume(storage()),move=new AudioStub(),bell=new AudioStub();
 volume.audio(move,.7);volume.audio(bell,.3);volume.set(50);
 assert.equal(move.volume,.35);assert.equal(bell.volume,.15);
 volume.set(0);assert.equal(move.volume,0);assert.equal(bell.volume,0);assert.equal(move.muted,true);assert.equal(bell.muted,true);
 volume.set(100);assert.equal(move.volume,.7);assert.equal(bell.volume,.3);assert.equal(move.muted,false);assert.equal(bell.muted,false);
 move.dispatchEvent(new Event('ended'));volume.set(20);assert.equal(move.volume,.7);
 volume.audio(move,.42);assert.equal(move.volume,.084);
});

test('collapse audio is absent at import, off and muted; enabled preparation caches both compressed cues before playback',()=>{
 const volume=makeVolume(storage()),audio=[];
 const sounds=createParadoxSounds({volume,audioFactory:src=>{const a=new AudioStub(src);audio.push(a);return a;}});
 assert.equal(audio.length,0);sounds.prepare(false);assert.equal(audio.length,0);
 volume.set(0);sounds.prepare();sounds.play(true);assert.equal(audio.length,0);
 volume.set(50);assert.equal(audio.length,2);assert.ok(audio.every(a=>a.loads===1&&a.plays===0&&a.preload==='auto'));
 sounds.prepare();sounds.play(true);sounds.play(false);
 assert.equal(audio.length,2);assert.ok(audio.every(a=>a.loads===1&&a.plays===1));assert.deepEqual(audio.map(a=>a.volume),[.15,.325]);
 volume.set(0);assert.ok(audio.every(a=>a.volume===0));sounds.play(false);assert.equal(audio[1].plays,1);
});

test('collapse assets are published by both hosts and replace the inline WAV payload',()=>{
 assert.ok(textAssets.includes('audio-settings.js'));
 for(const file of ['sounds/bell.mp3','sounds/broken.mp3'])assert.ok(binaryAssets.includes(file));
 const bytes=['bell','broken'].reduce((sum,name)=>sum+statSync(new URL('../dist/sounds/'+name+'.mp3',import.meta.url)).size,0);
 assert.ok(bytes<50000);assert.doesNotMatch(readFileSync(new URL('../dist/paradox.js',import.meta.url),'utf8'),/data:audio/);
});

test('SE volume leaves the separate BGM setting and volume unchanged',async()=>{
 const disk=storage(),volume=makeVolume(disk),audio=new AudioStub();
 const music=createMusic({storage:()=>disk,document:null,audioFactory:()=>audio});await music.setEnabled(true);volume.set(0);
 assert.equal(audio.volume,.16);assert.equal(music.enabled,true);assert.equal(makeVolume(disk).value,0);
});

function webAudio(){
 const nodes=[],parameter=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){},setTargetAtTime(){}});
 const make=kind=>{const node={kind,targets:[],gain:parameter(),frequency:parameter(),Q:parameter(),playbackRate:parameter(),connect(target){this.targets.push(target);},disconnect(){},start(){},stop(){}};nodes.push(node);return node;};
 const context={state:'running',currentTime:10,sampleRate:44100,destination:{},createGain:()=>make('gain'),createOscillator:()=>make('oscillator'),createBufferSource:()=>make('source'),createBiquadFilter:()=>make('filter'),createBuffer:(_,length)=>({getChannelData:()=>new Float32Array(length)})};
 return {context,nodes};
}

test('every synthesized cue routes through one master output, and HTML Audio uses the same current volume',async()=>{
 const {context,nodes}=webAudio(),volume=makeVolume(storage()),audio=[],timers=[];
 const scope={effectsVolume:volume,window:{addEventListener(){},AudioContext:function(){return context;}},Audio:class extends AudioStub{constructor(src){super(src);audio.push(this);}cloneNode(){return new scope.Audio(this.src);}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}};
 const source=readFileSync(new URL('../dist/sound.js',import.meta.url),'utf8');
 vm.createContext(scope);vm.runInContext(source.replace(/^import .*;\r?\n/,'').replaceAll('export ',''),scope);
 assert.equal(audio.length,0);volume.set(50);scope.prepareMoveSound();assert.equal(audio.length,1);assert.equal(audio[0].plays,0);
 for(const [name,args] of [
  ['playMoveSound',[]],['playClockWarning',[true]],['playTossShatterSound',[]],['playTossCutInSound',[]],['playSwordSound',[]],
  ['playMultiFlipSound',[]],['playVictorySound',[]],['playDefeatSound',[]],['playResultSound',[true]],['playResultSound',[false]],
  ['playApplauseSound',[]],['playArcadeCue',['tap']],['playCaptureSound',[true]],['playFireworks',[6]],['playSmallComboFinish',[4]],
  ['playComboImpact',[]],['playComboSound',[4]],['playHelperDeparture',[]],['playParadoxArrival',[]],
  ['playParadoxMotionSound',['thunder']],['playParadoxMotionSound',['rumble']],['playParadoxMotionSound',['warp']],
  ['playParadoxRareSound',['charisma']],['playParadoxRareSound',['summon']],['playParadoxRareSound',['spear-rise']]
 ])await scope[name](...args);
 const outputs=nodes.filter(n=>n.targets.includes(context.destination));assert.equal(outputs.length,1);assert.equal(outputs[0].gain.value,.5);
 assert.ok(nodes.filter(n=>n.kind==='oscillator'||n.kind==='source').every(n=>n.targets.length>0));
 assert.ok(audio.filter(a=>a.plays>0).every(a=>a.volume===.35));
 volume.set(0);assert.equal(outputs[0].gain.value,0);assert.ok(audio.every(a=>a.volume===0));
 // Scheduled multi-flip sounds consult the updated setting when they run.
 const before=audio.reduce((sum,a)=>sum+a.plays,0);for(const fn of timers.splice(0))fn();assert.equal(audio.reduce((sum,a)=>sum+a.plays,0),before);
 volume.set(100);assert.equal(outputs[0].gain.value,1);
});
