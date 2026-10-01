import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
test('演出中も自分の手番は操作でき、相手番・通信中・終了後は操作できない',()=>{
 const canAct=source.match(/const canAct=\(\)=>[^;]+;/)[0];
 const context={comboActive:true,comboPreparing:true,effectsActive:true,collapseEffect:{},state:{turn:0,result:''},busy:false,connected:true,online:{joined:true,side:0}};
 vm.createContext(context);vm.runInContext(canAct+'globalThis.allowed=canAct;',context);
 assert.equal(context.allowed(),true);
 context.state.turn=1;assert.equal(context.allowed(),false);
 context.state.turn=0;context.busy=true;assert.equal(context.allowed(),false);
 context.busy=false;context.state.result='勝ち';assert.equal(context.allowed(),false);
});

test('駒の選択は古い演出をキャンセルしてから合法手を表示する',()=>{
 const code=source.slice(source.indexOf('function interruptMoveEffects()'),source.indexOf('function click(i)'));
 const calls=[];
 const context={comboActive:true,comboPreparing:false,effectsActive:true,collapseEffect:null,animationKey:'old',selected:null,legal:[],state:{},message:'',canAct:()=>true,moves:()=>[{to:40}],cancelCombo(){calls.push('cancel');context.comboActive=false;context.effectsActive=false;},cancelCollapse(){calls.push('collapse');},render(){calls.push('render');}};
 vm.createContext(context);vm.runInContext(code+'select(49);',context);
 assert.equal(context.selected,49);assert.equal(context.legal[0].to,40);
 assert.equal(context.animationKey,'');assert.deepEqual(calls,['cancel','collapse','render','render']);
});

test('通常AI戦の確認は通常文言、対オセショ様のみ特殊セリフ',()=>{
 const code=source.slice(source.indexOf('const askOsesho=()=>'),source.indexOf("$('oseshoNo').onclick"));
 for(const challenge of [false,true]){
  const elements={oseshoDialog:{querySelector:()=>elements.copy,showModal(){elements.open=true;}},copy:{},skipHelperConfirm:{},askOsesho:{},osesho:{}};
  const context={$:id=>elements[id],helperAvailable:()=>true,helperConfirmKey:()=>'',storage:{get:()=>false},online:{settings:{aiLevel:challenge?'osesho':'expert',helperUnlimited:false}}};
  vm.createContext(context);vm.runInContext(code+'askOsesho();',context);
  assert.equal(elements.open,true);assert.equal(elements.copy.textContent.includes('仕方ない'),challenge);
 }
});
