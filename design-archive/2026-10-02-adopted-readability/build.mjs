import {readFile,mkdir,writeFile,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const out='.sites-runtime/release/dist';
await mkdir(out+'/server',{recursive:true});await mkdir(out+'/.openai/drizzle/meta',{recursive:true});
const assets={},binary={},etags={};
const etag=bytes=>'"'+createHash('sha256').update(bytes).digest('hex')+'"';
for(const name of ['puzzles.html','puzzles.css','puzzles.js','puzzle-solver.js','puzzle-page.js','puzzle-worker.js','puzzle-book.js','ad-break.js','toss.js','judge-options.js','match-options.js','index.html','appearance.js','appearance.css','hallmark-preview.css','hallmark-game.css','hallmark-tokens.css','style.css','app.js','engine.js','sound.js','ai.js','osesho-ai.js','ai-worker.js','ai-client.js','room-network.js','local-ai-game.js','move-effect.js','result-view.js','combo.js','impact.js','collapse-view.js','tutorial-lessons.js','novice-guide.js','credits.js','developer.js','dev-access.js','helper-visit.js','board-code.js','flip-light.js','paradox.js','fonts/OFL-MPLUSRounded1c.txt']){
 const bytes=await readFile('dist/'+name);assets['/'+name]=bytes.toString('utf8');etags['/'+name]=etag(bytes);
}
assets['/']=assets['/index.html'];etags['/']=etags['/index.html'];
for(const name of ['osesho.png','tutorial.mp4','tutorial-poster.jpg','fonts/title-mplus-rounded.woff2']){
 const bytes=await readFile('dist/'+name);binary['/'+name]=bytes.toString('base64');etags['/'+name]=etag(bytes);
}
const engine=(await readFile('dist/judge-options.js','utf8'))+'\n'+(await readFile('dist/engine.js','utf8')).replace(/^import .*;\r?\n/gm,'');
const apiSource=(await readFile('worker/api.js','utf8')).replace(/^import .*;\r?\n/gm,'');
const staticWorker=`
function matchesETag(value,etag){return value?.split(',').some(tag=>tag.trim()==='*'||tag.trim().replace(/^W\\//,'')===etag);}
export default {
 async scheduled(controller,env){await cleanupRooms(env);},
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path.startsWith('/api/'))return api(request,env);
  const isBinary=binary[path]!==undefined,body=assets[path];
  if(!isBinary&&body===undefined)return new Response('Not found',{status:404});
  const type=path.endsWith('.png')?'image/png':path.endsWith('.mp4')?'video/mp4':path.endsWith('.woff2')?'font/woff2':path.endsWith('.jpg')?'image/jpeg':path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.txt')?'text/plain; charset=utf-8':'text/html; charset=utf-8';
  const headers={'Content-Type':type,'Cache-Control':'no-cache','ETag':etags[path],'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
  if(isBinary)headers['Accept-Ranges']='bytes';
  if(['GET','HEAD'].includes(request.method)&&matchesETag(request.headers.get('If-None-Match'),etags[path]))return new Response(null,{status:304,headers});
  if(!isBinary)return new Response(request.method==='HEAD'?null:body,{headers});
  const bytes=Uint8Array.from(atob(binary[path]),c=>c.charCodeAt(0));
  let start=0,end=bytes.length-1,status=200;
  const range=request.headers.get('Range');
  if(range){
   const match=/^bytes=([0-9]+)-([0-9]*)$/.exec(range);
   if(!match)return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+bytes.length}});
   start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;
   if(start>end)return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+bytes.length}});
   status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+bytes.length;
  }
  headers['Content-Length']=String(end-start+1);
  return new Response(request.method==='HEAD'?null:bytes.slice(start,end+1),{status,headers});
 }
};`;
const worker=engine+'\n'+await readFile('dist/match-options.js','utf8')+'\n'+apiSource+'\nconst assets='+JSON.stringify(assets)+';\nconst binary='+JSON.stringify(binary)+';\nconst etags='+JSON.stringify(etags)+';\n'+staticWorker;
await writeFile(out+'/server/index.js',worker);
// Also expose the standard entrypoint used by the Sites packaging workflow.
await mkdir('dist/server',{recursive:true});
await writeFile('dist/server/index.js',worker);
await cp('.openai/hosting.json',out+'/.openai/hosting.json');
await cp('drizzle',out+'/.openai/drizzle',{recursive:true});
console.log('Worker and migrations built: '+out);
