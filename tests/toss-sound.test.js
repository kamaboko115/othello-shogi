import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/sound.js',import.meta.url),'utf8');
const code='let context;'+source.slice(source.indexOf('function prepare(){'),source.indexOf('function tone('))+source.slice(source.indexOf('export function playTossShatterSound()'),source.indexOf('export function playSwordSound(')).replaceAll('export ','');
function audio(){
 const nodes=[];
 const parameter=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 const make=kind=>{const node={kind,disconnected:false,connect(){},disconnect(){this.disconnected=true;},start(at){this.started=at;},stop(at){this.stopped=at;},gain:parameter(),frequency:parameter()};nodes.push(node);return node;};
 const context={state:'running',currentTime:10,sampleRate:48000,destination:{},createGain:()=>make('gain'),createOscillator:()=>make('oscillator'),createBufferSource:()=>make('source'),createBiquadFilter:()=>make('filter'),createBuffer(channels,length){assert.equal(channels,1);const data=new Float32Array(length);return {getChannelData:()=>data};}};
 return {context,nodes};
}

test('文字の破壊音は遅延なしで鳴り、破片の余韻後に音声ノードを解放する',()=>{
 const {context,nodes}=audio(),c={window:{AudioContext:function(){return context;}}};vm.createContext(c);vm.runInContext(code,c);c.playTossShatterSound();
 const crack=nodes.find(n=>n.kind==='source'),fragments=nodes.filter(n=>n.kind==='oscillator');
 assert.equal(crack.started,10);assert.equal(fragments.length,6);assert.equal(fragments[0].started,10);
 assert.ok(fragments.every(n=>n.stopped<11));assert.equal(nodes.find(n=>n.kind==='gain').gain.value,.6);
 assert.ok(crack.buffer.getChannelData(0).some(value=>value!==0));fragments.at(-1).onended();assert.ok(nodes.every(n=>n.disconnected));
});

test('音声が使えない環境では演出を止めず、停止中は合成しない',()=>{
 for(const state of ['unsupported','suspended']){
  const {context,nodes}=audio();context.state=state;context.resume=()=>Promise.resolve();
  const c={window:state==='unsupported'?{}:{AudioContext:function(){return context;}}};vm.createContext(c);vm.runInContext(code,c);assert.doesNotThrow(()=>c.playTossShatterSound());assert.doesNotThrow(()=>c.playTossCutInSound());assert.equal(nodes.length,0);
 }
});

test('カットインの金属音はその瞬間に開始し、1秒以内の余韻後にノードを解放する',()=>{
 const {context,nodes}=audio(),c={window:{AudioContext:function(){return context;}}};vm.createContext(c);vm.runInContext(code,c);c.playTossCutInSound();
 const swish=nodes.find(n=>n.kind==='source'),tones=nodes.filter(n=>n.kind==='oscillator');
 assert.equal(swish.started,10);assert.equal(tones[0].started,10);assert.equal(tones.length,4);
 assert.ok(swish.buffer.getChannelData(0).some(value=>value!==0));assert.ok(tones.every(n=>n.stopped<11));
 tones.at(-1).onended();assert.ok(nodes.every(n=>n.disconnected));
});

test('thunder and existing paradox sounds schedule ramps relative to the audio clock and release nodes',()=>{
 for(const kind of ['thunder','rumble','flip','warp']){
  const {context,nodes}=audio();const ramps=[];
  const gain=context.createGain;context.createGain=()=>{const n=gain();for(const method of ['setValueAtTime','linearRampToValueAtTime','exponentialRampToValueAtTime'])n.gain[method]=(value,at)=>{assert.ok(at>=context.currentTime,kind+' must not schedule a past ramp');ramps.push(at);};return n;};
  const filter=context.createBiquadFilter;context.createBiquadFilter=()=>{const n=filter();n.Q={value:0};return n;};
  const c={window:{AudioContext:function(){return context;}}};vm.createContext(c);
  vm.runInContext('let context;'+source.slice(source.indexOf('function prepare(){'),source.indexOf('function tone('))+source.slice(source.indexOf('let paradoxNoise;'),source.indexOf('// Original rare-event sounds')).replaceAll('export ',''),c);
  const stop=c.playParadoxMotionSound(kind,450,0);assert.ok(ramps.length>0);assert.equal(nodes.find(n=>n.kind==='source').started,10);stop();assert.ok(nodes.every(n=>n.disconnected));
 }
});
