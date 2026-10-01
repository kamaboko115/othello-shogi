import test from 'node:test';
import assert from 'node:assert/strict';
import {api,cleanupRooms,roomCloseGraceMs} from '../worker/api.js';
import {localDB} from '../worker/local-db.js';
const host='a'.repeat(64),guest='b'.repeat(64),invite='c'.repeat(64);
async function call(db,path,token=host,body){
 const response=await api(new Request('http://test.local/api/rooms'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:'http://test.local'},body:body?JSON.stringify(body):undefined}),{DB:db});
 return {status:response.status,data:await response.json()};
}
test('AI離脱は投了結果を返した後にDBから即削除する',async()=>{
 const db=localDB();try{
  const r=(await call(db,'',host,{invite,kind:'ai'})).data;
  const left=await call(db,'/'+r.room+'/action',host,{action:'leave',version:r.version});
  assert.equal(left.status,200);assert.equal(left.data.closed,true);assert.match(left.data.state.result,/投了/);
  assert.equal(await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(r.room).first(),null);
  assert.equal((await call(db,'/'+r.room)).status,404);
 }finally{db.close();}
});
test('友人離脱は1分だけ結果を届け、再試合を拒否し定期削除する',async()=>{
 const db=localDB();try{
  const r=(await call(db,'',host,{invite})).data;
  const joined=(await call(db,'/'+r.room+'/join',guest,{invite})).data;
  const before=Date.now(),left=await call(db,'/'+r.room+'/action',host,{action:'leave',version:joined.version});
  assert.equal(left.status,200);assert.match(left.data.state.result,/投了/);
  assert(left.data.expires>=before+roomCloseGraceMs&&left.data.expires<=Date.now()+roomCloseGraceMs);
  const received=await call(db,'/'+r.room,guest);assert.equal(received.status,200);assert.equal(received.data.closed,true);assert.equal(received.data.state.result,left.data.state.result);
  assert.equal((await call(db,'/'+r.room+'/action',guest,{action:'offer-rematch',version:received.data.version})).status,410);
  await cleanupRooms({DB:db},left.data.expires-1);assert(await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(r.room).first());
  await cleanupRooms({DB:db},left.data.expires);assert.equal(await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(r.room).first(),null);
 }finally{db.close();}
});
test('終了済み離脱は勝敗を変えず、参加待ちはすぐ削除する',async()=>{
 const db=localDB();try{
  const waiting=(await call(db,'',host,{invite})).data;
  assert.equal((await call(db,'/'+waiting.room+'/action',host,{action:'leave',version:waiting.version})).status,200);
  assert.equal((await call(db,'/'+waiting.room)).status,404);
  const r=(await call(db,'',host,{invite,kind:'ai'})).data;
  const resigned=(await call(db,'/'+r.room+'/action',host,{action:'resign',version:r.version})).data;
  const left=(await call(db,'/'+r.room+'/action',host,{action:'leave',version:resigned.version})).data;
  assert.equal(left.state.result,resigned.state.result);
 }finally{db.close();}
});
test('古い版の離脱や第三者の削除を拒否し、期限切れGETでも消去する',async()=>{
 const db=localDB();try{
  const r=(await call(db,'',host,{invite,kind:'ai'})).data;
  assert.equal((await call(db,'/'+r.room+'/action','d'.repeat(64),{action:'leave',version:r.version})).status,403);
  assert.equal((await call(db,'/'+r.room+'/action',host,{action:'leave',version:r.version-1})).status,409);
  await db.prepare('UPDATE rooms SET expires = ? WHERE id = ?').bind(Date.now()-1,r.room).run();
  assert.equal((await call(db,'/'+r.room)).status,404);assert.equal(await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(r.room).first(),null);
 }finally{db.close();}
});
test('離脱時に時間切れなら時間切れの決着を保存して閉じる',async()=>{
 const db=localDB();try{
  const r=(await call(db,'',host,{invite,settings:{timeControl:{minutes:1,increment:0,byoyomi:0}}})).data;
  const joined=(await call(db,'/'+r.room+'/join',guest,{invite})).data;
  const row=await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(r.room).first(),data=JSON.parse(row.data);
  data.clock.remaining[data.state.turn]=0;data.clock.since=Date.now()-10;
  await db.prepare('UPDATE rooms SET data = ? WHERE id = ?').bind(JSON.stringify(data),r.room).run();
  const left=await call(db,'/'+r.room+'/action',host,{action:'leave',version:joined.version});
  assert.equal(left.status,200);assert.equal(left.data.closed,true);assert.match(left.data.state.result,/時間切れ/);
 }finally{db.close();}
});
