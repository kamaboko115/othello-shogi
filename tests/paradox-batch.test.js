import test from 'node:test';
import assert from 'node:assert/strict';
import {empty,initial,collapseAfterMove,arrivals,arrivalSummary} from '../dist/engine.js';
import {packReplayState,unpackReplayState} from '../dist/replay-code.js';
import {paintArrival} from '../dist/collapse-view.js';
const active=()=>({...initial(),ply:151,paradoxAt:150,moveLimit:false});

test('arrival adds three distinct promoted major pieces without destroying anything',()=>{
 const s=active(),before=structuredClone(s.board);collapseAfterMove(s,()=>0,()=>true);
 const batch=arrivals(s);assert.equal(batch.length,3);assert.equal(new Set(batch.map(d=>d.square)).size,3);
 for(const d of batch){assert.equal(before[d.square],null);assert.ok(d.piece.prom);assert.ok(['B','R'].includes(d.piece.type));assert.deepEqual(s.board[d.square],d.piece);}
 before.forEach((p,i)=>{if(p)assert.deepEqual(s.board[i],p);});assert.equal(s.destroyed,null);assert.equal(s.board.filter(Boolean).length,43);
 assert.equal(arrivalSummary(s),'先手の馬・先手の馬・先手の馬が降臨');
});

test('arrival fills only available squares, including a completely full board',()=>{
 for(const count of [0,1,2]){
  const s=active();s.board=Array.from({length:81},()=>({type:'P',side:0,prom:false}));for(let i=0;i<count;i++)s.board[40+i]=null;
  collapseAfterMove(s,()=>0,()=>true);assert.equal(arrivals(s).length,count);assert.equal(s.board.filter(Boolean).length,81);assert.equal(s.destroyed,null);
 }
});

test('each king has one destruction ticket while every other piece has ten',()=>{
 const base=empty();base.ply=151;base.paradoxAt=150;base.board[4]={type:'K',side:1};base.board[76]={type:'K',side:0};base.board[20]={type:'B',side:1,prom:true};base.board[60]={type:'P',side:0};
 const counts=new Map();for(let roll=0;roll<22;roll++){
  const s=structuredClone(base);collapseAfterMove(s,n=>{assert.equal(n,22);return roll;},()=>false);
  counts.set(s.destroyed.square,(counts.get(s.destroyed.square)||0)+1);
  if(s.destroyed.piece.type==='K')assert.match(s.result,/王が崩壊/);else assert.equal(s.result,'');
 }
 assert.deepEqual([...counts],[[4,1],[20,10],[60,10],[76,1]]);
});

test('production arrival probability remains one in eight',t=>{
 for(let roll=0;roll<16;roll++){
  let first=true;const mock=t.mock.method(crypto,'getRandomValues',bytes=>{bytes.fill(first?roll:0);first=false;return bytes;});
  const s=active();collapseAfterMove(s);assert.equal(arrivals(s).length,roll%8===0?3:0);mock.mock.restore();
 }
});

test('replay preserves all arrivals, accepts old single arrivals and rejects invalid extras',()=>{
 const s=active();collapseAfterMove(s,()=>0,()=>true);const frame=packReplayState(s),restored=unpackReplayState(frame);
 assert.deepEqual(arrivals(restored),arrivals(s));assert.deepEqual(packReplayState(restored),frame);
 const old={...frame};delete old.a;assert.equal(arrivals(unpackReplayState(old)).length,1);
 for(const a of [[frame.u],[-1],[81],[frame.a[0],frame.a[0]],[4],[1,2,3],null])assert.throws(()=>unpackReplayState({...frame,a}));
 assert.throws(()=>unpackReplayState({...frame,u:null}));
});

test('all three arrivals receive the simultaneous animation, including legacy single events',t=>{
 const cells=new Map([1,2,3].map(i=>[i,{children:[],querySelectorAll(){return [];},append(el){this.children.push(el);},classList:{toggle(name,on){this[name]=on;}}}]));
 const board={querySelector:selector=>cells.get(Number(selector.match(/"(\d+)"/)[1]))};
 const previous=globalThis.document;globalThis.document={createElement:()=>({setAttribute(){}})};t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 const piece={type:'B',side:0,prom:true},state={spawned:{square:1,piece,additional:[{square:2,piece},{square:3,piece}]}};
 paintArrival(board,state,true);for(const cell of cells.values()){assert.match(cell.children[0].className,/arriving/);assert.equal(cell.classList['paradox-spawn-cell'],true);}
 paintArrival(board,{spawned:{square:1,piece}},false);assert.equal(cells.get(1).children.length,2);
});
