import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const leaving=source.slice(source.indexOf('async function resignAndLeave()'),source.indexOf("$('requestUndo').onclick"));
const sending=source.slice(source.indexOf('async function sendAction('),source.indexOf('function enter('));
function client(kind='friend'){
 const calls=[],elements={reset:{},closeResult:{}},state={result:'',turn:1};
 const context={state,online:{room:'room',round:1,joined:true,kind,side:0,version:1,token:'token'},busy:false,message:'',
  $:id=>elements[id],interruptMoveEffects(){},render(){},confirm(title,fn){context.confirmAction=fn;},
  leaveGame(){calls.push('lobby');context.online=null;},adopt(data){calls.push('adopt');context.state=data.state;},
  async poll(){calls.push('poll');},async request(path,token,body){calls.push(body.action);return {state:{result:'後手の勝ち（投了）'}};}};
 vm.createContext(context);vm.runInContext(sending+leaving,context);
 return {context,calls,elements};
}

for(const kind of ['ai','friend'])test(`${kind}対局を離れると相手番でも投了の確認完了を待ってロビーへ戻る`,async()=>{
 const {context,calls,elements}=client(kind);let resolve;
 context.request=async(path,token,body)=>{assert.equal(body.action,'resign');assert.equal(body.version,1);calls.push('resign');return new Promise(r=>{resolve=r;});};
 elements.reset.onclick();assert.equal(calls.length,0);
 const pending=context.confirmAction();assert.deepEqual(calls,['resign']);assert.equal(context.online.room,'room');
 resolve({state:{result:'後手の勝ち（投了）'}});await pending;
 assert.deepEqual(calls,['resign','adopt','lobby']);
});

for(const status of [409,500])test(`投了に失敗 (${status}) すると対局とエラーを残す`,async()=>{
 const {context,calls}=client();context.request=async()=>{throw Object.assign(new Error('通信に失敗しました'),{status});};
 await context.resignAndLeave();assert.equal(context.online.room,'room');assert.equal(context.message,'通信に失敗しました');
 assert.equal(calls.includes('lobby'),false);assert.equal(context.busy,false);assert.equal(calls.includes('poll'),status===409);
});

test('終了後と参加待ちのルームは投了なしで離れられる',async()=>{
 for(const ended of [false,true]){
  const {context,calls,elements}=client();context.online.joined=ended;context.state.result=ended?'先手の勝ち':'';
  elements.reset.onclick();assert.deepEqual(calls,['lobby']);
 }
});

test('投了処理中の重複離脱、終了未確認の応答、別対局への移動でロビーへ戻らない',async()=>{
 const {context,calls}=client();context.busy=true;await context.resignAndLeave();assert.deepEqual(calls,[]);
 context.busy=false;context.request=async()=>({state:{result:''}});await context.resignAndLeave();assert.equal(context.online.room,'room');
 context.request=async()=>{context.online={...context.online,round:2};return {state:{result:'後手の勝ち（投了）'}};};
 await context.resignAndLeave();assert.equal(calls.includes('lobby'),false);
});
