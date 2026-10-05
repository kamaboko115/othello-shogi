import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRoomPoller} from '../dist/room-network.js';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const leaving=source.slice(source.indexOf('async function resignAndLeave()'),source.indexOf("$('requestUndo').onclick"));
const sending=source.slice(source.indexOf('async function sendAction('),source.indexOf('function enter('));
function client(kind='friend'){
 const calls=[],elements={reset:{},closeResult:{},settingsLobby:{},settingsDialog:{open:true,close(){this.open=false;}}},state={result:'',turn:1};
 const context={winAds:{betweenMatches:async()=>({shown:false})},state,online:{room:'room',round:1,joined:true,kind,side:0,version:1,token:'token'},busy:false,message:'',routeVersion:0,
  $:id=>elements[id],interruptMoveEffects(){},render(){},confirm(title,fn){context.confirmAction=fn;},
  leaveGame(){calls.push('lobby');context.online=null;},adopt(data){calls.push('adopt');context.state=data.state;},
  roomPoller:{stop(){}},schedulePolling(){},async poll(){calls.push('poll');},async request(path,token,body){calls.push(body.action);return {closed:true,state:{result:'後手の勝ち（投了）'}};}};
 vm.createContext(context);vm.runInContext(sending+leaving,context);
 return {context,calls,elements};
}

for(const kind of ['ai','friend'])test(`${kind}対局を離れると相手番でも投了の確認完了を待ってロビーへ戻る`,async()=>{
 const {context,calls,elements}=client(kind);let resolve;
 context.request=async(path,token,body)=>{assert.equal(body.action,'leave');assert.equal(body.version,1);calls.push('leave');return new Promise(r=>{resolve=r;});};
 elements.reset.onclick();assert.equal(calls.length,0);
 const pending=context.confirmAction();assert.deepEqual(calls,['leave']);assert.equal(context.online.room,'room');
 resolve({closed:true,state:{result:'後手の勝ち（投了）'}});await pending;
 assert.deepEqual(calls,['leave','adopt','lobby']);
});

for(const status of [409,500])test(`投了に失敗 (${status}) すると対局とエラーを残す`,async()=>{
 const {context,calls}=client();context.request=async()=>{throw Object.assign(new Error('通信に失敗しました'),{status});};
 await context.resignAndLeave();assert.equal(context.online.room,'room');assert.equal(context.message,'通信に失敗しました');
 assert.equal(calls.includes('lobby'),false);assert.equal(context.busy,false);assert.equal(calls.includes('poll'),status===409);
});

test('終了後と参加待ちでも部屋を閉じてから離れる',async()=>{
 for(const ended of [false,true]){
  const {context,calls,elements}=client();context.online.joined=ended;context.state.result=ended?'先手の勝ち':'';
  await context.resignAndLeave();assert.deepEqual(calls,['leave','adopt','lobby']);
 }
});

test('削除済みの部屋への離脱再試行はロビーへ戻る',async()=>{
 const {context,calls}=client();context.request=async()=>{throw Object.assign(new Error('部屋がありません'),{status:404});};
 await context.resignAndLeave();assert.equal(calls.at(-1),'lobby');
});

test('閉鎖通知を受け取ったらポーリングを止める',async()=>{
 const polling=source.slice(source.indexOf('const roomPoller=createRoomPoller('),source.indexOf('async function sendAction('));
 for(const closed of [false,true]){
  const timers=new Map();let nextId=0;
  const context={online:{room:'room',token:'token'},state:{turn:0},document:{hidden:false},connected:true,
   createRoomPoller:options=>createRoomPoller({...options,setTimer:fn=>{timers.set(++nextId,fn);return nextId;},clearTimer:id=>timers.delete(id)}),paintNetworkUsage(){},request:async()=>({closed}),
   adopt(data){context.online={...context.online,...data};}};
  vm.createContext(context);vm.runInContext(polling,context);await context.poll();
  assert.equal(timers.size,closed?0:1);
 }
});
test('部屋が期限切れでもエラーを表示して定期通信を止める',async()=>{
 const polling=source.slice(source.indexOf('const roomPoller=createRoomPoller('),source.indexOf('async function sendAction('));
 const timers=new Map();let nextId=0;
 const context={online:{room:'room',token:'token'},state:{turn:0},document:{hidden:false},connected:true,message:'',
  createRoomPoller:options=>createRoomPoller({...options,setTimer:fn=>{timers.set(++nextId,fn);return nextId;},clearTimer:id=>timers.delete(id)}),paintNetworkUsage(){},render(){},request:async()=>{throw Object.assign(new Error('部屋は閉じられています'),{status:404});}};
 vm.createContext(context);vm.runInContext(polling,context);await context.poll();
 assert.equal(timers.size,0);assert.equal(context.online.closed,true);assert.match(context.message,/閉じられ/);
});

test('投了処理中の重複離脱、終了未確認の応答、別対局への移動でロビーへ戻らない',async()=>{
 const {context,calls}=client();context.busy=true;await context.resignAndLeave();assert.deepEqual(calls,[]);
 context.busy=false;context.request=async()=>({state:{result:''}});await context.resignAndLeave();assert.equal(context.online.room,'room');
 context.request=async()=>{context.online={...context.online,round:2};return {closed:true,state:{result:'後手の勝ち（投了）'}};};
 await context.resignAndLeave();assert.equal(calls.includes('lobby'),false);
});

for(const kind of ['ai','friend'])test(`${kind}設定からのロビー復帰も投了確認と応答を待つ`,async()=>{
 const {context,calls,elements}=client(kind);
 elements.settingsLobby.onclick();
 assert.equal(elements.settingsDialog.open,false);
 assert.deepEqual(calls,[]);assert.equal(context.online.room,'room');
 await context.confirmAction();assert.deepEqual(calls,['leave','adopt','lobby']);
});
test('処理中は設定からロビーへ移動しない',()=>{
 const {context,calls,elements}=client();context.busy=true;elements.settingsLobby.onclick();
 assert.equal(elements.settingsDialog.open,true);assert.equal(context.confirmAction,undefined);assert.deepEqual(calls,[]);
});
