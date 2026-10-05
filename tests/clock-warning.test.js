import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createClockWarning} from '../dist/clock-warning.js';
import {clockBudget} from '../dist/match-options.js';

test('30/10 seconds beep once; 5 through 1 double beep once despite 100ms updates',()=>{
 const sounds=[],warn=createClockWarning(urgent=>sounds.push(urgent));
 for(let ms=31000;ms>0;ms-=100)warn({turnKey:'turn1',remaining:ms,active:true});
 assert.deepEqual(sounds,[false,false,true,true,true,true,true]);
 warn({turnKey:'turn1',remaining:0,active:true});assert.equal(sounds.length,7);
});

test('delayed ticks do not stack alarms and corrected clocks do not repeat a threshold',()=>{
 const sounds=[],warn=createClockWarning(urgent=>sounds.push(urgent));
 for(const remaining of [31000,3900,4300,3900,2900])warn({turnKey:'turn1',remaining,active:true});
 assert.deepEqual(sounds,[true,true]);
 warn({turnKey:'turn2',remaining:5000,active:true});assert.deepEqual(sounds,[true,true,true]);
});

test('hidden ticks stay quiet with no backlog, and starting at 25 seconds waits until 10',()=>{
 const sounds=[],warn=createClockWarning(urgent=>sounds.push(urgent));
 warn({turnKey:'turn1',remaining:25000,active:true});
 warn({turnKey:'turn1',remaining:10000,active:true,audible:false});
 warn({turnKey:'turn1',remaining:9500,active:true});assert.deepEqual(sounds,[]);
 warn({turnKey:'turn1',remaining:5000,active:true});assert.deepEqual(sounds,[true]);
 for(const remaining of [Infinity,0,-1])warn({turnKey:'turn1',remaining,active:true});
 assert.equal(sounds.length,1);
});

test('the existing app clock tick only warns for the local player’s active friend turn',()=>{
 const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),from=source.indexOf('const warnClock='),to=source.indexOf('const advancedOpen=',from),sounds=[];
 const state={turn:0,ply:0,result:''},online={kind:'friend',room:'room',round:1,side:0,joined:true,state,clock:{remaining:[30000,30000],since:1000},settings:{timeControl:'turn30'}};
 let now=0,tick;
 const c={online,state,clockOffset:0,Date:{now:()=>now},document:{hidden:false},$:id=>id==='furigoma'?{hidden:true}:{classList:{toggle(){}}},clockBudget,createClockWarning,playClockWarning:urgent=>sounds.push(urgent),setInterval:fn=>tick=fn};
 vm.runInNewContext(source.slice(from,to),c);
 tick();assert.deepEqual(sounds,[]); // Animation allowance.
 now=1000;tick();tick();assert.deepEqual(sounds,[false]);
 now=26000;tick();assert.deepEqual(sounds,[false,true]);
 state.turn=1;now=27000;tick();assert.equal(sounds.length,2);
 state.result='後手の勝ち';state.turn=0;now=29000;tick();assert.equal(sounds.length,2);
 state.result='';online.kind='ai';tick();assert.equal(sounds.length,2);
 online.kind='friend';online.closed=true;tick();assert.equal(sounds.length,2);
});

test('clock cues synthesize one beep or two spaced beeps and release their audio nodes',()=>{
 const source=readFileSync(new URL('../dist/sound.js',import.meta.url),'utf8');
 const code='let context;'+source.slice(source.indexOf('function prepare(){'),source.indexOf('function tone('))+source.slice(source.indexOf('export function playClockWarning('),source.indexOf('// An original crack')).replace('export ','');
 for(const urgent of [false,true]){
  const oscillators=[],gains=[],parameter=()=>({setValueAtTime(){},linearRampToValueAtTime(){}});
  const context={state:'running',currentTime:10,destination:{},createOscillator(){const node={frequency:{},connect(){},start(at){this.startAt=at;},stop(at){this.stopAt=at;},disconnect(){this.released=true;}};oscillators.push(node);return node;},createGain(){const node={gain:parameter(),connect(){},disconnect(){this.released=true;}};gains.push(node);return node;}};
  const c={effectsVolume:{output:context=>context.destination},window:{AudioContext:function(){return context;}}};vm.runInNewContext(code+'globalThis.play=playClockWarning;',c);c.play(urgent);
  assert.equal(oscillators.length,urgent?2:1);assert.equal(oscillators[0].startAt,10);
  if(urgent)assert.equal(oscillators[1].startAt,10.12);
  for(const node of oscillators){assert.ok(node.stopAt-node.startAt<.1);node.onended();assert.ok(node.released);}
  assert.ok(gains.every(node=>node.released));
 }
});
