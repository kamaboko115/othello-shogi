import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,empty,applyParadoxEvent,beforeParadox,chooseParadoxEvent,paradoxWeights,paradoxTotal,moves,raw,collapseAfterMove,paradoxEventTiming,paradoxSummary,paradoxCutinCount} from '../dist/engine.js';
import {packReplayState,unpackReplayState} from '../dist/replay-code.js';
import {finishClockMove} from '../dist/match-options.js';
const pick=n=>Math.floor(n/3);
const active=()=>({...initial(),ply:151,paradoxAt:150,moveLimit:false});
const inventory=s=>s.board.filter(Boolean).map(p=>JSON.stringify(p)).sort();

test('every interval has exact odds and selection includes both boundaries',()=>{
 let start=0;for(const [kind,weight]of Object.entries(paradoxWeights)){
  assert.ok(Number.isInteger(weight)&&weight>0);
  for(const roll of [start,start+weight-1])assert.equal(chooseParadoxEvent(n=>{assert.equal(n,paradoxTotal);return roll;}),kind);
  start+=weight;
 }
 assert.equal(start,paradoxTotal);for(const value of [-1,paradoxTotal,NaN,1.5])assert.throws(()=>chooseParadoxEvent(()=>value));
 for(const [kind,odds]of Object.entries({promote:77,arrival:12,warp:12,flip:20,shuffle:90,thunder:60,invert:120,supply:60,extra:120,annihilate:500,dragons:300,wings:300}))assert.equal(paradoxWeights[kind]*odds,paradoxTotal);
});

test('all-promotion affects both sides but never kings, golds, hands or already promoted pieces',()=>{
 const s=empty();for(const side of [0,1])['P','L','N','S','B','R','G','K'].forEach((type,i)=>s.board[side*18+i]={type,side,prom:false});
 s.board[40]={type:'P',side:0,prom:true};s.hands[0].R=1;s.hands[1].P=2;const old=structuredClone(s);applyParadoxEvent(s,'promote',pick);
 assert.equal(s.paradoxEvent.squares.length,12);assert.equal(s.paradoxEvent.squares.includes(40),false);
 s.board.forEach((p,i)=>{if(p)assert.deepEqual(p,{...old.board[i],prom:!['G','K'].includes(p.type)});});
 assert.deepEqual(s.hands,old.hands);assert.deepEqual(beforeParadox(s).board,old.board);assert.equal(s.result,'');
 applyParadoxEvent(s,'promote',pick);assert.deepEqual(s.paradoxEvent.squares,[]);assert.match(paradoxSummary(s),/成れる駒なし/);
 assert.deepEqual(unpackReplayState(packReplayState(s)).paradoxEvent,s.paradoxEvent);
 for(const squares of [[6],[7],[81],[40,40]])assert.throws(()=>unpackReplayState({...packReplayState(s),e:{kind:'promote',squares}}));
});

test('warp is safe against every next capture, sandwich and drop',()=>{
 const s=empty();s.board[76]={type:'K',side:0,prom:false};s.board[4]={type:'K',side:1,prom:false};
 s.board[22]={type:'R',side:1,prom:true};s.board[49]={type:'B',side:0,prom:false};s.board[63]={type:'G',side:1,prom:false};s.hands[0].G=1;s.hands[1].G=1;
 const old=structuredClone(s);applyParadoxEvent(s,'warp',pick);assert.equal(s.paradoxEvent.moves.length,1);
 const {from,to}=s.paradoxEvent.moves[0],king=s.board[to];assert.notEqual(from,to);assert.equal(old.board[to],null);assert.equal(s.board[from],null);
 const trial={...s,turn:1-king.side};const replies=trial.board.flatMap((p,i)=>p?.side===trial.turn?moves(trial,i):[]).concat(Object.keys(trial.hands[trial.turn]).flatMap(t=>moves(trial,t)));
 assert.ok(replies.some(m=>m.drop));for(const m of replies){const next=raw(trial,m);assert.notEqual(m.to,to);assert.equal(next.board[to]?.side,king.side);assert.equal(next.board[to]?.type,'K');}
 assert.deepEqual(beforeParadox(s).board,old.board);
});

