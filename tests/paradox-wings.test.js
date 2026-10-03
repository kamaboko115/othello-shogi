import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,initial,play,raw,moves,applyParadoxEvent,collapseAfterMove,beforeParadox,paradoxSummary,paradoxWeights,paradoxTotal,paradoxEventTiming,safeArrivalSquares} from '../dist/engine.js';
import {packReplayState,unpackReplayState,validateReplay} from '../dist/replay-code.js';
import {encodeBoard,decodeBoard} from '../dist/board-code.js';
import {SearchPosition,searchMoveCodec,chooseOsesho} from '../dist/osesho-ai.js';
import {createLocalAIStore} from '../dist/local-ai-game.js';
import {finishClockMove} from '../dist/match-options.js';
const piece=(type,side,wings=false)=>({type,side,prom:false,...(wings?{wings:true}:{})});
const base=()=>{const s=empty();s.moveLimit=false;s.paradoxAt=false;s.board[76]=piece('K',0);s.board[4]=piece('K',1,true);return s;};
const capture=()=>{const s=base();s.board[13]=piece('R',0);return s;};
const roundtrip=s=>{const restored=unpackReplayState(packReplayState(s));assert.deepEqual(restored.board,s.board);assert.deepEqual(restored.paradoxEvent,s.paradoxEvent);assert.deepEqual(decodeBoard(encodeBoard(s)).board,s.board);return restored;};
test('wings have exact 1/300 odds, grant only one charge and persist in board/replay exports',()=>{
 assert.equal(paradoxWeights.wings*300,paradoxTotal);
 for(const side of [0,1]){const s=initial();s.turn=1-side;const before=structuredClone(s.board);applyParadoxEvent(s,'wings',()=>0);const i=side?4:76;assert.equal(s.board[i].wings,true);assert.equal(s.board[side?76:4].wings,undefined);assert.deepEqual(beforeParadox(roundtrip(s)).board,before);applyParadoxEvent(s,'wings',()=>0);assert.equal(s.paradoxEvent.wasWinged,true);assert.equal(s.board[i].wings,true);roundtrip(s);}
 assert.equal(paradoxSummary({paradoxEvent:{kind:'wings'}}),'オセショ様が再誕の翼を王に与え、一度のみ復活できる！');
});
test('capture explodes the capturing rook, revives in place once and does not give the rook to either hand',()=>{
 const s=capture(),n=play(s,{from:13,to:4,prom:true});assert.equal(n.result,'');assert.deepEqual(n.board[4],piece('K',1));assert.equal(n.board[13],null);assert.deepEqual(n.hands,[{},{}]);assert.equal(n.paradoxEvent.entries[0].cause,'capture');assert.deepEqual(beforeParadox(roundtrip(n)).board[4],{...piece('R',0),prom:true});
 n.turn=0;n.board[13]=piece('R',0);assert.match(play(n,{from:13,to:4,prom:false}).result,/先手の勝ち/);
});
test('a king sandwich, including a dropped endpoint, consumes wings instead of ending the game',()=>{
 for(const drop of [false,true]){const s=base();s.board[4]=null;s.board[40]=piece('K',1,true);s.board[39]=piece('P',0);if(drop)s.hands[0].G=1;else s.board[50]=piece('G',0);
 const n=play(s,drop?{drop:'G',to:41}:{from:50,to:41,prom:false});assert.equal(n.result,'');assert.deepEqual(n.board[40],piece('K',1));assert.equal(n.paradoxEvent.entries[0].cause,'flip');assert.deepEqual(n.flipped,[40]);roundtrip(n);assert.equal(beforeParadox(n).board[40].side,0);}
});
test('lightning uses the charge, leaves a living king and the next strike ends the game',()=>{
 const s=base();s.ply=151;s.paradoxAt=150;collapseAfterMove(s,()=>0);assert.equal(s.result,'');assert.deepEqual(s.board[4],piece('K',1));assert.equal(s.destroyed,null);assert.equal(s.paradoxEvent.entries[0].cause,'destroy');assert.equal(beforeParadox(roundtrip(s)).board[4],null);
 const next=raw(s,{from:76,to:75,prom:false});collapseAfterMove(next,()=>0);assert.match(next.result,/先手の勝ち/);
});
test('an unprotected attacking king explodes and correctly loses, rather than ending in a kingless live game',()=>{
 const s=base();s.board[76]=null;s.board[13]=piece('K',0);const n=play(s,{from:13,to:4,prom:false});assert.match(n.result,/後手の勝ち/);roundtrip(n);
});
test('winged kings collide: captured king warps to a safe empty square; attacker keeps its wings',()=>{
 const s=base();s.board[76]=null;s.board[13]=piece('K',0,true);const n=play(s,{from:13,to:4,prom:false});assert.equal(n.result,'');const r=n.paradoxEvent.entries[0];assert.equal(r.cause,'warp');assert.equal(r.from,4);assert.equal(n.board[4].side,0);assert.equal(n.board[4].wings,true);assert.deepEqual(n.board[r.square],piece('K',1));const trial=structuredClone(n);trial.board[r.square]=null;assert.deepEqual(safeArrivalSquares(trial,piece('K',1),[r.square]),[r.square]);roundtrip(n);
});
test('no safe collision square restores both kings without hanging or duplicating a king',()=>{
 const s=base();s.board=Array.from({length:81},()=>piece('G',0));s.board[4]=piece('K',1,true);s.board[13]=piece('K',0,true);const n=play(s,{from:13,to:4,prom:false});assert.equal(n.result,'');assert.equal(n.paradoxEvent.entries[0].rewoundFrom,13);assert.deepEqual(n.board[4],piece('K',1));assert.deepEqual(n.board[13],piece('K',0,true));assert.equal(beforeParadox(roundtrip(n)).board[13],null);
});
test('rebirth keeps its presentation instead of drawing a second collapse event on the same move',()=>{
 const s=capture();s.paradoxAt=150;s.ply=151;const n=play(s,{from:13,to:4,prom:false}),saved=structuredClone(n);collapseAfterMove(n,()=>{throw Error('must not draw');});assert.deepEqual(n,saved);
 const data={state:n,settings:{timeControl:{mode:'custom',minutes:5,increment:0,byoyomi:0}},clock:{remaining:[300000,300000],since:0}};finishClockMove(data,0,0);assert.ok(data.clock.since>=paradoxEventTiming(n.paradoxEvent).totalMs);
});
test('Osesho search respects winged king captures, reversible state, hashes and a bounded thinking time',()=>{
 const s=capture();s.board[76].wings=true;const p=new SearchPosition(s);const snap=()=>({b:[...p.board],h:[...p.hands],k:[...p.kings],c:[...p.count],v:[...p.material],w:p.wings,hash:p.hash,lock:p.lock,t:p.turn,ply:p.ply});const before=snap();
 for(const m of p.generate()){const n=raw(s,searchMoveCodec.decode(m)),q=new SearchPosition(n);p.make(m);assert.deepEqual(snap(),{b:[...q.board],h:[...q.hands],k:[...q.kings],c:[...q.count],v:[...q.material],w:q.wings,hash:q.hash,lock:q.lock,t:q.turn,ply:q.ply});p.unmake();assert.deepEqual(snap(),before);}
 assert.ok(p.gain(searchMoveCodec.encode({from:13,to:4,prom:false}))<1000000);const start=performance.now();const move=chooseOsesho(s,200);assert.ok(move);assert.ok(performance.now()-start<700);assert.deepEqual(snap(),before);
});
test('revival storage, replay and undo retain the original charge and do not end the local AI match',()=>{
 const disk=new Map(),storage={getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)},client=createLocalAIStore({storage,random:a=>a.fill(1)});let v=client.create({paradoxAt:false,moveLimit:false});v.state=capture();v=client.import(v);const original=structuredClone(v.state);v=client.action(v.room,{action:'move',version:v.version,move:{from:13,to:4,prom:false}});assert.equal(v.state.result,'');assert.match(v.logs.at(-1),/復活/);validateReplay(client.replay(v.room));assert.deepEqual(createLocalAIStore({storage}).read(v.room).state,v.state);v=client.action(v.room,{action:'offer-undo',version:v.version});assert.deepEqual(v.state,original);
});
test('malformed wing and revival replay metadata is rejected',()=>{
 const s=play(capture(),{from:13,to:4,prom:false});const f=packReplayState(s);for(const w of [[81],[4,4],[76,13]])assert.throws(()=>unpackReplayState({...f,w}));const invalid=structuredClone(f);invalid.e.entries[0].displaced.type='evil';assert.throws(()=>unpackReplayState(invalid));
});
