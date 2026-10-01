import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
execFileSync(process.execPath,['build.mjs'],{cwd:new URL('..',import.meta.url),stdio:'pipe'});
const worker=(await import('../dist/server/index.js')).default;
const request=(path,options)=>worker.fetch(new Request('http://test.local'+path,options),{});
test('compiled worker generates content SHA256 ETags and revalidates text, binary, and HEAD requests',async()=>{
 for(const path of ['/','/ad-break.js','/app.js','/room-network.js','/style.css','/osesho.png','/tutorial.mp4','/fonts/title-mplus-rounded.woff2']){
  const full=await request(path);assert.equal(full.status,200);const bytes=new Uint8Array(await full.arrayBuffer()),etag='"'+createHash('sha256').update(bytes).digest('hex')+'"';assert.equal(full.headers.get('ETag'),etag);assert.equal(full.headers.get('Cache-Control'),'no-cache');assert.equal(full.headers.get('X-Content-Type-Options'),'nosniff');
  for(const method of ['GET','HEAD']){const cached=await request(path,{method,headers:{'If-None-Match':'"different", W/'+etag}});assert.equal(cached.status,304);assert.equal(await cached.text(),'');assert.equal(cached.headers.get('ETag'),etag);assert.equal(cached.headers.get('Cache-Control'),'no-cache');}
  const changed=await request(path,{headers:{'If-None-Match':'"older-build"'}});assert.equal(changed.status,200);
  const head=await request(path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('ETag'),etag);
 }
 assert.equal((await request('/unknown.js',{headers:{'If-None-Match':'*'}})).status,404);
});
test('compiled worker retains MP4 byte ranges, HEAD and unsatisfiable range behavior',async()=>{
 const bytes=await readFile(new URL('../dist/tutorial.mp4',import.meta.url));
 const partial=await request('/tutorial.mp4',{headers:{Range:'bytes=10-29'}});assert.equal(partial.status,206);assert.equal(partial.headers.get('Content-Range'),`bytes 10-29/${bytes.length}`);assert.equal(partial.headers.get('Content-Length'),'20');assert.deepEqual(Buffer.from(await partial.arrayBuffer()),bytes.subarray(10,30));
 const head=await request('/tutorial.mp4',{method:'HEAD',headers:{Range:'bytes=10-29'}});assert.equal(head.status,206);assert.equal(head.headers.get('Content-Length'),'20');assert.equal(await head.text(),'');
 for(const range of ['bytes=0-1,4-5','bytes=20-10','bytes='+bytes.length+'-']){const invalid=await request('/tutorial.mp4',{headers:{Range:range}});assert.equal(invalid.status,416);assert.equal(invalid.headers.get('Content-Range'),'bytes */'+bytes.length);}
});
test('compiled worker serves the developer UI lock module',async()=>{
 assert.equal((await request('/dev-access.js')).status,200);
});
