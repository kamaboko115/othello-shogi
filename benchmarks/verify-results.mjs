import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {initial,play,collapseAfterMove,hasMove} from '../dist/engine.js';
const file=process.argv[2]||'benchmarks/results/evaluation-combined.json';
const data=JSON.parse(await readFile(file,'utf8'));
const sha=async p=>createHash('sha256').update(await readFile(new URL(p,import.meta.url))).digest('hex');
assert.equal(data.metadata.candidateSha256,await sha('../dist/osesho-ai.js'));
assert.equal(data.metadata.baselineSha256,await sha('./baseline/ai.js'));
assert.equal(data.metadata.budgetMs,5000);
assert.equal(data.summary.complete,true);
assert.deepEqual(data.metadata.rules,{moveLimit:false,noDrops:false,paradoxAt:150});
assert.equal(data.games.length,data.metadata.pairs*2);
const seen=new Set();let plies=0;
for(const g of data.games){
 const key=g.pair+':'+g.candidateSide;assert.ok(!seen.has(key));seen.add(key);
 const twin=data.games.find(x=>x.pair===g.pair&&x.candidateSide!==g.candidateSide);assert.ok(twin);assert.deepEqual(g.opening,twin.opening);
 let s=initial();s.moveLimit=false;s.paradoxAt=150;
 for(const m of g.opening)s=play(s,m);
 const repetitions=new Map();let repeated=false;
 for(const r of g.record){
  assert.ok(!s.result);assert.equal(r.engine,s.turn===g.candidateSide?'candidate':'baseline');
  s=play(s,r.move);
  if(r.destroyed){
   const choices=s.board.flatMap((p,i)=>p?[i]:[]),pick=choices.indexOf(r.destroyed.square);assert.ok(pick>=0);
   s=collapseAfterMove(s,()=>pick);assert.deepEqual(s.destroyed,r.destroyed);
  }else assert.ok(s.paradoxAt===false||s.ply<s.paradoxAt||s.result,'Missing collapse');
  assert.deepEqual(s.flipped,r.flipped);plies++;
  const k=JSON.stringify([s.board,s.hands,s.turn]),n=(repetitions.get(k)||0)+1;repetitions.set(k,n);if(n>=4)repeated=true;
 }
 assert.equal(s.ply,g.ply);
 if(g.reason==='fourfold-repetition'){assert.equal(g.winner,'draw');assert.ok(repeated);}
 else if(g.reason==='ply-cap'){assert.equal(g.winner,'draw');assert.equal(s.ply,data.metadata.maxPly);assert.ok(!s.result);}
 else if(g.reason==='no-legal-moves'){assert.ok(!s.result);assert.equal(hasMove(s),false);assert.equal(g.winner,s.turn===g.candidateSide?'baseline':'candidate');}
 else {assert.equal(s.result,g.reason);const winningSide=s.result.startsWith('先手')?0:s.result.startsWith('後手')?1:null;assert.equal(g.winner,winningSide===null?'draw':winningSide===g.candidateSide?'candidate':'baseline');}
}
for(let i=0;i<data.metadata.pairs;i++)for(const side of [0,1])assert.ok(seen.has(i+':'+side));
assert.equal(data.summary.games,data.games.length);
for(const [field,winner]of [['wins','candidate'],['losses','baseline'],['draws','draw']])assert.equal(data.summary[field],data.games.filter(g=>g.winner===winner).length);
assert.equal(data.summary.winRate,data.summary.wins/data.games.length);
console.log(JSON.stringify({verifiedGames:data.games.length,verifiedPlies:plies,summary:data.summary}));
