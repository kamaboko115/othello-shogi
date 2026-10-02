import test from 'node:test';
import assert from 'node:assert/strict';
import {initBoardPreview,shareInvitation,recordPage,initRecordViewer} from '../dist/lobby-tools.js';

function documentUI(){
 const elements=new Map(),listeners={};
 const document={getElementById(id){if(!elements.has(id))elements.set(id,{value:'green',dataset:{},attributes:{},events:{},children:[],hidden:false,open:false,addEventListener(name,fn){this.events[name]=fn;},setAttribute(key,value){this.attributes[key]=value;},replaceChildren(...children){this.children=children;},showModal(){this.open=true;},close(){this.open=false;}});return elements.get(id);},defaultView:{addEventListener:(name,fn)=>listeners[name]=fn}};
 return {document,$:id=>document.getElementById(id),listeners};
}

test('board preview follows either theme and storage changes without touching the position',()=>{
 const {document,$,listeners}=documentUI();initBoardPreview(document);
 assert.equal($('boardThemePreview').dataset.theme,'green');assert.equal($('boardThemePreviewName').textContent,'深緑の表示例');
 $('boardTheme').value='wood';$('boardTheme').events.change();
 assert.equal($('boardThemePreview').dataset.theme,'wood');assert.equal($('boardThemePreview').attributes['aria-label'],'木目の将棋盤プレビュー');
 $('boardTheme').value='green';listeners.storage({key:'hanten-board-theme-v2'});
 assert.equal($('boardThemePreview').dataset.theme,'green');
});

test('native sharing submits only the supplied invitation link; cancellation never copies it',async()=>{
 const url='https://oshogi-games.pages.dev/#room=room&invite=invite',sent=[];
 assert.equal(await shareInvitation(url,{navigator:{share:async data=>sent.push(data)}}),'shared');
 assert.deepEqual(sent,[{title:'オセロ将棋に招待',text:'オセロ将棋で対局しよう！',url}]);
 const cancelled={share:async()=>{throw Object.assign(Error(),{name:'AbortError'});},clipboard:{writeText:()=>assert.fail('a cancelled share must not copy')}};
 assert.equal(await shareInvitation(url,{navigator:cancelled}),'cancelled');
});

test('unsupported sharing falls back to copying and denied clipboard use falls back to selecting',async()=>{
 const copied=[],clipboard={writeText:async value=>copied.push(value)};
 assert.equal(await shareInvitation('invitation',{navigator:{clipboard}}),'copied');
 assert.equal(await shareInvitation('invitation',{navigator:{share:async()=>{throw Error('unsupported');},clipboard}}),'copied');
 assert.deepEqual(copied,['invitation','invitation']);
 assert.equal(await shareInvitation('invitation',{navigator:{}}),'select');
});

test('every move remains reachable beyond twelve moves, in bounded pages with no omissions',()=>{
 for(const length of [0,1,12,13,50,51,150,1001]){
  const logs=Array.from({length},(_,i)=>`${i+1}. ●歩`),last=recordPage(logs,Infinity),all=[];
  for(let page=0;page<last.pages;page++){const data=recordPage(logs,page);assert.ok(data.lines.length<=50);all.push(...data.lines);}
  assert.deepEqual(all,logs);assert.equal(recordPage(logs,-99).page,0);assert.equal(recordPage(logs,9999).page,last.page);
 }
});

test('record dialog browses the first and latest pages, refreshes after undo, and resets for another game',()=>{
 const {document,$}=documentUI(),viewer=initRecordViewer(document,text=>({text})),logs=Array.from({length:121},(_,i)=>`${i+1}. 手`);
 viewer.update(logs,'game1');assert.equal($('openRecord').hidden,false);$('openRecord').events.click();
 assert.equal($('recordDialog').open,true);assert.equal($('recordList').children[0].text,'101. 手');assert.equal($('recordRange').textContent,'全121手 · 101〜121手');
 $('recordFirst').events.click();assert.equal($('recordList').children[0].text,'1. 手');assert.equal($('recordPrevious').disabled,true);
 $('recordNext').events.click();assert.equal($('recordList').children[0].text,'51. 手');
 $('recordLast').events.click();viewer.update(logs.slice(0,25),'game1');assert.equal($('recordList').children.length,25);assert.equal($('recordRange').textContent,'全25手 · 1〜25手');
 viewer.update([],'game2');assert.equal($('recordDialog').open,false);assert.equal($('openRecord').hidden,true);
});
