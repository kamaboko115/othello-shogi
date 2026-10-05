import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {empty} from '../dist/engine.js';
import {isVictoryFor,runEffects} from '../dist/move-effect.js';

test('先手・後手のどちらでも勝敗の音を表示と同じ視点で選ぶ',async()=>{
 for(const winner of [0,1])for(const side of [0,1]){
  const effect={kind:'victory',text:(winner?'後手':'先手')+'の勝ち'};
  assert.equal(isVictoryFor(effect,side),winner===side);
  const controller=new AbortController(),heard=[];
  await runEffects([effect],{signal:controller.signal,victory:e=>heard.push(isVictoryFor(e,side)?'win':'lose'),show:()=>controller.abort(),hide(){},applause:()=>assert.fail('終局時に拍手しない')});
  assert.deepEqual(heard,[winner===side?'win':'lose']);
 }
});

const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
function view(){
 const events=[],state=empty(),c={online:{room:'r',version:0,round:1},state,connected:true,logs:[],selected:null,legal:[],animationKey:'',
  clearInspection(){},stopAI(){},cancelCombo(){},cancelCollapse(){},render(){},paintLastCollapse(){},syncAI(){},$:()=>({open:false}),
  slidingMove:()=>null,capturedPiece:()=>null,kingCaptureSquare:()=>null,
  presentEffects:s=>events.push(s.result),performance:{now:()=>0}};
 vm.createContext(c);vm.runInContext(app.slice(app.indexOf('function adopt('),app.indexOf('const roomPoller=')),c);
 const update=(version,result,round=1)=>c.adopt({room:'r',version,round,state:{...empty(),result},logs:[]});
 return {c,events,update};
}
for(const reason of ['投了','時間切れ','指せる手なし'])test(`${reason}では駒が動かなくても一度だけ終局演出を出す`,()=>{
 const {events,update}=view(),result='後手の勝ち（'+reason+'）';update(1,result);assert.deepEqual(events,[result]);
 update(1,result);update(2,result);assert.deepEqual(events,[result]);
});
test('別ルーム・古い更新・再試合の状態から終局演出を再生しない',()=>{
 const {c,events,update}=view();c.adopt({room:'other',version:1,state:{result:'後手の勝ち'}});update(-1,'後手の勝ち');update(1,'後手の勝ち',2);assert.deepEqual(events,[]);
});

const sound=readFileSync(new URL('../dist/sound.js',import.meta.url),'utf8');
const code='let context;'+sound.slice(sound.indexOf('function prepare(){'),sound.indexOf('function tone('))+sound.slice(sound.indexOf('export function playDefeatSound('),sound.indexOf('// A short crowd applause')).replaceAll('export ','');
function audio(state='running'){
 const nodes=[],ramps=[];
 const param=()=>({value:0,setValueAtTime(v,t){this.initial=v;},linearRampToValueAtTime(){},exponentialRampToValueAtTime(v,t){ramps.push({from:this.initial,to:v,time:t});}});
 const make=kind=>{const n={kind,connect(){},disconnect(){this.disconnected=true;},start(t){this.started=t;},stop(t){if(t!==undefined)this.stopped=t;},frequency:param(),gain:param()};nodes.push(n);return n;};
 const context={state,currentTime:10,destination:{},resume:()=>Promise.resolve(),createGain:()=>make('gain'),createOscillator:()=>make('osc')};
 const c={effectsVolume:{output:context=>context.destination},window:state==='unsupported'?{}:{AudioContext:function(){return context;}}};vm.createContext(c);vm.runInContext(code,c);return {c,nodes,ramps};
}
test('敗北音は即時に下降する音を鳴らし、1.5秒以内に終わりノードを解放する',()=>{
 const {c,nodes,ramps}=audio();c.playResultSound(false);const voices=nodes.filter(n=>n.kind==='osc');
 assert.equal(voices.length,4);assert.equal(voices[0].started,10);assert.ok(voices.every(v=>v.stopped<11.5));
 assert.ok(ramps.filter(r=>r.from>1).every(r=>r.to<r.from));voices.at(-1).onended();assert.ok(nodes.every(n=>n.disconnected));
});
test('敗北音は中断時に解放し、音声が使えない環境でも対局を止めない',()=>{
 const {c,nodes}=audio(),controller=new AbortController();c.playDefeatSound(controller.signal);controller.abort();assert.ok(nodes.every(n=>n.disconnected));
 for(const status of ['unsupported','suspended']){const a=audio(status);assert.doesNotThrow(()=>a.c.playDefeatSound());assert.equal(a.nodes.length,0);}
 const cancelled=audio();cancelled.c.playDefeatSound(controller.signal);assert.equal(cancelled.nodes.length,0);
});
