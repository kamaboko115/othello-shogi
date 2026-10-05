import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial} from '../dist/engine.js';
import {lessons,lessonState,tutorialMoves} from '../dist/tutorial-lessons.js';
globalThis.Audio=class {addEventListener(){} load(){} play(){return Promise.resolve();} pause(){}};
globalThis.window={addEventListener(){}};
globalThis.matchMedia=()=>({matches:true});
const {initDeveloper}=await import('../dist/developer.js');
// Minimal DOM for exercising event handlers and asynchronous dialog transitions.
function view(onComplete){
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
 initDeveloper(()=>({state:initial(),side:0}),onComplete);
 const get=id=>ids.get(id),clickSquare=i=>get('devBoard').querySelector(`[data-square="${i}"]`).onclick();
 return {get,clickSquare};
}

test('練習1〜8は指定の1手だけを許可し、完了後は次の手を許可しない',()=>{
 for(let index=0;index<8;index++){
  const state=lessonState(index),expected=lessons[index].move;
  const all=[...Array(81).keys(),'R','B','G','S','N','L','P'].flatMap(source=>tutorialMoves(state,index,source));
  assert.equal(all.length,1,'lesson '+(index+1));
  assert.equal(all[0].from,expected.from);assert.equal(all[0].to,expected.to);assert.equal(all[0].drop,expected.drop);
  state.ply=1;assert.deepEqual(tutorialMoves(state,index,expected.from??expected.drop),[]);
 }
 assert.ok(tutorialMoves(lessonState(8),8,58).length>1,'崩壊の練習は自由に動かせる');
});

test('練習1〜8で他の駒・移動先を押しても進まず、指定の駒と移動先を案内する',async()=>{
 const {get,clickSquare}=view();get('openTutorial').onclick();
 for(let index=0;index<8;index++){
  const move=lessons[index].move,cell=i=>get('devBoard').querySelector(`[data-square="${i}"]`);
  assert.equal(cell(76).disabled,true,'自分の王は操作不可');
  assert.ok(get('devBoard').children.some(el=>el.className==='tutorial-arrow'));
  await clickSquare(76);await clickSquare(67);
  assert.equal(cell(76).children[0].textContent,'玉');
  if(move.drop)get('devHand0').children.find(el=>el.dataset.type===move.drop).onclick();
  else await clickSquare(move.from);
  assert.equal(cell(move.to).disabled,false,'指定の移動先は操作可能');
  await clickSquare(0);assert.equal(cell(move.to).disabled,false,'無関係なマスで選択を失わない');
  assert.equal(get('lessonComplete').open,false);
  get('lessonNext').onclick();
 }
 assert.match(get('lessonText').textContent,/破壊の代わりに龍か馬が合計3枚降臨/);
 assert.equal(get('lessonAdvice').hidden,false);
 assert.ok(!get('devBoard').children.some(el=>el.className==='tutorial-arrow'));
 assert.equal(get('devBoard').querySelector('[data-square="58"]').disabled,false);
 get('lessonExit').onclick();
});
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

test('開発者の練習盤は崩壊せず、待ったで盤面を戻せる',async()=>{
 const {get,clickSquare}=view();get('openDeveloper').onclick();get('devMode').value='play';
 const count=()=>get('devBoard').children.filter(cell=>cell.children.some(el=>el.className.startsWith('piece'))).length;
 for(const [from,to] of [[54,45],[55,46],[56,47]]){await clickSquare(from);await clickSquare(to);assert.equal(count(),40);}
 get('devUndo').onclick();assert.ok(get('devBoard').querySelector('[data-square="56"]').children.length);
 assert.equal(count(),40);get('closeDeveloper').onclick();
 get('openTutorial').onclick();assert.match(get('lessonTitle').textContent,/1 \/ /);get('lessonExit').onclick();
});

 test('最後の練習から仕上げの4問へ繋がり、途中終了では開かない',()=>{
 let opened=0;const {get}=view(()=>opened++);get('openTutorial').onclick();
 for(let i=0;i<lessons.length-1;i++)get('lessonNext').onclick();
 assert.equal(get('lessonNext').textContent,'仕上げの4問へ');
 get('lessonNext').onclick();assert.equal(opened,1);assert.equal(get('developerDialog').open,false);
 get('openTutorial').onclick();get('lessonExit').onclick();assert.equal(opened,1);
 });
