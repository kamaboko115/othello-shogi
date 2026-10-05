import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {limitApiIP,limitRoomActions,localApiRateLimits,apiRequestLimit,roomActionLimit,apiRatePeriodSeconds} from '../worker/action-limit.js';
import {api} from '../worker/api.js';
import {localDB} from '../worker/local-db.js';

const firstHash='a'.repeat(64),secondHash='b'.repeat(64),ip='192.0.2.10';
test('IP budget hashes the trusted address and returns a no-store JSON 429 with retry guidance',async()=>{
 const keys=[],env={API_REQUEST_BURST:{async limit({key}){keys.push(key);return {success:false};}}};
 const response=await limitApiIP(env,{clientIP:ip,required:true});
 assert.deepEqual(keys,['ip:'+createHash('sha256').update(ip).digest('hex')]);
 assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
 assert.match((await response.json()).error,/1分/);
});

test('required bindings, missing trusted IP and failed native counters fail closed',async()=>{
 assert.equal((await limitApiIP({},{clientIP:ip,required:true})).status,503);
 assert.equal((await limitRoomActions({},{tokenHash:firstHash,required:true})).status,503);
 const mustNotCall={limit(){assert.fail('invalid identity must not reach the counter');}};
 assert.equal((await limitApiIP({API_REQUEST_BURST:mustNotCall},{clientIP:null})).status,503);
 assert.equal((await limitRoomActions({ROOM_ACTION_BURST:mustNotCall},{tokenHash:'raw-token'})).status,503);
 for(const limit of [async()=>{throw Error('Unavailable');},async()=>({})]){
  assert.equal((await limitApiIP({API_REQUEST_BURST:{limit}},{clientIP:ip})).status,503);
  assert.equal((await limitRoomActions({ROOM_ACTION_BURST:{limit}},{tokenHash:firstHash})).status,503);
 }
 assert.equal(await limitApiIP({},{clientIP:ip}),null);
 assert.equal(await limitRoomActions({},{tokenHash:firstHash}),null);
});

test('one player exhausts only their action budget; the opponent and shared-network reads remain available',async()=>{
 let now=100000;const env=localApiRateLimits({now:()=>now});
 for(let i=0;i<roomActionLimit;i++){
  assert.equal(await limitApiIP(env,{clientIP:ip}),null);
  assert.equal(await limitRoomActions(env,{tokenHash:firstHash}),null);
 }
 assert.equal((await limitRoomActions(env,{tokenHash:firstHash})).status,429);
 assert.equal(await limitRoomActions(env,{tokenHash:secondHash}),null);
 assert.equal(await limitApiIP(env,{clientIP:ip}),null);
 now+=apiRatePeriodSeconds*1000-1;
 assert.equal((await limitRoomActions(env,{tokenHash:firstHash})).status,429);
 now++;
 assert.equal(await limitRoomActions(env,{tokenHash:firstHash}),null);
});

test('IP limit caps token rotation, keeps unrelated IPs independent and recovers at the window boundary',async()=>{
 let now=100000;const env=localApiRateLimits({now:()=>now});
 for(let i=0;i<apiRequestLimit;i++)assert.equal(await limitApiIP(env,{clientIP:ip}),null);
 assert.equal((await limitApiIP(env,{clientIP:ip})).status,429);
 assert.equal(await limitApiIP(env,{clientIP:'192.0.2.11'}),null);
 now+=apiRatePeriodSeconds*1000;
 assert.equal(await limitApiIP(env,{clientIP:ip}),null);
});

test('deployed native bindings match the verified local limits and use independent namespaces',()=>{
 const config=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 for(const [name,limit] of [['API_REQUEST_BURST',apiRequestLimit],['ROOM_ACTION_BURST',roomActionLimit]]){
  assert.deepEqual(config.ratelimits.find(binding=>binding.name===name)?.simple,{limit,period:apiRatePeriodSeconds});
 }
 assert.equal(new Set(config.ratelimits.map(binding=>binding.namespace_id)).size,config.ratelimits.length);
});

