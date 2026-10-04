import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,empty,applyParadoxEvent,beforeParadox,paradoxEventTiming,paradoxCutinCount} from '../dist/engine.js';
import {packReplayState,unpackReplayState} from '../dist/replay-code.js';
import {encodeBoard,decodeBoard} from '../dist/board-code.js';
import {finishClockMove} from '../dist/match-options.js';
const hands=s=>s.hands.map(h=>Array.from('PLNSGBR',t=>h[t]||0));
for(const mover of [0,1])test(`charisma converts only enemy minor pieces, side ${mover}`,()=>{
 const s=empty();s.turn=1-mover;s.ply=151;
 for(const side of [0,1])for(const [i,type]of Array.from('KRBGSNLP').entries()){
  s.board[side*27+i]={type,side,prom:false};
  if(!['K','G'].includes(type))s.board[side*27+9+i]={type,side,prom:true};
 }
 s.board[0].wings=true;s.hands[0].G=2;const old=structuredClone(s);applyParadoxEvent(s,'charisma',()=>0);
 s.board.forEach((p,i)=>{if(!p)return;assert.deepEqual(p,{...old.board[i],side:old.board[i].side!==mover&&!['K','R','B'].includes(p.type)?mover:old.board[i].side});});
 assert.deepEqual(s.hands,old.hands);assert.equal(s.turn,old.turn);assert.equal(s.result,'');assert.deepEqual(beforeParadox(s).board,old.board);
 const f=packReplayState(s),restored=unpackReplayState(f);assert.deepEqual(restored.paradoxEvent,s.paradoxEvent);assert.deepEqual(beforeParadox(restored).board,old.board);
 for(const change of [{side:1-mover},{square:80},{squares:[mover*27]},{squares:[mover*27+1]},{squares:[80]},{squares:[3,3]}])assert.throws(()=>unpackReplayState({...f,e:{...f.e,...change}}));
});
for(const mover of [0,1])for(const full of [false,true])test(`summon fills empty cells and adds ten per hand type, side ${mover}, full ${full}`,()=>{
 const s=initial();s.turn=1-mover;s.ply=1;s.noDrops=true;
 if(full)s.board=s.board.map((p,i)=>p||{type:'G',side:i%2,prom:false});
 s.hands[mover].R=4;s.hands[1-mover].P=3;const old=structuredClone(s);let next=0;
 applyParadoxEvent(s,'summon',()=>next++%2);
 assert.equal(s.board.filter(Boolean).length,81);assert.equal(s.paradoxEvent.spawnedSquares.length,old.board.filter(p=>!p).length);
 for(let i=0;i<81;i++){if(old.board[i])assert.deepEqual(s.board[i],old.board[i]);else {assert.equal(s.board[i].side,mover);assert.equal(s.board[i].prom,true);assert.ok(['R','B'].includes(s.board[i].type));}}
 for(const t of 'PLNSGBR')assert.equal(s.hands[mover][t],(old.hands[mover][t]||0)+10);assert.deepEqual(s.hands[1-mover],old.hands[1-mover]);assert.equal(s.hands[mover].K,undefined);assert.equal(s.turn,old.turn);assert.equal(s.noDrops,true);
 const f=packReplayState(s),restored=unpackReplayState(f);assert.deepEqual(restored.board,s.board);assert.deepEqual(hands(restored),hands(s));assert.deepEqual(beforeParadox(restored).board,old.board);assert.deepEqual(hands(beforeParadox(restored)),hands(old));
 assert.deepEqual(hands(decodeBoard(encodeBoard(s))),hands(s));
 for(const change of [{side:1-mover},{spawnedSquares:[4]},{spawnedSquares:[81]},{spawnedSquares:[40,40]}])assert.throws(()=>unpackReplayState({...f,e:{...f.e,...change}}));
 const bad=structuredClone(f);bad.h[mover][0]=9;assert.throws(()=>unpackReplayState(bad));
});
test('repeated summons remain copyable and replayable with growing reserves',()=>{
 const s=initial();s.turn=1;for(let i=1;i<=40;i++){s.ply=i;applyParadoxEvent(s,'summon',()=>0);assert.deepEqual(hands(unpackReplayState(packReplayState(s))),hands(s));assert.deepEqual(hands(decodeBoard(encodeBoard(s))),hands(s));}
});
for(const kind of ['charisma','summon'])test(`${kind} has five cut-ins and reserves full presentation time`,()=>{
 const s=initial();applyParadoxEvent(s,kind,()=>0);const timing=paradoxEventTiming(s.paradoxEvent);assert.equal(paradoxCutinCount(kind),5);assert.equal(timing.cutins.length,5);
 const base={settings:{timeControl:'none'},clock:{remaining:[300000,300000]},state:initial()},event=structuredClone(base);event.state=s;
 finishClockMove(base,0,0);finishClockMove(event,0,0);assert.equal(event.clock.since-base.clock.since,120+timing.totalMs);
});
