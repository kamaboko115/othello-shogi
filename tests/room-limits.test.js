import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {api,cleanupRooms} from '../worker/api.js';
import {localDB,localRoomBurstLimiter} from '../worker/local-db.js';
import {insertLimitedFriendRoom,roomCreationWindowMs} from '../worker/room-limits.js';

const ip='192.0.2.1',otherIP='192.0.2.2';
const token=()=>randomBytes(32).toString('hex');
const digest=value=>createHash('sha256').update(value).digest('hex');
async function call(db,{path='',host=token(),body={invite:token()},clientIP=ip,env={},required=false,headers={}}={}){
 return api(new Request('https://test.local/api/rooms'+path,{method:body?'POST':'GET',
  headers:{Authorization:'Bearer '+host,'Content-Type':'application/json',...headers},
  body:body?JSON.stringify(body):undefined}),{DB:db,...env},{clientIP,requireBurstLimiter:required});
}
const quota=(db,clientIP=ip)=>db.prepare('SELECT * FROM room_creation_limits WHERE ip_hash = ?').bind(digest(clientIP)).first();

test('IPごとに100部屋を許可し101部屋目を拒否する・別IPは独立',async()=>{
 const db=localDB();try{
  for(let i=0;i<100;i++)assert.equal((await call(db)).status,201);
  const limited=await call(db);assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('Retry-After'))>0);
  assert.match((await limited.json()).error,/作成回数/);
  assert.equal((await quota(db)).count,100);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM rooms').first()).count,100);
  assert.equal((await call(db,{clientIP:otherIP})).status,201);
  assert.equal((await quota(db,otherIP)).count,1);
  assert.equal(await db.prepare('SELECT * FROM room_creation_limits WHERE ip_hash = ?').bind(ip).first(),null);
 }finally{db.close();}
});

test('12時間の直前は拒否し境界でリセット・途中の作成で期限を延ばさない',async t=>{
 const db=localDB(),start=Date.now();t.mock.method(Date,'now',()=>start);
 try{
  assert.equal((await call(db)).status,201);
  const expires=(await quota(db)).expires;assert.equal(expires,start+roomCreationWindowMs);
  t.mock.method(Date,'now',()=>start+60000);
  assert.equal((await call(db)).status,201);assert.equal((await quota(db)).expires,expires);
  await db.prepare('UPDATE room_creation_limits SET count = 100').run();
  t.mock.method(Date,'now',()=>expires-1);
  const blocked=await call(db);assert.equal(blocked.status,429);assert.equal(blocked.headers.get('Retry-After'),'1');
  t.mock.method(Date,'now',()=>expires);
  assert.equal((await call(db)).status,201);
  assert.equal((await quota(db)).count,1);assert.equal((await quota(db)).expires,expires+roomCreationWindowMs);
 }finally{db.close();}
});

test('残り1枠の並行作成は1部屋だけ成功・同じトークンの並行再送は1回だけ数える',async()=>{
 const db=localDB();try{
  const sameHost=token();
  const retries=await Promise.all(Array.from({length:10},()=>call(db,{host:sameHost})));
  assert.equal(retries.filter(r=>r.status===201).length,1);
  assert.equal(retries.filter(r=>r.status===200).length,9);
  const ids=await Promise.all(retries.map(async r=>(await r.json()).room));assert.equal(new Set(ids).size,1);
  assert.equal((await quota(db)).count,1);
  await db.prepare('UPDATE room_creation_limits SET count = 99').run();
  const attempts=await Promise.all(Array.from({length:10},()=>call(db)));
  assert.equal(attempts.filter(r=>r.status===201).length,1);
  assert.equal(attempts.filter(r=>r.status===429).length,9);
  assert.equal((await quota(db)).count,100);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM rooms').first()).count,2);
 }finally{db.close();}
});

test('上限到達後も復帰・参加・着手・再試合を許可し、AI作成は数えない',async()=>{
 const db=localDB();try{
  const host=token(),guest=token(),invite=token();
  const created=await (await call(db,{host,body:{invite}})).json(),path='/'+created.room;
  await db.prepare('UPDATE room_creation_limits SET count = 100').run();
  const env={ROOM_CREATE_BURST:{limit(){assert.fail('復帰・参加・着手・AIで制限を呼ばない');}}};
  assert.equal((await call(db,{host,body:{invite},env,required:true})).status,200);
  assert.equal((await call(db,{path,host,body:null,env})).status,200);
  const joined=await (await call(db,{path:path+'/join',host:guest,body:{invite},env})).json();
  const first=joined.side===0?guest:host;
  const moved=await (await call(db,{path:path+'/action',host:first,body:{action:'move',version:joined.version,move:{from:54,to:45,prom:false}},env})).json();
  assert.equal(moved.state.ply,1);
  const ended=await (await call(db,{path:path+'/action',host,body:{action:'resign',version:moved.version},env})).json();
  const offered=await (await call(db,{path:path+'/action',host,body:{action:'offer-rematch',version:ended.version},env})).json();
  const rematch=await (await call(db,{path:path+'/action',host:guest,body:{action:'accept-rematch',version:offered.version},env})).json();
  assert.equal(rematch.round,2);
  assert.equal((await call(db,{body:{invite:token(),kind:'ai'},env,required:true})).status,201);
  assert.equal((await quota(db)).count,100);
 }finally{db.close();}
});

