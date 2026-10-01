import test from 'node:test';
import assert from 'node:assert/strict';
import {presentToss,tossLandingMs,tossPauseMs,tossInterventionMs} from '../dist/toss.js';

function view(){
 const classes=new Set(),timers=[];
 const dialog={classList:{add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));}},hidden:true};
 const coins={replaceChildren(...children){this.children=children;}},result={},close={};
 globalThis.document={createElement(){return {style:{}};}};
 return {dialog,coins,result,close,classes,timers,schedule(fn,ms){timers.push({fn,ms});},isCurrent:()=>true};
}
const toss={intervened:true,originalCoins:[1,1,1,1,1],coins:[0,0,0,1,1]};
test('普通の振り駒が着地してから1秒待ち、オセショ様が置換する',()=>{
 const v=view();presentToss({...v,toss,playerSide:1});
 assert.deepEqual(v.coins.children.map(c=>c.textContent),['歩','歩','歩','歩','歩']);
 assert.equal(v.classes.has('osesho-intervention'),false);
 assert.equal(v.close.disabled,true);
 assert.equal(v.timers[0].ms,tossLandingMs+tossPauseMs);
 assert.equal(tossPauseMs,1000);
 v.timers.shift().fn();assert.equal(v.classes.has('osesho-intervention'),true);
 assert.match(v.result.textContent,/謎の力/);
 assert.equal(v.timers[0].ms,tossInterventionMs);v.timers.shift().fn();
 assert.deepEqual(v.coins.children.map(c=>c.textContent),['と','と','と','歩','歩']);
 assert.equal(v.classes.has('osesho-intervention'),false);assert.equal(v.classes.has('toss-settled'),true);
 assert.equal(v.close.disabled,false);assert.match(v.result.textContent,/あなたは後手/);
});
test('通常対局では置換演出も追加の待ち時間もない',()=>{
 const v=view();presentToss({...v,toss:{coins:toss.originalCoins},playerSide:0});
 assert.equal(v.timers.length,0);assert.equal(v.close.disabled,false);assert.match(v.result.textContent,/あなたは先手/);
});
test('別の対局へ移った後に古い振り駒の置換を再生しない',()=>{
 const v=view();let current=true;presentToss({...v,toss,playerSide:1,isCurrent:()=>current});
 current=false;v.timers.shift().fn();assert.equal(v.classes.has('osesho-intervention'),false);assert.equal(v.timers.length,0);
});
