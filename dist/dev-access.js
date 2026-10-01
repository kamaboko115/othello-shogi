export function isLocalDevHost(location){return ['localhost','127.0.0.1','::1','[::1]'].includes(location?.hostname?.toLowerCase());}

// Unlock only this page's controls. Never store the entered secret or perform
// background authorization requests during a game.
export function createDevAccess({document,location=globalThis.location,fetch=globalThis.fetch}={}){
 const get=id=>document.getElementById(id),dialog=get('devAccessDialog'),form=get('devAccessForm');
 const password=get('devAccessPassword'),error=get('devAccessError'),submit=get('devAccessSubmit');
 let unlocked=isLocalDevHost(location),pending=null,resolvePending=null,abort=null;
 const finish=result=>{
  abort?.abort();abort=null;password.value='';submit.disabled=false;
  const resolve=resolvePending;resolvePending=null;pending=null;
  if(dialog.open)dialog.close();resolve?.(result);
 };
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(submit.disabled||!pending)return;
  const entered=password.value;password.value='';error.textContent='';
  if(!entered){error.textContent='パスワードを入力してください。';password.focus();return;}
  const active=resolvePending,controller=new AbortController();abort=controller;submit.disabled=true;
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch('/api/dev-access',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:entered}),signal:abort.signal});
   if(active!==resolvePending)return;
   if(response.ok){const result=await response.json();if(active!==resolvePending)return;if(result.ok===true){unlocked=true;finish(true);return;}}
   error.textContent=({401:'パスワードが違います。',429:'試行回数が多すぎます。1分ほど待ってください。',503:'公開版の開発者ツールは有効になっていません。'})[response.status]||'開発者ツールを開けませんでした。';
  }catch{
   if(active!==resolvePending)return;
   error.textContent='確認できませんでした。通信状態を確認して再度お試しください。';
  }finally{clearTimeout(timeout);}
  if(active===resolvePending){submit.disabled=false;password.focus();}
 });
 get('devAccessCancel').addEventListener('click',()=>finish(false));
 dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
 dialog.addEventListener('close',()=>{if(pending)finish(false);});
 const requestAccess=()=>{
  if(unlocked)return Promise.resolve(true);
  if(pending)return pending;
  pending=new Promise(resolve=>{resolvePending=resolve;});
  error.textContent='';password.value='';submit.disabled=false;dialog.showModal();password.focus();
  return pending;
 };
 const guardDeveloperTools=()=>{
  const details=get('developerTools'),summary=details.querySelector('summary');
  summary.addEventListener('click',async event=>{
   if(details.open||unlocked)return;
   event.preventDefault();if(await requestAccess())details.open=true;
  });
 };
 return {requestAccess,guardDeveloperTools};
}