test('連打制限はDB枠を消費せず429を返す・不正入力も数えない',async()=>{
 const db=localDB();try{
  const keys=[],env={ROOM_CREATE_BURST:{async limit({key}){keys.push(key);return {success:false};}}};
  const blocked=await call(db,{env,required:true});assert.equal(blocked.status,429);assert.equal(blocked.headers.get('Retry-After'),'60');
  assert.deepEqual(keys,[digest(ip)]);assert.equal(await quota(db),null);
  assert.equal((await call(db,{body:{invite:token(),settings:{paradoxAt:-1}}})).status,400);
  assert.equal((await call(db,{host:''})).status,401);
  assert.equal(await quota(db),null);
 }finally{db.close();}
});

test('DB挿入失敗は枠の消費もロールバック・期限切れカウンターを清掃',async()=>{
 const db=localDB();try{
  const created=await (await call(db)).json();
  await assert.rejects(insertLimitedFriendRoom(db,{ipHash:digest(otherIP),id:created.room,hostHash:digest(token()),inviteHash:digest(token()),data:{},now:Date.now()}));
  assert.equal(await quota(db,otherIP),null);assert.equal((await quota(db)).count,1);
  const expires=(await quota(db)).expires;
  await cleanupRooms({DB:db},expires-1);assert.ok(await quota(db));
  await cleanupRooms({DB:db},expires);assert.equal(await quota(db),null);
  assert.ok(await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(created.room).first());
 }finally{db.close();}
});

test('ローカル連打制限は1分5回・期限で回復・IPごとに独立',async t=>{
 let now=100000;t.mock.method(Date,'now',()=>now);const limiter=localRoomBurstLimiter();
 for(let i=0;i<5;i++)assert.equal((await limiter.limit({key:ip})).success,true);
 assert.equal((await limiter.limit({key:ip})).success,false);
 assert.equal((await limiter.limit({key:otherIP})).success,true);
 now+=60000;assert.equal((await limiter.limit({key:ip})).success,true);
});

test('既存DBにマイグレーションを適用して部屋を保持・再適用も可能',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec(readFileSync(new URL('../drizzle/0000_rooms.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO rooms (id,host_hash,invite_hash,data,expires) VALUES (?,?,?,?,?)').run('existing','host','invite','{}',Date.now()+100000);
  const migration=readFileSync(new URL('../drizzle/0001_room_creation_limits.sql',import.meta.url),'utf8');db.exec(migration);db.exec(migration);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM rooms').get().count,1);
  assert.ok(db.prepare('PRAGMA index_list(rooms)').all().some(index=>index.name==='rooms_host_expires'));
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM room_creation_limits').get().count,0);
 }finally{db.close();}
});

execFileSync(process.execPath,['build.mjs'],{cwd:new URL('..',import.meta.url),stdio:'pipe'});
const compiled=await import('../dist/server/index.js');
const worker=compiled.default;
test('公開Workerはヘルパー定数をエントリーポイントとして公開しない',()=>{
 assert.deepEqual(Object.keys(compiled),['default']);
});
test('公開WorkerはCloudflareのIPで制限・転送ヘッダーを信用せず未設定時は作成を拒否',async()=>{
 const db=localDB();try{
  const keys=[],env={DB:db,ROOM_CREATE_BURST:{async limit({key}){keys.push(key);return {success:true};}}};
  const request=headers=>new Request('https://game.test/api/rooms',{method:'POST',headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json',...headers},body:JSON.stringify({invite:token()})});
  assert.equal((await worker.fetch(request({}),env)).status,503);
  assert.equal((await worker.fetch(request({'CF-Connecting-IP':ip}),{DB:db})).status,503);
  assert.equal((await worker.fetch(request({'CF-Connecting-IP':ip,'X-Forwarded-For':otherIP}),env)).status,201);
  assert.equal((await worker.fetch(request({'CF-Connecting-IP':ip,'X-Forwarded-For':'192.0.2.3'}),env)).status,201);
  assert.deepEqual(keys,[digest(ip),digest(ip)]);assert.equal((await quota(db)).count,2);
 }finally{db.close();}
});

test('公開版は旧AI作成での制限回避を拒否し、既存の旧AI対局は復帰できる',async()=>{
 const db=localDB();try{
  const host=token(),invite=token(),body={invite,kind:'ai'};
  const request=()=>new Request('https://game.test/api/rooms',{method:'POST',headers:{Authorization:'Bearer '+host,'Content-Type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify(body)});
  const env={DB:db,ROOM_CREATE_BURST:{limit(){assert.fail('旧AI対局の復帰で枠を消費しない');}}};
  assert.equal((await worker.fetch(request(),env)).status,410);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM rooms').first()).count,0);
  const legacy=await (await call(db,{host,body})).json();
  const restored=await worker.fetch(request(),env);assert.equal(restored.status,200);assert.equal((await restored.json()).room,legacy.room);
  assert.equal((await worker.fetch(new Request('https://game.test/api/rooms/'+legacy.room,{headers:{Authorization:'Bearer '+host}}),env)).status,200);
  assert.equal(await quota(db),null);
 }finally{db.close();}
});
