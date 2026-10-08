import {writeBuildInfo,injectBuildInfo} from './scripts/build-info.mjs';
import {readFile,mkdir,writeFile,rename,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {textAssets,binaryAssets} from './worker/static-assets.js';
const out='.sites-runtime/release/dist';
await mkdir(out+'/server',{recursive:true});await mkdir(out+'/.openai/drizzle/meta',{recursive:true});
const assets={},binary={},etags={},buildInfo=await writeBuildInfo();
const etag=bytes=>'"'+createHash('sha256').update(bytes).digest('hex')+'"';
for(const name of textAssets){
 let bytes=await readFile('dist/'+name);if(name==='index.html')bytes=Buffer.from(injectBuildInfo(bytes.toString('utf8'),buildInfo));assets['/'+name]=bytes.toString('utf8');etags['/'+name]=etag(bytes);
}
assets['/']=assets['/index.html'];etags['/']=etags['/index.html'];
for(const name of binaryAssets){
 const bytes=await readFile('dist/'+name);binary['/'+name]=bytes.toString('base64');etags['/'+name]=etag(bytes);
}
const engine=(await readFile('dist/judge-options.js','utf8'))+'\n'+(await readFile('dist/engine.js','utf8')).replace(/^import .*;\r?\n/gm,'');
const apiSource=(await readFile('worker/api.js','utf8')).replace(/^import .*;\r?\n/gm,'');
const limitsSource=(await readFile('worker/room-limits.js','utf8')).replace(/^import .*;\r?\n/gm,'');
const securitySource=await readFile('worker/security.js','utf8');
const actionLimitSource=(await readFile('worker/action-limit.js','utf8')).replace(/^import .*;\r?\n/gm,'');
const staticWorker=`
function matchesETag(value,etag){return value?.split(',').some(tag=>tag.trim()==='*'||tag.trim().replace(/^W\\//,'')===etag);}
export default {
 async scheduled(controller,env){if(controller.cron==='0 * * * *')await backupChallengeWins(env.DB);else await cleanupRooms(env);},
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/'))return api(request,env,{clientIP:request.headers.get('CF-Connecting-IP'),requireBurstLimiter:true,allowServerAI:false});
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{...securityHeaders,Allow:'GET, HEAD'}});
  const limited=await limitApiIP(env,{clientIP:request.headers.get('CF-Connecting-IP'),required:true});if(limited)return limited;
  const isBinary=binary[path]!==undefined,body=assets[path];
  if(!isBinary&&body===undefined)return new Response('Not found',{status:404,headers:securityHeaders});
  const type=path.endsWith('.png')?'image/png':path.endsWith('.mp4')?'video/mp4':path.endsWith('.mp3')?'audio/mpeg':path.endsWith('.woff2')?'font/woff2':path.endsWith('.jpg')?'image/jpeg':path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.xml')?'application/xml; charset=utf-8':path.endsWith('.txt')?'text/plain; charset=utf-8':'text/html; charset=utf-8';
  const headers={...securityHeaders,'Content-Type':type,'Cache-Control':'no-cache','ETag':etags[path]};
  if(isBinary)headers['Accept-Ranges']='bytes';
  if(['GET','HEAD'].includes(request.method)&&matchesETag(request.headers.get('If-None-Match'),etags[path]))return new Response(null,{status:304,headers});
  if(!isBinary)return new Response(request.method==='HEAD'?null:body,{headers});
  const encoded=binary[path],length=encoded.length*3/4-(encoded.endsWith('==')?2:encoded.endsWith('=')?1:0);
  let start=0,end=length-1,status=200;
  const range=request.headers.get('Range');
  if(range){
   const match=/^bytes=([0-9]+)-([0-9]*)$/.exec(range);
   if(!match)return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+length}});
   start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;
   if(start>end)return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+length}});
   status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+length;
  }
  headers['Content-Length']=String(end-start+1);
  if(request.method==='HEAD')return new Response(null,{status,headers});
  const decoded=atob(encoded),bytes=new Uint8Array(decoded.length);
  for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
  return new Response(bytes.slice(start,end+1),{status,headers});
 }
};`;
// Only the default handler is a Workers entrypoint; helper module exports
// (including numeric constants) must remain internal to the bundled Worker.
const replaySource=(await readFile('dist/replay-code.js','utf8')).replace(/^import .*;\r?\n/gm,'');
const helpers=[engine,(await readFile('dist/match-storage.js','utf8')),(await readFile('dist/collapse-options.js','utf8')),(await readFile('dist/challenge-options.js','utf8')).replace(/^import .*;\r?\n/gm,''),replaySource,(await readFile('dist/match-options.js','utf8')).replace(/^import .*;\r?\n/gm,''),securitySource,limitsSource,(await readFile('worker/challenge-wins.js','utf8')),(await readFile('worker/challenge-verification.js','utf8')).replace(/^import .*;\r?\n/gm,''),apiSource].join('\n').replace(/^export /gm,'');
const chatSource=(await readFile('worker/chat.js','utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export (?!class RoomChat)/gm,'');
const worker=chatSource+'\n'+helpers+'\n'+actionLimitSource.replace(/^export /gm,'')+'\nconst assets='+JSON.stringify(assets)+';\nconst binary='+JSON.stringify(binary)+';\nconst etags='+JSON.stringify(etags)+';\n'+staticWorker;
// Tests and preview builds can run concurrently. Readers must never see a
// truncated module while another build is replacing the same entrypoint.
async function writeWorker(path){
 const temporary=path+'.'+process.pid+'.tmp';
 await writeFile(temporary,worker);
 for(let attempt=0;;attempt++){
  try{await rename(temporary,path);break;}
  catch(error){
   // Windows briefly locks modules while another test process imports them.
   // Preserve the existing complete file and retry the atomic replacement.
   if(process.platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=6)throw error;
   await new Promise(resolve=>setTimeout(resolve,20*2**attempt));
  }
 }
}
await writeWorker(out+'/server/index.js');
// Also expose the standard entrypoint used by the Sites packaging workflow.
await mkdir('dist/server',{recursive:true});
await writeWorker('dist/server/index.js');
await cp('.openai/hosting.json',out+'/.openai/hosting.json');
await cp('drizzle',out+'/.openai/drizzle',{recursive:true});
console.log('Worker and migrations built: '+out);
