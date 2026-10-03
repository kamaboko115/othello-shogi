import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,empty,moves,play,raw} from '../dist/engine.js';
import {SearchPosition,searchMoveCodec,chooseOsesho} from '../dist/osesho-ai.js';
const all=s=>[...s.board.flatMap((p,i)=>p?.side===s.turn?[i]:[]),...Object.keys(s.hands[s.turn])].flatMap(src=>moves(s,src));
const key=m=>JSON.stringify(m.drop?{drop:m.drop,to:m.to}:{from:m.from,to:m.to,prom:!!m.prom});
let seed=18517;
const rand=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
const snapshot=p=>({board:[...p.board],hands:[...p.hands],kings:[...p.kings],count:[...p.count],material:[...p.material],hash:p.hash,lock:p.lock,turn:p.turn,ply:p.ply});
const same=(p,s)=>{
 const q=new SearchPosition(s);assert.deepEqual([...p.board],[...q.board]);assert.deepEqual([...p.hands],[...q.hands]);
 assert.deepEqual([...p.count],[...q.count]);assert.deepEqual([...p.material],[...q.material]);assert.equal(p.turn,q.turn);assert.equal(p.ply,q.ply);
 assert.equal(p.hash,q.hash);assert.equal(p.lock,q.lock);
};
test('search move generation and make/unmake match the authoritative rules across seeded games',()=>{
 for(let game=0;game<12;game++){
  let s=initial();s.moveLimit=false;s.noDrops=game%3===0;
  for(let ply=0;ply<90&&!s.result;ply++){
   const p=new SearchPosition(s),expected=all(s),actual=p.generate();
   assert.deepEqual(actual.map(m=>key(searchMoveCodec.decode(m))).sort(),expected.map(key).sort());
   if(!actual.length)break;
   for(let sample=0;sample<Math.min(5,actual.length);sample++){
    const m=actual[rand(actual.length)],before=snapshot(p);p.make(m);same(p,raw(s,searchMoveCodec.decode(m)));p.unmake();assert.deepEqual(snapshot(p),before);
   }
   s=play(s,expected[rand(expected.length)]);
  }
 }
});
test('forced promotion, drops, and flipping promoted pieces match engine rules',()=>{
 for(const side of [0,1])for(const noDrops of [false,true]){
  const s=empty();s.turn=side;s.noDrops=noDrops;s.moveLimit=false;
  s.board[76]={type:'K',side:0,prom:false};s.board[4]={type:'K',side:1,prom:false};
  for(const [i,t,n,prom]of [[18,'P',0,false],[20,'L',0,false],[21,'N',0,false],[62,'N',1,false],[39,'R',1,true],[38,'B',1,true],[37,'P',0,false],[49,'P',0,false]])s.board[i]={type:t,side:n,prom};
  s.hands=[{P:1,L:1,N:1,S:1,G:1,B:1,R:1},{P:1,L:1,N:1,S:1,G:1,B:1,R:1}];
  const p=new SearchPosition(s),actual=p.generate();assert.deepEqual(actual.map(m=>key(searchMoveCodec.decode(m))).sort(),all(s).map(key).sort());
  for(const m of actual){const before=snapshot(p);p.make(m);same(p,raw(s,searchMoveCodec.decode(m)));p.unmake();assert.deepEqual(snapshot(p),before);}
 }
});
const base=()=>{const s=empty();s.moveLimit=false;s.board[76]={type:'K',side:0,prom:false};s.board[4]={type:'K',side:1,prom:false};return s;};
test('Osesho prevents an immediate king flip by a dropped gold',()=>{
 const s=base();s.board[74]={type:'P',side:1,prom:false};s.board[75]={type:'P',side:0,prom:false};s.hands[1].G=1;
 const before=structuredClone(s);let stats;const m=chooseOsesho(s,500,()=>{},x=>stats=x),next=play(s,m);
 assert.deepEqual(s,before);assert.ok(!all(next).some(m=>play(next,m).result.includes('後手の勝ち')));assert.ok(stats.elapsedMs<800);
});
test('Osesho wins by flipping the king even when its own king is attacked',()=>{
 const s=base();s.board[4]=null;s.board[39]={type:'K',side:1,prom:false};s.board[38]={type:'P',side:0,prom:false};s.hands[0].G=1;s.board[67]={type:'R',side:1,prom:false};
 assert.match(play(s,chooseOsesho(s,500)).result,/先手の勝ち/);
});
test('Osesho respects the 60-ply board count adjudication',()=>{
 const s=base();s.moveLimit=true;s.ply=59;s.board[49]={type:'G',side:0,prom:false};s.board[39]={type:'P',side:1,prom:false};s.board[38]={type:'P',side:1,prom:false};s.board[37]={type:'P',side:0,prom:false};s.hands[1].R=9;
 assert.match(play(s,chooseOsesho(s,500)).result,/先手の勝ち.*60手/);
});

test('generated reserves above 81 and 255 retain distinct reversible search hashes',()=>{
 const s=initial();s.hands[0].P=300;const p=new SearchPosition(s),start=[p.hash,p.lock];
 assert.equal(p.hands[1],300);p.hand(0,1,299);assert.notDeepEqual([p.hash,p.lock],start);
 p.hand(0,1,300);assert.deepEqual([p.hash,p.lock],start);
});
