import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,applyParadoxEvent,beforeParadox,paradoxSummary,paradoxWeights,paradoxEventTiming,moves} from '../dist/engine.js';
import {packReplayState,unpackReplayState,validateReplay} from '../dist/replay-code.js';
import {createLocalAIStore} from '../dist/local-ai-game.js';
import {chargeClock,finishClockMove} from '../dist/match-options.js';
const startOf=kind=>{let n=0;for(const [k,v]of Object.entries(paradoxWeights)){if(k===kind)return n;n+=v;}};
const firstMove=s=>s.board.flatMap((p,i)=>p?.side===s.turn?moves(s,i):[])[0];
for(const mover of [0,1])for(const kind of ['extra','annihilate','dragons'])test(`${kind} for side ${mover} preserves kings, reserves and replay reconstruction`,()=>{
 const s=initial();s.turn=1-mover;s.ply=152;s.hands=[{B:2},{P:3}];s.board[0].prom=true;const old=structuredClone(s);
 applyParadoxEvent(s,kind,()=>0);assert.equal(s.turn,kind==='extra'?mover:old.turn);assert.equal(s.ply,old.ply);assert.deepEqual(s.hands,old.hands);
 for(let i=0;i<81;i++){
  const p=old.board[i];if(!p||p.type==='K'||kind==='extra'||p.side!==(kind==='annihilate'?1-mover:mover))assert.deepEqual(s.board[i],p);
  else assert.deepEqual(s.board[i],kind==='annihilate'?null:{type:'R',side:mover,prom:true});
 }
 const restored=unpackReplayState(packReplayState(s));assert.deepEqual(restored.board,s.board);assert.equal(restored.turn,s.turn);assert.deepEqual(restored.paradoxEvent,s.paradoxEvent);
 assert.deepEqual(beforeParadox(restored).board,old.board);assert.equal(beforeParadox(restored).turn,old.turn);
 if(s.paradoxEvent.pieces?.length){const frame=packReplayState(s);frame.e.pieces[0].piece.type='K';assert.throws(()=>unpackReplayState(frame));}
});
for(const human of [0,1])test(`extra turns keep consecutive notation, replay, restoration and undo for human side ${human}`,t=>{
 let roll=startOf('extra');t.mock.method(crypto,'getRandomValues',a=>{a.fill(roll);return a;});
 const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const client=createLocalAIStore({storage,random:a=>a.fill(1)});let v=client.create({moveLimit:false,paradoxAt:150});v.toss.hostSide=human;v.state.turn=human;v.state.ply=151;v=client.import(v);
 const original=structuredClone(v.state);
 v=client.action(v.room,{action:'move',move:firstMove(v.state),version:v.version});assert.equal(v.state.turn,human);assert.equal(v.state.ply,152);
 assert.throws(()=>client.action(v.room,{action:'ai-move',move:firstMove(v.state),version:v.version}));
 roll=startOf('promote');v=client.action(v.room,{action:'move',move:firstMove(v.state),version:v.version});assert.equal(v.state.turn,1-human);assert.equal(v.state.ply,153);
 assert.ok(v.logs.slice(-2).every(l=>l.includes(human?'▽':'▲')));
 const record=validateReplay(client.replay(v.room));assert.deepEqual(record.frames.map(f=>f.p),[151,152,153]);assert.deepEqual(record.frames.map(f=>f.t),[human,human,1-human]);
 const reloaded=createLocalAIStore({storage}).read(v.room);assert.deepEqual(reloaded.state,v.state);
 v=client.action(v.room,{action:'offer-undo',version:v.version});assert.equal(v.state.ply,152);assert.equal(v.state.turn,human);
 v=client.action(v.room,{action:'offer-undo',version:v.version});assert.deepEqual(v.state,original);
});
test('extra turn clock debits and adds increment to the same mover and reserves cut-in time',()=>{
 const s=initial();s.turn=0;const data={settings:{timeControl:{mode:'custom',minutes:5,increment:3,byoyomi:0}},state:s,clock:{remaining:[300000,300000],since:0}};
 chargeClock(data,1000);data.state.turn=1;applyParadoxEvent(data.state,'extra',()=>0);finishClockMove(data,0,1000);
 assert.equal(data.state.turn,0);assert.deepEqual(data.clock.remaining,[302000,300000]);assert.ok(data.clock.since>=1000+paradoxEventTiming(data.state.paradoxEvent).totalMs);
 const nextAt=data.clock.since+1000;chargeClock(data,nextAt);assert.equal(data.clock.remaining[0],301000);assert.equal(data.clock.remaining[1],300000);
});
test('rare event messages use the requested exact wording',()=>{
 assert.equal(paradoxSummary({paradoxEvent:{kind:'annihilate'}}),'オセショ様の禁断の槍がすべてを焦がす');
 assert.equal(paradoxSummary({paradoxEvent:{kind:'dragons'}}),'オセショ様が滅ぼした龍の時代が訪れる...');
});

test('forbidden spear clock covers the abyss, rise, rain and closing stages',()=>{
 const t=paradoxEventTiming({kind:'annihilate',pieces:[]});assert.equal(t.motionMs,3700);assert.equal(t.totalMs,6550);
 const data={settings:{timeControl:'none'},state:initial(),clock:{remaining:[300000,300000]}};data.state.paradoxEvent={kind:'annihilate',pieces:[]};finishClockMove(data,0,1000);assert.ok(data.clock.since>=1000+t.totalMs);
});
