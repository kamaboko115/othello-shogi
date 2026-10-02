import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,empty,moves,play,collapseAfterMove} from '../dist/engine.js';
import {packReplayState,unpackReplayState,rememberReplay,appendReplay,validateReplay} from '../dist/replay-code.js';
import {encodeReplayLink,decodeReplayLink} from '../dist/replay-view.js';
import {createLocalAIStore} from '../dist/local-ai-game.js';
import {api} from '../worker/api.js';
import {localDB} from '../worker/local-db.js';

const firstMove=s=>s.board.flatMap((p,i)=>p?.side===s.turn?moves(s,i):[])[0];
const disk=()=>{const values=new Map();return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};};
test('compact snapshots preserve drops, promotion, flips and the actual random collapse result',()=>{
 const data={state:initial(),logs:[]};rememberReplay(data);
 const s=empty();s.paradoxAt=1;s.moveLimit=false;s.board[76]={type:'K',side:0,prom:false};s.board[8]={type:'K',side:1,prom:false};s.board[58]={type:'R',side:0,prom:false};s.board[30]={type:'S',side:1,prom:false};s.hands[0].G=2;
 const promoted=play(s,{from:58,to:13,prom:true});collapseAfterMove(promoted,()=>0);
 for(const state of [s,promoted,collapseAfterMove(play({...s,ply:5},{drop:'G',to:40}),()=>0,()=>true)]){
  const packed=packReplayState(state);assert.deepEqual(packReplayState(unpackReplayState(packed)),packed);
  data.state=state;appendReplay(data);assert.deepEqual(data.replay.at(-1),packed);
 }
});
test('local AI replay persists, removes discarded moves after undo and resets on rematch',()=>{
 const storage=disk(),store=createLocalAIStore({storage,random:bytes=>bytes.fill(1)});let d=store.create({paradoxAt:false,moveLimit:false});
 for(let i=0;i<8;i++)d=store.action(d.room,{action:d.state.turn===d.side?'move':'ai-move',version:d.version,move:firstMove(d.state)});
 assert.equal(d.replay,undefined);assert.equal(store.replay(d.room).frames.length,9);
 assert.deepEqual(createLocalAIStore({storage}).replay(d.room),store.replay(d.room));
 d=store.action(d.room,{action:'offer-undo',version:d.version});assert.equal(store.replay(d.room).frames.at(-1).p,d.state.ply);assert.equal(store.replay(d.room).frames.length,d.state.ply+1);
 d=store.action(d.room,{action:'resign',version:d.version});assert.equal(store.replay(d.room).result,d.state.result);
 d=store.action(d.room,{action:'offer-rematch',version:d.version});assert.equal(store.replay(d.room).frames.length,1);assert.equal(store.replay(d.room).result,'');
});
test('friend replay is authorized and fetched on demand; normal responses never include the history',async()=>{
 const db=localDB(),host='a'.repeat(64),guest='b'.repeat(64),invite='c'.repeat(64);
 const call=async(path,token,body)=>{const res=await api(new Request('https://test.local/api/rooms'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB:db});return {status:res.status,data:await res.json()};};
 try{
  let d=(await call('',host,{invite,settings:{paradoxAt:false,moveLimit:false}})).data;
  d=(await call('/'+d.room+'/join',guest,{invite})).data;const guestSide=d.side;
  assert.equal((await call('/'+d.room+'/replay',host)).status,409);
  for(let i=0;i<4;i++){
   const token=d.state.turn===guestSide?guest:host;
   d=(await call('/'+d.room+'/action',token,{action:'move',version:d.version,move:firstMove(d.state)})).data;assert.equal(d.replay,undefined);
  }
  d=(await call('/'+d.room+'/action',host,{action:'resign',version:d.version})).data;
  const replay=await call('/'+d.room+'/replay',guest);assert.equal(replay.status,200);assert.equal(replay.data.frames.length,5);assert.deepEqual(replay.data.logs,d.logs);assert.equal(replay.data.result,d.state.result);
  assert.equal((await call('/'+d.room+'/replay','f'.repeat(64))).status,403);
 }finally{db.close();}
});
test('shared replay round trips without room credentials, rejects malformed or oversized data',async()=>{
 const data={v:1,frames:[packReplayState(initial())],logs:[],result:'先手の勝ち（投了）',rules:{noDrops:false,moveLimit:false}};
 const url=await encodeReplayLink(data,'https://test.local/?invite=secret#ai=private');assert.ok(url.length<2000);assert.ok(!url.includes('secret'));assert.ok(!url.includes('private'));
 assert.deepEqual(await decodeReplayLink(new URLSearchParams(new URL(url).hash.slice(1)).get('replay')),data);
 assert.throws(()=>validateReplay({...data,frames:[{...data.frames[0],b:'<script>'}]}));
 assert.throws(()=>validateReplay({...data,frames:[data.frames[0],data.frames[0]]}));
 await assert.rejects(decodeReplayLink('z'+'a'.repeat(64001)));
 const bad={...data,frames:[{...data.frames[0],h:[[82,0,0,0,0,0,0],[0,0,0,0,0,0,0]]}]};assert.throws(()=>validateReplay(bad));
});
