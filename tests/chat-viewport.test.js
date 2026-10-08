import test from 'node:test';
import assert from 'node:assert/strict';
import {initChatViewport} from '../dist/room-chat.js';

function fixture(mobile=true){
 const classes=()=>{const values=new Set();return {add:x=>values.add(x),remove:x=>values.delete(x),contains:x=>values.has(x)};};
 const properties=new Map(),root={classList:classes(),style:{setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k)}};
 const media=Object.assign(new EventTarget(),{matches:mobile});
 const view=Object.assign(new EventTarget(),{height:844,offsetTop:0});
 const doc={documentElement:root,activeElement:null,querySelector:()=>({getBoundingClientRect:()=>({width:340})})};
 const win={visualViewport:view,innerHeight:844,scrollX:0,scrollY:120,matchMedia:()=>media,scrollTo:options=>{win.restored=options;},requestAnimationFrame:fn=>fn()};
 const input=Object.assign(new EventTarget(),{readOnly:false,focus(options){this.options=options;doc.activeElement=this;this.dispatchEvent(new Event('focus'));}});
 const form=Object.assign(new EventTarget(),{classList:classes(),contains:node=>node===input});
 return {root,properties,media,view,doc,win,input,form,viewport:initChatViewport(form,input,win,doc)};
}
test('mobile composer pins the current board and follows keyboard resize without scrolling on focus',()=>{
 const f=fixture();f.viewport.focus();
 assert.deepEqual(f.input.options,{preventScroll:true});
 assert.equal(f.root.classList.contains('chat-composing'),true);
 assert.equal(f.properties.get('--chat-scroll-top'),'-120px');
 assert.equal(f.properties.get('--chat-board-width'),'340px');
 f.view.height=480;f.view.offsetTop=20;f.view.dispatchEvent(new Event('resize'));
 assert.equal(f.properties.get('--chat-keyboard-inset'),'344px');
 assert.equal(f.properties.get('--chat-viewport-top'),'20px');
 assert.equal(f.win.restored,undefined);
 f.doc.activeElement=null;f.form.dispatchEvent(new Event('focusout'));
 assert.equal(f.root.classList.contains('chat-composing'),false);
 assert.equal(f.properties.size,0);
 assert.deepEqual(f.win.restored,{left:0,top:120,behavior:'instant'});
});
test('desktop and consent-only inputs do not lock the page; rotating out of mobile releases it',()=>{
 const desktop=fixture(false);desktop.viewport.focus();assert.equal(desktop.properties.size,0);
 const f=fixture();f.input.readOnly=true;f.viewport.focus();assert.equal(f.properties.size,0);
 f.input.readOnly=false;f.viewport.focus();
 f.media.matches=false;f.media.dispatchEvent(new Event('change'));
 assert.equal(f.root.classList.contains('chat-composing'),false);
 assert.equal(f.form.classList.contains('chat-composer-floating'),false);
});
