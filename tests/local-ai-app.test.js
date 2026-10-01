import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createLocalAIStore} from '../dist/local-ai-game.js';
import {createRoomTransport,createRoomPoller} from '../dist/room-network.js';
import {clockBudget} from '../dist/match-options.js';
import {moves,initial} from '../dist/engine.js';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const section=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const requesting=section('async function request(','function adopt(');
const sending=section('async function sendAction(','function enter(');
const entering=section('function enter(','for(const [value,name]');
const creating=section("$('createRoom').onclick=", "$('joinRoom').onclick=");
const restoring=section('async function restore()','if(matchMedia(');
const polling=section('const roomPoller=createRoomPoller(','async function sendAction(');
const diagnostics=section('function paintNetworkUsage()','let autoHelperAttempt=');
const thinking=section('function syncAI()','let lastTossKey=');
const helping=section('async function useHelper()',"$('helperAd').onclick=");
const firstMove=s=>[...s.board.flatMap((p,i)=>p?.side===s.turn?[i]:[]),...Object.keys(s.hands[s.turn])].flatMap(src=>moves(s,src))[0];

function client(){
 const saved=new Map(),elements={},calls=[],hashes=[],timers=[];
 const disk={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const context={localAI:createLocalAIStore({storage:disk,random:bytes=>bytes.fill(1)}),online:null,state:initial(),logs:[],stack:[],legal:[],busy:false,connected:true,message:'',selectedKind:'ai',helperJob:null,helperIdeaTimer:null,aiJob:null,aiTiming:null,helperLingering:false,helperIdea:false,comboActive:false,comboPreparing:false,effectsActive:false,collapseEffect:null,pollTimer:null,routeVersion:0,
  $:id=>elements[id]??=(id==='furigoma'?{hidden:true}:id==='paradoxAt'?{reportValidity:()=>true}:{close(){}}),
  selectedSettings:()=>({aiLevel:'expert',thinkMs:5000,paradoxAt:false,moveLimit:300,helperUnlimited:true}),
  fetch:async(...args)=>{calls.push(args);return Response.json({room:'f'.repeat(32),kind:'friend',version:0});},AbortSignal,JSON,Date,URLSearchParams,Error,initial,
  storage:{get:k=>{const value=saved.get(k);return value?JSON.parse(value):null;},set:(k,v)=>saved.set(k,JSON.stringify(v))},localStorage:disk,
  history:{replaceState:(state,title,url)=>{hashes.push(url);context.location.hash=url.includes('#')?url.slice(url.indexOf('#')):'';}},location:{pathname:'/game',hash:''},
  render(){},cancelCombo(){},cancelCollapse(){},stopAI(){context.aiJob=null;},clearSession(){context.online=null;context.connected=true;},start(s){context.state=s;},
  clearTimeout(){},setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},interruptMoveEffects(){},syncAutoHelper(){},side:n=>n?'後手':'先手',document:{hidden:false},clockBudget,clockOffset:0,
  window:{confirm:()=>true},homeMessage:'home',freshToken:()=> 'a'.repeat(64),
  adopt(d){context.online={...context.online,...d};context.state=d.state;context.logs=d.logs;},helperAvailable:()=>true,playHelperDeparture(){},
  startAI(s,level,thinkMs){calls.push({search:{level,thinkMs}});return {promise:Promise.resolve({move:firstMove(s),elapsedMs:10}),cancel(){}};}
 };
 // Resolve fetch dynamically so tests can deny network access after creating
 // the transport. Its real counters must observe any accidental room request.
 context.transport=createRoomTransport({fetchImpl:(...args)=>context.fetch(...args)});
 context.createRoomPoller=options=>createRoomPoller({...options,setTimer:(fn,ms)=>context.setTimeout(fn,ms),clearTimer:id=>context.clearTimeout(id),random:()=>.5});
 context.clearSession=()=>{context.stopPolling();context.online=null;context.connected=true;};
 vm.createContext(context);vm.runInContext(diagnostics+requesting+sending+entering+creating+restoring+polling+thinking+helping+'\nfunction stopPolling(){roomPoller.stop();}',context);
 return {context,calls,hashes,saved,elements,timers};
}

