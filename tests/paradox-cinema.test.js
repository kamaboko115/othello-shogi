import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,applyParadoxEvent,empty,play} from '../dist/engine.js';
globalThis.Audio=class{addEventListener(){}load(){}play(){return Promise.resolve();}};
globalThis.window={addEventListener(){},removeEventListener(){}};
globalThis.matchMedia=()=>({matches:false});
globalThis.getComputedStyle=()=>({fontSize:'32px'});
const {runParadoxEvent}=await import('../dist/paradox-event.js');
function view(){
 const animations=[],cutins=[];
 class Element{
  children=[];style={};dataset={};classes=new Set();clientWidth=450;clientHeight=450;
  classList={add:c=>this.classes.add(c),remove:c=>this.classes.delete(c),toggle:(c,on)=>on?this.classes.add(c):this.classes.delete(c)};
  append(el){el.parent=this;this.children.push(el);if(el.className?.startsWith('paradox-cutin'))cutins.push(el.className);}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
  setAttribute(){}closest(){return null;}
  getBoundingClientRect(){return {left:0,top:0,width:450,height:450};}
  animate(frames,options){const a={frames,options,cancelled:false,cancel(){this.cancelled=true;}};animations.push(a);return a;}
 }
 const board=new Element(),cells=Array.from({length:81},(_,i)=>{const c=new Element();c.dataset.square=i;c.getBoundingClientRect=()=>({left:i%9*50,top:Math.floor(i/9)*50,width:50,height:50});return c;});
 board.querySelectorAll=()=>cells;board.querySelector=()=>new Element();
 globalThis.document={body:new Element(),createElement:()=>new Element()};return {board,animations,cutins};
}
test('all-flip plays centre/top/bottom then 4-second rotations and cleans visual copies',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
 const {board,animations,cutins}=view(),state=initial();applyParadoxEvent(state,'invert',()=>0);const saved=structuredClone(state);
 let done=false;const task=runParadoxEvent(board,state,1).then(()=>done=true);
 assert.ok(board.classes.has('paradox-cinema-hidden'));
 for(let i=0;i<100&&!done;i++){t.mock.timers.tick(100);await Promise.resolve();await Promise.resolve();}
 await task;assert.deepEqual(cutins,['paradox-cutin middle','paradox-cutin upper','paradox-cutin lower']);
 assert.equal(animations.filter(a=>a.options.duration===4000).length,40);assert.ok(animations.every(a=>a.cancelled));
 assert.equal(document.body.children.length,0);assert.equal(board.classes.has('paradox-cinema-hidden'),false);assert.deepEqual(state,saved);
});
test('leaving during a cinematic removes the overlay, restores pieces and cancels animations',async t=>{
 t.mock.timers.enable({apis:['setTimeout'],now:0});const {board,animations}=view(),state=initial(),controller=new AbortController();applyParadoxEvent(state,'invert',()=>0);
 const task=runParadoxEvent(board,state,0,controller.signal);assert.equal(document.body.children.length,1);controller.abort();await task;
 assert.equal(document.body.children.length,0);assert.equal(board.classes.has('paradox-cinema-hidden'),false);assert.ok(animations.every(a=>a.cancelled));
});

test('shuffle highlights only kings after all moves and retains them for 1500ms',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});t.mock.method(performance,'now',()=>Date.now());
 const {board}=view(),state=initial();state.board=state.board.map(p=>p?.type==='K'?p:null);state.board[40]={type:'G',side:0,prom:false};
 applyParadoxEvent(state,'shuffle',n=>Math.floor(n/3));assert.ok(!state.paradoxEvent.skipped);
 let done=false;const task=runParadoxEvent(board,state,0).then(()=>done=true);
 const tokens=document.body.children[0].children[0].children;
 const glowing=()=>tokens.filter(t=>t.classes.has('paradox-shuffle-king'));
 assert.equal(glowing().length,0);
 for(let i=0;i<600&&!glowing().length;i++){t.mock.timers.tick(10);await Promise.resolve();await Promise.resolve();}
 assert.equal(glowing().length,2);assert.ok(glowing().every(t=>t.children[0].textContent==='玉'));
 assert.equal(tokens.filter(t=>t.classes.has('paradox-token-travel')).length,0);
 t.mock.timers.tick(1499);await Promise.resolve();assert.equal(done,false);assert.equal(document.body.children.length,1);
 t.mock.timers.tick(1);await task;assert.equal(done,true);assert.equal(document.body.children.length,0);
});

