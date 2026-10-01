// Keep diagnostics aggregate-only: never retain room IDs, tokens, moves or URLs.
export function createRoomTransport({fetchImpl=globalThis.fetch,onClock=()=>{}}={}){
 const empty=()=>({requests:0,reads:0,writes:0,unchanged:0,errors:0,aborted:0,responseBytes:0});
 let stats=empty();
 async function request(path,token,body,{version,signal}={}){
  const counters=stats;
  const write=body!==undefined;
  let url='/api/rooms'+path;
  if(!write&&Number.isSafeInteger(version)&&version>=0)url+=(url.includes('?')?'&':'?')+'version='+version;
  counters.requests++;counters[write?'writes':'reads']++;
  try{
   const timeout=AbortSignal.timeout(12000),requestSignal=signal?AbortSignal.any([signal,timeout]):timeout;
   const response=await fetchImpl(url,{method:write?'POST':'GET',headers:{Authorization:'Bearer '+token,...(write?{'Content-Type':'application/json'}:{})},body:write?JSON.stringify(body):undefined,cache:'no-store',signal:requestSignal});
   if(response.status===304){
    counters.unchanged++;
    const now=Number(response.headers.get('X-Room-Server-Now'));
    if(Number.isFinite(now)&&now>0)onClock(now);
    return null;
   }
   const text=await response.text();counters.responseBytes+=new TextEncoder().encode(text).byteLength;
   let data;try{data=JSON.parse(text);}catch{throw Object.assign(new Error('通信処理に失敗しました。少し待って再接続してください。'),{status:response.status});}
   if(!response.ok)throw Object.assign(new Error(data.error||'通信に失敗しました。'),{status:response.status});
   if(Number.isFinite(data.serverNow))onClock(data.serverNow);
   return data;
  }catch(error){if(error.name==='AbortError'){counters.aborted++;}else{counters.errors++;}throw error;}
 }
 return {request,getStats:()=>Object.freeze({...stats}),resetStats(){stats=empty();}};
}

// Keep polling after a result so draw/undo/rematch offers and room closure arrive.
// Hidden friend games still check every ten seconds and refresh on visibility.
export function pollDelay({joined,turn,side,hidden=false,connected=true,closed=false,result=false,errors=0,random=Math.random}={}){
 if(closed)return null;
 if(!connected||errors>0){const base=Math.min(30000,5000*2**Math.min(3,Math.max(0,errors-1)));return Math.round(Math.min(30000,base*(0.9+0.2*random())));}
 if(hidden)return 10000;
 return joined&&!result&&turn===side?8000:2000;
}

// Optional timer owner for callers without their own lifecycle. Concurrent
// refreshes share the same read; stop aborts it and prevents stale delivery.
export function createRoomPoller({read,getState,onData=()=>{},onError=()=>{},getDelay=(state,delay)=>delay,setTimer=setTimeout,clearTimer=clearTimeout,random=Math.random}){
 let active=false,timer=null,pending=null,controller=null,epoch=0,errors=0;
 function cancelTimer(){if(timer!==null)clearTimer(timer);timer=null;}
 function schedule(){cancelTimer();if(!active)return;const state={...getState(),errors},computed=pollDelay({...state,random}),delay=computed===null?null:getDelay(state,computed);if(delay!==null)timer=setTimer(()=>{timer=null;void refresh();},delay);}
 function refresh(){
  cancelTimer();if(!active)return Promise.resolve(null);if(pending)return pending;
  const generation=epoch,abort=new AbortController();controller=abort;
  const job=(async()=>{
   // Defer once so pending is assigned even when a supplied read throws.
   await Promise.resolve();
   try{const data=await read({signal:abort.signal});if(active&&generation===epoch){errors=0;await onData(data);}return data;}
   catch(error){if(active&&generation===epoch&&error.name!=='AbortError'){errors++;await onError(error);}return null;}
   finally{if(generation===epoch){pending=null;controller=null;schedule();}}
  })();pending=job;return job;
 }
 function stop(){active=false;epoch++;cancelTimer();controller?.abort();controller=null;pending=null;errors=0;}
 return {start({immediate=true}={}){if(active)return pending||Promise.resolve(null);active=true;if(immediate)return refresh();schedule();return Promise.resolve(null);},refresh,stop};
}