test('API rejects over-budget requests before touching D1, including anonymous reads and rotating tokens',async()=>{
 const DB={prepare(){assert.fail('rate-limited requests must not query D1');}};
 for(const path of ['/api/challenge-wins','/api/rooms/'+'c'.repeat(32)]){
  for(const token of [firstHash,secondHash]){
   const response=await api(new Request('https://test.local'+path,{headers:{Authorization:'Bearer '+token}}),{
    DB,API_REQUEST_BURST:{async limit(){return {success:false};}}
   },{clientIP:ip,requireBurstLimiter:true});
   assert.equal(response.status,429);
  }
 }
 const missing=await api(new Request('https://test.local/api/challenge-wins'),{DB},{clientIP:ip,requireBurstLimiter:true});
 assert.equal(missing.status,503);
});

test('API stops alternating proposal writes, preserves polling and the other participant, then recovers',async()=>{
 const db=localDB();let now=100000;const limits=localApiRateLimits({now:()=>now});
 const env={DB:db,...limits,ROOM_CREATE_BURST:{async limit(){return {success:true};}}};
 async function request(path,token,body){
  return api(new Request('https://test.local/api/rooms'+path,{
   method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})
  }),env,{clientIP:ip,requireBurstLimiter:true});
 }
 async function post(path,token,body){const response=await request(path,token,body);assert.ok(response.ok,await response.clone().text());return response.json();}
 try{
  const invite='c'.repeat(64);let room=await post('',firstHash,{invite,settings:{timeControl:'none'}});
  const path='/'+room.room;room=await post(path+'/join',secondHash,{invite});
  // Both participants can poll thirty times per minute without spending any
  // action quota; real clients normally use this rate only while waiting.
  for(let i=0;i<30;i++)for(const token of [firstHash,secondHash])assert.equal((await request(path+'?version='+room.version,token)).status,304);
  for(let i=0;i<roomActionLimit;i++)room=await post(path+'/action',firstHash,{action:i%2?'decline-draw':'offer-draw',version:room.version});
  const before=await db.prepare('SELECT data,version FROM rooms WHERE id = ?').bind(room.room).first();
  assert.equal((await request(path+'/action',firstHash,{action:'offer-draw',version:room.version})).status,429);
  assert.deepEqual(await db.prepare('SELECT data,version FROM rooms WHERE id = ?').bind(room.room).first(),before);
  assert.equal((await request(path+'?version='+room.version,firstHash)).status,304);
  room=await post(path+'/action',secondHash,{action:'offer-draw',version:room.version});
  assert.equal(room.version,before.version+1);
  now+=apiRatePeriodSeconds*1000;
  room=await post(path+'/action',firstHash,{action:'decline-draw',version:room.version});
  assert.equal(room.version,before.version+2);
 }finally{db.close();}
});

test('unauthorized tokens cannot spend a participant action budget and missing action binding blocks writes',async()=>{
 const db=localDB();let actionCalls=0;
 const base={DB:db,API_REQUEST_BURST:{async limit(){return {success:true};}},ROOM_CREATE_BURST:{async limit(){return {success:true};}}};
 async function request(path,token,body,env=base){return api(new Request('https://test.local/api/rooms'+path,{
  method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)
 }),env,{clientIP:ip,requireBurstLimiter:true});}
 try{
  const invite='c'.repeat(64),created=await (await request('',firstHash,{invite})).json(),path='/'+created.room;
  const joined=await (await request(path+'/join',secondHash,{invite})).json();
  const watched={...base,ROOM_ACTION_BURST:{async limit(){actionCalls++;return {success:true};}}};
  assert.equal((await request(path+'/action','d'.repeat(64),{action:'offer-draw',version:joined.version},watched)).status,403);
  assert.equal(actionCalls,0);
  assert.equal((await request(path+'/action',firstHash,{action:'offer-draw',version:joined.version})).status,503);
  assert.equal((await db.prepare('SELECT version FROM rooms WHERE id = ?').bind(created.room).first()).version,joined.version);
 }finally{db.close();}
});
