import test from 'node:test';
import assert from 'node:assert/strict';
import {paintCollapse} from '../dist/collapse-view.js';
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
