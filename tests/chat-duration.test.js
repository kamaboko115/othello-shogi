import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/room-chat.js',import.meta.url),'utf8');
const receive=source.slice(source.indexOf('  ws.onmessage='),source.indexOf('  ws.onclose='));
for(const seconds of [5,10,15,20])for(const reducedMotion of [false,true])test(`chat stays visible for ${seconds} seconds (reduced motion: ${reducedMotion})`,()=>{
 let now=0,animation=null;const pending=new Map(),lines=[];
 const ws={},timers=new Set();
 const context=vm.createContext({getChatDisplayMs:()=>seconds*1000,ws,socket:ws,current:{seat:0},lane:0,timers,status:{},q:()=>({checked:false}),
  document:{hidden:false,createElement(){const line={style:{},offsetWidth:100,classList:{add(){}},setAttribute(){},animate(frames,options){animation=options;},remove(){lines.splice(lines.indexOf(line),1);}};return line;}},
  messages:{clientWidth:390,append:line=>lines.push(line)},matchMedia:()=>({matches:reducedMotion}),
  setTimeout(fn,ms){const id=pending.size+1;pending.set(id,{fn,at:now+ms});return id;}
 });
 vm.runInContext(receive,context);
 const advance=ms=>{now+=ms;for(const [id,timer] of pending)if(timer.at<=now){pending.delete(id);timer.fn();}};
 ws.onmessage({data:JSON.stringify({type:'message',text:'ゆっくり読めます',seat:1})});
 assert.equal(lines.length,1);assert.equal(lines[0].textContent,'ゆっくり読めます');
 if(!reducedMotion)assert.equal(animation.duration,seconds*1000);
 advance(3000);assert.equal(lines.length,1);
 advance(seconds*1000-3001);assert.equal(lines.length,1);
 advance(1);assert.equal(lines.length,0);assert.equal(timers.size,0);
});

const {initChatDuration}=await import('../dist/room-chat.js');
test('duration preference defaults, persists, restores and rejects unsupported values',()=>{
 let saved=null,onChange;const select={value:'',addEventListener(type,fn){onChange=fn;}};
 const storage={getItem(){return saved;},setItem(key,value){saved=value;}};
 const duration=initChatDuration(select,storage);assert.equal(duration(),10000);assert.equal(select.value,'10');
 for(const seconds of [5,10,15,20]){select.value=String(seconds);onChange();assert.equal(duration(),seconds*1000);assert.equal(initChatDuration(null,storage)(),seconds*1000);}
 saved='999';assert.equal(initChatDuration(null,storage)(),10000);
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
 const fallback=initChatDuration(select,blocked);assert.equal(fallback(),10000);select.value='15';onChange();assert.equal(fallback(),15000);
});