test('supply presents seven pieces at the mover tray and cleans up',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
 const {board,animations}=view(),state=initial();document.getElementById=()=>({querySelector:()=>board});
 applyParadoxEvent(state,'supply',()=>0);const saved=structuredClone(state);let done=false;
 const task=runParadoxEvent(board,state,0).then(()=>done=true);
 for(let i=0;i<100&&!done;i++){t.mock.timers.tick(100);await Promise.resolve();await Promise.resolve();}
 await task;assert.equal(animations.filter(a=>a.options.duration!==650).length,7);assert.equal(animations.filter(a=>a.options.duration===650).length,1);assert.ok(animations.every(a=>a.cancelled));assert.deepEqual(state,saved);assert.equal(document.body.children.length,0);
});

for(const [kind,count]of [['thunder',1],['extra',3],['annihilate',5],['dragons',4],['wings',4]])test(kind+' plays the configured cut-ins and leaves no overlays or modified authoritative state',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});const {board,animations,cutins}=view(),state=initial();applyParadoxEvent(state,kind,()=>0);const saved=structuredClone(state);let done=false;
 const task=runParadoxEvent(board,state,0).then(()=>done=true);
 for(let i=0;i<160&&!done;i++){t.mock.timers.tick(100);await Promise.resolve();await Promise.resolve();}
 await task;assert.equal(cutins.length,count);assert.deepEqual(state,saved);assert.equal(document.body.children.length,0);assert.ok(animations.every(a=>a.cancelled));
});

test('rebirth explodes the occupant, restores the king visually and cleans up on abort',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
 for(const abort of [false,true]){const {board,animations}=view(),s=empty();s.moveLimit=false;s.board[4]={type:'K',side:1,prom:false,wings:true};s.board[13]={type:'R',side:0,prom:false};s.board[76]={type:'K',side:0,prom:false};const state=play(s,{from:13,to:4,prom:false}),saved=structuredClone(state),controller=new AbortController();let done=false;const task=runParadoxEvent(board,state,0,controller.signal).then(()=>done=true);
 for(let i=0;i<80&&!done;i++){t.mock.timers.tick(100);await Promise.resolve();await Promise.resolve();if(abort&&i===5)controller.abort();}
 await task;assert.deepEqual(state,saved);assert.equal(document.body.children.length,0);assert.equal(board.classes.has('paradox-cinema-hidden'),false);assert.ok(animations.every(a=>a.cancelled));}
});

for(const reduced of [false,true])test(`empty promotion announces then explains the miss (reduced motion: ${reduced})`,async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});t.mock.method(globalThis,'matchMedia',()=>({matches:reduced}));
 const {board,animations}=view(),state=initial();state.board.forEach(p=>{if(p&&'PLNSBR'.includes(p.type))p.prom=true;});
 applyParadoxEvent(state,'promote',()=>0);const saved=structuredClone(state);assert.deepEqual(state.paradoxEvent.squares,[]);
 let done=false;const task=runParadoxEvent(board,state,0).then(()=>done=true);
 const caption=()=>document.body.children[0]?.children.find(el=>el.className?.startsWith('paradox-cinema-title'));
 for(let i=0;i<20&&!caption();i++){t.mock.timers.tick(50);await Promise.resolve();await Promise.resolve();}
 assert.equal(caption().textContent,'盤上の全駒が成る');
 t.mock.timers.tick(799);await Promise.resolve();assert.equal(caption().textContent,'盤上の全駒が成る');
 t.mock.timers.tick(1);await Promise.resolve();await Promise.resolve();
 assert.equal(caption().textContent,'しかし、コマはすでに全てなっていた');assert.equal(caption().classes.has('during'),false);
 for(let i=0;i<40&&!done;i++){t.mock.timers.tick(100);await Promise.resolve();await Promise.resolve();}
 await task;assert.equal(document.body.children.length,0);assert.deepEqual(state,saved);assert.ok(animations.every(a=>a.options.duration===650),'no pieces rotate on a miss');
});

for(const reduced of [false,true])test(`empty thunder announces then shows no lightning (reduced: ${reduced})`,async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});t.mock.method(globalThis,'matchMedia',()=>({matches:reduced}));
 const {board,animations}=view(),state=initial();state.board=state.board.map(p=>p?.type==='K'?p:null);applyParadoxEvent(state,'thunder',()=>0);
 let done=false;const task=runParadoxEvent(board,state,0).then(()=>done=true);
 const caption=()=>document.body.children[0]?.children.find(el=>el.className?.startsWith('paradox-cinema-title'));
 for(let i=0;i<20&&!caption();i++){t.mock.timers.tick(50);await Promise.resolve();await Promise.resolve();}
 assert.equal(caption().textContent,'オセショ様が雷雲を呼ぶ');t.mock.timers.tick(1200);await Promise.resolve();await Promise.resolve();
 assert.equal(caption().textContent,'しかし雷は落ちなかった');assert.equal(caption().classes.has('during'),false);
 for(let i=0;i<40&&!done;i++){t.mock.timers.tick(100);await Promise.resolve();await Promise.resolve();}
 await task;assert.equal(document.body.children.length,0);assert.ok(animations.every(a=>a.options.duration===650));
});
