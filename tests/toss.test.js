import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {presentToss,tossLandingMs,tossPauseMs,tossShatterMs,tossInterventionMs} from '../dist/toss.js';
function view(){
 const classes=new Set(),timers=[],styles=new Map(),sounds=[];
 const dialog={style:{setProperty:(key,value)=>styles.set(key,value)},classList:{add(...names){names.forEach(n=>classes.add(n));},remove(...names){names.forEach(n=>classes.delete(n));}},hidden:true};
 const children=()=>({replaceChildren(...items){this.children=items;}}),coins=children(),banner={...children(),hidden:true},result={},close={};
 globalThis.document={createElement(){return {style:{setProperty(){}},setAttribute(){}};}};
 return {dialog,coins,banner,result,close,classes,timers,styles,sounds,onShatter(){sounds.push('shatter');},schedule(fn,ms){timers.push({fn,ms});},isCurrent:()=>true};
}
const toss={intervened:true,originalCoins:[1,1,1,1,1],coins:[0,0,0,1,1]};
const side=v=>v.banner.children[0].textContent;
function next(v,ms){assert.equal(v.timers[0].ms,ms);v.timers.shift().fn();}
test('普通の先手表示を1秒見せ、文字を壊してからオセショ様が置換する',()=>{
 const v=view();presentToss({...v,toss,playerSide:1});
 assert.deepEqual(v.coins.children.map(c=>c.textContent),['歩','歩','歩','歩','歩']);
 assert.equal(v.banner.hidden,true);assert.equal(v.close.disabled,true);
 assert.deepEqual(v.sounds,[]);
 next(v,tossLandingMs);assert.equal(side(v),'先手');assert.equal(v.banner.hidden,false);
 assert.equal(v.classes.has('osesho-intervention'),false);assert.equal(v.classes.has('toss-shattering'),false);
 assert.deepEqual(v.sounds,[]);
 assert.equal(tossPauseMs,1000);next(v,tossPauseMs);
 assert.equal(v.classes.has('toss-shattering'),true);assert.equal(v.classes.has('osesho-intervention'),false);assert.equal(v.close.disabled,true);
 assert.deepEqual(v.sounds,['shatter']);
 next(v,tossShatterMs);assert.equal(v.classes.has('osesho-intervention'),true);assert.equal(v.banner.hidden,true);assert.match(v.result.textContent,/謎の力/);
 next(v,tossInterventionMs);
 assert.deepEqual(v.coins.children.map(c=>c.textContent),['と','と','と','歩','歩']);
 assert.equal(v.classes.has('osesho-intervention'),false);assert.equal(v.classes.has('toss-settled'),true);
 assert.equal(v.banner.hidden,false);assert.equal(side(v),'後手');assert.equal(v.close.disabled,false);assert.match(v.result.textContent,/あなたは後手/);
 assert.deepEqual(v.sounds,['shatter']);
});
for(const playerSide of [0,1])test(`通常の${playerSide===0?'先手':'後手'}を着地後に大きく表示する`,()=>{
 const v=view();presentToss({...v,toss:{coins:toss.originalCoins},playerSide});
 assert.equal(v.banner.hidden,true);assert.equal(v.close.disabled,true);
 next(v,tossLandingMs);assert.equal(side(v),playerSide===0?'先手':'後手');assert.equal(v.close.disabled,false);assert.equal(v.timers.length,0);
 assert.equal(v.classes.has('toss-shattering'),false);assert.equal(v.classes.has('osesho-intervention'),false);
 assert.deepEqual(v.sounds,[]);
});
for(const stage of [0,1,2,3])test(`別の対局へ移った後は演出を継続しない（段階${stage}）`,()=>{
 const v=view();let current=true;presentToss({...v,toss,playerSide:1,isCurrent:()=>current});
 for(let i=0;i<stage;i++)v.timers.shift().fn();
 const before={classes:[...v.classes],result:v.result.textContent,hidden:v.banner.hidden,disabled:v.close.disabled,sounds:[...v.sounds]};
 current=false;v.timers.shift().fn();assert.equal(v.timers.length,0);
 assert.deepEqual({classes:[...v.classes],result:v.result.textContent,hidden:v.banner.hidden,disabled:v.close.disabled,sounds:[...v.sounds]},before);
});

test('特別な破壊と置換だけを約3/5倍速にし、CSSと段階切り替えの時間を一致させる',()=>{
 assert.ok(Math.abs(650/tossShatterMs-.6)<.001);assert.ok(Math.abs(1400/tossInterventionMs-.6)<.001);
 assert.equal(tossLandingMs,1400);assert.equal(tossPauseMs,1000);
 const v=view();presentToss({...v,toss,playerSide:1});
 assert.equal(v.styles.get('--toss-shatter-duration'),tossShatterMs+'ms');assert.equal(v.styles.get('--toss-intervention-duration'),tossInterventionMs+'ms');
 const css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
 assert.match(css,/animation:toss-side-shatter var\(--toss-shatter-duration,/);assert.match(css,/animation:toss-intervene var\(--toss-intervention-duration,/);
 const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');assert.match(app,/presentToss\(\{[^\n]+onShatter:playTossShatterSound/);
});
