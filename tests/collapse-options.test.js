import test from 'node:test';
import assert from 'node:assert/strict';
import {collapseSteps,normalizeCollapseAt,initCollapseSlider} from '../dist/collapse-options.js';
import {initial,play,collapseAfterMove} from '../dist/engine.js';
import {createLocalAIStore} from '../dist/local-ai-game.js';
import {api} from '../worker/api.js';
import {localDB} from '../worker/local-db.js';

test('slider exposes all requested thresholds, immediate collapse and unlimited distinctly',()=>{
 assert.deepEqual(collapseSteps,[0,30,50,75,100,150,180,200,250,300,false]);
 const input={value:'5',attributes:{},addEventListener(type,fn){this.input=fn;},setAttribute(k,v){this.attributes[k]=v;}},output={};
 const refresh=initCollapseSlider(input,output);assert.equal(output.textContent,'150手');
 input.value='0';input.input();assert.equal(output.textContent,'0手（最初の1手から）');
 input.value='10';input.input();assert.equal(output.textContent,'無制限');assert.equal(input.attributes['aria-valuetext'],'無制限');
 input.value=String(collapseSteps.indexOf(200));refresh();assert.equal(output.textContent,'200手');
 assert.equal(normalizeCollapseAt(),150);assert.equal(normalizeCollapseAt(2),2,'old rooms still work');
 for(const bad of [-1,1001,1.5,null,'0',true])assert.throws(()=>normalizeCollapseAt(bad),{status:400});
});

test('zero destroys on the first move, positive thresholds announce first, unlimited never draws',()=>{
 for(const threshold of collapseSteps){
  const s=initial();s.moveLimit=false;s.paradoxAt=threshold;
  if(threshold===false)s.ply=1000;else if(threshold>0)s.ply=threshold-1;
  let draws=0;const next=collapseAfterMove(play(s,{from:54,to:45,prom:false}),()=>{draws++;return 0;});
  if(threshold===0){assert.ok(draws>0);assert.ok(next.destroyed);assert.equal(next.board.filter(Boolean).length,39);assert.equal(next.paradoxStarted,false);}
  else{assert.equal(draws,0);assert.equal(next.destroyed,null);assert.equal(next.paradoxStarted,threshold!==false);}
 }
});

test('AI settings preserve zero and unlimited through persistence and rematches',()=>{
 for(const threshold of collapseSteps){
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},client=createLocalAIStore({storage});
  let game=client.create({paradoxAt:threshold,moveLimit:false});
  assert.equal(game.settings.paradoxAt,threshold);assert.equal(game.state.paradoxAt,threshold);
  assert.equal(createLocalAIStore({storage}).read(game.room).state.paradoxAt,threshold);
  game=client.action(game.room,{action:'resign',version:game.version});
  game=client.action(game.room,{action:'offer-rematch',version:game.version});assert.equal(game.state.paradoxAt,threshold);
 }
});

test('friend room shares zero through invitation, executes first-move collapse, and does not redraw on reads',async t=>{
 const original=crypto.getRandomValues.bind(crypto);
 t.mock.method(crypto,'getRandomValues',bytes=>bytes instanceof Uint32Array?(bytes.fill(153845999),bytes):original(bytes));
 const db=localDB(),host='a'.repeat(64),guest='b'.repeat(64),invite='c'.repeat(64);
 const call=async(path,body,token=host)=>{
  const response=await api(new Request('https://test.local/api/rooms'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),{DB:db});
  assert.ok(response.ok,await response.clone().text());return response.json();
 };
 try{
  const room=await call('',{invite,settings:{paradoxAt:0,moveLimit:false}}),path='/'+room.room;
  assert.equal((await call(path+'/preview',{invite},guest)).settings.paradoxAt,0);
  const joined=await call(path+'/join',{invite},guest),first=joined.side===0?guest:host;
  const moved=await call(path+'/action',{action:'move',version:joined.version,move:{from:54,to:45,prom:false}},first);
  assert.equal(moved.state.ply,1);assert.ok(moved.state.destroyed);assert.equal(moved.state.board.filter(Boolean).length,39);
  assert.deepEqual((await call(path,undefined,guest)).state,moved.state);
 }finally{db.close();}
});
