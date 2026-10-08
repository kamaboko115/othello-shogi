import {winningChallenge} from './helpers/challenge-game.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalAIStore,localAIStorageKey} from '../dist/local-ai-game.js';
import {helperRemaining} from '../dist/challenge-options.js';
import {moves,initial,empty,play,applyParadoxEvent,collapseAfterMove,collapseTargets,paradoxEventTiming} from '../dist/engine.js';
import {clockBudget,movePresentationAllowance,finishClockMove} from '../dist/match-options.js';
import {api} from '../worker/api.js';
import {localDB} from '../worker/local-db.js';
import {createChallengeWins} from '../dist/challenge-wins.js';
const disk=()=>{const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
const first=s=>[...s.board.flatMap((p,i)=>p?.side===s.turn?[i]:[]),...Object.keys(s.hands[s.turn])].flatMap(i=>moves(s,i))[0];
test('public challenge fixes all competitive rules; three helpers survive reload and reset on rematch',()=>{
 const storage=disk(),client=createLocalAIStore({storage,random:b=>b.fill(1)});let d=client.create({aiLevel:'osesho',thinkMs:500,noDrops:true,moveLimit:60,paradoxAt:false,handicap:'six',helperUnlimited:true});
 assert.equal(d.settings.thinkMs,5000);assert.equal(d.state.noDrops,false);assert.equal(d.state.moveLimit,false);assert.equal(d.state.paradoxAt,200);assert.equal(d.state.board.filter(Boolean).length,40);assert.equal(d.side,1);assert.deepEqual(d.settings.timeControl,{minutes:20,increment:5,byoyomi:0});
 const action=(name)=>d=client.action(d.room,{version:d.version,action:name,...(name.endsWith('move')?{move:first(d.state)}:{})});
 action('ai-move');
 for(let i=0;i<3;i++){assert.equal(helperRemaining(d),3-i);action('helper-move');assert.equal(d.canUndo,false);assert.throws(()=>action('offer-undo'),/待ったを使えません/);action('ai-move');d=createLocalAIStore({storage}).read(d.room);}
 assert.equal(helperRemaining(d),0);assert.throws(()=>action('helper-move'),/使い切り|使い切/);
 action('resign');action('offer-rematch');assert.equal(helperRemaining(d),3);assert.equal(d.clock.remaining[1],1200000);
});
test('only human clock runs, timeout settles locally with no network and illegal moves cannot reset clocks',()=>{
 let time=1000;const storage=disk(),client=createLocalAIStore({storage,now:()=>time,random:b=>b.fill(1)});let d=client.create({aiLevel:'osesho'});
 time+=2000000;d=client.read(d.room);assert.equal(d.state.result,'');assert.equal(clockBudget(d,0,time),Infinity);
 d=client.action(d.room,{version:d.version,action:'ai-move',move:first(d.state)});const ready=d.clock.since;
 assert.equal(clockBudget(d,1,ready),1200000);time=ready+1000;
 assert.throws(()=>client.action(d.room,{version:d.version,action:'move',move:{from:0,to:80,prom:false}}));assert.equal(client.read(d.room).clock.since,ready);
 time=ready+1200001;d=client.read(d.room);assert.match(d.state.result,/先手の勝ち（時間切れ）/);const version=d.version;assert.equal(client.read(d.room).version,version);
 const normal=client.create({aiLevel:'expert'});assert.equal(normal.clock,null);
});
test('clock allowance covers move, capture, flips, rare cut-ins and check in sequence',()=>{
 const previous=initial();previous.board[40]={side:1,type:'G'};const next=initial();next.last=[54,40];next.board[40]={side:0,type:'R',prom:true};next.flipped=[1,2,3,4,5,6];next.paradoxEvent={kind:'annihilate'};
 const expected=560+980+330+[360,328,296,264,232,200].reduce((a,b)=>a+b)+100+245+2400+1000+120+paradoxEventTiming(next.paradoxEvent).totalMs;
 assert.ok(movePresentationAllowance(previous,next)>=expected);
 const d={kind:'friend',state:{...next,turn:1},settings:{timeControl:'sudden3'},clock:{remaining:[180000,180000],since:0},takebacks:[{state:previous}]};finishClockMove(d,0,1000);
 assert.equal(clockBudget(d,1,1000+expected),180000);assert.equal(clockBudget(d,1,d.clock.since+1000),179000);
});
test('victory API deduplicates reports, assigns contiguous ordinals and rejects non-challenge results',async()=>{
 const db=localDB();try{
 const call=(method,body,extra={})=>api(new Request('https://test.local/api/challenge-wins',{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+'a'.repeat(64),...extra},...(body?{body:JSON.stringify(body)}:{})}),{DB:db});
 const settings=createLocalAIStore({storage:disk(),random:b=>b.fill(1)}).create({aiLevel:'osesho'}).settings;
 const body={matchKey:'1'.repeat(32)+':1',side:1,...winningChallenge(),settings};
 assert.deepEqual(await (await call('GET')).json(),{total:0});
 assert.deepEqual(await (await call('POST',body)).json(),{ordinal:1,total:1});
 assert.deepEqual(await (await call('POST',body)).json(),{ordinal:1,total:1});
 assert.deepEqual(await (await call('POST',{...body,matchKey:'2'.repeat(32)+':1'})).json(),{ordinal:1,total:1});
 assert.equal((await call('POST',{...body,settings:{...settings,paradoxAt:150}})).status,400);
 assert.equal((await call('POST',{...body,result:'先手の勝ち（王を取った）'})).status,400);
 assert.equal((await call('POST',body,{Origin:'https://foreign.test'})).status,403);
 assert.equal((await call('GET')).headers.get('Cache-Control'),'public, max-age=300');
 }finally{db.close();}
});
test('victory client caches lobby counts and reloaded report without repeated requests',async()=>{
 const storage=disk();let calls=0;const fetchImpl=async(_,options)=>{calls++;return Response.json(options?.method==='POST'?{ordinal:8,total:8}:{total:7});};
 let c=createChallengeWins({storage:()=>storage,fetchImpl});await Promise.all([c.count(),c.count()]);assert.equal(calls,1);await c.count();assert.equal(calls,1);
 const data={room:'a'.repeat(32),round:1,state:{result:'後手の勝ち（王を取った）',ply:10}};await Promise.all([c.report(data),c.report(data)]);assert.equal(calls,2);
 c=createChallengeWins({storage:()=>storage,fetchImpl});assert.equal((await c.report(data)).ordinal,8);assert.equal(calls,2);
});

test('drop clock allowance identifies the one-square move record, including a dropped piece destroyed by a gust',()=>{
 for(const type of ['R','B','G','P'])for(const event of [null,'wind','promote','destroy']){
  const before=empty();before.moveLimit=false;before.paradoxAt=0;before.board[4]={type:'K',side:1,prom:false};before.board[76]={type:'K',side:0,prom:false};before.hands[0][type]=1;
  const next=play(before,{drop:type,to:40});if(event==='destroy')collapseAfterMove(next,()=>collapseTargets(next).indexOf(40));else if(event)applyParadoxEvent(next,event,()=>3);
  assert.deepEqual(next.last,[40]);
  const expected=(['R','B'].includes(type)?650:280)+1000+250+(event==='destroy'?1700:event?120+paradoxEventTiming(next.paradoxEvent).totalMs:0);
  assert.equal(movePresentationAllowance(before,next),expected,type+' '+event);
  const data={kind:'friend',state:next,settings:{timeControl:'sudden3'},clock:{remaining:[180000,180000],since:0},takebacks:[{state:before}]};finishClockMove(data,0,1000);
  assert.equal(clockBudget(data,1,1000+expected+2500),180000);assert.equal(clockBudget(data,1,data.clock.since+1000),179000);
 }
});
