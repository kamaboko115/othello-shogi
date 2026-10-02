import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/appearance.js',import.meta.url),'utf8');
function browser({theme='light',board='green',url='https://oshogi-games.pages.dev/?theme=dark#room=shared'}={}){
 const values=new Map([['othello-shogi-appearance-v1',JSON.stringify({design:'improved',theme})],['hanten-board-theme-v2',JSON.stringify(board)]]),listeners={},elements={};
 for(const id of ['designMode','uiTheme','boardTheme','pieceSkin'])elements[id]={value:'',events:{},addEventListener(name,callback){this.events[name]=callback;}};
 const root={dataset:{},style:{}},document={readyState:'complete',documentElement:root,body:{classList:{toggle(){}}},querySelector(){return null;},querySelectorAll(){return [];},getElementById:id=>elements[id]};
 const context={document,location:new URL(url),URL,URLSearchParams,localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)},history:{replaceState(){}},addEventListener:(name,callback)=>listeners[name]=callback};
 vm.runInNewContext(source,context);
 return {root,elements,values,listeners,change(id,value){elements[id].value=value;elements[id].events.change();}};
}

test('the same room URL keeps each browser’s own UI and board colors on load and reload',()=>{
 const host=browser({theme:'dark',board:'wood'}),guest=browser({theme:'light',board:'green'});
 assert.equal(host.root.dataset.uiTheme,'dark');assert.equal(host.root.dataset.boardTheme,'wood');
 assert.equal(guest.root.dataset.uiTheme,'light');assert.equal(guest.root.dataset.boardTheme,'green');
 host.change('uiTheme','light');host.change('boardTheme','green');
 assert.equal(guest.root.dataset.uiTheme,'light');assert.equal(guest.root.dataset.boardTheme,'green');
 guest.change('uiTheme','dark');guest.change('boardTheme','wood');
 assert.equal(host.root.dataset.uiTheme,'light');assert.equal(host.root.dataset.boardTheme,'green');
 const reload=browser({theme:JSON.parse(guest.values.get('othello-shogi-appearance-v1')).theme,board:JSON.parse(guest.values.get('hanten-board-theme-v2'))});
 assert.equal(reload.root.dataset.uiTheme,'dark');assert.equal(reload.root.dataset.boardTheme,'wood');
});

test('URL overrides are limited to local comparison previews and expire after choosing a preference',()=>{
 const main=browser({url:'http://127.0.0.1:4174/?theme=dark&design=original'});
 assert.equal(main.root.dataset.uiTheme,'light');assert.equal(main.root.dataset.design,'improved');
 const preview=browser({url:'http://127.0.0.1:4174/hallmark-preview.html?theme=dark&design=original'});
 assert.equal(preview.root.dataset.uiTheme,'dark');assert.equal(preview.root.dataset.design,'original');
 preview.change('uiTheme','light');preview.listeners.storage({key:'othello-shogi-appearance-v1',newValue:'{"theme":"dark","design":"improved"}'});
 assert.equal(preview.root.dataset.uiTheme,'dark');assert.equal(preview.root.dataset.design,'improved');
});

test('preferences sync between a user’s tabs through local storage, including the existing board key',()=>{
 const user=browser();
 user.listeners.storage({key:'othello-shogi-appearance-v1',newValue:'{"theme":"dark","design":"original"}'});
 user.listeners.storage({key:'hanten-board-theme-v2',newValue:'"wood"'});
 assert.equal(user.root.dataset.uiTheme,'dark');assert.equal(user.elements.uiTheme.value,'dark');
 assert.equal(user.root.dataset.boardTheme,'wood');assert.equal(user.elements.boardTheme.value,'wood');
});

test('the Othello piece skin is a separate local preference and syncs without room settings',()=>{
 const host=browser(),guest=browser();host.change('pieceSkin','stones');
 assert.equal(host.root.dataset.pieceSkin,'stones');assert.equal(host.values.get('othello-shogi-piece-skin-v1'),'stones');assert.equal(guest.root.dataset.pieceSkin,'wood');
 guest.listeners.storage({key:'othello-shogi-piece-skin-v1',newValue:'stones'});assert.equal(guest.root.dataset.pieceSkin,'stones');assert.equal(guest.elements.pieceSkin.value,'stones');
 guest.listeners.storage({key:'othello-shogi-piece-skin-v1',newValue:null});assert.equal(guest.root.dataset.pieceSkin,'wood');
});
