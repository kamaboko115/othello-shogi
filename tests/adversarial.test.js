import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {api} from '../worker/api.js';
import {localDB,localRoomBurstLimiter} from '../worker/local-db.js';
import {localApiRateLimits} from '../worker/action-limit.js';
const token=()=>randomBytes(32).toString('hex');
async function fixture(){
 const db=localDB(),host=token(),guest=token(),outsider=token(),invite=token();
 const env={DB:db,...localApiRateLimits(),ROOM_CREATE_BURST:localRoomBurstLimiter()};
 const call=(path,t,body,headers={})=>api(new Request('https://audit.invalid/api'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+t,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env,{clientIP:'192.0.2.30',requireBurstLimiter:true,allowServerAI:false});
 const created=await (await call('/rooms',host,{invite,settings:{paradoxAt:false,timeControl:'none'}})).json();
 const path='/rooms/'+created.room;
 const room=await (await call(path+'/join',guest,{invite})).json();
 const snapshot=()=>db.prepare('SELECT data,version,guest_hash,expires FROM rooms WHERE id = ?').bind(room.room).first();
 return {db,host,guest,outsider,invite,call,path,room,snapshot,env};
}
test('foreign token cannot read, replay, resign, leave, move or join an occupied room',async()=>{
 const f=await fixture();try{const before=await f.snapshot();
 for(const [suffix,body] of [['',undefined],['/replay',undefined],['/action',{action:'leave',version:f.room.version}],['/action',{action:'resign',version:f.room.version}],['/action',{action:'move',version:f.room.version,move:{from:54,to:45,prom:false}}],['/join',{invite:token()}],['/preview',{invite:token()}]]){
  assert.equal((await f.call(f.path+suffix,f.outsider,body)).status,403);
 }
 assert.equal((await f.call(f.path+'/join',f.outsider,{invite:f.invite})).status,409);
 assert.deepEqual(await f.snapshot(),before);
 }finally{f.db.close();}
});
test('malformed and forged moves do not mutate the match',async()=>{
 const f=await fixture();try{const before=await f.snapshot(),mover=f.room.side===0?f.guest:f.host;
 const bad=[null,{}, {from:-1,to:0,prom:false},{from:54,to:81,prom:false},{from:54,to:45,prom:'true'},{from:54,to:45,prom:true},{from:54,to:0,prom:false},{from:18,to:27,prom:false},{drop:'K',to:40},{drop:'R',to:40},{drop:'__proto__',to:40},{to:NaN},{to:Infinity},{from:[54],to:45,prom:false}];
 for(const move of bad)assert.equal((await f.call(f.path+'/action',mover,{action:'move',version:f.room.version,move})).status,400);
 assert.equal((await f.call(f.path+'/action',mover===f.host?f.guest:f.host,{action:'move',version:f.room.version,move:{from:54,to:45,prom:false}})).status,403);
 assert.deepEqual(await f.snapshot(),before);
 }finally{f.db.close();}
});
test('20 concurrent moves with identical version commit only once',async()=>{
 const f=await fixture();try{const mover=f.room.side===0?f.guest:f.host;
 const results=await Promise.all(Array.from({length:20},()=>f.call(f.path+'/action',mover,{action:'move',version:f.room.version,move:{from:54,to:45,prom:false}})));
 assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===409).length,19);
 const current=await (await f.call(f.path,mover)).json();assert.equal(current.state.ply,1);assert.equal(current.version,f.room.version+1);
 }finally{f.db.close();}
});
test('hostile origin, text payload and oversized JSON do not create rooms',async()=>{
 const f=await fixture();try{
 assert.equal((await f.call('/rooms',token(),{invite:token()},{Origin:'https://attacker.invalid'})).status,403);
 assert.equal((await f.call('/rooms',token(),{invite:token()},{'Content-Type':'text/plain'})).status,415);
 assert.equal((await f.call('/rooms',token(),{invite:token(),padding:'x'.repeat(5000)})).status,413);
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM rooms').first()).n,1);
 }finally{f.db.close();}
});
test('rotating bearer tokens and forwarding headers does not reset trusted-IP quota',async()=>{
 const f=await fixture();try{let limited=0;
 for(let i=0;i<610;i++){
  const r=await f.call('/rooms/'+'0'.repeat(32),token(),undefined,{'X-Forwarded-For':`203.0.113.${i%250+1}`,'CF-Connecting-IP':`198.51.100.${i%250+1}`});
  assert.ok([404,429].includes(r.status));if(r.status===429)limited++;
 }
 assert.equal(limited,12);
 }finally{f.db.close();}
});
test('fake AI actions and unoffered draw/undo/rematch acceptance are rejected',async()=>{
 const f=await fixture();try{const before=await f.snapshot();
 for(const action of ['ai-move','helper-move','ai-no-moves','accept-draw','accept-undo','accept-rematch']){
  const r=await f.call(f.path+'/action',f.host,{action,version:f.room.version,move:{from:54,to:45,prom:false}});assert.ok([400,403,409].includes(r.status),action+':'+r.status);
 }
 assert.deepEqual(await f.snapshot(),before);
 }finally{f.db.close();}
});
