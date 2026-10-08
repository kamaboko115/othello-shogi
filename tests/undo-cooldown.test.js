import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {api,undoCooldownMs} from '../worker/api.js';
import {localDB} from '../worker/local-db.js';
import {undoWaitSeconds} from '../dist/room-requests.js';

test('friend undo cooldown survives reads, cancellation, moves and acceptance; seats are independent and rematch resets it',async t=>{
 let now=Date.now();t.mock.method(Date,'now',()=>now);
 const db=localDB(),host='a'.repeat(64),guest='b'.repeat(64),invite='c'.repeat(64);
 async function call(path,token,body){return api(new Request('http://test.local/api/rooms'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB:db});}
 try{
  const room=await (await call('',host,{invite,settings:{paradoxAt:false}})).json(),path='/'+room.room;
  let data=await (await call(path+'/join',guest,{invite})).json();
  const first=data.side===0?guest:host,second=first===host?guest:host,seat=first===host?0:1;
  async function action(token,action,extra={},expected=200){
   const response=await call(path+'/action',token,{action,version:data.version,...extra});
   const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));
   if(response.ok)data=result;return result;
  }
  await action(first,'move',{move:{from:54,to:45,prom:false}});
  await action(second,'move',{move:{from:18,to:27,prom:false}});
  await action(first,'offer-undo');const deadline=now+undoCooldownMs;
  assert.equal(data.undoCooldowns[seat],deadline);
  await action(second,'decline-undo');
  const reloaded=await (await call(path,first)).json();assert.equal(reloaded.undoCooldowns[seat],deadline);
  await action(first,'offer-undo',{},429);
  await action(second,'offer-undo');assert.equal(data.undoCooldowns[1-seat],deadline);
  await action(first,'decline-undo');
  now=deadline-1;await action(first,'offer-undo',{},429);
  now=deadline;await action(first,'offer-undo');
  await action(second,'accept-undo');assert.equal(data.state.ply,0);
  await action(first,'move',{move:{from:54,to:45,prom:false}});
  await action(first,'offer-undo',{},429);
  await action(host,'resign');await action(host,'offer-rematch');await action(guest,'accept-rematch');
  assert.deepEqual(data.undoCooldowns,[0,0]);
 }finally{db.close();}
});

test('undo button counts down in server time, unlocks at the boundary and never throttles AI undo',()=>{
 const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('function paintUndoButton('),source.indexOf('function render(){'));
 const button={},context=vm.createContext({online:{kind:'friend',seat:1,side:0,canUndo:true,undoCooldowns:[0,20000]},busy:false,connected:true,clockOffset:5000,Date:{now:()=>10000},undoWaitSeconds,allowsTakeback:()=>true,$:()=>button});
 vm.runInContext(code,context);
 vm.runInContext('paintUndoButton()',context);assert.equal(button.textContent,'待った（あと5秒）');assert.equal(button.disabled,true);
 vm.runInContext('paintUndoButton(19999)',context);assert.equal(button.textContent,'待った（あと1秒）');
 vm.runInContext('paintUndoButton(20000)',context);assert.equal(button.textContent,'待った');assert.equal(button.disabled,false);
 context.online.undoOffer={seat:1};vm.runInContext('paintUndoButton(20000)',context);assert.equal(button.disabled,true);
 context.online={kind:'ai',canUndo:true,undoCooldowns:[999999,999999]};vm.runInContext('paintUndoButton()',context);assert.equal(button.disabled,false);
});
