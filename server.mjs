import http from 'node:http';import {readFile,mkdir} from 'node:fs/promises';import path from 'node:path';
import {api,cleanupRooms} from './worker/api.js';import {localDB} from './worker/local-db.js';
await mkdir('.sites-runtime',{recursive:true});const DB=localDB('.sites-runtime/rooms.sqlite');
setInterval(()=>cleanupRooms({DB}).catch(error=>console.error('Room cleanup failed:',error.message)),300000).unref();
const root=path.resolve('dist');
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://'+req.headers.host);
 if(url.pathname.startsWith('/api/')){let body='';for await(const chunk of req){body+=chunk;if(body.length>4096){res.writeHead(413);res.end();return;}}const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='GET'||req.method==='HEAD'?{}:{body})});const result=await api(request,{DB});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());return;}
 let file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}});const port=Number(process.env.PORT)||4173;server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log('http://127.0.0.1:'+port));
