import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,empty,applyParadoxEvent,beforeParadox,chooseParadoxEvent,paradoxWeights,moves,raw,collapseAfterMove,paradoxEventTiming,paradoxSummary} from '../dist/engine.js';
import {packReplayState,unpackReplayState} from '../dist/replay-code.js';
import {finishClockMove} from '../dist/match-options.js';
const pick=n=>Math.floor(n/3);
const active=()=>({...initial(),ply:151,paradoxAt:150,moveLimit:false});
const inventory=s=>s.board.filter(Boolean).map(p=>JSON.stringify(p)).sort();

test('all 9240 event tickets match the configured weights',()=>{
 const counts={};for(let roll=0;roll<9240;roll++){const kind=chooseParadoxEvent(n=>{assert.equal(n,9240);return roll;});counts[kind]=(counts[kind]||0)+1;}
 assert.deepEqual(counts,paradoxWeights);for(const value of [-1,9240,NaN,1.5])assert.throws(()=>chooseParadoxEvent(()=>value));
 assert.equal(counts.promote/9240,1/77);assert.equal(counts.arrival/9240,1/12);assert.equal(counts.warp/9240,1/12);
 assert.equal(counts.flip/9240,1/20);assert.equal(counts.shuffle/9240,1/60);assert.equal(counts.invert/9240,1/120);
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
 for(const kind of ['warp','flip','shuffle','invert','promote']){
  const e={kind,...(['flip','invert','promote'].includes(kind)?{squares:[1,2,3,4,5]}:{moves:[{from:9,to:4}]})},timing=paradoxEventTiming(e);
  const base={settings:{timeControl:'none'},clock:{remaining:[300000,300000]},state:active()},event=structuredClone(base);
  event.state.paradoxEvent=e;finishClockMove(base,0,0);finishClockMove(event,0,0);assert.equal(event.clock.since-base.clock.since,120+timing.totalMs);
  if(kind==='shuffle'){assert.ok(timing.motionMs<=3000);assert.deepEqual(timing.cutins,['middle']);assert.ok(timing.noticeMs>=1500);}
  if(kind==='invert'){assert.equal(timing.flipMs,4000);assert.deepEqual(timing.cutins,['middle','upper','lower']);}
  if(kind==='flip')assert.ok(timing.flipMs>=1000);
 }
 assert.equal(paradoxSummary({paradoxEvent:{kind:'warp',side:0,moves:[{from:0,to:1}]}}),'先手の玉がワープ');
});

test('authoritative production selection executes each event without fallback destruction',t=>{
 for(const [roll,kind] of [[770,'warp'],[1540,'flip'],[2002,'shuffle'],[2156,'invert'],[2233,'promote']]){
  let first=true;const mock=t.mock.method(crypto,'getRandomValues',a=>{a.fill(first?roll:0);first=false;return a;});
  const s=active();collapseAfterMove(s);assert.equal(s.paradoxEvent.kind,kind);assert.equal(s.destroyed,null);assert.equal(s.spawned,null);mock.mock.restore();
 }
});
