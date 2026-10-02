import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRoomTransport,createRoomPoller} from '../dist/room-network.js';
import {clockBudget} from '../dist/match-options.js';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const section=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
function client(){
 const elements={},timers=new Map(),calls=[],adoptions=[];let nextId=0;
 const snapshot={room:'room',token:'token',kind:'friend',side:0,joined:true,version:3,state:{ply:2,turn:0,result:''},logs:[],round:1};
 const c={online:structuredClone(snapshot),state:structuredClone(snapshot.state),busy:false,connected:true,clockOffset:0,routeVersion:0,document:{hidden:false},Date,
  clockBudget,location:{pathname:'/'},history:{replaceState(){}},storage:{set(){}},$:id=>elements[id]??={},
  interruptMoveEffects(){},cancelCombo(){},cancelCollapse(){},stopAI(){},render(){},paintNetworkUsage(){},
  createRoomPoller:options=>createRoomPoller({...options,setTimer:(fn,ms)=>{timers.set(++nextId,{fn,ms});return nextId;},clearTimer:id=>timers.delete(id),random:()=>0.5}),
  adopt(data){adoptions.push(data);c.online={...c.online,...data};c.state=data.state;},
  fetch:async(url,options)=>{calls.push({url,options});return options.method==='GET'?new Response(null,{status:304,headers:{'X-Room-Server-Now':String(Date.now())}}):Response.json({...snapshot,version:4,state:{ply:3,turn:1,result:''}});}
 };
 c.transport=createRoomTransport({fetchImpl:(...args)=>c.fetch(...args),onClock:now=>{c.clockOffset=now-Date.now();}});
 vm.createContext(c);vm.runInContext(section('async function request(','function adopt(')+section('const roomPoller=createRoomPoller(','for(const [value,name]')+'globalThis.poller=roomPoller;',c);
 return {c,timers,calls,adoptions,snapshot};
}

test('enter uses the creation/join snapshot, skips duplicate GET, then conditionally checks the current version',async()=>{
 const {c,timers,calls,snapshot,adoptions}=client();c.enter(snapshot,'token');
 assert.equal(calls.length,0);assert.equal([...timers.values()][0].ms,8000);
 await c.poll();assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/rooms/room?version=3');assert.equal(adoptions.length,0);
 assert.equal(c.transport.getStats().unchanged,1);assert.equal(timers.size,1);c.poller.stop();
});

test('concurrent refreshes share a GET and an action aborts it without allowing a stale board to replace the action',async()=>{
 const {c,calls,adoptions,timers,snapshot}=client();let resolveGet,signal;
 c.fetch=async(url,options)=>{calls.push({url,options});if(options.method==='GET'){signal=options.signal;return new Promise(resolve=>{resolveGet=resolve;});}return Response.json({...snapshot,version:4,state:{ply:3,turn:1,result:''}});};
 const a=c.poll(),b=c.poll();await Promise.resolve();assert.equal(calls.length,1);
 await c.sendAction('move',{from:54,to:45,prom:false});assert.equal(signal.aborted,true);assert.equal(c.online.version,4);assert.equal([...timers.values()][0].ms,2000);
 resolveGet(Response.json({...snapshot,version:3}));await Promise.all([a,b]);assert.equal(adoptions.length,1);assert.equal(c.online.version,4);c.poller.stop();
});

test('failure backoff, 304 reconnect, hidden timing and clock deadlines use the friend lifecycle',async()=>{
 const {c,timers,calls}=client();c.fetch=async()=>{throw Error('offline');};
 await c.poll();assert.equal(c.connected,false);assert.equal([...timers.values()][0].ms,5000);
 await c.poll();assert.equal([...timers.values()][0].ms,10000);
 c.fetch=async(url,options)=>{calls.push({url,options});return new Response(null,{status:304,headers:{'X-Room-Server-Now':String(Date.now())}});};
 await c.poll();assert.equal(c.connected,true);assert.equal([...timers.values()][0].ms,8000);
 c.document.hidden=true;await c.poll();assert.equal([...timers.values()][0].ms,10000);
 c.online.clock={remaining:[500,1000],since:Date.now()};c.online.settings={timeControl:{minutes:1,increment:0,byoyomi:0}};
 await c.poll();assert.equal([...timers.values()][0].ms,1000);c.poller.stop();
});

test('undo/rematch/closure updates arrive and closure prevents any further polling',async()=>{
 const {c,snapshot,timers,adoptions}=client();
 for(const update of [{undoOffer:1},{rematch:1,state:{ply:2,turn:0,result:'引き分け'}},{closed:true,state:{ply:2,turn:0,result:'後手の勝ち（投了）'}}]){
  const version=c.online.version+1;c.fetch=async()=>Response.json({...snapshot,...update,version});await c.poll();assert.equal(c.online.version,version);
 }
 assert.equal(adoptions.length,3);assert.equal(c.online.closed,true);assert.equal(timers.size,0);
 const count=c.transport.getStats().requests;await c.poll();assert.equal(c.transport.getStats().requests,count);
});

test('late action success or failure cannot change a newly entered room or release its busy lock',async()=>{
 for(const status of [200,404,409,500])for(const sameRoom of [false,true]){
  const {c,snapshot,adoptions}=client();let settle,leaves=0;c.leaveGame=()=>{leaves++;c.online=null;};
  c.fetch=()=>new Promise(resolve=>{settle=resolve;});const pending=c.sendAction('leave');
  c.online={...snapshot,room:sameRoom?'room':'other-room'};c.routeVersion++;c.busy=true;c.message='new session';
  settle(Response.json(status===200?{...snapshot,closed:true,state:{result:'投了'}}:{error:'old error'},{status}));await pending;
  assert.equal(leaves,0);assert.equal(adoptions.length,0);assert.equal(c.online.room,sameRoom?'room':'other-room');assert.equal(c.busy,true);assert.equal(c.message,'new session');
 }
});