test('AI creation, human and AI moves, helper, undo, results, rematch and leave work offline with zero measured API requests',async()=>{
 const {context:c,calls,elements,hashes,timers}=client();
 c.fetch=async(...args)=>{calls.push(args);throw new TypeError('Failed to fetch: offline');};
 await elements.createRoom.onclick();assert.equal(c.online.local,true);assert.match(hashes.at(-1),/^\/game#ai=[a-f0-9]{32}$/);assert.equal(timers.length,0);
 await c.sendAction('move',firstMove(c.state));assert.equal(c.state.ply,1);
 c.syncAI();await new Promise(resolve=>setImmediate(resolve));assert.equal(c.state.ply,2);assert.deepEqual(calls,[{search:{level:'expert',thinkMs:5000}}]);
 await c.useHelper();assert.equal(c.state.ply,3);assert.equal(c.online.helperUsedRound,1);assert.deepEqual(calls.at(-1),{search:{level:'osesho',thinkMs:5000}});
 await c.sendAction('offer-undo');assert.equal(c.state.ply,2);
 await c.sendAction('offer-draw');assert.equal(c.state.result,'合意による引き分け');
 await c.sendAction('offer-rematch');assert.equal(c.state.ply,0);assert.equal(c.online.round,2);
 await c.sendAction('resign');const ended=await c.sendAction('leave');assert.equal(ended.closed,true);
 assert.equal(calls.filter(Array.isArray).length,0);
 assert.deepEqual(c.transport.getStats(),{requests:0,reads:0,writes:0,unchanged:0,errors:0,aborted:0,responseBytes:0});
 assert.match(elements.networkUsage.textContent,/API通信: 0回/);
});

test('reloading #ai restores the browser snapshot without GET, while friend actions still call the API',async()=>{
 const {context:c,calls,elements,hashes,saved}=client();await elements.createRoom.onclick();await c.sendAction('move',firstMove(c.state));const id=c.online.room;
 c.localAI=createLocalAIStore({storage:c.localStorage});await c.restore();assert.equal(c.online.room,id);assert.equal(c.state.ply,1);assert.equal(c.online.settings.aiLevel,'expert');assert.equal(calls.length,0);
 assert.equal(c.transport.getStats().requests,0);
 c.online={room:'f'.repeat(32),kind:'friend',version:0,token:'friend-token'};await c.request('/'+c.online.room+'/action',c.online.token,{action:'resign',version:0});assert.equal(calls.length,1);assert.match(calls[0][0],/^\/api\/rooms\/[a-f0-9]{32}\/action$/);assert.equal(calls[0][1].headers.Authorization,'Bearer friend-token');assert.equal(calls[0][1].method,'POST');
 assert.ok(saved.size);assert.match(hashes.at(-1),/#ai=/);
 assert.equal(c.transport.getStats().requests,1);assert.equal(c.transport.getStats().writes,1);assert.ok(c.transport.getStats().responseBytes>0);
});

test('one legacy AI GET imports a room and subsequent moves and restore use only the browser snapshot',async()=>{
 const {context:c,calls,saved}=client();const legacy={...c.localAI.create({aiLevel:'normal',paradoxAt:false}),local:undefined},id=legacy.room;
 c.localAI=createLocalAIStore({storage:c.localStorage});saved.delete('hanten-local-ai-v1-'+id);saved.set('hanten-room-'+id,JSON.stringify({token:'legacy-token'}));c.location.hash='#room='+id;
 c.fetch=async(url)=>{calls.push(url);return Response.json(legacy);};
 await c.restore();assert.equal(c.online.local,true);assert.match(c.location.hash,/#ai=/);assert.deepEqual(calls,['/api/rooms/'+id]);
 assert.equal(c.transport.getStats().requests,1);assert.equal(c.transport.getStats().reads,1);
 c.fetch=async(url)=>{calls.push(url);throw new TypeError('Failed to fetch: offline');};
 await c.sendAction('move',firstMove(c.state));assert.equal(c.transport.getStats().requests,1);await c.restore();assert.equal(c.state.ply,1);assert.equal(calls.length,1);assert.equal(c.transport.getStats().requests,0);
 c.location.hash='#room='+id;await c.restore();assert.equal(c.state.ply,1);assert.equal(calls.length,1);assert.match(c.location.hash,/#ai=/);
});

test('AI matches remain playable with a visible warning when browser persistence is disabled',async()=>{
 const {context:c,elements,calls}=client();c.localAI=createLocalAIStore({storage:()=>{throw Error('blocked');},random:bytes=>bytes.fill(1)});c.storage.set=()=>{throw Error('must not create server credentials');};
 await elements.createRoom.onclick();assert.equal(c.online.local,true);assert.match(c.online.storageWarning,/保存できません/);await c.sendAction('move',firstMove(c.state));assert.equal(c.state.ply,1);assert.equal(calls.length,0);
 assert.match(source,/if\(online.local&&online.storageWarning\)\$\('connection'\).textContent\+=/);
 assert.equal(c.transport.getStats().requests,0);
});

test('AI restore reports missing or expired local data without attempting to locate a server room',async()=>{
 const {context:c,calls}=client();c.location.hash='#ai='+'c'.repeat(32);await c.restore();assert.equal(c.online,null);assert.match(c.message,/保存データ/);assert.equal(calls.length,0);
 assert.equal(c.transport.getStats().requests,0);
});

test('local version conflict adopts the latest browser snapshot without polling or sending a room request',async()=>{
 const {context:c,calls,elements,timers}=client();c.fetch=async(...args)=>{calls.push(args);throw new TypeError('Failed to fetch: offline');};
 await elements.createRoom.onclick();const id=c.online.room,staleMove=firstMove(c.state),otherTab=createLocalAIStore({storage:c.localStorage});
 const latest=otherTab.action(id,{action:'move',move:staleMove,version:c.online.version});assert.equal(c.state.ply,0);
 await c.sendAction('move',staleMove);assert.equal(c.online.version,latest.version);assert.deepEqual(c.state,latest.state);assert.equal(c.state.ply,1);assert.equal(c.busy,false);assert.equal(calls.length,0);assert.equal(timers.length,0);assert.equal(c.transport.getStats().requests,0);
 await c.sendAction('ai-move',firstMove(c.state));assert.equal(c.state.ply,2);assert.equal(calls.length,0);
});

test('offline #ai reload, explicit refresh and rematch never schedule a room request',async()=>{
 const {context:c,calls,elements,timers}=client();c.fetch=async(...args)=>{calls.push(args);throw new TypeError('Failed to fetch: offline');};
 await elements.createRoom.onclick();await c.sendAction('move',firstMove(c.state));
 c.localAI=createLocalAIStore({storage:c.localStorage});await c.restore();assert.equal(c.state.ply,1);await c.poll();
 await c.sendAction('resign');await c.sendAction('offer-rematch');await c.poll();assert.equal(c.state.ply,0);assert.equal(c.online.round,2);
 assert.equal(calls.length,0);assert.equal(timers.length,0);assert.equal(c.transport.getStats().requests,0);assert.match(elements.networkUsage.textContent,/AI対局は端末内で処理/);
});
