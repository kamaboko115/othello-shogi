import test from 'node:test';
import assert from 'node:assert/strict';
import {createDevAccess,isLocalDevHost} from '../dist/dev-access.js';

const password='kamaboko';

class Element{
 constructor(){this.listeners=new Map();this.value='';this.textContent='';this.disabled=false;this.open=false;this.focused=false;}
 addEventListener(name,handler){const handlers=this.listeners.get(name)||[];handlers.push(handler);this.listeners.set(name,handlers);}
 async emit(name){const event={prevented:false,preventDefault(){this.prevented=true;}};for(const handler of this.listeners.get(name)||[])await handler(event);return event;}
 showModal(){this.open=true;}
 close(){this.open=false;for(const handler of this.listeners.get('close')||[])handler({});}
 focus(){this.focused=true;}
 querySelector(name){assert.equal(name,'summary');return this.summary;}
}
function ui(hostname='public.example'){
 const ids=['devAccessDialog','devAccessForm','devAccessPassword','devAccessError','devAccessSubmit','devAccessCancel','developerTools'];
 const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));elements.developerTools.summary=new Element();
 const access=createDevAccess({document:{getElementById:id=>elements[id]},location:{hostname}});
 return {...elements,access};
}
test('local developer controls open without authentication or network; public lookalikes require it',async()=>{
 for(const hostname of ['localhost','127.0.0.1','::1','[::1]']){
  const view=ui(hostname);assert.equal(await view.access.requestAccess(),true);assert.equal(view.devAccessDialog.open,false);
 }
 for(const hostname of ['localhost.example','127.0.0.1.example','public.example'])assert.equal(isLocalDevHost({hostname}),false);
});
test('public developer tools require the UI password once per page without any requests',async context=>{
 context.mock.method(globalThis,'fetch',()=>assert.fail('The UI lock must not use the network'));
 const view=ui();view.access.guardDeveloperTools();
 const opening=view.developerTools.summary.emit('click');
 assert.equal(view.developerTools.open,false);assert.equal(view.devAccessDialog.open,true);assert.equal(view.devAccessPassword.focused,true);
 view.devAccessPassword.value=password;await view.devAccessForm.emit('submit');
 assert.equal((await opening).prevented,true);assert.equal(view.developerTools.open,true);assert.equal(view.devAccessDialog.open,false);assert.equal(view.devAccessPassword.value,'');
 assert.equal(await view.access.requestAccess(),true);assert.equal(globalThis.fetch.mock.callCount(),0);
 assert.equal((await view.developerTools.summary.emit('click')).prevented,false);
});
test('empty and wrong input keep tools locked; a correct retry unlocks without preserving input',async()=>{
 const view=ui(),opening=view.access.requestAccess();assert.equal(view.access.requestAccess(),opening);
 await view.devAccessForm.emit('submit');assert.match(view.devAccessError.textContent,/入力してください/);
 view.devAccessPassword.value='wrong';await view.devAccessForm.emit('submit');assert.match(view.devAccessError.textContent,/違います/);assert.equal(view.developerTools.open,false);assert.equal(view.devAccessDialog.open,true);assert.equal(view.devAccessPassword.value,'');
 view.devAccessPassword.value=password;await view.devAccessForm.emit('submit');assert.equal(await opening,true);assert.equal(view.devAccessDialog.open,false);assert.equal(view.devAccessPassword.value,'');
});
test('cancel, Escape and closing leave public tools locked and clear the input',async()=>{
 for(const cancel of [view=>view.devAccessCancel.emit('click'),view=>view.devAccessDialog.emit('cancel'),view=>view.devAccessDialog.close()]){
  const view=ui(),opening=view.access.requestAccess();view.devAccessPassword.value=password;await cancel(view);
  assert.equal(await opening,false);assert.equal(view.devAccessPassword.value,'');assert.equal(view.devAccessDialog.open,false);
  const reopening=view.access.requestAccess();assert.equal(view.devAccessDialog.open,true);await view.devAccessCancel.emit('click');assert.equal(await reopening,false);
 }
});
test('recreating the page requires the public password again',async()=>{
 const view=ui(),opening=view.access.requestAccess();view.devAccessPassword.value=password;await view.devAccessForm.emit('submit');assert.equal(await opening,true);
 const reloaded=ui(),next=reloaded.access.requestAccess();assert.equal(reloaded.devAccessDialog.open,true);await reloaded.devAccessCancel.emit('click');assert.equal(await next,false);
});
