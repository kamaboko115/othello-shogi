import {securityHeaders} from './security.js';

// Broad IP budget accommodates shared networks; the participant budget isolates
// each player's writes so one player cannot spend the opponent's action budget.
// Keep these settings aligned with the native bindings in wrangler.jsonc.
export const apiRequestLimit=600;
export const roomActionLimit=60;
export const apiRatePeriodSeconds=60;

function apiLimitResponse(status){
 return Response.json({error:status===429?'操作や通信が多すぎます。1分ほど待ってから再度お試しください。':'対戦サーバーの制限設定を確認しています。しばらく待ってから再接続してください。'},
  {status,headers:{...securityHeaders,'Cache-Control':'no-store','Retry-After':String(apiRatePeriodSeconds)}});
}
async function checkApiRateBinding(binding,key){
 try{
  const result=await binding.limit({key});
  if(result?.success===true)return null;
  return apiLimitResponse(result?.success===false?429:503);
 }catch{return apiLimitResponse(503);}
}

// Call before any D1 access, including anonymous count reads and bad room IDs.
// The entrypoint must provide CF-Connecting-IP or the local socket IP, never
// X-Forwarded-For or another caller-controlled forwarding header.
export async function limitApiIP(env,{clientIP,required=false}={}){
 const binding=env.API_REQUEST_BURST;
 if(!binding)return required?apiLimitResponse(503):null;
 if(typeof clientIP!=='string'||!clientIP)return apiLimitResponse(503);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(clientIP));
 const ipHash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
 return checkApiRateBinding(binding,'ip:'+ipHash);
}

// Call only after the token is authorized for the room and before any action
// mutates it. Do not use room ID alone: that lets one player block the other.
export async function limitRoomActions(env,{tokenHash,required=false}={}){
 const binding=env.ROOM_ACTION_BURST;
 if(!binding)return required?apiLimitResponse(503):null;
 if(typeof tokenHash!=='string'||!/^[a-f0-9]{64}$/.test(tokenHash))return apiLimitResponse(503);
 return checkApiRateBinding(binding,'participant:'+tokenHash);
}

// Development-only equivalents. Production uses Cloudflare native counters,
// not D1 reads/writes and not an isolate-local Map.
export function localApiRateLimits({now=Date.now}={}){
 const create=limit=>{
  const counters=new Map();
  return {async limit({key}){
   const at=now();
   for(const [id,counter] of counters)if(counter.expires<=at)counters.delete(id);
   let counter=counters.get(key);
   if(!counter){counter={count:0,expires:at+apiRatePeriodSeconds*1000};counters.set(key,counter);}
   if(counter.count>=limit)return {success:false};
   counter.count++;return {success:true};
  }};
 };
 return {API_REQUEST_BURST:create(apiRequestLimit),ROOM_ACTION_BURST:create(roomActionLimit)};
}
