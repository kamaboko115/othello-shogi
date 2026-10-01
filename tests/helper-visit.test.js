import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {placeHelper} from '../dist/helper-visit.js';

function view(){
 const animations=[],classes=new Set(),home={parentElement:{name:'sidebar'},after(node){node.parentElement=this.parentElement;node.previousElementSibling=this;}};
 const opponent={name:'opponent',prepend(node){node.parentElement=this;node.previousElementSibling=null;}};
 const actor={hidden:false,parentElement:opponent,previousElementSibling:null,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},getBoundingClientRect(){return this.parentElement===opponent?{left:200,top:80,width:160}:{left:1000,top:160,width:210};},animate(frames,options){const a={frames,options,cancel(){this.oncancel?.();}};animations.push(a);return a;}};
 let sounds=0;const options={home,opponent,travel:true,sound:()=>sounds++,reducedMotion:()=>false};
 return {actor,home,opponent,animations,classes,options,get sounds(){return sounds;}};
}
test('代打時は同じ画像を右側へ飛ばし、再描画で音や移動を重複させず、帰りも往復する',()=>{
 const v=view();assert.equal(placeHelper(v.actor,{...v.options,visiting:true}),true);
 assert.equal(v.actor.parentElement,v.home.parentElement);assert.equal(v.sounds,1);assert.equal(v.animations[0].options.duration,450);
 assert.match(v.animations[0].frames[0].transform,/translate\(-800px,-80px\)/);
 assert.equal(placeHelper(v.actor,{...v.options,visiting:true}),false);assert.equal(v.sounds,1);
 v.animations[0].onfinish();assert.equal(v.classes.has('helper-travelling'),false);
 placeHelper(v.actor,v.options);assert.equal(v.actor.parentElement,v.opponent);assert.equal(v.sounds,2);
 placeHelper(v.actor,{...v.options,visiting:true});assert.equal(v.sounds,3);
});
test('初期配置は無音で、動きを減らす設定では移動アニメーションを省く',()=>{
 const v=view();placeHelper(v.actor,{...v.options,visiting:true,travel:false});assert.equal(v.animations.length,0);assert.equal(v.sounds,0);
 placeHelper(v.actor,{...v.options,reducedMotion:()=>true});assert.equal(v.animations.length,0);assert.equal(v.sounds,1);
});

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('async function useHelper()'),source.indexOf("$('helperAd').onclick="));
function helper(challenge,unlimited=true){
 const timers=[],renders=[],calls=[],task={promise:null};let resolveSearch;
 task.promise=new Promise(resolve=>{resolveSearch=resolve;});
 const online={room:'room',round:1,version:2,token:'token',settings:{aiLevel:challenge?'osesho':'expert',helperUnlimited:unlimited}};
 const context={online,state:{},helperIdeaTimer:null,helperIdea:false,helperJob:null,helperGreeting:false,helperVisiting:false,helperTravelPending:false,helperLingering:false,helperFarewell:false,helperDeparting:false,
  $:()=>({close(){}}),helperAvailable:()=>true,interruptMoveEffects(){},clearTimeout(){},setTimeout(fn,ms){timers.push({fn,ms});return timers.length;},message:'',busy:false,selected:null,legal:[],startAI:()=>task,
  render(){renders.push({greeting:context.helperGreeting,visiting:context.helperVisiting,idea:context.helperIdea,farewell:context.helperFarewell});},
  request:async()=>{calls.push('move');return {settings:online.settings};},adopt(){},playHelperDeparture(){calls.push('depart');}};
 vm.createContext(context);vm.runInContext(code,context);
 return {context,timers,renders,calls,resolveSearch};
}
test('対オセショ様だけ1秒のセリフを出し、思考・ひらめき・じゃあの後の帰還を順に行う',async()=>{
 const v=helper(true),job=v.context.useHelper();assert.equal(v.context.helperGreeting,true);assert.equal(v.context.helperVisiting,true);
 assert.equal(v.timers[0].ms,1000);v.timers.shift().fn();assert.equal(v.context.helperGreeting,false);
 // The greeting must end even when the search has not finished yet.
 assert.equal(v.calls.length,0);v.resolveSearch({move:{to:1}});await job;
 assert.equal(v.context.helperIdea,true);assert.equal(v.context.helperVisiting,true);assert.equal(v.context.helperLingering,true);
 assert.deepEqual(v.timers.map(x=>x.ms),[1800,2300]);v.timers.shift().fn();
 assert.equal(v.context.helperFarewell,true);assert.equal(v.context.helperVisiting,false);assert.equal(v.context.helperTravelPending,true);
 v.timers.shift().fn();assert.equal(v.context.helperLingering,false);assert.equal(v.context.helperFarewell,false);assert.deepEqual(v.calls,['move']);
});
test('通常AIの無限代打は追加の待ち時間や往復なしで従来どおり指す',async()=>{
 const v=helper(false),job=v.context.useHelper();assert.equal(v.timers.length,0);v.resolveSearch({move:{to:1}});await job;
 assert.equal(v.context.helperVisiting,false);assert.equal(v.context.helperGreeting,false);assert.equal(v.context.helperLingering,false);
 assert.deepEqual(v.timers.map(x=>x.ms),[1800,2300]);v.timers.shift().fn();v.timers.shift().fn();assert.deepEqual(v.calls,['move']);
});
test('対局から離れた後のセリフタイマーや思考結果は移動や指し手を実行しない',async()=>{
 const v=helper(true),job=v.context.useHelper();v.context.online=null;v.context.helperJob=null;v.context.helperGreeting=false;v.context.helperVisiting=false;
 const count=v.renders.length;v.timers.shift().fn();v.resolveSearch({move:{to:1}});await job;
 assert.equal(v.renders.length,count);assert.deepEqual(v.calls,[]);
});
