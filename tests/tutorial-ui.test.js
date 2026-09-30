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
 await clickSquare(49);const interrupted=clickSquare(40);get('lessonExit').onclick();await interrupted;
 assert.equal(get('lessonComplete').open,false);assert.equal(get('developerDialog').open,false);
});

test('完了案内から終了するとロビーへ戻り、最初から練習を再開できる',async()=>{
 const {get,clickSquare}=view();get('openTutorial').onclick();await clickSquare(49);await clickSquare(40);
 assert.equal(get('lessonComplete').open,true);get('lessonCompleteExit').onclick();
 assert.equal(get('lessonComplete').open,false);assert.equal(get('developerDialog').open,false);
 get('openTutorial').onclick();assert.match(get('lessonTitle').textContent,/1 \/ /);assert.equal(get('lessonComplete').open,false);get('lessonExit').onclick();
});

test('開発者の早期崩壊は2手目から発動し、待った・オフ・チュートリアルへ漏れない',async t=>{
 t.mock.method(crypto,'getRandomValues',array=>{array.fill(1);return array;});
 const {get,clickSquare}=view();get('openDeveloper').onclick();get('devMode').value='play';
 get('devCollapseEarly').checked=true;get('devCollapseEarly').onchange();
 const count=()=>get('devBoard').children.filter(cell=>cell.children.some(el=>el.className.startsWith('piece'))).length;
 await clickSquare(54);await clickSquare(45);assert.equal(count(),40,'1手目は破壊しない');
 await clickSquare(55);await clickSquare(46);assert.equal(count(),39,'2手目で1枚破壊');assert.match(get('devStatus').textContent,/2手目.*崩壊/);
 get('devUndo').onclick();assert.equal(count(),40,'待ったで破壊前の盤面に戻る');assert.equal(get('devCollapseEarly').checked,true);
 get('devCollapseEarly').checked=false;get('devCollapseEarly').onchange();
 await clickSquare(55);await clickSquare(46);assert.equal(count(),40,'オフにすると破壊しない');
 get('closeDeveloper').onclick();get('openTutorial').onclick();assert.match(get('lessonTitle').textContent,/1 \/ /);get('lessonExit').onclick();
 get('openDeveloper').onclick();assert.equal(get('devCollapseEarly').checked,false,'開き直すと通常の練習盤');get('closeDeveloper').onclick();
});
