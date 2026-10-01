import test from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../worker/api.js';
import {createDevAccess,isLocalDevHost} from '../dist/dev-access.js';

const secret='test-only-developer-password';
const request=(body={password:secret},options={})=>new Request('https://public.example/api/dev-access',{method:'POST',headers:{Origin:'https://public.example','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...options.headers},body:typeof body==='string'?body:JSON.stringify(body),...options});
test('public API verifies the server secret without a room token or database and never echoes it',async()=>{
 const DB={prepare(){throw new Error('Developer access must not use the room database');}};
 const success=await api(request(),{DB,DEVTOOLS_PASSWORD:secret});
 assert.equal(success.status,200);assert.deepEqual(await success.json(),{ok:true});assert.equal(success.headers.get('Cache-Control'),'no-store');
 const missing=await api(request(),{});assert.equal(missing.status,503);assert.doesNotMatch(await missing.text(),new RegExp(secret));
 const wrong=await api(request({password:'wrong'}),{DEVTOOLS_PASSWORD:secret});assert.equal(wrong.status,401);assert.doesNotMatch(await wrong.text(),new RegExp(secret));
 const sameLengthWrong=await api(request({password:secret.slice(0,-1)+'x'}),{DEVTOOLS_PASSWORD:secret});assert.equal(sameLengthWrong.status,401);
});
test('public API rejects cross-origin, method, malformed and oversized input before verification',async()=>{
 const env={DEVTOOLS_PASSWORD:secret};
 assert.equal((await api(new Request('https://public.example/api/dev-access'),env)).status,405);
 assert.equal((await api(request({}, {headers:{Origin:'https://other.example','Content-Type':'application/json'}}),env)).status,403);
 assert.equal((await api(request({}, {headers:{'Content-Type':'application/json'}}),env)).status,403);
 assert.equal((await api(request({}, {headers:{Origin:'https://public.example','Content-Type':'text/plain'}}),env)).status,415);
 for(const body of ['{',[],null,{password:''},{password:42},{password:'x'.repeat(257)}])assert.equal((await api(request(body),env)).status,400);
 assert.equal((await api(request('あ'.repeat(1500)),env)).status,413);
 assert.equal((await api(request({}, {headers:{Origin:'https://public.example','Content-Type':'application/json','Content-Length':'4097'}}),env)).status,413);
});
test('repetitive failed attempts are limited per worker/IP without affecting other clients',async()=>{
 const env={DEVTOOLS_PASSWORD:secret},headers={Origin:'https://public.example','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.65'};
 for(let i=0;i<10;i++)assert.equal((await api(request({password:'incorrect'},{headers}),env)).status,401);
 assert.equal((await api(request({password:secret},{headers}),env)).status,429);
 assert.equal((await api(request({password:secret},{headers:{...headers,'CF-Connecting-IP':'192.0.2.66'}}),env)).status,200);
});

class Element{
 constructor(){this.listeners=new Map();this.value='';this.textContent='';this.disabled=false;this.open=false;this.focused=false;}
 addEventListener(name,handler){const handlers=this.listeners.get(name)||[];handlers.push(handler);this.listeners.set(name,handlers);}
 async emit(name){const event={prevented:false,preventDefault(){this.prevented=true;}};for(const handler of this.listeners.get(name)||[])await handler(event);return event;}
 showModal(){this.open=true;}
 close(){this.open=false;for(const handler of this.listeners.get('close')||[])handler({});}
 focus(){this.focused=true;}
 querySelector(name){assert.equal(name,'summary');return this.summary;}
}
function ui(hostname='public.example',fetch=async()=>Response.json({ok:true})){
 const ids=['devAccessDialog','devAccessForm','devAccessPassword','devAccessError','devAccessSubmit','devAccessCancel','developerTools'];
 const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));elements.developerTools.summary=new Element();
 const access=createDevAccess({document:{getElementById:id=>elements[id]},location:{hostname},fetch});
 return {...elements,access};
}
test('local developer controls open without authentication or network; public lookalikes require it',async()=>{
 for(const hostname of ['localhost','127.0.0.1','::1','[::1]']){
  const view=ui(hostname,()=>assert.fail('Local tools must not fetch'));assert.equal(await view.access.requestAccess(),true);assert.equal(view.devAccessDialog.open,false);
 }
 for(const hostname of ['localhost.example','127.0.0.1.example','public.example'])assert.equal(isLocalDevHost({hostname}),false);
});
test('public developer tools prompt once per page; no requests occur before submitting',async()=>{
 const calls=[],view=ui('public.example',async(...args)=>{calls.push(args);return Response.json({ok:true});});view.access.guardDeveloperTools();
 assert.equal(calls.length,0);
 const opening=view.developerTools.summary.emit('click');
 assert.equal(view.developerTools.open,false);assert.equal(view.devAccessDialog.open,true);assert.equal(view.devAccessPassword.focused,true);assert.equal(calls.length,0);
 view.devAccessPassword.value=secret;await view.devAccessForm.emit('submit');
 assert.equal((await opening).prevented,true);assert.equal(view.developerTools.open,true);assert.equal(view.devAccessDialog.open,false);assert.equal(view.devAccessPassword.value,'');
 assert.equal(calls.length,1);const [url,options]=calls[0];assert.equal(url,'/api/dev-access');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');assert.deepEqual(JSON.parse(options.body),{password:secret});
 assert.equal(await view.access.requestAccess(),true);assert.equal(calls.length,1);
 assert.equal((await view.developerTools.summary.emit('click')).prevented,false);
});
test('wrong password, unset secret and network errors keep tools locked and allow cancellation',async()=>{
 for(const [fetch,message] of [[async()=>Response.json({}, {status:401}),'パスワードが違います'],[async()=>Response.json({}, {status:503}),'有効になっていません'],[async()=>{throw new Error('offline');},'通信状態']]){
  const view=ui('public.example',fetch),opening=view.access.requestAccess();assert.equal(view.access.requestAccess(),opening);
  view.devAccessPassword.value=secret;await view.devAccessForm.emit('submit');assert.match(view.devAccessError.textContent,new RegExp(message));assert.equal(view.devAccessSubmit.disabled,false);assert.equal(view.devAccessPassword.value,'');
  await view.devAccessCancel.emit('click');assert.equal(await opening,false);assert.equal(view.devAccessDialog.open,false);
 }
 const view=ui(),opening=view.access.requestAccess();assert.equal((await view.devAccessDialog.emit('cancel')).prevented,true);assert.equal(await opening,false);
});
test('cancelling while the server response or JSON is pending cannot later unlock tools',async()=>{
 for(const afterHeaders of [false,true]){
  let release;
  const delayed=new Promise(resolve=>{release=resolve;});
  const view=ui('public.example',()=>afterHeaders?Promise.resolve({ok:true,json:()=>delayed}):delayed),opening=view.access.requestAccess();
  view.devAccessPassword.value=secret;const submission=view.devAccessForm.emit('submit');await Promise.resolve();
  await view.devAccessCancel.emit('click');assert.equal(await opening,false);
  release(afterHeaders?{ok:true}:Response.json({ok:true}));await submission;
  const reopening=view.access.requestAccess();assert.equal(view.devAccessDialog.open,true);await view.devAccessCancel.emit('click');assert.equal(await reopening,false);
 }
});
