import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
execFileSync(process.execPath,['build.mjs'],{cwd:new URL('..',import.meta.url),stdio:'pipe'});
const worker=(await import('../dist/server/index.js')).default;
const request=(path,options)=>worker.fetch(new Request('http://test.local'+path,options),{});
test('compiled worker generates content SHA256 ETags and revalidates text, binary, and HEAD requests',async()=>{
 for(const path of ['/','/ad-break.js','/app.js','/room-network.js','/style.css','/osesho.png','/fonts/title-mplus-rounded.woff2']){
  const full=await request(path);assert.equal(full.status,200);const bytes=new Uint8Array(await full.arrayBuffer()),etag='"'+createHash('sha256').update(bytes).digest('hex')+'"';assert.equal(full.headers.get('ETag'),etag);assert.equal(full.headers.get('Cache-Control'),'no-cache');assert.equal(full.headers.get('X-Content-Type-Options'),'nosniff');
  for(const method of ['GET','HEAD']){const cached=await request(path,{method,headers:{'If-None-Match':'"different", W/'+etag}});assert.equal(cached.status,304);assert.equal(await cached.text(),'');assert.equal(cached.headers.get('ETag'),etag);assert.equal(cached.headers.get('Cache-Control'),'no-cache');}
  const changed=await request(path,{headers:{'If-None-Match':'"older-build"'}});assert.equal(changed.status,200);
  const head=await request(path,{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');assert.equal(head.headers.get('ETag'),etag);
 }
 assert.equal((await request('/unknown.js',{headers:{'If-None-Match':'*'}})).status,404);
});
test('compiled worker retains binary byte ranges, HEAD and unsatisfiable range behavior',async()=>{
 const bytes=await readFile(new URL('../dist/fonts/title-mplus-rounded.woff2',import.meta.url));
 const partial=await request('/fonts/title-mplus-rounded.woff2',{headers:{Range:'bytes=10-29'}});assert.equal(partial.status,206);assert.equal(partial.headers.get('Content-Range'),`bytes 10-29/${bytes.length}`);assert.equal(partial.headers.get('Content-Length'),'20');assert.deepEqual(Buffer.from(await partial.arrayBuffer()),bytes.subarray(10,30));
 const head=await request('/fonts/title-mplus-rounded.woff2',{method:'HEAD',headers:{Range:'bytes=10-29'}});assert.equal(head.status,206);assert.equal(head.headers.get('Content-Length'),'20');assert.equal(await head.text(),'');
 for(const range of ['bytes=0-1,4-5','bytes=20-10','bytes='+bytes.length+'-']){const invalid=await request('/fonts/title-mplus-rounded.woff2',{headers:{Range:range}});assert.equal(invalid.status,416);assert.equal(invalid.headers.get('Content-Range'),'bytes */'+bytes.length);}
});
test('compiled worker serves the developer UI lock module',async()=>{
 assert.equal((await request('/dev-access.js')).status,200);
});

test('opt-in music is served as cacheable MP3 and supports partial audio reads',async()=>{
 const path='/music/electrodoodle.mp3',bytes=await readFile(new URL('../dist'+path,import.meta.url));
 const partial=await request(path,{headers:{Range:'bytes=100-199'}});assert.equal(partial.status,206);assert.equal(partial.headers.get('Content-Type'),'audio/mpeg');assert.equal(partial.headers.get('Content-Range'),`bytes 100-199/${bytes.length}`);assert.deepEqual(Buffer.from(await partial.arrayBuffer()),bytes.subarray(100,200));
 const cached=await request(path,{headers:{'If-None-Match':partial.headers.get('ETag')}});assert.equal(cached.status,304);assert.equal(await cached.text(),'');
});

test('AdSenseの所有確認タグとads.txtを配信し、実広告スクリプトはまだ読み込まない',async()=>{
 const page=await (await request('/')).text();
 assert.match(page,/<meta name="google-adsense-account" content="ca-pub-1514816413848325">/);
 assert.doesNotMatch(page,/src="https:\/\/pagead2\.googlesyndication\.com/);
 const text=await request('/ads.txt');
 assert.equal(text.status,200);assert.match(text.headers.get('Content-Type'),/^text\/plain/);
 assert.equal((await text.text()).trim(),'google.com, pub-1514816413848325, DIRECT, f08c47fec0942fa0');
});


test('searchable rules, canonical metadata and sitemap are served without exposing previews',async()=>{
 const page=await (await request('/')).text();assert.match(page,/rel="canonical" href="https:\/\/oshogi-games.pages.dev\/"/);assert.match(page,/name="description"/);assert.match(page,/href="rules.html"/);
 const rules=await request('/rules.html');assert.equal(rules.status,200);assert.match(await rules.text(),/王を取るか、挟めば勝ち/);
 const sitemap=await request('/sitemap.xml');assert.match(sitemap.headers.get('Content-Type'),/application\/xml/);const xml=await sitemap.text();assert.match(xml,/rules.html/);assert.doesNotMatch(xml,/preview|fixture|#ai/);
 const robots=await request('/robots.txt');assert.match(robots.headers.get('Content-Type'),/text\/plain/);assert.match(await robots.text(),/Sitemap: https:\/\/oshogi-games.pages.dev\/sitemap.xml/);
 for(const file of ['launch-fixture.html','launch-fixture.js'])assert.equal((await request('/'+file)).status,404);
});
