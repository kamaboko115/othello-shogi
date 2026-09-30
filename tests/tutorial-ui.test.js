import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial} from '../dist/engine.js';
globalThis.Audio=class {addEventListener(){} load(){} play(){return Promise.resolve();} pause(){}};
globalThis.window={addEventListener(){}};
globalThis.matchMedia=()=>({matches:true});
const {initDeveloper}=await import('../dist/developer.js');
// Minimal DOM for exercising event handlers and asynchronous dialog transitions.
function view(){
 const ids=new Map();
 class Element{
  children=[];dataset={};style={};value='';open=false;events={};
  classList={add(){},remove(){},toggle(){}};
  set id(value){this._id=value;ids.set(value,this);} get id(){return this._id;}
  setAttribute(){} getAttribute(){return null;} removeAttribute(){} querySelectorAll(){return [];} append(...els){this.children.push(...els);}
  replaceChildren(...els){this.children=els;}
  insertAdjacentElement(){} after(){} remove(){} getAnimations(){return [];}
  addEventListener(name,fn){this.events[name]=fn;}
  showModal(){this.open=true;}
  close(){if(this.open){this.open=false;this.events.close?.();}}
  querySelector(selector){const square=selector.match(/data-square="(\d+)"/);if(!square)return null;const cell=this.children.find(el=>el.dataset.square===Number(square[1]));return selector.includes('.piece')?cell?.children[0]:cell;}
 }
 const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 for(const [,id] of html.matchAll(/id="([^"]+)"/g)){assert.ok(!ids.has(id),'unique id '+id);const el=new Element();el.id=id;}
 globalThis.document={getElementById:id=>{assert.ok(ids.has(id),'exists '+id);return ids.get(id);},createElement:()=>new Element(),querySelectorAll:()=>[]};
 initDeveloper(()=>({state:initial(),side:0}));
 const get=id=>ids.get(id),clickSquare=i=>get('devBoard').querySelector(`[data-square="${i}"]`).onclick();
 return {get,clickSquare};
}
test('練習の演出完了後に次へ・再練習を選べ、閉じた場合は案内を残さない',async()=>{
 const {get,clickSquare}=view();get('openTutorial').onclick();
 await clickSquare(49);const playing=clickSquare(40);
 assert.equal(get('lessonComplete').open,false,'演出中は表示しない');
 await playing;assert.equal(get('lessonComplete').open,true);
 get('lessonCompleteRepeat').onclick();assert.equal(get('lessonComplete').open,false);assert.match(get('lessonTitle').textContent,/1 \/ /);
 await clickSquare(49);await clickSquare(40);get('lessonCompleteNext').onclick();assert.match(get('lessonTitle').textContent,/2 \/ /);
 await clickSquare(49);const interrupted=clickSquare(40);get('closeDeveloper').onclick();await interrupted;
 assert.equal(get('lessonComplete').open,false);assert.equal(get('developerDialog').open,false);
});
