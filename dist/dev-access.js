export function isLocalDevHost(location){return ['localhost','127.0.0.1','::1','[::1]'].includes(location?.hostname?.toLowerCase());}

// A simple UI lock against accidental use, not a secret or security boundary.
// Unlock only this page. The entered value is never saved or sent anywhere.
export function createDevAccess({document,location=globalThis.location}={}){
 const get=id=>document.getElementById(id),dialog=get('devAccessDialog'),form=get('devAccessForm');
 const password=get('devAccessPassword'),error=get('devAccessError'),submit=get('devAccessSubmit');
 let unlocked=isLocalDevHost(location),pending=null,resolvePending=null;
 const finish=result=>{
  password.value='';submit.disabled=false;
  const resolve=resolvePending;resolvePending=null;pending=null;
  if(dialog.open)dialog.close();resolve?.(result);
 };
 form.addEventListener('submit',event=>{
  event.preventDefault();if(submit.disabled||!pending)return;
  const entered=password.value;password.value='';error.textContent='';
  if(!entered){error.textContent='パスワードを入力してください。';password.focus();return;}
  if(entered==='kamaboko'){unlocked=true;finish(true);return;}
  error.textContent='パスワードが違います。';password.focus();
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
