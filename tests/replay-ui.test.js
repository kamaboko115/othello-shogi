import test from 'node:test';
import assert from 'node:assert/strict';
import {initReplayViewer} from '../dist/replay-view.js';
import {initial,play} from '../dist/engine.js';
import {packReplayState} from '../dist/replay-code.js';
function ui(){
 const elements=new Map();class Element{
  events={};children=[];dataset={};attributes={};hidden=false;open=false;value='';
  addEventListener(name,fn){this.events[name]=fn;}setAttribute(name,value){this.attributes[name]=value;}append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
  showModal(){this.open=true;}close(){this.open=false;this.events.close?.();}focus(){}select(){}
 }
 const document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:()=>new Element(),defaultView:{location:new URL('https://oshogi-games.pages.dev/'),navigator:{clipboard:{writeText:async()=>{}}}}};return {document,$:id=>document.getElementById(id)};
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
