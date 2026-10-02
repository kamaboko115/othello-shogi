const localHost=host=>['localhost','127.0.0.1','::1','[::1]'].includes(host);
// Enable a real provider only after AdSense + H5 Games approval and consent setup.
export const rewardProviderEnabled=false;
export function showTestReward({document=globalThis.document,seconds=5,now=Date.now,setTimer=setInterval,clearTimer=clearInterval}={}){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='interstitial-test';dialog.setAttribute('aria-label','報酬型広告のテスト');
  const title=document.createElement('h2');title.textContent='テスト広告';const note=document.createElement('p');note.textContent='5秒の視聴で、次のAI対局のオセショ様が無限になります。実広告は配信していません。';
  const finish=document.createElement('button'),cancel=document.createElement('button');finish.type=cancel.type='button';cancel.textContent='視聴をやめる';dialog.append(title,note,finish,cancel);document.body.append(dialog);
  const until=now()+seconds*1000;let complete=false;const tick=()=>{const remaining=Math.max(0,Math.ceil((until-now())/1000));finish.disabled=remaining>0;finish.textContent=remaining?remaining+'秒後に受け取る':'無限オセショ様を受け取る';};
  tick();const timer=setTimer(tick,100);finish.onclick=()=>{if(now()<until)return;complete=true;dialog.close();};cancel.onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{clearTimer(timer);dialog.remove();resolve({rewarded:complete,reason:complete?'viewed':'dismissed'});},{once:true});dialog.showModal();
 });
}
export function createRewardAds({document=globalThis.document,hostname=globalThis.location?.hostname,provider=rewardProviderEnabled?globalThis.adBreak:null,pause=()=>{},resume=()=>{},showTest=()=>showTestReward({document}),setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let task=null;
 return {watch(){
  if(task)return task;
  task=(async()=>{
   try{
    if(!provider){if(!localHost(hostname))return {rewarded:false,reason:'not-configured'};pause();return await showTest();}
    return await new Promise(resolve=>{
     let viewed=false,done=false;const finish=(reason,completed=false)=>{if(done)return;done=true;clearTimer(timer);const rewarded=viewed&&completed;resolve({rewarded,reason:rewarded?'viewed':reason});};
     let timer=setTimer(()=>finish('timeout'),30000);
     try{provider({type:'reward',name:'unlimited-osesho',beforeReward:show=>{if(done)return;try{show();}catch{finish('failed');}},beforeAd:()=>{if(done)return;pause();clearTimer(timer);timer=setTimer(()=>finish('timeout'),180000);},adViewed:()=>{if(!done)viewed=true;},adDismissed:()=>{viewed=false;},adBreakDone:info=>finish(info?.breakStatus||'no-ad',true)});}catch{finish('failed');}
    });
   }catch{return {rewarded:false,reason:'failed'};}finally{resume();}
  })().finally(()=>{task=null;});return task;
 }};
}
