import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {localDB} from '../worker/local-db.js';
const host='a'.repeat(64),guest='b'.repeat(64),invite='c'.repeat(64),outsider='d'.repeat(64);
async function call(db,path='',token=host,body){
 return api(new Request('http://test.local/api/rooms'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB:db});
}
test('unchanged authenticated reads have no body and carry version/server time; old clients retain full views',async()=>{
 const db=localDB();try{
  const room=await (await call(db,'',host,{invite})).json(),path='/'+room.room;
  const same=await call(db,path+'?version=0');assert.equal(same.status,304);assert.equal(await same.text(),'');assert.equal(same.headers.get('X-Room-Version'),'0');assert.ok(Number(same.headers.get('X-Room-Server-Now'))>=room.serverNow);assert.equal(same.headers.get('Cache-Control'),'no-store');
  assert.equal((await call(db,path+'?version=0',outsider)).status,403);
  assert.equal((await call(db,path+'?version=0','')).status,401);
  for(const query of ['', '?version=','?version=-1','?version=00','?version=0.0','?version=1','?version=9007199254740992']){const res=await call(db,path+query);assert.equal(res.status,200);assert.equal((await res.json()).version,0);}
  const joined=await (await call(db,path+'/join',guest,{invite})).json();
  const changed=await call(db,path+'?version=0');assert.equal(changed.status,200);assert.equal((await changed.json()).joined,true);
  assert.equal((await call(db,path+'?version='+joined.version)).status,304);
 }finally{db.close();}
});
test('moves, draw/undo offers, undo acceptance, rematch and closure invalidate versions',async()=>{
 const db=localDB();try{
  const room=await (await call(db,'',host,{invite})).json(),path='/'+room.room;
  let data=await (await call(db,path+'/join',guest,{invite})).json();
  const first=data.side===0?guest:host;
  async function change(token,action,extra={}){
   const old=data.version,response=await call(db,path+'/action',token,{action,version:old,...extra});assert.equal(response.status,200);data=await response.json();
   const changed=await call(db,path+'?version='+old);assert.equal(changed.status,200);assert.equal((await changed.json()).version,data.version);
   assert.equal((await call(db,path+'?version='+data.version)).status,304);
  }
  await change(first,'move',{move:{from:54,to:45,prom:false}});
  const hostView=await (await call(db,path)).json();assert.equal(hostView.canUndo,first===host);
  await change(host,'offer-draw');assert.equal(data.offer,0);
  await change(guest,'decline-draw');
  await change(first,'offer-undo');assert.ok(data.undoOffer);
  await change(first===host?guest:host,'accept-undo');assert.equal(data.state.ply,0);
  await change(host,'resign');assert.ok(data.state.result);
  await change(host,'offer-rematch');assert.equal(data.rematch,0);
  await change(guest,'accept-rematch');assert.equal(data.round,2);assert.equal(data.state.result,'');
  await change(host,'leave');assert.equal(data.closed,true);
  const final=await (await call(db,path+'?version='+(data.version-1),guest)).json();assert.equal(final.closed,true);assert.ok(final.state.result);
 }finally{db.close();}
});
test('matching version cannot hide a timed-out or expired room',async()=>{
 const db=localDB();try{
  const room=await (await call(db,'',host,{invite,settings:{timeControl:'turn30'}})).json(),path='/'+room.room;
  const joined=await (await call(db,path+'/join',guest,{invite})).json();
  const row=await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(room.room).first(),data=JSON.parse(row.data);data.clock.since=Date.now()-31000;
  await db.prepare('UPDATE rooms SET data = ? WHERE id = ?').bind(JSON.stringify(data),room.room).run();
  const timeout=await call(db,path+'?version='+joined.version);assert.equal(timeout.status,200);const ended=await timeout.json();assert.match(ended.state.result,/時間切れ/);assert.equal(ended.version,joined.version+1);
  await db.prepare('UPDATE rooms SET expires = ? WHERE id = ?').bind(Date.now()-1,room.room).run();
  assert.equal((await call(db,path+'?version='+ended.version)).status,404);
 }finally{db.close();}
});
