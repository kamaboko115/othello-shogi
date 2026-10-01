export const winAdKey='othello-shogi-win-ads-v1';
const localHost=host=>['localhost','127.0.0.1','::1','[::1]'].includes(host);

// Wins are counted on this browser. Repeated polls, renders and restored games
// must not count the same round twice. No server request is needed.
export function createWinAdCounter({storage=()=>globalThis.localStorage,key=winAdKey}={}){
 let memory={wins:0,pending:0,rounds:[]};
 function read(){try{const saved=JSON.parse((typeof storage==='function'?storage():storage).getItem(key));if(saved&&Number.isSafeInteger(saved.wins)&&saved.wins>=0&&Number.isSafeInteger(saved.pending)&&saved.pending>=0&&Array.isArray(saved.rounds))memory=saved;}catch{}return memory;}
 function save(value){memory=value;try{(typeof storage==='function'?storage():storage).setItem(key,JSON.stringify(value));}catch{}}
 return {
  record({room,round=1,side,state,joined=true}){
   if(!joined||!room||![0,1].includes(side)||!state?.result)return false;
   const winner=state.result.startsWith('先手の勝ち')?0:state.result.startsWith('後手の勝ち')?1:null;
   if(winner!==side)return false;
   const value=read(),id=room+':'+round;if(value.rounds.includes(id))return false;
   value.rounds.push(id);value.wins++;
   if(value.wins%2===0)value.pending++;
   save(value);return true;
  },
  due:()=>read().pending>0,
  consume(){const value=read();if(value.pending>0){value.pending--;save(value);}},
  stats(){const value=read();return {wins:value.wins,pending:value.pending};}
 };
}

export function showTestInterstitial({document=globalThis.document,seconds=5,now=Date.now,setTimer=setInterval,clearTimer=clearInterval}={}){
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='interstitial-test';
  dialog.setAttribute('aria-label','テスト広告');
  const label=document.createElement('p');label.textContent='ADVERTISEMENT · テスト広告';
  const title=document.createElement('h2');title.textContent='広告の表示イメージ';
  const description=document.createElement('p');description.textContent='実際の広告は配信していません。';
  const close=document.createElement('button');close.type='button';close.disabled=true;
  dialog.append(label,title,description,close);document.body.append(dialog);
  const until=now()+seconds*1000;
  const tick=()=>{const remaining=Math.max(0,Math.ceil((until-now())/1000));close.disabled=remaining>0;close.textContent=remaining?remaining+'秒後に閉じられます':'閉じる';};
  tick();const timer=setTimer(tick,100);
  dialog.addEventListener('cancel',event=>{if(close.disabled)event.preventDefault();});
  dialog.addEventListener('close',()=>{clearTimer(timer);dialog.remove();resolve({shown:true});},{once:true});
  close.onclick=()=>dialog.close();dialog.showModal();
 });
}

// Production skips gracefully until a real ad provider is configured. Tests
// and the local preview use the same match-count policy, without ad downloads.
export function createWinAdBreak({counter=createWinAdCounter(),document=globalThis.document,hostname=globalThis.location?.hostname,showAd}={}){
 let task=null;
 return {
  counter,
  betweenMatches(){
   if(task)return task;
   if(!counter.due())return Promise.resolve({shown:false});
   task=(async()=>{
    try{return await (showAd?showAd():localHost(hostname)?showTestInterstitial({document}):{shown:false,reason:'not-configured'});}
    catch{return {shown:false,reason:'failed'};}
    finally{counter.consume();task=null;}
   })();
   return task;
  }
 };
}
