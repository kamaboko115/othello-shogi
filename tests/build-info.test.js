import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {buildInfoText,initBuildInfo} from '../dist/lobby-tools.js';
import {injectBuildInfo} from '../scripts/build-info.mjs';

test('build date is always Japanese time and a local edit cannot look like a clean revision',()=>{
 const info={builtAt:'2026-10-03T18:04:05Z',revision:'1234567abcdef',dirty:true};
 assert.equal(buildInfoText(info),'最終更新（ビルド）：2026/10/04 03:04:05（日本時間）\nバージョン：1234567（未コミットの変更あり）');
 assert.equal(buildInfoText({...info,dirty:false}).includes('未コミット'),false);
 assert.match(buildInfoText({builtAt:'bad'}),/不明/);
 const output={};initBuildInfo({querySelector:()=>({content:'broken json'}),getElementById:()=>output});assert.match(output.textContent,/ビルド情報なし/);
});

test('metadata stays in the HTML attribute and does not change the source template',()=>{
 const html='<head><meta name="app-build" content=""></head>',rendered=injectBuildInfo(html,{revision:'"><script>alert(1)</script>'});
 assert.equal(rendered.includes('<script>'),false);assert.ok(rendered.includes('&quot;'));assert.ok(html.includes('content=""'));
});

test('both deployment builds ship metadata in the homepage without an extra API call',async()=>{
 for(const script of ['build.mjs','build-pages.mjs'])execFileSync(process.execPath,[script],{cwd:new URL('..',import.meta.url),stdio:'pipe'});
 const worker=(await import('../dist/server/index.js')).default;
 const response=await worker.fetch(new Request('https://test.local/',{headers:{'CF-Connecting-IP':'192.0.2.1'}}),{API_REQUEST_BURST:{limit:async()=>({success:true})}});
 assert.equal(response.status,200);
 const pages=readFileSync(new URL('../pages/.sites-runtime/pages/index.html',import.meta.url),'utf8');
 for(const html of [await response.text(),pages]){
  const value=html.match(/<meta name="app-build" content="([^"]+)">/)[1];
  const info=JSON.parse(value.replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&amp;','&'));
  assert.ok(Number.isFinite(Date.parse(info.builtAt)));assert.match(info.revision,/^[a-f0-9]{40}$/);assert.equal(typeof info.dirty,'boolean');
 }
});
