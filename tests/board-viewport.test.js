import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf("let boardViewportKey="),source.indexOf('function paintUndoButton('));
function fixture(mobile=true){
 const frames=[],scrolls=[];
 const context=vm.createContext({online:null,compactGameViewport:{matches:mobile},requestAnimationFrame:fn=>frames.push(fn),window:{scrollTo:options=>scrolls.push({...options})}});
 vm.runInContext(helpers,context);
 return {context,scrolls,render(online){context.online=online;vm.runInContext('syncBoardViewport()',context);},flush(){while(frames.length)frames.shift()();}};
}
test('mobile enters each room and rematch at the board top without moving on routine updates',()=>{
 const f=fixture();f.render(null);f.flush();assert.equal(f.scrolls.length,0);
 f.render({room:'ai',round:1});f.flush();
 assert.deepEqual(f.scrolls,[{left:0,top:0,behavior:'instant'}]);
 f.render({room:'ai',round:1,ply:1});f.flush();assert.equal(f.scrolls.length,1);
 f.render({room:'ai',round:2});f.flush();assert.equal(f.scrolls.length,2);
 f.render({room:'friend',round:1});f.flush();assert.equal(f.scrolls.length,3);
 f.render(null);f.render({room:'friend',round:1});f.flush();assert.equal(f.scrolls.length,4);
});
test('desktop and obsolete queued navigation leave the viewport alone',()=>{
 const desktop=fixture(false);desktop.render({room:'ai',round:1});desktop.flush();assert.equal(desktop.scrolls.length,0);
 const f=fixture();f.render({room:'ai',round:1});f.render(null);f.flush();assert.equal(f.scrolls.length,0);
 f.render({room:'ai',round:1});f.context.compactGameViewport.matches=false;f.flush();assert.equal(f.scrolls.length,0);
});
test('closing the toss can restore the board after its overlay was shown',()=>{
 const f=fixture();f.render({room:'ai',round:1});f.flush();
 vm.runInContext('scrollBoardToTop()',f.context);f.flush();assert.equal(f.scrolls.length,2);
});
