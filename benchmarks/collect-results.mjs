import {readFile,writeFile} from 'node:fs/promises';
const files=process.argv.slice(2);if(!files.length)throw Error('Pass all shard result files.');
const results=await Promise.all(files.map(async f=>JSON.parse(await readFile(f,'utf8'))));
const metadata=results[0].metadata;
for(const r of results)for(const k of ['candidateSha256','baselineSha256','budgetMs','pairs','seed','openingPlies','maxPly','shards'])if(r.metadata[k]!==metadata[k])throw Error('Incompatible results: '+k);
const games=results.flatMap(r=>r.games).sort((a,b)=>a.pair-b.pair||a.candidateSide-b.candidateSide),keys=new Set();
for(const g of games){const key=g.pair+':'+g.candidateSide;if(keys.has(key))throw Error('Duplicate game '+key);keys.add(key);}
const wins=games.filter(g=>g.winner==='candidate').length,losses=games.filter(g=>g.winner==='baseline').length,draws=games.filter(g=>g.winner==='draw').length;
const n=games.length,p=n?wins/n:0,z=1.96,d=1+z*z/n,center=(p+z*z/(2*n))/d,margin=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
const summary={games:n,plannedGames:metadata.pairs*2,complete:n===metadata.pairs*2&&results.every(r=>r.metadata.finished),wins,losses,draws,winRate:p,wilson95:n?[center-margin,center+margin]:null};
const aggregate={metadata:{...metadata,shard:undefined,files},summary,games};
await writeFile('benchmarks/results/evaluation-combined.json',JSON.stringify(aggregate,null,2));console.log(JSON.stringify(summary));