test('warp fizzles on a full board without destroying anything',()=>{
 const s=active();s.board=Array.from({length:81},(_,i)=>({type:i===4||i===76?'K':'G',side:i<40?1:0,prom:false}));const old=structuredClone(s.board);
 applyParadoxEvent(s,'warp',pick);assert.deepEqual(s.paradoxEvent.moves,[]);assert.deepEqual(s.board,old);assert.equal(s.destroyed,null);
});

test('five flips are distinct, exclude kings, and use remaining pieces when fewer than five',()=>{
 for(const small of [false,true]){
  const s=active();if(small)s.board=s.board.map(p=>p?.type==='K'||p?.type==='R'?p:null);
  const old=structuredClone(s);applyParadoxEvent(s,'flip',pick);const squares=s.paradoxEvent.squares;
  assert.equal(squares.length,small?2:5);assert.equal(new Set(squares).size,squares.length);
  s.board.forEach((p,i)=>{if(!p)return;assert.equal(p.side,squares.includes(i)?1-old.board[i].side:old.board[i].side);assert.equal(p.type,old.board[i].type);});
  assert.deepEqual(beforeParadox(s).board,old.board);assert.deepEqual(s.hands,old.hands);
 }
});

for(const kind of ['shuffle','invert','flip','warp','promote'])test(kind+' preserves replay, hands, turn, promotions and reversible animation state',()=>{
 const s=active();s.board[1].prom=true;const old=structuredClone(s);applyParadoxEvent(s,kind,pick);
 assert.deepEqual(s.hands,old.hands);assert.equal(s.turn,old.turn);assert.equal(s.result,'');assert.deepEqual(beforeParadox(s).board,old.board);
 if(kind==='shuffle'){assert.deepEqual(inventory(s),inventory(old));assert.equal(new Set(s.paradoxEvent.moves.map(m=>m.to)).size,40);}
 if(kind==='invert'){s.board.forEach((p,i)=>{if(p)assert.deepEqual(p,{...old.board[i],side:1-old.board[i].side});});assert.equal(s.board.filter(p=>p?.type==='K').length,2);}
 const frame=packReplayState(s),restored=unpackReplayState(frame);assert.deepEqual(restored.paradoxEvent,s.paradoxEvent);assert.deepEqual(restored.board,s.board);
 assert.deepEqual(beforeParadox(restored).board,old.board);
 const m=s.board.flatMap((p,i)=>p?.side===s.turn?moves(s,i):[])[0];assert.ok(m);assert.equal(raw(s,m).paradoxEvent,undefined);
});

test('malformed replay events cannot move missing pieces or duplicate coordinates',()=>{
 const s=active();applyParadoxEvent(s,'invert',pick);const f=packReplayState(s);
 for(const e of [null,{kind:'unknown'},{kind:'flip',squares:[4]},{kind:'invert',squares:[0,0]},{kind:'warp',moves:[{from:20,to:4}],side:0},{kind:'shuffle',moves:[{from:0,to:0}]}])assert.throws(()=>unpackReplayState({...f,e}));
});

test('warp animation receives its full clock allowance',()=>{
 const base={settings:{timeControl:{mode:'custom',minutes:5,increment:0,byoyomi:0}},clock:{remaining:[300000,300000]},state:active()};
 const normal=structuredClone(base),event=structuredClone(base);event.state.paradoxEvent={kind:'warp',moves:[]};
 finishClockMove(normal,0,1000);finishClockMove(event,0,1000);assert.equal(event.clock.since-normal.clock.since,120+paradoxEventTiming(event.state.paradoxEvent).totalMs);
});

