import test from 'node:test';
import assert from 'node:assert/strict';
import {victoryShareData,shareVictory} from '../dist/challenge-celebration.js';
test('victory sharing uses a public URL and the global ordinal, never a local match link',async()=>{
 let copied='';assert.equal(await shareVictory(42,{clipboard:{writeText:async text=>copied=text}}),'copied');
 assert.match(copied,/全プレイヤー合計で42回目/);assert.match(copied,/https:\/\/oshogi-games.pages.dev\//);assert.doesNotMatch(copied,/#ai=|localhost|127\.0\.0\.1/);
 assert.throws(()=>victoryShareData(-1));
});
test('cancelling native share does not silently copy to clipboard',async()=>{
 let copies=0;const platform={share:async()=>{throw Object.assign(new Error(),{name:'AbortError'});},clipboard:{writeText:async()=>copies++}};
 assert.equal(await shareVictory(1,platform),'cancelled');assert.equal(copies,0);
});
test('unavailable native sharing falls back to clipboard while successful sharing does not',async()=>{
 let copies=0;const platform={share:async()=>{throw new Error('unsupported');},clipboard:{writeText:async()=>copies++}};
 assert.equal(await shareVictory(2,platform),'copied');assert.equal(copies,1);platform.share=async()=>{};
 assert.equal(await shareVictory(2,platform),'shared');assert.equal(copies,1);
});
