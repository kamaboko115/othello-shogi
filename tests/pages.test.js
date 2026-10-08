import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
import gateway from '../worker/pages-gateway.js';
import {onRequest} from '../pages/functions/api/[[path]].js';
import {securityHeaders} from '../worker/security.js';
import {textAssets,binaryAssets} from '../worker/static-assets.js';

execFileSync(process.execPath,['build-pages.mjs'],{cwd:new URL('..',import.meta.url),stdio:'pipe'});
const output=new URL('../pages/.sites-runtime/pages/',import.meta.url);

test('every published browser module has all of its local imports in the release',async()=>{
 const published=new Set(textAssets);
 for(const name of textAssets.filter(name=>name.endsWith('.js'))){
  const source=await readFile(new URL(name,output),'utf8');
  const imports=source.matchAll(/\b(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"](\.[^'"]+)['"]/g);
  for(const [,specifier] of imports){
   const dependency=new URL(specifier,new URL(name,'https://assets.test/')).pathname.slice(1);
   assert.ok(published.has(dependency),`${name} imports ${dependency}, which is missing from the release`);
   assert.ok((await readFile(new URL(dependency,output))).length,`${dependency} must be emitted`);
  }
 }
});

test('Pages serves the same public assets and keeps preview/server files private',async()=>{
 for(const name of [...textAssets,...binaryAssets]){
  let actual=await readFile(new URL(name,output));
  if(name==='index.html')actual=Buffer.from(actual.toString('utf8').replace(/<meta name="app-build" content="[^"]*">/,'<meta name="app-build" content="">'));
  assert.deepEqual(actual,await readFile(new URL('../dist/'+name,import.meta.url)));
 }
 const files=await readdir(output);
 assert.ok(!files.some(name=>/(preview|comparison|puzzles)\.html$/.test(name)||name==='server'));
 assert.ok(!files.includes('_worker.js'));
 assert.match(await readFile(new URL('ads.txt',output),'utf8'),/pub-1514816413848325/);
 const headers=await readFile(new URL('_headers',output),'utf8');
 for(const [key,value] of Object.entries(securityHeaders))assert.ok(headers.includes(key+': '+value));
 assert.match(headers,/Cache-Control: no-cache/);
 assert.deepEqual(JSON.parse(await readFile(new URL('_routes.json',output),'utf8')),{version:1,include:['/api/*'],exclude:[]});
});

test('Pages forwards friend requests and 304 responses without rewriting origin, auth or IP',async()=>{
 for(const method of ['GET','POST']){
  const request=new Request('https://oshogi-games.pages.dev/api/rooms/example',{method,headers:{Origin:'https://oshogi-games.pages.dev',Authorization:'Bearer player-token','CF-Connecting-IP':'192.0.2.3','If-None-Match':'"room-4"',...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{"action":"leave"}'}:{})});
  const response=new Response(null,{status:304,headers:{ETag:'"room-4"',...securityHeaders}});
  const actual=await onRequest({request,env:{GAME_API:{async fetch(forwarded){
   assert.equal(forwarded,request);
   if(method==='POST')assert.equal(await forwarded.text(),'{"action":"leave"}');
   return response;
  }}}});
  assert.equal(actual,response);
 }
});

test('Pages keeps local AI/static requests off the API service and fails closed if binding is absent',async()=>{
 let apiCalls=0;
 const response=new Response('static');
 const request=new Request('https://oshogi-games.pages.dev/ai-worker.js');
 assert.equal(await gateway.fetch(request,{ASSETS:{fetch:async r=>{assert.equal(r,request);return response;}},GAME_API:{fetch(){apiCalls++;}}}),response);
 assert.equal(apiCalls,0);
 const failed=await gateway.fetch(new Request('https://oshogi-games.pages.dev/api/rooms'),{});
 assert.equal(failed.status,503);
 assert.equal(failed.headers.get('Cache-Control'),'no-store');
 assert.equal(failed.headers.get('Content-Security-Policy'),securityHeaders['Content-Security-Policy']);
});

test('Pages service points at the existing Worker with its DB, limiter and cleanup',async()=>{
 const pages=JSON.parse(await readFile(new URL('../pages/wrangler.jsonc',import.meta.url),'utf8'));
 const worker=JSON.parse(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
 assert.equal(pages.services[0].service,worker.name);
 assert.equal(pages.pages_build_output_dir,'.sites-runtime/pages');
 assert.equal(pages.services[0].binding,'GAME_API');
 assert.equal(worker.d1_databases[0].binding,'DB');
 assert.equal(worker.ratelimits[0].name,'ROOM_CREATE_BURST');
 assert.ok(worker.triggers.crons.length);
});
