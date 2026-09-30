import test from 'node:test';import assert from 'node:assert/strict';
import {api} from '../worker/api.js';import {localDB} from '../worker/local-db.js';
const host='a'.repeat(64),guest='b'.repeat(64),other='c'.repeat(64),invite='d'.repeat(64);
async function call(db,path,token=host,body,origin='http://test.local'){
 const req=new Request('http://test.local/api/rooms'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:origin},body:body?JSON.stringify(body):undefined});
 const response=await api(req,{DB:db});return {status:response.status,data:await response.json()};
}
async function room(db){const created=await call(db,'',host,{invite,mode:true});assert.equal(created.status,201);return created.data.room;}
async function timedRoom(db){const created=await call(db,'',host,{invite,mode:true,settings:{timeControl:{minutes:1,increment:0,byoyomi:0}}});assert.equal(created.status,201);return created.data.room;}
test('部屋作成・2人参加・手番同期・再接続・第三者の拒否',async()=>{
 const db=localDB();try{
 const id=await room(db),path='/'+id;
 assert.equal((await call(db,path+'/action',host,{action:'move',version:0,move:{from:54,to:45,prom:false}})).status,409);
 assert.equal((await call(db,path,other)).status,403);
 assert.equal((await call(db,path+'/join',guest,{invite:'e'.repeat(64)})).status,403);
 const joined=await call(db,path+'/join',guest,{invite});assert.equal(joined.status,200);assert.equal(joined.data.seat,1);const first=joined.data.side===0?guest:host,second=first===host?guest:host;
 assert.equal((await call(db,path+'/join',other,{invite})).status,409);
 assert.equal((await call(db,path+'/action',second,{action:'move',version:1,move:{from:18,to:27,prom:false}})).status,403);
 const moved=await call(db,path+'/action',first,{action:'move',version:1,move:{from:54,to:45,prom:false}});assert.equal(moved.status,200);assert.equal(moved.data.state.turn,1);
 const reconnected=await call(db,path,guest);assert.deepEqual(reconnected.data.state,moved.data.state);assert.equal(reconnected.data.side,joined.data.side);
 assert(!JSON.stringify(reconnected.data).includes(host));assert(!('host_hash' in reconnected.data));
 assert.equal((await call(db,path+'/action',host,{action:'move',version:1,move:{from:54,to:45,prom:false}})).status,409);
 }finally{db.close();}
});
test('同時参加では1人だけ後手になる・不正手と古い版を拒否',async()=>{
 const db=localDB();try{
 const id=await room(db),path='/'+id;
 const joins=await Promise.all([call(db,path+'/join',guest,{invite}),call(db,path+'/join',other,{invite})]);assert.deepEqual(joins.map(x=>x.status).sort(),[200,409]);const winner=joins[0].status===200?guest:other;const first=joins.find(x=>x.status===200).data.side===0?winner:host;
 assert.equal((await call(db,path+'/action',first,{action:'move',version:1,move:{from:54,to:0,prom:false}})).status,400);
 assert.equal((await call(db,path+'/action',first,{action:'move',version:1,move:{from:'54',to:45,prom:false}})).status,400);
 const simultaneous=await Promise.all([call(db,path+'/action',first,{action:'move',version:1,move:{from:54,to:45,prom:false}}),call(db,path+'/action',first,{action:'move',version:1,move:{from:55,to:46,prom:false}})]);assert.deepEqual(simultaneous.map(x=>x.status).sort(),[200,409]);
 assert.equal((await call(db,path)).data.state.ply,1);
 }finally{db.close();}
});
test('引き分けは相手の承諾が必要・投了は手番に関係なく可能',async()=>{
 const db=localDB();try{
 const id=await room(db),path='/'+id;await call(db,path+'/join',guest,{invite});
 assert.equal((await call(db,path+'/action',host,{action:'accept-draw',version:1})).status,400);
 const offer=await call(db,path+'/action',host,{action:'offer-draw',version:1});assert.equal(offer.data.offer,0);assert.equal(offer.data.state.result,'');
 assert.equal((await call(db,path+'/action',host,{action:'accept-draw',version:2})).status,400);
 const accepted=await call(db,path+'/action',guest,{action:'accept-draw',version:2});assert.equal(accepted.data.state.result,'合意による引き分け');
 assert.equal((await call(db,path+'/action',host,{action:'resign',version:3})).status,409);
 }finally{db.close();}
});
test('投了・合意引き分けでは終局時点の消費時間を確定する',async()=>{
 for(const ending of ['resign','draw']){const db=localDB();try{
  const id=await timedRoom(db),path='/'+id;await call(db,path+'/join',guest,{invite});
  let version=1;
  if(ending==='draw'){const offered=await call(db,path+'/action',host,{action:'offer-draw',version});assert.equal(offered.status,200);version=offered.data.version;}
  const row=await db.prepare('SELECT data FROM rooms WHERE id = ?').bind(id).first(),raw=JSON.parse(row.data);raw.clock.since=Date.now()-10000;
  await db.prepare('UPDATE rooms SET data = ? WHERE id = ?').bind(JSON.stringify(raw),id).run();
  const token=ending==='draw'?guest:host,action=ending==='draw'?'accept-draw':'resign',ended=await call(db,path+'/action',token,{action,version});
  assert.equal(ended.status,200);assert.ok(ended.data.state.result);assert.ok(ended.data.clock.remaining[0]<=50050&&ended.data.clock.remaining[0]>=49500,`${ending}: ${ended.data.clock.remaining[0]}`);
  const fetched=await call(db,path,host);assert.equal(fetched.data.clock.remaining[0],ended.data.clock.remaining[0]);
 }finally{db.close();}}
});
test('別サイトからの操作・認証なし・期限切れの対局を拒否',async()=>{
 const db=localDB();try{
 assert.equal((await call(db,'',host,{invite},'https://evil.example')).status,403);
 assert.equal((await call(db,'','',{invite})).status,401);
 const id=await room(db);await db.prepare('UPDATE rooms SET expires = ? WHERE id = ?').bind(0,id).run();
 assert.equal((await call(db,'/'+id)).status,404);
 }finally{db.close();}
});

test('再試合は双方合意・毎回振り駒・再接続と手番権限',async()=>{const db=localDB();try{const id=await room(db),path='/'+id;let joined=(await call(db,path+'/join',guest,{invite})).data;assert.equal(joined.toss.coins.length,5);assert.equal(joined.toss.hostSide,joined.toss.coins.reduce((a,b)=>a+b,0)>=3?0:1);assert.equal((await call(db,path+'/action',host,{action:'offer-rematch',version:1})).status,409);let ended=(await call(db,path+'/action',host,{action:'resign',version:1})).data;assert.match(ended.state.result,new RegExp(ended.side===0?'後手':'先手'));let offer=(await call(db,path+'/action',host,{action:'offer-rematch',version:ended.version})).data;assert.equal((await call(db,path+'/action',host,{action:'accept-rematch',version:offer.version})).status,409);let fresh=(await call(db,path+'/action',guest,{action:'accept-rematch',version:offer.version})).data;assert.equal(fresh.round,2);assert.equal(fresh.state.ply,0);assert.equal(fresh.state.result,'');assert.deepEqual(fresh.logs,[]);const hostView=(await call(db,path,host)).data;assert.equal(hostView.side,1-fresh.side);assert.deepEqual(hostView.toss,fresh.toss);const first=fresh.side===0?guest:host;assert.equal((await call(db,path+'/action',first,{action:'move',version:fresh.version,move:{from:54,to:45,prom:false}})).status,200);}finally{db.close();}});
