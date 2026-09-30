import {chooseAI} from './baseline/ai.js';
import {chooseOsesho} from '../dist/osesho-ai.js';
import {initial,moves,play,collapseAfterMove} from '../dist/engine.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const budget=Number(args.ms||5000),pairs=Number(args.pairs||10),seed=Number(args.seed||73101),openingPlies=Number(args.opening||4),maxPly=Number(args.maxply||300);
const shard=Number(args.shard||0),shards=Number(args.shards||1);
if(!Number.isInteger(shard)||!Number.isInteger(shards)||shards<1||shard<0||shard>=shards)throw Error('Invalid shard');
if(![500,1000,3000,5000].includes(budget))throw Error('Both engines must use a supported identical time budget.');
const output=args.out||'benchmarks/results/latest.json';
const random=seed=>{let x=seed>>>0;return n=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x%n;};};
const legal=s=>[...s.board.flatMap((p,i)=>p?.side===s.turn?[i]:[]),...Object.keys(s.hands[s.turn])].flatMap(src=>moves(s,src));
function opening(index){
 let s=initial();s.moveLimit=false;s.paradoxAt=150;const pick=random(seed+index*104729),history=[];
 for(let i=0;i<(index===0?0:openingPlies);i++){
  const quiet=legal(s).filter(m=>!m.drop&&!m.prom&&!s.board[m.to]).filter(m=>{const next=play(s,m);return !next.result&&!next.flipped.length&&!legal(next).some(reply=>play(next,reply).result);});
  if(!quiet.length)break;const m=quiet[pick(quiet.length)];history.push(m);s=play(s,m);
 }
 return {state:s,history};
}
const sha=async path=>createHash('sha256').update(await readFile(new URL(path,import.meta.url))).digest('hex');
const metadata={baselineCommit:'598f7c6423fabaf75b7ef20352f3edd9e625bf68',baselineSha256:await sha('./baseline/ai.js'),candidateSha256:await sha('../dist/osesho-ai.js'),budgetMs:budget,pairs,seed,openingPlies,maxPly,shard,shards,rules:{moveLimit:false,noDrops:false,paradoxAt:150},cpu:cpus()[0]?.model,node:process.version,started:new Date().toISOString()};
let games=[];
if(args.resume==='yes'){
 try{const previous=JSON.parse(await readFile(output,'utf8'));for(const k of ['candidateSha256','baselineSha256','budgetMs','pairs','seed','openingPlies','maxPly','shard','shards'])if(previous.metadata[k]!==metadata[k])throw Error('Resume mismatch: '+k);games=previous.games;metadata.started=previous.metadata.started;}catch(e){if(e.code!=='ENOENT')throw e;}
}
const tally=()=>{const wins=games.filter(g=>g.winner==='candidate').length,losses=games.filter(g=>g.winner==='baseline').length,draws=games.filter(g=>g.winner==='draw').length;return {games:games.length,wins,losses,draws,winRate:games.length?wins/games.length:0};};
async function save(){await mkdir(output.replace(/[\\/][^\\/]*$/,''),{recursive:true});await writeFile(output,JSON.stringify({metadata,summary:tally(),games},null,2));}
for(let index=0;index<pairs;index++)for(const candidateSide of [0,1]){
 if(index%shards!==shard)continue;
 if(games.some(g=>g.pair===index&&g.candidateSide===candidateSide))continue;
 const start=opening(index);let s=structuredClone(start.state),winner='draw',reason='ply-cap';const record=[],repetitions=new Map(),pick=random(seed+index*8191+37),started=Date.now();
 while(!s.result&&s.ply<maxPly){
  let stats,published=null;const candidate=s.turn===candidateSide,decisionStart=performance.now();
  const publish=m=>{if(performance.now()-decisionStart<=budget)published=m;};
  // Match the browser's last completed iteration; every returned move is checked
  // by the shared authoritative play() before it can enter the game.
  const result=candidate?chooseOsesho(s,budget,publish,x=>stats=x):chooseAI(s,'expert',budget,publish,x=>stats=x);
  const m=published||result;
  if(!m){winner=candidate?'baseline':'candidate';reason='no-legal-moves';break;}
  try{s=collapseAfterMove(play(s,m),pick);}catch(error){winner=candidate?'baseline':'candidate';reason='illegal-move';record.push({move:m,error:error.message});break;}
  record.push({engine:candidate?'candidate':'baseline',move:m,stats,flipped:s.flipped,destroyed:s.destroyed||null});
  if(s.result){const side=s.result.startsWith('先手')?0:s.result.startsWith('後手')?1:null;winner=side===null?'draw':side===candidateSide?'candidate':'baseline';reason=s.result;break;}
  // Repetition is counted as a benchmark draw; no game is silently discarded.
  const key=JSON.stringify([s.board,s.hands,s.turn]),count=(repetitions.get(key)||0)+1;repetitions.set(key,count);if(count>=4){reason='fourfold-repetition';break;}
  if(record.length%20===0)console.log(JSON.stringify({progress:true,pair:index,candidateSide,ply:s.ply,lastDepth:stats?.completedDepth}));
 }
 games.push({pair:index,candidateSide,opening:start.history,winner,reason,ply:s.ply,elapsedMs:Date.now()-started,record});await save();
 console.log(JSON.stringify({finished:true,pair:index,candidateSide,winner,reason,ply:s.ply,summary:tally()}));
}
metadata.finished=new Date().toISOString();await save();console.log(JSON.stringify({complete:true,...tally()}));
