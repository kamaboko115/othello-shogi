import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {initial,movementTargets,moves,label} from '../dist/engine.js';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
test('開発者ツールONでロビーの2手崩壊を選べ、OFFなら150手へ戻る',()=>{
 const option={hidden:true,disabled:true};
 const elements={debugCollapseOption:{checked:false},paradoxAt:{value:'150',querySelector:()=>option}};
 const context={$:id=>elements[id]};vm.createContext(context);
 const code=source.slice(source.indexOf('function syncDebugCollapseOption()'),source.indexOf("$('debugCollapseOption').onchange"));
 vm.runInContext(code,context);context.syncDebugCollapseOption();assert.equal(option.disabled,true);
 elements.debugCollapseOption.checked=true;context.syncDebugCollapseOption();assert.equal(option.hidden,false);assert.equal(option.disabled,false);
 elements.paradoxAt.value='2';elements.debugCollapseOption.checked=false;context.syncDebugCollapseOption();assert.equal(option.hidden,true);assert.equal(elements.paradoxAt.value,'150');
});
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
 const context={comboActive:true,comboPreparing:false,effectsActive:true,collapseEffect:null,animationKey:'old',selected:null,legal:[],state:{},message:'',canAct:()=>true,clearInspection(){},moves:()=>[{to:40}],cancelCombo(){calls.push('cancel');context.comboActive=false;context.effectsActive=false;},cancelCollapse(){calls.push('collapse');},render(){calls.push('render');}};
 vm.createContext(context);vm.runInContext(code+'select(49);',context);
 assert.equal(context.selected,49);assert.equal(context.legal[0].to,40);
 assert.equal(context.animationKey,'');assert.deepEqual(calls,['cancel','collapse','render','render']);
});

test('代打の確認文は共通で、対オセショ様の画像タップは依頼を開かない',()=>{
 const code=source.slice(source.indexOf('const askOsesho=()=>'),source.indexOf("$('oseshoNo').onclick"));
 for(const challenge of [false,true]){
  const elements={oseshoDialog:{querySelector:()=>elements.copy,showModal(){elements.open=true;}},copy:{},skipHelperConfirm:{},askOsesho:{},osesho:{}};
  const context={$:id=>elements[id],helperAvailable:()=>true,helperConfirmKey:()=>'',storage:{get:()=>false},online:{settings:{aiLevel:challenge?'osesho':'expert',helperUnlimited:false}}};
  vm.createContext(context);vm.runInContext(code+'askOsesho();',context);
  assert.equal(elements.open,true);assert.equal(elements.copy.textContent.includes('仕方ない'),false);
  elements.open=false;elements.osesho.onclick();assert.equal(elements.open,!challenge);
 }
});

function inspectionHarness(){
 const commits=[],state=initial(true),context={state,online:{side:0},selected:null,legal:[],inspected:null,inspectedTargets:[],message:'',movementTargets,label,
  canAct:()=>context.state.turn===context.online.side,canInspect:()=>true,interruptMoveEffects(){},render(){},
  clearInspection(){context.inspected=null;context.inspectedTargets=[];},commit(move){commits.push(move);},
  select(square){context.clearInspection();context.selected=square;context.legal=moves(state,square);},$:()=>({showModal(){}})};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function click(i)'),source.indexOf('function commit(m)')),context);
 return {context,commits};
}

test('相手の駒と確認用の移動先を押しても指し手を送信せず、通常の駒選択に戻れる',()=>{
 const {context:c,commits}=inspectionHarness(),before=structuredClone(c.state);
 c.click(18);assert.equal(c.inspected,18);assert.deepEqual(Array.from(c.inspectedTargets),[27]);assert.equal(c.legal.length,0);
 c.click(27);assert.equal(c.inspected,null);assert.equal(commits.length,0);assert.deepEqual(c.state,before);
 c.click(18);c.click(18);assert.equal(c.inspected,null);
 c.click(18);c.click(54);assert.equal(c.inspected,null);assert.equal(c.selected,54);
 c.click(45);assert.equal(commits.length,1);assert.equal(commits[0].to,45);
});

test('相手の手番も駒を確認でき、自分の駒を選んでも動かさない',()=>{
 const {context:c,commits}=inspectionHarness();c.state.turn=1;
 c.click(18);assert.equal(c.inspected,18);assert.equal(c.legal.length,0);
 c.click(54);assert.equal(c.selected,null);assert.equal(commits.length,0);
});

test('敵駒のいる合法な移動先を押した場合は、確認より通常の駒取りを優先する',()=>{
 const {context:c,commits}=inspectionHarness();
 c.state.board[45]={type:'S',side:1,prom:false};c.click(54);c.click(45);
 assert.equal(commits.length,1);assert.equal(commits[0].from,54);assert.equal(c.inspected,null);
});
