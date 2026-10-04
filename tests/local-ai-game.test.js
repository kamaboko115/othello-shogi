import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalAIStore,localAIStorageKey,localAIStorageWarning} from '../dist/local-ai-game.js';
import {api} from '../worker/api.js';
import {localDB} from '../worker/local-db.js';
import {empty,moves,paradoxWeights} from '../dist/engine.js';

const token='a'.repeat(64),invite='b'.repeat(64);
const storage=()=>{const data=new Map();return {data,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
const firstMove=s=>[...s.board.flatMap((p,i)=>p?.side===s.turn?[i]:[]),...Object.keys(s.hands[s.turn])].flatMap(src=>moves(s,src))[0];
async function server(db,path='',body){const response=await api(new Request('https://test.local/api/rooms'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB:db});return {status:response.status,data:await response.json()};}
const comparable=d=>({state:d.state,settings:d.settings,logs:d.logs,side:d.side,seat:d.seat,joined:d.joined,version:d.version,round:d.round,offer:d.offer,undoOffer:d.undoOffer??null,rematch:d.rematch,helperUsedRound:d.helperUsedRound,canUndo:d.canUndo,toss:d.toss,closed:d.closed});

test('local match creation and every action match the existing server rules, for both human sides and all AI settings',async t=>{
 let coins=0;t.mock.method(crypto,'getRandomValues',bytes=>bytes.fill(bytes instanceof Uint32Array?1:coins));
 for(const humanSide of [0,1])for(const aiLevel of ['weak','normal','strong','expert','osesho']){
  coins=humanSide===0?1:0;
  const db=localDB(),disk=storage(),client=createLocalAIStore({storage:disk});
  try{
   const settings={aiLevel,thinkMs:5000,paradoxAt:2,moveLimit:300,noDrops:humanSide===1,helperUnlimited:aiLevel==='expert',handicap:'two',handicapSide:humanSide===0?'human':'ai',timeControl:{minutes:1,increment:10,byoyomi:20}};
   let local=client.create(settings),remote=(await server(db,'',{invite,kind:'ai',settings})).data;
   assert.deepEqual(comparable(local),comparable(remote));
   const action=async(name,move)=>{local=client.action(local.room,{action:name,move,version:local.version});const response=await server(db,'/'+remote.room+'/action',{action:name,move,version:remote.version});assert.equal(response.status,200,name);remote=response.data;assert.deepEqual(comparable(local),comparable(remote),name);};
   for(let i=0;i<6&&!local.state.result;i++)await action(local.state.turn===local.side?(i===local.side?'helper-move':'move'):'ai-move',firstMove(local.state));
   assert.equal(local.state.paradoxAt,aiLevel==='osesho'?200:2);if(aiLevel!=='osesho')assert.ok(local.logs.some(log=>log.includes('崩壊')||log.includes('降臨')));
   const resumed=createLocalAIStore({storage:disk}).read(local.room);assert.deepEqual(comparable(resumed),comparable(local));
   await action('offer-undo');await action('resign');await action('offer-rematch');
   assert.equal(local.round,2);assert.equal(local.canUndo,false);assert.equal(local.state.ply,0);
   if(local.state.turn!==local.side)await action('ai-move',firstMove(local.state));
   await action('helper-move',firstMove(local.state));await action('offer-draw');await action('decline-rematch');await action('leave');
   assert.equal(disk.getItem(localAIStorageKey(local.room)),null);assert.throws(()=>client.read(local.room),{status:404});
  }finally{db.close();}
 }
});

test('forced Osesho toss preserves the original coins and fixes the challenge to even material',()=>{
 for(const handicapSide of ['human','ai']){
  const client=createLocalAIStore({storage:storage(),random:bytes=>bytes.fill(1)}),d=client.create({aiLevel:'osesho',handicap:'two',handicapSide});
  assert.equal(d.side,1);assert.equal(d.toss.intervened,true);assert.deepEqual(d.toss.originalCoins,[1,1,1,1,1]);assert.deepEqual(d.toss.coins,[0,0,0,0,0]);
  const dropped=handicapSide==='human'?d.side:1-d.side;assert.equal(d.state.board.filter(p=>p?.side===dropped).length,20);assert.equal(d.state.board.filter(p=>p?.side===1-dropped).length,20);
 }
});

test('reject stale, wrong-turn and illegal moves without changing saved board or consuming the helper',()=>{
 const client=createLocalAIStore({storage:storage(),random:bytes=>bytes.fill(1)});let d=client.create({paradoxAt:false});
 const baseline=structuredClone(d);
 for(const body of [{action:'move',version:99,move:firstMove(d.state)},{action:'ai-move',version:0,move:firstMove(d.state)},{action:'helper-move',version:0,move:{from:54,to:0,prom:false}},{action:'move',version:0,move:{from:54,to:45,prom:'false'}},{action:'ai-no-moves',version:0}])assert.throws(()=>client.action(d.room,body));
 assert.deepEqual(comparable(client.read(d.room)),comparable(baseline));
 d=client.action(d.room,{action:'helper-move',version:d.version,move:firstMove(d.state)});
 d=client.action(d.room,{action:'offer-undo',version:d.version});assert.equal(d.state.ply,0);assert.equal(d.helperUsedRound,1);
 assert.throws(()=>client.action(d.room,{action:'helper-move',version:d.version,move:firstMove(d.state)}),{status:403});
});

test('unlimited helper works repeatedly and usage resets by round while ended matches reject ordinary moves',()=>{
 const client=createLocalAIStore({storage:storage(),random:bytes=>bytes.fill(1)});let d=client.create({helperUnlimited:true});
 for(let i=0;i<2;i++){d=client.action(d.room,{action:'helper-move',version:d.version,move:firstMove(d.state)});d=client.action(d.room,{action:'offer-undo',version:d.version});assert.equal(d.state.ply,0);}
 d=client.action(d.room,{action:'offer-draw',version:d.version});assert.throws(()=>client.action(d.room,{action:'move',version:d.version,move:{from:54,to:45,prom:false}}),{status:409});
 d=client.action(d.room,{action:'offer-rematch',version:d.version});d=client.action(d.room,{action:'helper-move',version:d.version,move:firstMove(d.state)});assert.equal(d.helperUsedRound,2);
});

test('seven-day expiry, validation and browser storage denial never fall back to a server',()=>{
 let now=1000;const disk=storage(),client=createLocalAIStore({storage:disk,now:()=>now});const d=client.create({});assert.equal(d.expires,1000+7*86400000);
 now=d.expires;assert.throws(()=>createLocalAIStore({storage:disk,now:()=>now}).read(d.room),{status:404});assert.equal(disk.getItem(localAIStorageKey(d.room)),null);
 for(const settings of [{paradoxAt:0},{paradoxAt:1001},{moveLimit:42},{timeControl:{minutes:-1}}])assert.throws(()=>client.create(settings));
 const denied=createLocalAIStore({storage:()=>{throw Error('disabled');},random:bytes=>bytes.fill(1)});let local=denied.create({});assert.equal(local.storageWarning,localAIStorageWarning);
 local=denied.action(local.room,{action:'move',version:local.version,move:firstMove(local.state)});assert.equal(denied.read(local.room).state.ply,1);
 local=denied.action(local.room,{action:'resign',version:local.version});assert.ok(local.state.result);local=denied.action(local.room,{action:'leave',version:local.version});assert.equal(local.closed,true);assert.throws(()=>denied.read(local.room),{status:404});
});

test('quota failure after a successful save retains the new position in memory rather than rereading the old snapshot',()=>{
 const disk=storage(),client=createLocalAIStore({storage:disk,random:bytes=>bytes.fill(1)});let d=client.create({});disk.setItem=()=>{throw Error('quota');};
 d=client.action(d.room,{action:'move',version:d.version,move:firstMove(d.state)});assert.equal(client.read(d.room).state.ply,1);assert.equal(d.storageWarning,localAIStorageWarning);
 d=client.action(d.room,{action:'resign',version:d.version});assert.equal(client.read(d.room).version,2);
});

test('legacy import preserves the position, settings, expiry, result and helper use; undo starts at the imported position',()=>{
 const client=createLocalAIStore({storage:storage(),random:bytes=>bytes.fill(1)});let d=client.create({});d=client.action(d.room,{action:'helper-move',version:d.version,move:firstMove(d.state)});
 const imported=createLocalAIStore({storage:storage()}).import({...d,local:undefined});assert.deepEqual(imported.state,d.state);assert.deepEqual(imported.logs,d.logs);assert.deepEqual(imported.settings,d.settings);assert.equal(imported.helperUsedRound,1);assert.equal(imported.expires,d.expires);assert.equal(imported.canUndo,false);assert.equal(imported.local,true);
 assert.throws(()=>client.import({...d,kind:'friend'}));
});

test('no-moves AI adjudication matches the server and normal moves remain impossible in that position',async()=>{
 const disk=storage(),client=createLocalAIStore({storage:disk,random:bytes=>bytes.fill(1)}),db=localDB();
 try{
  const remote=(await server(db,'',{invite,kind:'ai'})).data,row=await db.prepare('SELECT data FROM rooms WHERE id = ?').bind(remote.room).first(),data=JSON.parse(row.data);
  const s=empty();s.turn=1;s.board[76]={type:'K',side:0,prom:false};data.state=s;data.toss={coins:[1,1,1,1,1],hostSide:0};
  await db.prepare('UPDATE rooms SET data = ? WHERE id = ?').bind(JSON.stringify(data),remote.room).run();
  let local=client.import({...remote,state:s,toss:data.toss});local=client.action(local.room,{action:'ai-no-moves',version:local.version});const result=await server(db,'/'+remote.room+'/action',{action:'ai-no-moves',version:remote.version});assert.equal(result.status,200);assert.deepEqual(comparable(local),comparable(result.data));assert.match(local.state.result,/指せる手なし/);
 }finally{db.close();}
});

test('promotion, capture, simultaneous flips, drops, adjudication and random arrivals preserve server results and undo',async t=>{
 let eventRoll=0;t.mock.method(crypto,'getRandomValues',bytes=>bytes.fill(bytes instanceof Uint32Array?eventRoll:1));
 const piece=(type,side,prom=false)=>({type,side,prom});
 for(const scenario of ['promotion','capture-flip','drop-flip','judge','arrival','warp','flip','shuffle','invert','promote','supply','extra','annihilate','dragons','wings']){
  const db=localDB(),client=createLocalAIStore({storage:storage()});
  try{
   let remote=(await server(db,'',{invite,kind:'ai',settings:{moveLimit:false,paradoxAt:false}})).data;
   const row=await db.prepare('SELECT data FROM rooms WHERE id = ?').bind(remote.room).first(),data=JSON.parse(row.data),s=empty();s.moveLimit=false;s.paradoxAt=false;s.noDrops=false;s.board[76]=piece('K',0);s.board[4]=piece('K',1);
   let move;
   if(scenario==='promotion'){s.board[18]=piece('P',0);move={from:18,to:9,prom:true};}
   else if(scenario==='capture-flip'){s.board[49]=piece('R',0);s.board[40]=piece('B',1);s.board[39]=piece('P',1);s.board[38]=piece('G',0);move={from:49,to:40,prom:false};}
   else if(scenario==='drop-flip'){s.hands[0].G=1;s.board[39]=piece('P',1);s.board[38]=piece('G',0);move={drop:'G',to:40};}
   else if(scenario==='judge'){s.ply=59;s.moveLimit=60;s.board[54]=piece('P',0);move={from:54,to:45,prom:false};}
   else{s.ply=2;s.paradoxAt=1;s.board[54]=piece('P',0);move={from:54,to:45,prom:false};}
   eventRoll=0;for(const [kind,weight]of Object.entries(paradoxWeights)){if(kind===scenario)break;if(kind==='destroy'){eventRoll=0;break;}eventRoll+=weight;}
   data.state=s;data.toss={coins:[1,1,1,1,1],hostSide:0};data.takebacks=[];data.undoOffer=null;
   await db.prepare('UPDATE rooms SET data = ? WHERE id = ?').bind(JSON.stringify(data),remote.room).run();
   remote=(await server(db,'/'+remote.room)).data;let local=client.import(remote);
   local=client.action(local.room,{action:'move',move,version:local.version});remote=(await server(db,'/'+remote.room+'/action',{action:'move',move,version:remote.version})).data;assert.deepEqual(comparable(local),comparable(remote),scenario);
   if(scenario==='promotion')assert.equal(local.state.board[9].prom,true);
   if(scenario==='capture-flip'){assert.equal(local.state.hands[0].B,1);assert.deepEqual(local.state.flipped,[39]);}
   if(scenario==='drop-flip')assert.deepEqual(local.state.flipped,[39]);
   if(scenario==='judge')assert.match(local.state.result,/60手/);
   if(scenario==='arrival')assert.ok(local.state.spawned);
   if(['warp','flip','shuffle','invert','promote','supply','extra','annihilate','dragons','wings'].includes(scenario))assert.equal(local.state.paradoxEvent.kind,scenario);
   local=client.action(local.room,{action:'offer-undo',version:local.version});remote=(await server(db,'/'+remote.room+'/action',{action:'offer-undo',version:remote.version})).data;assert.deepEqual(comparable(local),comparable(remote));assert.deepEqual(local.state,s);
  }finally{db.close();}
 }
});