test('shuffle leaves both kings safe against all enemy replies including drops',()=>{
 let successful=0;
 for(let seed=1;seed<=20;seed++){
  let rng=seed;const random=n=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng%n;};
  const s=active();s.hands[0].G=1;s.hands[1].G=1;const original=structuredClone(s.board);applyParadoxEvent(s,'shuffle',random);
  if(s.paradoxEvent.skipped){assert.deepEqual(s.board,original);continue;}successful++;
  for(const [square,king] of s.board.entries()){
   if(king?.type!=='K')continue;
   const trial={...s,turn:1-king.side},replies=s.board.flatMap((p,i)=>p?.side===trial.turn?moves(trial,i):[]).concat(Object.keys(trial.hands[trial.turn]).flatMap(t=>moves(trial,t)));
   for(const m of replies){assert.notEqual(m.to,square);assert.equal(raw(trial,m).board[square]?.side,king.side,JSON.stringify(m));}
  }
 }
 assert.ok(successful>=15,'safe shuffles should succeed for most ordinary positions');
});

test('impossible safe shuffle leaves the board intact and round-trips the replay',()=>{
 const s=active();s.board=Array.from({length:81},(_,i)=>({type:i===4||i===76?'K':'R',side:i%2,prom:false}));
 const old=structuredClone(s.board);applyParadoxEvent(s,'shuffle',pick);
 assert.equal(s.paradoxEvent.skipped,true);assert.deepEqual(s.board,old);assert.deepEqual(unpackReplayState(packReplayState(s)).paradoxEvent,s.paradoxEvent);
});

test('cinematic schedules match the requested durations and clock allowance',()=>{
 for(const kind of ['warp','flip','shuffle','invert','promote','supply']){
  const e={kind,...(['flip','invert','promote'].includes(kind)?{squares:[1,2,3,4,5]}:{moves:[{from:9,to:4}]})},timing=paradoxEventTiming(e);
  const base={settings:{timeControl:'none'},clock:{remaining:[300000,300000]},state:active()},event=structuredClone(base);
  event.state.paradoxEvent=e;finishClockMove(base,0,0);finishClockMove(event,0,0);assert.equal(event.clock.since-base.clock.since,120+timing.totalMs);
  if(kind==='shuffle'){assert.equal(timing.tailMs,1500);assert.ok(timing.motionMs<=3000);assert.deepEqual(timing.cutins,['middle','upper']);assert.ok(timing.noticeMs>=1500);}
  if(kind==='invert'){assert.equal(timing.flipMs,4000);assert.deepEqual(timing.cutins,['middle','upper','lower']);}
  if(kind==='flip')assert.ok(timing.flipMs>=1000);
 }
 assert.equal(paradoxSummary({paradoxEvent:{kind:'warp',side:0,moves:[{from:0,to:1}]}}),'先手の玉がワープ');
});

test('authoritative production selection executes each event without fallback destruction',t=>{
 let roll=0;for(const [kind,weight]of Object.entries(paradoxWeights)){const start=roll;roll+=weight;if(['arrival','destroy'].includes(kind))continue;
  let first=true;const mock=t.mock.method(crypto,'getRandomValues',a=>{a.fill(first?start:0);first=false;return a;});
  const s=active();collapseAfterMove(s);assert.equal(s.paradoxEvent.kind,kind);assert.equal(s.destroyed,null);assert.equal(s.spawned,null);mock.mock.restore();
 }
});

test('supply adds seven types only to the mover hand, including either side and no-drops games',()=>{
 for(const noDrops of [false,true])for(const mover of [0,1]){
  const s=active();s.turn=1-mover;s.noDrops=noDrops;s.hands=[{P:81,R:3},{B:2}];const old=structuredClone(s);
  applyParadoxEvent(s,'supply',pick);assert.deepEqual(s.board,old.board);assert.equal(s.turn,old.turn);assert.equal(s.noDrops,noDrops);
  for(const side of [0,1])for(const type of 'PLNSGBR')assert.equal(s.hands[side][type]||0,(old.hands[side][type]||0)+(side===mover?1:0));
  assert.equal(s.hands[0].K,undefined);assert.equal(s.hands[1].K,undefined);
  const restored=unpackReplayState(packReplayState(s));for(const side of [0,1])for(const type of 'PLNSGBR')assert.equal(restored.hands[side][type],s.hands[side][type]||0);
  assert.deepEqual(restored.paradoxEvent,{kind:'supply',side:mover});
  const before=beforeParadox(restored);for(const side of [0,1])for(const type of 'PLNSGBR')assert.equal(before.hands[side][type],old.hands[side][type]||0);
  assert.deepEqual(s.hands[1-mover],old.hands[1-mover]);assert.equal(moves({...s,turn:mover},'R').length>0,!noDrops);
  assert.throws(()=>unpackReplayState({...packReplayState(s),e:{kind:'supply',side:1-mover}}));
  const frame=packReplayState(s);frame.h[mover][0]=0;assert.throws(()=>unpackReplayState(frame));
 }
});

