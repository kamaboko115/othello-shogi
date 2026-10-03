import test from 'node:test';
import assert from 'node:assert/strict';
import {initReplayViewer,replayIndexAt} from '../dist/replay-view.js';
import {initial,play} from '../dist/engine.js';
import {packReplayState} from '../dist/replay-code.js';
function ui(){
 const elements=new Map(),jobs=[];class Element{
  events={};children=[];dataset={};attributes={};hidden=false;open=false;value='';
  addEventListener(name,fn){this.events[name]=fn;}setAttribute(name,value){this.attributes[name]=value;}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
  showModal(){this.open=true;}close(){this.open=false;this.events.close?.();}focus(){}select(){}
  getBoundingClientRect(){return {left:100,width:600};}
 }
 class Worker{constructor(){jobs.push(this);}postMessage(data){this.record=data;}terminate(){this.terminated=true;}reply(scores){this.onmessage({data:scores});}}
 const document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:()=>new Element(),createElementNS:()=>new Element(),defaultView:{Worker,location:new URL('https://oshogi-games.pages.dev/'),navigator:{clipboard:{writeText:async()=>{}}}}};return {document,jobs,$:id=>document.getElementById(id)};
}
function record(){const s=initial(),n=play(s,{from:58,to:49,prom:false});return {v:1,frames:[packReplayState(s),packReplayState(n)],logs:['1. ▲5六 歩'],result:'後手の勝ち（投了）'};}
test('replay opens once per match, browses either direction and clears for the next match',async()=>{
 const {document,$}=ui();let requests=0;const viewer=initReplayViewer(document,async()=>{requests++;return record();});viewer.update('game1',true);await $('openReplay').events.click();
 assert.equal(requests,1);assert.equal($('replayBoard').children.length,81);assert.equal($('replayPly').textContent,'1手目 / 1手');assert.equal($('replayLine').textContent,'1. ▲5六 歩');
 $('replayPrevious').onclick();assert.equal($('replayPly').textContent,'0手目 / 1手');assert.equal($('replayPrevious').disabled,true);assert.equal($('replayResult').textContent,'');
 $('replayLast').onclick();assert.equal($('replayResult').textContent,'後手の勝ち（投了）');
 $('closeReplay').onclick();await $('openReplay').events.click();assert.equal(requests,1);
 viewer.update('game2',false);assert.equal($('replayDialog').open,false);assert.equal($('openReplay').hidden,true);assert.equal($('replayBoard').children.length,0);
 viewer.update('game2',true);await $('openReplay').events.click();assert.equal(requests,2);
});
test('an earlier match’s late response cannot replace the next match’s board',async()=>{
 const {document,$}=ui();let finish;const viewer=initReplayViewer(document,()=>new Promise(resolve=>finish=resolve));viewer.update('old',true);
 const pending=$('openReplay').events.click();await Promise.resolve();viewer.update('new',false);finish(record());await pending;
 assert.equal($('replayDialog').open,false);assert.equal($('replayBoard').children.length,0);assert.equal($('replayPly').textContent,'');
});

test('評価を自動表示し、クリック・左右キー・通常の棋譜操作で同じ局面とカーソルを表示する',async()=>{
 const {document,$,jobs}=ui();const viewer=initReplayViewer(document,async()=>record());viewer.update('game',true);await $('openReplay').events.click();
 assert.equal(jobs.length,1);assert.equal(jobs[0].record.frames.length,2);assert.equal($('replayEvaluate').disabled,true);
 jobs[0].reply([10,-50]);assert.equal($('replayGraph').hidden,false);
 const svg=$('replayGraph').children[0];assert.equal(svg.attributes.role,'slider');assert.equal(svg.attributes['aria-valuenow'],1);
 svg.onclick({clientX:100});assert.equal($('replayPly').textContent,'0手目 / 1手');assert.equal(svg.attributes['aria-valuenow'],0);
 svg.onclick({clientX:900});assert.equal($('replayPly').textContent,'1手目 / 1手');
 let prevented=false;svg.onkeydown({key:'ArrowLeft',preventDefault(){prevented=true;}});assert(prevented);assert.equal(svg.attributes['aria-valuenow'],0);
 svg.onkeydown({key:'End',preventDefault(){}});assert.equal(svg.attributes['aria-valuenow'],1);
 $('replayFirst').onclick();assert.equal(svg.attributes['aria-valuenow'],0);
 $('replaySlider').value='1';$('replaySlider').oninput();assert.equal(svg.attributes['aria-valuenow'],1);
 $('closeReplay').onclick();await $('openReplay').events.click();assert.equal(jobs.length,1,'再表示では評価を再計算しない');
});

test('閉じた画面や前の対局の遅い評価結果を表示せず、失敗しても棋譜を操作できる',async()=>{
 const {document,$,jobs}=ui();const viewer=initReplayViewer(document,async()=>record());viewer.update('old',true);await $('openReplay').events.click();
 $('closeReplay').onclick();jobs[0].reply([1,2]);assert.equal($('replayGraph').hidden,true);
 await $('openReplay').events.click();assert.equal(jobs.length,2);jobs[1].onerror();assert.equal($('replayEvaluate').disabled,false);
 $('replayFirst').onclick();assert.equal($('replayPly').textContent,'0手目 / 1手');
 $('replayEvaluate').onclick();assert.equal(jobs.length,3);viewer.update('new',false);jobs[2].reply([1,2]);assert.equal($('replayGraph').children.length,0);
});

test('グラフの端や単一局面、途中からの記録でも範囲内の局面へ移動する',async()=>{
 for(const [ratio,count,expected] of [[-1,9,0],[2,9,8],[.5,9,4],[1,1,0],[NaN,9,0]])assert.equal(replayIndexAt(ratio,count),expected);
 const data=record();data.frames=[data.frames[1]];
 const {document,$,jobs}=ui();const viewer=initReplayViewer(document,async()=>data);viewer.update('partial',true);await $('openReplay').events.click();jobs[0].reply([12]);
 const svg=$('replayGraph').children[0];svg.onclick({clientX:450});assert.equal(svg.attributes['aria-valuemin'],1);assert.equal(svg.attributes['aria-valuenow'],1);assert.match($('replayPly').textContent,/途中からの記録/);
});
