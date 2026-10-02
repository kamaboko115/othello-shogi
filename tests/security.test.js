import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {api} from '../worker/api.js';
import {localDB} from '../worker/local-db.js';
import {readLimitedRequestBody,maxRequestBodyBytes} from '../worker/security.js';
import {createLocalAIStore} from '../dist/local-ai-game.js';

const token=()=>randomBytes(32).toString('hex');
test('ブラウザ内AI対局も無意味な取消で版を増やさず保存し直さない',()=>{
 const saved=new Map();let writes=0;
 const storage={getItem:key=>saved.get(key)??null,setItem(key,value){writes++;saved.set(key,value);},removeItem:key=>saved.delete(key)};
 const client=createLocalAIStore({storage});let room=client.create({});const before=writes;
 for(const action of ['decline-draw','decline-undo']){
  room=client.action(room.room,{action,version:room.version});assert.equal(room.version,0);
 }
 assert.equal(writes,before);
 room=client.action(room.room,{action:'resign',version:room.version});assert.equal(room.version,1);
 const endedWrites=writes;
 room=client.action(room.room,{action:'decline-rematch',version:room.version});assert.equal(room.version,1);assert.equal(writes,endedWrites);
});
async function call(db,path,host,body){
 const response=await api(new Request('https://test.local/api/rooms'+path,{method:'POST',headers:{Authorization:'Bearer '+host,'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB:db});
 assert.equal(response.status,200);return response.json();
}
async function fixture(){
 const db=localDB(),host=token(),guest=token(),invite=token();
 const r=await api(new Request('https://test.local/api/rooms',{method:'POST',headers:{Authorization:'Bearer '+host,'Content-Type':'application/json'},body:JSON.stringify({invite})}),{DB:db});
 const room=await r.json(),path='/'+room.room;
 const joined=await call(db,path+'/join',guest,{invite});
 let writes=0;
 const observed={prepare(sql){const statement=db.prepare(sql),wrap=s=>({bind(...args){return wrap(s.bind(...args));},first:()=>s.first(),async run(){if(/^UPDATE rooms/.test(sql))writes++;return s.run();}});return wrap(statement);}};
 return {db,observed,host,guest,path,joined,get writes(){return writes;}};
}
test('存在しない提案の取り消しと同じ引き分け提案の再送はDBも版も更新しない',async()=>{
 const f=await fixture();try{
  const original=await f.db.prepare('SELECT data FROM rooms WHERE id = ?').bind(f.joined.room).first();
  for(const action of ['decline-draw','decline-undo']){
   const response=await call(f.observed,f.path+'/action',f.host,{action,version:f.joined.version});assert.equal(response.version,f.joined.version);
  }
  assert.equal(f.writes,0);assert.equal((await f.db.prepare('SELECT data FROM rooms WHERE id = ?').bind(f.joined.room).first()).data,original.data);
  const offer=await call(f.observed,f.path+'/action',f.host,{action:'offer-draw',version:f.joined.version});assert.equal(f.writes,1);
  for(let i=0;i<3;i++)assert.equal((await call(f.observed,f.path+'/action',f.host,{action:'offer-draw',version:offer.version})).version,offer.version);
  assert.equal(f.writes,1);
  const first=f.joined.side===0?f.guest:f.host;
  const moved=await call(f.observed,f.path+'/action',first,{action:'move',version:offer.version,move:{from:54,to:45,prom:false}});assert.equal(moved.state.ply,1);
 }finally{f.db.close();}
});
test('待った・再試合の提案の再送は更新せず、本当の承諾・取消は更新する',async()=>{
 const f=await fixture();try{
  const first=f.joined.side===0?f.guest:f.host;
  const moved=await call(f.observed,f.path+'/action',first,{action:'move',version:f.joined.version,move:{from:54,to:45,prom:false}});
  const offer=await call(f.observed,f.path+'/action',first,{action:'offer-undo',version:moved.version});
  const writes=f.writes;
  assert.equal((await call(f.observed,f.path+'/action',first,{action:'offer-undo',version:offer.version})).version,offer.version);assert.equal(f.writes,writes);
  const accepted=await call(f.observed,f.path+'/action',first===f.host?f.guest:f.host,{action:'accept-undo',version:offer.version});assert.equal(accepted.state.ply,0);assert.equal(f.writes,writes+1);
  const ended=await call(f.observed,f.path+'/action',f.host,{action:'resign',version:accepted.version});
  const absent=await call(f.observed,f.path+'/action',f.host,{action:'decline-rematch',version:ended.version});assert.equal(absent.version,ended.version);
  const rematch=await call(f.observed,f.path+'/action',f.host,{action:'offer-rematch',version:ended.version}),before=f.writes;
  assert.equal((await call(f.observed,f.path+'/action',f.host,{action:'offer-rematch',version:rematch.version})).version,rematch.version);assert.equal(f.writes,before);
  const cancelled=await call(f.observed,f.path+'/action',f.guest,{action:'decline-rematch',version:rematch.version});assert.equal(cancelled.version,rematch.version+1);
  assert.equal((await call(f.observed,f.path+'/action',f.guest,{action:'decline-rematch',version:cancelled.version})).version,cancelled.version);assert.equal(f.writes,before+1);
 }finally{f.db.close();}
});

function upload(chunks,headers={}){
 let reads=0,cancelled=false;
 const body=new ReadableStream({pull(controller){reads++;if(chunks.length)controller.enqueue(chunks.shift());else controller.close();},cancel(){cancelled=true;}},{highWaterMark:0});
 const request=new Request('https://test.local/api/rooms',{method:'POST',headers:{Authorization:'Bearer '+token(),'Content-Type':'application/json',...headers},body,duplex:'half'});
 return {request,get reads(){return reads;},get cancelled(){return cancelled;}};
}
test('Content-Length超過は本文を読まず拒否・認証なしも本文を読まない',async()=>{
 const declared=upload([new Uint8Array(8000)],{'Content-Length':'8000'});
 await assert.rejects(readLimitedRequestBody(declared.request),{status:413});assert.equal(declared.reads,0);assert.ok(declared.cancelled);
 const unsigned=upload([new Uint8Array(8000)]);unsigned.request.headers.delete('Authorization');
 const response=await api(unsigned.request,{DB:{prepare(){assert.fail('認証前にDBを呼ばない');}}});assert.equal(response.status,401);assert.equal(unsigned.reads,0);
});
test('長さの申告なし・小さく偽装された本文も4096バイト超過で読み込みを打ち切る',async()=>{
 for(const headers of [{},{'Content-Length':'1'}]){
  const input=upload([new Uint8Array(4096),new Uint8Array(1),new Uint8Array(1000000)],headers);
  await assert.rejects(readLimitedRequestBody(input.request),{status:413});assert.equal(input.reads,2);assert.ok(input.cancelled);
 }
});
test('上限内の本文はUTF-8の分割文字も保持し、マルチバイトの超過は拒否',async()=>{
 const exact=upload([new TextEncoder().encode('x'.repeat(maxRequestBodyBytes))]);assert.equal((await readLimitedRequestBody(exact.request)).length,maxRequestBodyBytes);
 const bytes=new TextEncoder().encode('{"text":"将棋"}'),split=upload([bytes.slice(0,10),bytes.slice(10)]);
 assert.equal(await readLimitedRequestBody(split.request),'{"text":"将棋"}');
 const large=upload([new TextEncoder().encode('あ'.repeat(1500))]);await assert.rejects(readLimitedRequestBody(large.request),{status:413});
});
test('通常のJSON操作を維持し、ストリームの本文超過はAPIで413を返す',async()=>{
 const db=localDB();try{
  const valid=upload([new TextEncoder().encode(JSON.stringify({invite:token()}))]);assert.equal((await api(valid.request,{DB:db})).status,201);
  const large=upload([new Uint8Array(4097),new Uint8Array(10000)]);assert.equal((await api(large.request,{DB:db})).status,413);assert.equal(large.reads,1);assert.ok(large.cancelled);
 }finally{db.close();}
});

execFileSync(process.execPath,['build.mjs'],{cwd:new URL('..',import.meta.url),stdio:'pipe'});
const worker=(await import('../dist/server/index.js')).default;
test('公開ページ・キャッシュ応答・エラー応答にCSPの埋め込み禁止を付ける',async()=>{
 const page=await worker.fetch(new Request('https://test.local/'),{});
 for(const response of [page,
  await worker.fetch(new Request('https://test.local/',{headers:{'If-None-Match':page.headers.get('ETag')}}),{}),
  await worker.fetch(new Request('https://test.local/missing'),{}),
  await worker.fetch(new Request('https://test.local/api/rooms'),{DB:{}})]){
  const csp=response.headers.get('Content-Security-Policy');assert.match(csp,/frame-ancestors 'none'/);assert.match(csp,/script-src 'self'/);assert.doesNotMatch(csp,/unsafe-eval/);assert.equal(response.headers.get('X-Frame-Options'),'DENY');
 }
});
