import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,empty,play} from '../dist/engine.js';
import {chooseAI} from '../dist/ai.js';
test('弱い・普通は先読みをせず合法手を返す',()=>{
 for(const level of ['weak','normal']){let stats;const s=initial();const m=chooseAI(s,level,500,()=>{},value=>stats=value);assert.doesNotThrow(()=>play(s,m));assert.equal(stats.completedDepth,0);assert.equal(stats.nodes,0);}
});
test('普通でも目の前の王取りは見逃さない',()=>{
 const s=empty();s.board[76]={type:'K',side:0};s.board[4]={type:'K',side:1};s.board[13]={type:'R',side:0};
 for(let n=0;n<5;n++)assert.match(play(s,chooseAI(s,'normal')).result,/先手の勝ち/);
});
