import {writeBuildInfo,injectBuildInfo} from './scripts/build-info.mjs';
import http from 'node:http';import {readFile,mkdir} from 'node:fs/promises';import path from 'node:path';
import {api,cleanupRooms} from './worker/api.js';import {localDB,localRoomBurstLimiter} from './worker/local-db.js';
import {securityHeaders} from './worker/security.js';
import {localApiRateLimits} from './worker/action-limit.js';
await mkdir('.sites-runtime',{recursive:true});const DB=localDB('.sites-runtime/rooms.sqlite');
const ROOM_CREATE_BURST=localRoomBurstLimiter();
const apiRateLimits=localApiRateLimits();
setInterval(()=>cleanupRooms({DB}).catch(error=>console.error('Room cleanup failed:',error.message)),300000).unref();
const root=path.resolve('dist');
await writeBuildInfo();
// Pause rejected uploads so the socket can still deliver the error response.
function incomingBody(req){
 return new ReadableStream({
  start(controller){
   const detach=()=>{req.off('data',data);req.off('end',end);req.off('error',error);};
   const data=chunk=>{controller.enqueue(chunk);req.pause();};
   const end=()=>{detach();controller.close();};
   const error=err=>{detach();controller.error(err);};
   this.detach=detach;req.on('data',data);req.on('end',end);req.on('error',error);req.pause();
  },
  pull(){req.resume();},
  cancel(){req.pause();this.detach();}
 },{highWaterMark:0});
}
const server=http.createServer(async(req,res)=>{try{
 for(const [name,value] of Object.entries(securityHeaders))res.setHeader(name,value);
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname.startsWith('/api/')){
  const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'||req.method==='HEAD'?{}:{body:incomingBody(req),duplex:'half'})});
  const result=await api(request,{DB,ROOM_CREATE_BURST,...apiRateLimits},{clientIP:req.socket.remoteAddress,requireBurstLimiter:true});
  if(request.body&&!req.readableEnded){request.body.cancel().catch(()=>{});res.setHeader('Connection','close');}
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;
 }
 let file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}let data=await readFile(file);if(file===path.join(root,'index.html')){const info=JSON.parse(await readFile('.sites-runtime/build-info.json','utf8'));data=Buffer.from(injectBuildInfo(data.toString('utf8'),info));}res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mp3':'audio/mpeg','.xml':'application/xml; charset=utf-8','.txt':'text/plain; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}});const port=Number(process.env.PORT)||4173;server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log('http://127.0.0.1:'+port));
