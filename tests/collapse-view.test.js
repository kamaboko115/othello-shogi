import test from 'node:test';
import assert from 'node:assert/strict';
import {paintCollapse,collapseStrikeDuration,collapseAshDuration} from '../dist/collapse-view.js';
function boardView(){
 class Element{
  children=[];dataset={};attributes={};className='';
  classList={add:name=>this.classes.add(name),remove:name=>this.classes.delete(name)};classes=new Set();
  append(el){el.parent=this;this.children.push(el);} remove(){this.parent.children=this.parent.children.filter(el=>el!==this);}
  setAttribute(key,value){this.attributes[key]=value;} getAttribute(key){return this.attributes[key]??null;} removeAttribute(key){delete this.attributes[key];}
 }
 globalThis.document={createElement:()=>new Element()};
 const cells=new Map([4,76].map(i=>{const cell=new Element();cell.setAttribute('aria-label',i+' 空き');return [i,cell];}));
 return {cells,board:{querySelector:selector=>cells.get(Number(selector.match(/\d+/)[0])),querySelectorAll:selector=>selector==='.collapse-marker'?[...cells.values()].flatMap(cell=>cell.children):[...cells.values()].filter(cell=>cell.classes.has('collapse-square'))}};
}
test('直前の破壊を灰・駒名で表示し、再描画・次の着手・陣営反転に対応する',()=>{
 const {board,cells}=boardView(),destroyed={square:4,piece:{type:'K',side:1,prom:false}},original=structuredClone(destroyed);
 paintCollapse(board,destroyed,{perspective:0,phase:'breaking'});
 assert.ok(cells.get(4).children.some(el=>el.className.includes('collapse-lightning')));
 assert.ok(cells.get(4).children.some(el=>el.className.includes('enemy')));
 paintCollapse(board,destroyed,{perspective:1,phase:'waiting'});
 assert.ok(!cells.get(4).children.some(el=>el.className.includes('enemy')));
 paintCollapse(board,destroyed);paintCollapse(board,destroyed);
 assert.equal(cells.get(4).children.length,2,'灰と駒名のみ残り、重複しない');
 assert.equal(cells.get(4).children[1].textContent,'玉の灰');
 assert.equal(cells.get(4).getAttribute('aria-label'),'4 空き（直前の崩壊で玉が消滅）');
 assert.deepEqual(destroyed,original,'対局データを変更しない');
 paintCollapse(board,{square:76,piece:{type:'P',side:0}});
 assert.equal(cells.get(4).children.length,0);assert.equal(cells.get(4).getAttribute('aria-label'),'4 空き');
 assert.equal(cells.get(76).children[1].textContent,'歩の灰');
 paintCollapse(board,null);assert.equal(cells.get(76).children.length,0);assert.equal(cells.get(76).getAttribute('aria-label'),'76 空き');
});

test('灰は破壊から1.7秒で消え、定期更新・再描画で復活しない',t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
 const {board,cells}=boardView(),destroyed={square:4,piece:{type:'G',side:1}};
 const paint=phase=>paintCollapse(board,structuredClone(destroyed),{phase,eventKey:150});
 paint('waiting');t.mock.timers.tick(3000);
 assert.equal(cells.get(4).children.length,1,'開始前の警告中は消さない');
 assert.equal(collapseStrikeDuration,1200);assert.equal(collapseAshDuration,500);
 paint('breaking');assert.ok(!cells.get(4).children.some(el=>el.className.includes('collapse-ash')),'雷の途中には灰を重ねない');
 t.mock.timers.tick(collapseStrikeDuration);paint('ash');
 t.mock.timers.tick(collapseAshDuration-1);paint('ash');
 assert.equal(cells.get(4).children.length,2,'破壊から1699msでは灰が残る');
 t.mock.timers.tick(1);
 assert.equal(cells.get(4).children.length,0,'破壊から1700msで自動消去');
 assert.equal(cells.get(4).getAttribute('aria-label'),'4 空き');
 assert.ok(!cells.get(4).classes.has('collapse-square'),'枠も消去');
 paint('ash');t.mock.timers.tick(500);paint('ash');
 assert.equal(cells.get(4).children.length,0,'同じ着手の再受信では復活しない');
 paintCollapse(board,destroyed,{phase:'breaking',eventKey:151});
 assert.ok(cells.get(4).children.length>0,'次の破壊は新しく表示する');
 t.mock.timers.tick(1700);assert.equal(cells.get(4).children.length,0);
});
