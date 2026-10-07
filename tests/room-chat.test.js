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
 const connect=token=>new WebSocket(origin.replace('http:','ws:')+'/api/rooms/'+room.room+'/chat?terms=2026-10-07',['ose-chat','auth.'+token],{origin});
 a=connect(host);b=connect(guest);await Promise.all([once(a,'open'),once(b,'open')]);
 const got=once(b,'message');a.send(JSON.stringify({type:'message',text:'<b>こんにちは</b>'}));
 assert.equal(JSON.parse((await got)[0]).text,'<b>こんにちは</b>');
 assert.deepEqual(await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(room.room).first(),before);
 b.close();await once(b,'close');c=connect(guest);await once(c,'open');let replayed=false;c.on('message',()=>{replayed=true;});
 await new Promise(r=>setTimeout(r,40));assert.equal(replayed,false);
 await call('/'+room.room+'/action',host,{action:'leave',version:before.version});
 const closed=once(c,'close');c.send(JSON.stringify({type:'message',text:'閉鎖後'}));await closed;
 }finally{a?.terminate();b?.terminate();c?.terminate();wss.close();await new Promise(r=>server.close(r));db.close();}
});
