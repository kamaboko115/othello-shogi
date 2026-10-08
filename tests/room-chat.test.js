import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import WebSocket from 'ws';
import {api} from '../worker/api.js';
import {localDB} from '../worker/local-db.js';
import {authorizeChat,chatMessage} from '../worker/chat.js';
import {attachLocalChat} from '../worker/local-chat.js';
const host='a'.repeat(64),guest='b'.repeat(64),invite='c'.repeat(64);
async function setup(db){
 const call=(path,token,body)=>api(new Request('http://test/api/rooms'+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)}),{DB:db});
 const room=await(await call('',host,{invite})).json();await call('/'+room.room+'/join',guest,{invite});return {room,call};
}
test('chat is restricted to authenticated friend participants with origin and terms',async()=>{
 const db=localDB();try{const {room}=await setup(db);
 const request=(token=host,origin='http://test',terms='2026-10-07')=>new Request('http://test/api/rooms/'+room.room+'/chat?terms='+terms,{headers:{Origin:origin,Upgrade:'websocket','Sec-WebSocket-Protocol':'ose-chat, auth.'+token}});
 assert.equal((await authorizeChat(request(),{DB:db})).seat,0);
 assert.equal((await authorizeChat(request(guest),{DB:db})).seat,1);
 assert.equal((await authorizeChat(request('d'.repeat(64)),{DB:db})).status,403);
 assert.equal((await authorizeChat(request(host,'https://evil.test'),{DB:db})).status,403);
 assert.equal((await authorizeChat(request(host,'http://test',''),{DB:db})).status,403);
 const receive=new URL(request().url);receive.search='?receive=1';
 const receiver=new Request(receive,{headers:request().headers});
 assert.equal((await authorizeChat(receiver,{DB:db})).canSend,false);
 assert.equal((await authorizeChat(request(),{DB:db})).canSend,true);
 const outsider=new Request(receive,{headers:request('d'.repeat(64)).headers});
 assert.equal((await authorizeChat(outsider,{DB:db})).status,403);
 }finally{db.close();}
});
test('chat length and cooldown are enforced before relay',()=>{
 assert.equal(chatMessage(JSON.stringify({type:'message',text:'あ'.repeat(121)}),5000),null);
 assert.equal(chatMessage(JSON.stringify({type:'message',text:'hello'}),5000,4000),null);
 assert.equal(chatMessage('bad',5000),null);
 assert.equal(chatMessage(JSON.stringify({type:'message',text:'\nこんにちは\u202e'}),5000).text,'こんにちは');
});
test('two peers relay without database writes or message replay and reject closed rooms',async()=>{
 const db=localDB(),server=http.createServer(),wss=attachLocalChat(server,db);let a,b,c;
 try{
 const {room,call}=await setup(db);const before=await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(room.room).first();
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const connect=(token,receive=false)=>new WebSocket(origin.replace('http:','ws:')+'/api/rooms/'+room.room+'/chat?'+(receive?'receive=1':'terms=2026-10-07'),['ose-chat','auth.'+token],{origin});
 a=connect(host);b=connect(guest,true);await Promise.all([once(a,'open'),once(b,'open')]);
 const got=once(b,'message');a.send(JSON.stringify({type:'message',text:'<b>こんにちは</b>'}));
 assert.equal(JSON.parse((await got)[0]).text,'<b>こんにちは</b>');
 assert.deepEqual(await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(room.room).first(),before);
 const rejected=once(b,'message');b.send(JSON.stringify({type:'message',text:'同意前の送信'}));
 assert.equal(JSON.parse((await rejected)[0]).type,'error');
 b.close();await once(b,'close');c=connect(guest);await once(c,'open');let replayed=false;c.on('message',()=>{replayed=true;});
 await new Promise(r=>setTimeout(r,40));assert.equal(replayed,false);
 await call('/'+room.room+'/action',host,{action:'leave',version:before.version});
 const closed=once(c,'close');c.send(JSON.stringify({type:'message',text:'閉鎖後'}));await closed;
 }finally{a?.terminate();b?.terminate();c?.terminate();wss.close();await new Promise(r=>server.close(r));db.close();}
});

test('chat upgrade survives API hardening and the IP limiter still applies first',async()=>{
 const db=localDB();try{
  const {room}=await setup(db);let forwarded=0,allowed=true;
  const env={DB:db,API_REQUEST_BURST:{limit:async()=>({success:allowed})},ROOM_CHAT:{idFromName:id=>id,get:id=>({fetch:async request=>{
   forwarded++;assert.equal(id,room.room);assert.equal(request.headers.get('X-Chat-Room'),room.room);assert.equal(request.headers.get('X-Chat-Seat'),'0');assert.equal(request.headers.get('X-Chat-Can-Send'),forwarded===1?'true':'false');assert.equal(request.headers.get('Sec-WebSocket-Protocol'),null);return new Response('upgrade reached');
  }})}};
  const request=()=>new Request('http://test/api/rooms/'+room.room+'/chat?terms=2026-10-07',{headers:{Origin:'http://test',Upgrade:'websocket','Sec-WebSocket-Protocol':'ose-chat, auth.'+host}});
  assert.equal((await api(request(),env)).status,200);assert.equal(forwarded,1);
  const receive=new Request(request().url.replace('terms=2026-10-07','receive=1'),{headers:request().headers});
  receive.headers.set('X-Chat-Can-Send','true');
  assert.equal((await api(receive,env)).status,200);assert.equal(forwarded,2);
  allowed=false;assert.equal((await api(request(),env)).status,429);assert.equal(forwarded,2);
 }finally{db.close();}
});
