import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {packReplayState} from '../dist/replay-code.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {rateAddress,limitApiIP} from '../worker/action-limit.js';
import {localDB} from '../worker/local-db.js';
import {api} from '../worker/api.js';
import {backupChallengeWins,recordChallengeWin} from '../worker/challenge-wins.js';
import {verifyChallengeProof} from '../worker/challenge-verification.js';
import {winningChallenge} from './helpers/challenge-game.js';
import {createLocalAIStore} from '../dist/local-ai-game.js';

test('IPv6 equivalents and privacy addresses share one /64 budget; mapped IPv4 shares IPv4 budget',async()=>{
 const addresses=['2001:db8:1:2::1','2001:0db8:0001:0002:ffff:ffff:ffff:ffff'];
 const keys=[];for(const clientIP of addresses)await limitApiIP({API_REQUEST_BURST:{limit:async({key})=>{keys.push(key);return {success:true};}}},{clientIP});
 assert.equal(keys[0],keys[1]);assert.notEqual(rateAddress(addresses[0]),rateAddress('2001:db8:1:3::1'));
 assert.equal(rateAddress('::ffff:192.0.2.1'),rateAddress('192.0.2.1'));
 for(const value of ['unknown','999.2.3.4','::1%eth0','x',null])assert.equal(rateAddress(value),null);
});

test('unknown routes never read D1; outsider never decodes corrupted room history',async()=>{
 let reads=0;const env={DB:{prepare(){reads++;return {bind(){return this;},first:async()=>({id:'a'.repeat(32),host_hash:'x',guest_hash:'y',invite_hash:'z',expires:Date.now()+60000,data:'invalid json'})};}}};
 const request=path=>new Request('https://test.local/api/rooms/'+path,{headers:{Authorization:'Bearer '+'b'.repeat(64)}});
 assert.equal((await api(request('a'.repeat(32)+'/replay/extra'),env)).status,404);assert.equal(reads,0);
 assert.equal((await api(request('a'.repeat(32)),env)).status,403);assert.equal(reads,1);
});

test('hourly recovery snapshots are immutable, include zero wins, retain 90 days and do not alter victories',async()=>{
 const db=localDB();try{
  const now=1800000000000;
  await backupChallengeWins(db,now);
  await recordChallengeWin(db,'first',now+1);
  await backupChallengeWins(db,now+2);
  assert.equal((await db.prepare('SELECT total FROM challenge_win_backups WHERE hour = ?').bind(Math.floor(now/3600000)).first()).total,0);
  await backupChallengeWins(db,now+3600000);
  assert.equal((await db.prepare('SELECT total,last_ordinal FROM challenge_win_backups WHERE hour = ?').bind(Math.floor(now/3600000)+1).first()).last_ordinal,1);
  await backupChallengeWins(db,now+92*86400000);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM challenge_win_backups').first()).n,1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM challenge_wins').first()).n,1);
 }finally{db.close();}
});

test('lightweight check accepts records including collapse, rejects missing evidence, invalid coordinates and inconsistent final boards',()=>{
 for(const long of [false,true]){
  const body=winningChallenge(long);assert.equal(verifyChallengeProof(body),true);
  assert.equal(verifyChallengeProof({...body,result:'後手の勝ち（時間切れ）'}),false);
  const bad=structuredClone(body);bad.proof.steps[0].move.to=81;assert.equal(verifyChallengeProof(bad),false);
  const extra=structuredClone(body);extra.proof.final.p++;assert.equal(verifyChallengeProof(extra),false);
  assert.equal(verifyChallengeProof({...body,proof:undefined}),false);
 }
 assert.equal(verifyChallengeProof({ply:1001,proof:{v:1,steps:Array(1001).fill({})}}),false);
});

test('new challenge rounds persist recorded moves across reloads and reset proof on rematch',()=>{
 const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)};
 let client=createLocalAIStore({storage}),data=client.create({aiLevel:'osesho'});
 const proof=winningChallenge().proof;
 for(const step of proof.steps){data=client.action(data.room,{version:data.version,action:data.state.turn===0?'ai-move':'move',move:step.move});}
 client=createLocalAIStore({storage});data=client.read(data.room);
 assert.equal(verifyChallengeProof({proof:{...data.challengeProof,final:packReplayState(data.state)},ply:data.state.ply,result:data.state.result}),true);
 data=client.action(data.room,{version:data.version,action:'offer-rematch'});assert.equal(data.challengeProof.steps.length,0);
});

test('victory limiter rejects before consuming large evidence or D1 reads',async()=>{
 const request=new Request('https://test.local/api/challenge-wins',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+'a'.repeat(64)},body:'x'.repeat(600000)});
 const response=await api(request,{DB:{prepare(){assert.fail('D1 must not be read');}},ROOM_CREATE_BURST:{limit:async()=>({success:false})}});
 assert.equal(response.status,429);assert.equal(request.bodyUsed,false);
});


test('migration retains existing wins and captures their initial recovery point',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec("CREATE TABLE challenge_wins (match_key TEXT PRIMARY KEY, ordinal INTEGER NOT NULL UNIQUE, created INTEGER NOT NULL); INSERT INTO challenge_wins VALUES ('old',7,123);");
  const migration=readFileSync(new URL('../drizzle/0003_challenge_backups.sql',import.meta.url),'utf8');
  db.exec(migration);db.exec(migration);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM challenge_wins').get().n,1);
  const saved=db.prepare('SELECT total,last_ordinal FROM challenge_win_backups').get();assert.equal(saved.total,1);assert.equal(saved.last_ordinal,7);
 }finally{db.close();}
});

test('concurrent reports with different match keys but identical evidence increment once',async()=>{
 const db=localDB();try{
  const results=await Promise.all(Array.from({length:20},(_,i)=>recordChallengeWin(db,'game-'+i,100,'identical-proof')));
  assert.ok(results.every(r=>r.ordinal===1&&r.total===1));
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM challenge_wins').first()).n,1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM challenge_win_proofs').first()).n,1);
 }finally{db.close();}
});
