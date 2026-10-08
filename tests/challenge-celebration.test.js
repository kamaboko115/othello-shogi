import test from 'node:test';
import assert from 'node:assert/strict';
import {victoryShareData,victoryTweetURL} from '../dist/challenge-celebration.js';
test('X victory text matches the requested wording and includes the public URL only',()=>{
 const data=victoryShareData(42),url=new URL(victoryTweetURL(42));
 assert.equal(data.text,'私はオセショ様に42回目に勝ったプレイヤーです！ #オセロ将棋 #オセショギ #OSESHOGI');
 assert.equal(url.origin,'https://x.com');assert.equal(url.pathname,'/intent/tweet');
 assert.equal(url.searchParams.get('text'),data.text);assert.equal(url.searchParams.get('url'),'https://oshogi-games.pages.dev/');
 assert.doesNotMatch(url.href,/#ai=|localhost|127\.0\.0\.1/);
});
test('invalid victory ordinals cannot become shared achievements',()=>{
 for(const n of [-1,0,1.5,NaN,Infinity,'<script>',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>victoryTweetURL(n),RangeError);
 assert.match(victoryShareData(1).text,/1回目/);
});