test('cut-in count follows actual odds at the 1/40 and 1/120 boundaries',()=>{
 for(const kind of ['arrival','warp','flip','destroy'])assert.equal(paradoxCutinCount(kind),0);
 for(const kind of ['thunder','promote','supply'])assert.equal(paradoxCutinCount(kind),1);
 assert.equal(paradoxCutinCount('shuffle'),2);assert.equal(paradoxCutinCount('invert'),3);assert.equal(paradoxCutinCount('extra'),3);assert.equal(paradoxCutinCount('dragons'),4);assert.equal(paradoxCutinCount('annihilate'),5);assert.equal(paradoxCutinCount('unknown'),0);
 for(const [denominator,count]of [[39,0],[40,1],[79,1],[80,2],[119,2],[120,3],[199,3],[200,4],[499,4],[500,5],[999,5]])assert.equal(paradoxCutinCount('supply',{supply:1,rest:denominator-1}),count);
 for(const kind of ['promote','supply']){const t=paradoxEventTiming({kind});assert.deepEqual(t.cutins,['middle']);assert.equal(t.totalMs,t.cutinMs+t.noticeMs+t.motionMs+t.tailMs);}
});

for(const count of [0,2,5,8])test(`thunder destroys up to five non-kings across both sides (${count} available)`,()=>{
 const s=empty();s.turn=1;s.ply=151;s.hands[0].R=2;s.hands[1].P=3;
 s.board[4]={type:'K',side:1,prom:false,wings:true};s.board[76]={type:'K',side:0,prom:false};
 for(let i=0;i<count;i++)s.board[30+i]={type:i%2?'R':'P',side:i%2,prom:i%2===1};
 const old=structuredClone(s);applyParadoxEvent(s,'thunder',n=>n-1);
 assert.equal(s.paradoxEvent.pieces.length,Math.min(5,count));assert.equal(new Set(s.paradoxEvent.pieces.map(d=>d.square)).size,Math.min(5,count));
 assert.deepEqual(s.board[4],old.board[4]);assert.deepEqual(s.board[76],old.board[76]);
 assert.equal(s.board.filter(Boolean).length,2+Math.max(0,count-5));assert.deepEqual(s.hands,old.hands);assert.equal(s.turn,old.turn);assert.equal(s.result,'');
 if(count>1)assert.equal(new Set(s.paradoxEvent.pieces.map(d=>d.piece.side)).size,2);
 const restored=unpackReplayState(packReplayState(s));assert.deepEqual(restored.paradoxEvent,s.paradoxEvent);assert.deepEqual(beforeParadox(restored).board,old.board);
 if(!count)assert.match(paradoxSummary(s),/しかし雷は落ちなかった/);
 const frame=packReplayState(s);
 for(const pieces of [[{square:4,piece:old.board[4]}],Array(6).fill({square:20,piece:{type:'P',side:0,prom:false}}),[{square:20,piece:{type:'P',side:2,prom:false}}]])assert.throws(()=>unpackReplayState({...frame,e:{kind:'thunder',side:0,pieces}}));
 const base={settings:{timeControl:'none'},clock:{remaining:[300000,300000]},state:old},event=structuredClone(base);event.state=s;
 finishClockMove(base,0,0);finishClockMove(event,0,0);assert.equal(event.clock.since-base.clock.since,120+paradoxEventTiming(s.paradoxEvent).totalMs);
});
