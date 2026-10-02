import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {moves} from '../dist/engine.js';

// Explicit manual check only. Never schedule room creation or print room tokens.
const origin=new URL(process.env.SITE_URL||'https://oshogi-games.pages.dev').origin;
const token=()=>randomBytes(32).toString('hex');
const host=token(),guest=token(),invite=token();
let room=null,snapshot=null;
async function call(path,auth,body,expected=200){
 const response=await fetch(origin+'/api/rooms'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+auth,...(body?{'Content-Type':'application/json',Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,expected,`API ${body?.action||body?.kind||'read'}: HTTP ${response.status} (expected ${expected})`);
 return response.status===304?null:response.json();
}
try{
 const page=await fetch(origin+'/',{signal:AbortSignal.timeout(15000)});
 assert.equal(page.status,200);assert.match(page.headers.get('Content-Security-Policy')||'',/frame-ancestors 'none'/);
 assert.match(await page.text(),/遊べるチュートリアル/);
 console.log('PASS: home and security headers');
 snapshot=await call('',host,{kind:'friend',invite,settings:{timeControl:'none',paradoxAt:false,moveLimit:false,noDrops:false}},201);room=snapshot.room;
 assert.match(room,/^[a-f0-9]{32}$/);assert.equal(snapshot.kind,'friend');
 console.log('PASS: friend room creation (D1 schema and burst binding)');
 await call('/'+room+'/preview',guest,{invite});
 snapshot=await call('/'+room+'/join',guest,{invite});
 assert.equal(snapshot.joined,true);
 await call('/'+room,token(),undefined,403);
 await call('/'+room+'?version='+snapshot.version,host,undefined,304);
 console.log('PASS: invitation, join, authorization and 304 polling');
 const hostSide=snapshot.toss.hostSide;
 const mover=snapshot.state.turn===hostSide?host:guest,other=mover===host?guest:host;
 const move=snapshot.state.board.flatMap((p,i)=>p?.side===snapshot.state.turn?moves(snapshot.state,i):[])[0];
 assert.ok(move);
 snapshot=await call('/'+room+'/action',mover,{action:'move',version:snapshot.version,move});
 assert.equal(snapshot.state.ply,1);
 snapshot=await call('/'+room,other);assert.equal(snapshot.state.ply,1);
 snapshot=await call('/'+room+'/action',mover,{action:'offer-undo',version:snapshot.version});
 snapshot=await call('/'+room+'/action',other,{action:'accept-undo',version:snapshot.version});assert.equal(snapshot.state.ply,0);
 console.log('PASS: move synchronization and agreed undo');
 snapshot=await call('/'+room+'/action',host,{action:'resign',version:snapshot.version});assert.match(snapshot.state.result,/投了/);
 snapshot=await call('/'+room+'/action',host,{action:'offer-rematch',version:snapshot.version});
 snapshot=await call('/'+room+'/action',guest,{action:'accept-rematch',version:snapshot.version});
 assert.equal(snapshot.round,2);assert.equal(snapshot.state.result,'');
 console.log('PASS: resignation and rematch');
 snapshot=await call('/'+room+'/action',host,{action:'leave',version:snapshot.version});assert.equal(snapshot.closed,true);
 const final=await call('/'+room,guest);assert.equal(final.closed,true);assert.match(final.state.result,/投了/);
 console.log('PASS: leave resigns and delivers the final result');
}finally{
 // Only close the room created above, never a user room. A grace period expires normally.
 if(room&&!snapshot?.closed){
  try{const current=await call('/'+room,host);await call('/'+room+'/action',host,{action:'leave',version:current.version});console.log('Test room closed');}catch{console.error('Cleanup could not complete; the test room expires automatically.');}
 }
}
