import test from 'node:test';
import assert from 'node:assert/strict';
import {createWinAdCounter,createWinAdBreak,showTestInterstitial} from '../dist/ad-break.js';
const disk=()=>{const values=new Map();return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};};
const win=(room,side=0,round=1)=>({room,side,round,state:{result:(side?'後手':'先手')+'の勝ち（王を取った）'}});
test('2勝ごとに広告待ちになり、敗北・引き分け・進行中・観戦は数えない',()=>{
 const counter=createWinAdCounter({storage:disk()});
 for(const result of ['', '後手の勝ち（投了）','合意による引き分け'])counter.record({room:'loss',side:0,state:{result}});
 counter.record({...win('waiting'),joined:false});counter.record({...win('spectator'),side:null});
 assert.deepEqual(counter.stats(),{wins:0,pending:0});
 counter.record(win('ai'));assert.equal(counter.due(),false);
 counter.record(win('friend',1));assert.equal(counter.due(),true);counter.consume();
 counter.record(win('third'));assert.equal(counter.due(),false);
 counter.record(win('fourth'));assert.deepEqual(counter.stats(),{wins:4,pending:1});
});
test('再描画・再取得・再読み込みは同じ対局を重複計上せず、再試合は別に数える',()=>{
 const storage=disk(),counter=createWinAdCounter({storage});counter.record(win('room'));
 for(let i=0;i<10;i++)assert.equal(counter.record(win('room')),false);
 const restored=createWinAdCounter({storage});assert.equal(restored.record(win('room')),false);
 restored.record(win('room',0,2));assert.deepEqual(restored.stats(),{wins:2,pending:1});
});
test('ストレージが拒否されてもページ内でカウントして対局を妨げない',()=>{
 const counter=createWinAdCounter({storage:()=>{throw Error('blocked');}});
 counter.record(win('a'));counter.record(win('b'));assert.equal(counter.due(),true);
});
test('二重クリックでも広告は一度だけで、終了後の次の2勝まで出ない',async()=>{
 const counter=createWinAdCounter({storage:disk()});counter.record(win('a'));counter.record(win('b'));
 let calls=0,finish;const ads=createWinAdBreak({counter,showAd:()=>{calls++;return new Promise(r=>finish=r);}});
 const a=ads.betweenMatches(),b=ads.betweenMatches();assert.equal(a,b);assert.equal(calls,1);
 finish({shown:true});await a;assert.equal(counter.due(),false);
 await ads.betweenMatches();assert.equal(calls,1);
});
test('広告の失敗・配信未設定はゲームに戻り、公開版でテスト広告を出さない',async()=>{
 for(const showAd of [undefined,async()=>{throw Error('offline');}]){
  const counter=createWinAdCounter({storage:disk()});counter.record(win('a'));counter.record(win('b'));
  const ads=createWinAdBreak({counter,hostname:'game.example',document:{createElement(){throw Error('must not render');}},showAd});
  assert.equal((await ads.betweenMatches()).shown,false);assert.equal(counter.due(),false);
 }
});
test('テスト広告は5秒の前に閉じられず、閉じるとタイマーと画面を片付ける',async()=>{
 let now=0,tick,cleared=false;
 const nodes=[];const document={body:{append(){}},createElement(tag){const events={};const node={tag,events,append(...children){this.children=children;},setAttribute(){},addEventListener(name,fn){events[name]=fn;},showModal(){this.open=true;},close(){this.open=false;events.close();},remove(){this.removed=true;}};nodes.push(node);return node;}};
 const pending=showTestInterstitial({document,now:()=>now,setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>cleared=true});
 const dialog=nodes[0],close=nodes.at(-1);assert.equal(close.disabled,true);let prevented=false;dialog.events.cancel({preventDefault(){prevented=true;}});assert.equal(prevented,true);
 now=4999;tick();assert.equal(close.disabled,true);now=5000;tick();assert.equal(close.disabled,false);assert.equal(close.textContent,'閉じる');close.onclick();
 assert.equal((await pending).shown,true);assert.equal(cleared,true);assert.equal(dialog.removed,true);
});
