import test from 'node:test';import assert from 'node:assert/strict';
import {initial} from '../dist/engine.js';
import {startClock,clockBudget,chargeClock,finishClockMove,applyHandicap,normalizeTime,clockRule,clockSecondsLabel,timeHelp} from '../dist/match-options.js';
test('自由設定の加算と秒読みを併用、全0は無制限、加算のみ0分でも初手を確保',()=>{
 const d={kind:'friend',settings:{timeControl:normalizeTime({minutes:1,increment:5,byoyomi:10})},state:initial()};startClock(d,0);
 assert.equal(clockBudget(d,0,74000),1000);chargeClock(d,74000);d.state.turn=1;finishClockMove(d,0,74000);assert.equal(d.clock.remaining[0],5000);assert.equal(clockBudget(d,0,74000),15000);
 d.settings.timeControl={minutes:0,increment:0,byoyomi:0};startClock(d,0);assert.equal(d.clock,null);
 d.settings.timeControl={minutes:0,increment:2,byoyomi:0};startClock(d,0);assert.equal(d.clock.remaining[0],2000);
 for(const value of [{minutes:31,increment:0,byoyomi:0},{minutes:1,increment:16,byoyomi:0},{minutes:1,increment:0,byoyomi:61},null])assert.throws(()=>normalizeTime(value));
});
import {api} from '../worker/api.js';import {localDB} from '../worker/local-db.js';
test('切れ負け・毎手・加算・秒読みの境界と演出猶予',()=>{
 for(const key of ['turn30','sudden3','fischer3','byo5']){
  const d={kind:'friend',settings:{timeControl:key},state:initial()};startClock(d,1000);const base=d.clock.remaining[0];
  assert.equal(clockBudget(d,0,5000),base+(key==='byo5'?30000:0));
  chargeClock(d,7000);assert.equal(d.clock.remaining[0],base-1000);d.state.turn=1;finishClockMove(d,0,7000);
  assert.equal(d.clock.remaining[0],key==='turn30'?base:key==='fischer3'?base+1000:base-1000);
  assert.ok(d.clock.since>7000);assert.equal(clockBudget(d,1,7000),base+(key==='byo5'?30000:0));
 }
 const d={kind:'friend',settings:{timeControl:'byo0'},state:initial()};startClock(d,0);assert.equal(clockBudget(d,0,35000),0);chargeClock(d,34000);d.state.turn=1;finishClockMove(d,0,34000);assert.equal(clockBudget(d,0,34000),30000);
});
test('駒落ちは先後によらず作成者だけ、玉は残る',()=>{for(const side of [0,1])for(const [key,count] of [['none',20],['bishop',19],['rook',19],['two',18],['four',16],['six',14]]){const s=initial();applyHandicap(s,side,key);assert.equal(s.board.filter(p=>p?.side===side).length,count);assert.equal(s.board.filter(p=>p?.side===1-side).length,20);assert.equal(s.board.filter(p=>p?.type==='K').length,2);}});
const h='a'.repeat(64),g='b'.repeat(64),invite='d'.repeat(64);
async function call(db,path,token=h,body){const res=await api(new Request('https://test.local/api/rooms'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB:db});return {status:res.status,data:await res.json()};}
test('時間切れはGETでも確定・遅い着手拒否・再試合で時計と作成者駒落ちを再設定',async()=>{const db=localDB();try{
 let d=(await call(db,'',h,{invite,settings:{timeControl:'turn30',handicap:'six'}})).data;const path='/'+d.room;
 assert.equal(d.clock,undefined);d=(await call(db,path+'/join',g,{invite})).data;
 const hostSide=d.toss.hostSide;assert.equal(d.state.board.filter(p=>p?.side===hostSide).length,14);assert.equal(d.clock.remaining[0],30000);
 const row=await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(d.room).first(),raw=JSON.parse(row.data);raw.clock.since=Date.now()-31000;
 await db.prepare('UPDATE rooms SET data = ? WHERE id = ?').bind(JSON.stringify(raw),d.room).run();
 d=(await call(db,path,g)).data;assert.match(d.state.result,/後手の勝ち（時間切れ）/);assert.equal((await call(db,path+'/action',h,{action:'move',version:d.version,move:{from:54,to:45,prom:false}})).status,409);
 d=(await call(db,path+'/action',h,{action:'offer-rematch',version:d.version})).data;d=(await call(db,path+'/action',g,{action:'accept-rematch',version:d.version})).data;
 assert.equal(d.state.result,'');assert.equal(d.clock.remaining[0],30000);assert.ok(d.clock.since>Date.now());assert.equal(d.state.board.filter(p=>p?.side===d.toss.hostSide).length,14);
 }finally{db.close();}});

test('開始の予告・落雷・降臨中は持ち時間を消費しない',()=>{
 const allowance=event=>{const d={kind:'friend',settings:{timeControl:'turn30'},state:{...initial(),...event}};startClock(d,0);finishClockMove(d,0,1000);return d.clock.since;};
 const normal=allowance({});
 assert.equal(allowance({paradoxStarted:true})-normal,3000);
 assert.equal(allowance({destroyed:{square:0}})-normal,1700);
 assert.equal(allowance({spawned:{square:40}})-normal,1320);
});

test('無効な加算・秒読みはなしと示し、使う方式だけ秒数を案内する',()=>{
 for(const setting of [{minutes:5,increment:3,byoyomi:0},{minutes:5,increment:0,byoyomi:30},{minutes:5,increment:0,byoyomi:0},{minutes:0,increment:3,byoyomi:0},{minutes:0,increment:3,byoyomi:30}]){
  const help=timeHelp(setting),rule=clockRule(setting);
  assert.equal(help.includes('秒読みなし'),!setting.byoyomi);
  assert.equal(help.includes('加算なし'),!setting.increment);
  assert.equal(help.includes('持ち時間が切れたら負け'),!setting.byoyomi);
  assert.equal(help.includes('初手も'),setting.minutes===0&&setting.increment>0&&setting.byoyomi===0);
  assert.doesNotMatch(help,/(?:秒読み|加算|＋)0秒/);assert.doesNotMatch(rule.label,/(?:秒読み|加算)0秒/);
  assert.equal(rule.base,setting.minutes*60000||(!setting.byoyomi?setting.increment*1000:0));
 }
 assert.equal(clockSecondsLabel(0),'なし');assert.equal(clockSecondsLabel(3),'3秒');
 assert.equal(clockRule({minutes:0,increment:0,byoyomi:0}).mode,'none');
 assert.match(timeHelp({minutes:0,increment:0,byoyomi:0}),/時間制限なし/);
});
