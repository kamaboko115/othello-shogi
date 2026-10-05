import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {initial,empty,play,moves,applyParadoxEvent,beforeParadox,collapseAfterMove,MAX_GAME_PLIES} from '../dist/engine.js';
import {packReplayState,unpackReplayState,validateReplay} from '../dist/replay-code.js';
import {encodeReplayLink,decodeReplayLink} from '../dist/replay-view.js';
import {packMatchData,unpackMatchData,serializeMatchData,parseMatchData} from '../dist/match-storage.js';
import {createLocalAIStore,localAIStorageKey} from '../dist/local-ai-game.js';
import {api} from '../worker/api.js';
import {localDB} from '../worker/local-db.js';

const disk=()=>{const values=new Map();return {values,getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
const king=side=>({type:'K',side,prom:false});
function quietState(){const s=empty();s.board[76]=king(0);s.board[4]=king(1);s.paradoxAt=false;s.moveLimit=false;return s;}
function quietMove(s){const from=s.board.findIndex(p=>p?.side===s.turn);return {from,to:from===(s.turn?4:76)?from-1:from+1,prom:false};}
const firstMove=s=>s.board.flatMap((p,i)=>p?.side===s.turn?moves(s,i):[])[0];
const hands=s=>s.hands.map(h=>Object.fromEntries('PLNSGBR'.split('').map(t=>[t,h[t]||0])));

test('999 legal plies save/reload/replay/undo, then the 1000th move draws',t=>{
 const storage=disk(),store=createLocalAIStore({storage,random:a=>a.fill(1)});let v=store.create({paradoxAt:false});v.state=quietState();v=store.import(v);
 const move=()=>{v=store.action(v.room,{action:v.state.turn===v.side?'move':'ai-move',version:v.version,move:quietMove(v.state)});};
 for(let i=0;i<999;i++)move();
 assert.equal(v.state.ply,999);assert.equal(v.state.result,'');
 const saved=storage.getItem(localAIStorageKey(v.room)),bytes=Buffer.byteLength(saved);
 t.diagnostic(`999 legal plies: ${bytes} stored bytes`);
 assert.ok(bytes<600000,`999-ply save is ${bytes} bytes`);
 const encoded=JSON.parse(saved).data;assert.equal(encoded.takebacks.length,128);assert.ok(encoded.takebacks.every(t=>!('logs' in t)&&Number.isInteger(t.logLength)&&typeof t.state.board==='string'));
 const replay=validateReplay(store.replay(v.room));assert.equal(replay.frames.length,1000);
 for(const frame of replay.frames){const s=unpackReplayState(frame);assert.equal(s.board.filter(Boolean).length,2);assert.equal(s.turn,s.ply%2);}
 const resumed=createLocalAIStore({storage});assert.deepEqual(resumed.read(v.room).state,v.state);
 v=resumed.action(v.room,{action:'offer-undo',version:v.version});assert.equal(v.state.ply,998);assert.equal(v.logs.length,998);assert.equal(resumed.replay(v.room).frames.length,999);
 move();move();assert.equal(v.state.ply,MAX_GAME_PLIES);assert.equal(v.state.result,'引き分け（1000手到達）');
 assert.equal(store.replay(v.room).frames.length,1001);validateReplay(store.replay(v.room));
 assert.throws(()=>store.action(v.room,{action:'move',version:v.version,move:quietMove(v.state)}),{status:409});
});

test('1000th-move wins take precedence, including random king destruction and wing revival',()=>{
 let s=quietState();s.ply=998;assert.equal(collapseAfterMove(play(s,quietMove(s))).result,'');
 s.ply=999;s.board[76]=null;s.board[13]=king(0);assert.match(collapseAfterMove(play(s,{from:13,to:4,prom:false})).result,/先手の勝ち/);
 s=quietState();s.ply=999;s.paradoxAt=1;const next=collapseAfterMove(play(s,quietMove(s)),()=>0);assert.match(next.result,/先手の勝ち.*王が崩壊/);
 s.board[4].wings=true;const revived=collapseAfterMove(play(s,quietMove(s)),()=>0);assert.equal(revived.result,'引き分け（1000手到達）');assert.equal(revived.paradoxEvent.kind,'rebirth');
});

const eventStates=()=>{
 const states=[];
 for(const kind of ['invert','shuffle','extra','annihilate','dragons','charisma','summon','wings','warp','flip','promote','supply','thunder','wind','windRows']){
  const s=initial();s.moveLimit=false;s.paradoxAt=false;s.ply=201;s.turn=1;const before=structuredClone(s);applyParadoxEvent(s,kind,n=>Math.floor(n/3));
  assert.deepEqual(beforeParadox(s).board,before.board,kind);states.push([kind,s]);
 }
 const s=quietState();s.board[4].wings=true;s.board[13]={type:'R',side:0,prom:false};s.ply=200;states.push(['rebirth',play(s,{from:13,to:4,prom:true})]);
 const destroyed=quietState();destroyed.ply=201;destroyed.paradoxAt=1;destroyed.board[9]={type:'P',side:0,prom:false};states.push(['destroy',collapseAfterMove(destroyed,()=>1)]);
 const arrival=quietState();arrival.ply=201;arrival.paradoxAt=1;states.push(['arrival',collapseAfterMove(arrival,()=>0,()=>true)]);
 return states;
};

test('all collapse events retain exact replay and undo state through old and compact saves',()=>{
 for(const [kind,s] of eventStates())for(const compact of [false,true]){
  const storage=disk(),store=createLocalAIStore({storage,random:a=>a.fill(1)}),view=store.create({paradoxAt:false}),key=localAIStorageKey(view.room),record=JSON.parse(storage.getItem(key));
  const next=play(s,firstMove(s));record.data={...unpackMatchData(record.data),state:next,toss:{hostSide:s.turn,coins:[1,1,1,1,1]},logs:['first','second'],takebacks:[{state:structuredClone(s),logs:['first']}],replay:[packReplayState(s),packReplayState(next)]};
  const expected=structuredClone(record.data);
  if(compact)record.data=packMatchData(record.data);
  storage.setItem(key,JSON.stringify(record));
  const reloaded=store.read(view.room);assert.deepEqual(reloaded.state,next,kind);
  const replay=validateReplay(store.replay(view.room));
  assert.deepEqual(replay.frames,expected.replay,kind);
  const replayed=unpackReplayState(replay.frames[0]);assert.deepEqual(replayed.board,s.board,kind);assert.deepEqual(hands(replayed),hands(s),kind);assert.deepEqual(replayed.paradoxEvent,s.paradoxEvent,kind);
  const undo=store.action(view.room,{action:'offer-undo',version:reloaded.version});assert.deepEqual(undo.state,s,kind);assert.deepEqual(undo.logs,['first']);
  assert.deepEqual(store.replay(view.room).frames,[packReplayState(s)],kind);
  assert.deepEqual(createLocalAIStore({storage}).read(view.room).state,s,kind);
 }
});

test('event-heavy 999-ply history stays well below the 2 MB D1 row limit and shares its replay',async t=>{
 const states=eventStates(),data={state:quietState(),logs:[],takebacks:[],replay:[]};
 // A deliberately pessimistic history repeats a full-board removal every ply.
 const dense=initial();dense.board=dense.board.map((p,i)=>i===4?king(1):i===76?king(0):{type:'R',side:1,prom:true});dense.turn=1;dense.ply=1;applyParadoxEvent(dense,'annihilate',()=>0);
 for(let ply=0;ply<=999;ply++){
  const s=structuredClone(ply%2?dense:states[ply%states.length][1]);s.ply=ply;
  // Give early stress frames a valid reserve bound as well.
  if(ply===0)s.hands=[{},{}];
  data.state=s;data.replay.push(packReplayState(s));if(ply)data.logs.push(`${ply}. ▲５六 歩 ／ オセショ様の禁断の槍がすべてを焦がす`);
  data.takebacks.push({state:structuredClone(s),logs:[...data.logs]});if(data.takebacks.length>128)data.takebacks.shift();
 }
 const legacyBytes=Buffer.byteLength(JSON.stringify(data)),encoded=serializeMatchData(data),bytes=Buffer.byteLength(encoded),restored=parseMatchData(encoded);
 t.diagnostic(`999 event-heavy plies: ${legacyBytes} legacy bytes -> ${bytes} compact bytes; public replay ${Buffer.byteLength(JSON.stringify(data.replay))} bytes`);
 assert.ok(bytes<1300000,`compact=${bytes}, legacy=${legacyBytes}`);assert.ok(bytes<legacyBytes/5);
 assert.deepEqual(restored.replay,data.replay);assert.deepEqual(restored.state,data.state);
 assert.deepEqual(restored.takebacks.map(t=>t.state),data.takebacks.map(t=>t.state));
 assert.deepEqual(restored.takebacks.map(t=>t.logLength),data.takebacks.map(t=>t.logs.length));
 // The URL retains its independent 64 KB browser bound. This compressible but
 // >2 MB v1 record isolates the decompressed-data limit from the URL limit.
 const record={v:1,frames:Array.from({length:1000},(_,p)=>packReplayState({...dense,ply:p})),logs:Array(999).fill('move'),result:'引き分け（1000手到達）',rules:{noDrops:false,moveLimit:false}};
 assert.ok(Buffer.byteLength(JSON.stringify(record))>2*1024*1024);
 const link=await encodeReplayLink(record,'https://test.local/');
 assert.deepEqual(await decodeReplayLink(new URL(link).hash.slice('#replay='.length)),record);
});

test('friend API persists the 999/1000 boundary and allows agreed undo from a draw',async()=>{
 const db=localDB(),host='a'.repeat(64),guest='b'.repeat(64),invite='c'.repeat(64);
 const call=async(path,token,body)=>{const r=await api(new Request('https://test.local/api/rooms'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB:db});assert.equal(r.status,200);return r.json();};
 try{
  const create=await api(new Request('https://test.local/api/rooms',{method:'POST',headers:{Authorization:'Bearer '+host,'Content-Type':'application/json'},body:JSON.stringify({invite,settings:{paradoxAt:false}})}),{DB:db});let v=await create.json();const path='/'+v.room;v=await call(path+'/join',guest,{invite});
  const row=await db.prepare('SELECT data FROM rooms WHERE id = ?').bind(v.room).first(),data=parseMatchData(row.data);data.state=quietState();data.state.ply=998;data.logs=Array(998).fill('move');data.replay=[packReplayState(data.state)];
  await db.prepare('UPDATE rooms SET data = ? WHERE id = ?').bind(serializeMatchData(data),v.room).run();
  const first=data.toss.hostSide===0?host:guest,second=first===host?guest:host;
  v=await call(path+'/action',first,{action:'move',version:v.version,move:quietMove(data.state)});assert.equal(v.state.ply,999);assert.equal(v.state.result,'');
  v=await call(path+'/action',second,{action:'move',version:v.version,move:quietMove(v.state)});assert.equal(v.state.result,'引き分け（1000手到達）');
  const replay=validateReplay(await call(path+'/replay',host));assert.deepEqual(replay.frames.map(f=>f.p),[998,999,1000]);
  v=await call(path+'/action',first,{action:'offer-undo',version:v.version});v=await call(path+'/action',second,{action:'accept-undo',version:v.version});assert.equal(v.state.ply,998);assert.equal(v.state.result,'');assert.equal(v.logs.length,998);
 }finally{db.close();}
});

test('shared replay decompression still rejects a small gzip that expands past 8 MB',async()=>{
 const value='z'+gzipSync(Buffer.alloc(8*1024*1024+1,32)).toString('base64url');
 assert.ok(value.length<64000);
 await assert.rejects(decodeReplayLink(value),/棋譜データが大きすぎます/);
});
