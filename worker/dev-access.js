const devAccessAttempts=new Map();
const devAccessWindowMs=60000,devAccessMaxAttempts=10;
const devAccessJson=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const devAccessDigest=async text=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));

// This gate prevents accidental use of development controls. Client-side game
// code remains public; this is not authorization for privileged game actions.
export async function devAccessApi(request,env){
 const url=new URL(request.url);
 if(request.method!=='POST')return devAccessJson({error:'対応していない操作です。'},405);
 if(request.headers.get('Origin')!==url.origin)return devAccessJson({error:'このページから操作してください。'},403);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return devAccessJson({error:'JSONが必要です。'},415);
 if(typeof env.DEVTOOLS_PASSWORD!=='string'||!env.DEVTOOLS_PASSWORD)return devAccessJson({error:'公開版の開発者ツールは有効になっていません。'},503);
 const now=Date.now();
 // Per-isolate attempt limit: bounds repetitive attempts without a database or
 // normal-game requests. It is best effort, not an account authentication system.
 for(const [key,attempt] of devAccessAttempts)if(attempt.until<=now)devAccessAttempts.delete(key);
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';
 let attempts=devAccessAttempts.get(ip);
 if(attempts?.count>=devAccessMaxAttempts)return devAccessJson({error:'試行回数が多すぎます。1分ほど待ってください。'},429);
 if(Number(request.headers.get('Content-Length'))>4096)return devAccessJson({error:'リクエストが大きすぎます。'},413);
 let size=0,text='';
 const reader=request.body?.getReader();
 if(reader){
  const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return devAccessJson({error:'リクエストが大きすぎます。'},413);}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();
 }
 let body;try{body=JSON.parse(text);}catch{return devAccessJson({error:'不正なリクエストです。'},400);}
 if(!body||Array.isArray(body)||typeof body.password!=='string'||!body.password||body.password.length>256)return devAccessJson({error:'パスワードを入力してください。'},400);
 const [actual,expected]=await Promise.all([devAccessDigest(body.password),devAccessDigest(env.DEVTOOLS_PASSWORD)]);
 let difference=0;for(let i=0;i<expected.length;i++)difference|=actual[i]^expected[i];
 if(difference){
  if(!attempts){attempts={count:0,until:now+devAccessWindowMs};devAccessAttempts.set(ip,attempts);}
  attempts.count++;
  return devAccessJson({error:'パスワードが違います。'},401);
 }
 devAccessAttempts.delete(ip);
 return devAccessJson({ok:true});
}
