import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const layout=source.slice(source.indexOf(' const ending='),source.indexOf(' const chatPanel='));
const permissions=source.slice(source.indexOf('const canAct='),source.indexOf('function renderHand('));

test('waiting rooms use the mobile game layout while moves remain locked until the opponent joins',()=>{
 const classes=new Set();
 const context=vm.createContext({
  online:null,showTutorial:true,state:{turn:0,result:null},busy:false,connected:true,
  collapseEffect:null,comboPreparing:false,comboActive:false,effectsActive:false,
  $:()=>({hidden:true}),
  document:{body:{classList:{contains:name=>classes.has(name),toggle(name,on){on?classes.add(name):classes.delete(name);}}}}
 });
 vm.runInContext(permissions,context);
 for(const [online,result,active,ended,canMove] of [
  [null,null,false,false,false],
  [{joined:false,side:0},null,true,false,false],
  [{joined:true,side:0},null,true,false,true],
  [{joined:true,side:0},{winner:0},false,true,false],
  [{joined:false,side:0},null,true,false,false],
  [null,null,false,false,false]
 ]){
  context.online=online;context.showTutorial=!online;context.state.result=result;
  vm.runInContext(`{${layout}}`,context);
  assert.equal(classes.has('game-active'),active);
  assert.equal(classes.has('game-ended'),ended);
  assert.equal(vm.runInContext('canAct()',context),canMove);
 }
});
