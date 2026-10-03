import test from 'node:test';import assert from 'node:assert/strict';import {initial} from '../dist/engine.js';import {encodeBoard,decodeBoard} from '../dist/board-code.js';
test('盤面コピーで陣営・成り・持ち駒・手番を復元する',()=>{const s=initial();s.board[54].prom=true;s.hands[1].R=2;s.turn=1;s.ply=23;const n=decodeBoard(encodeBoard(s));assert.deepEqual(n.board,s.board);assert.equal(n.hands[1].R,2);assert.equal(n.turn,1);assert.equal(n.ply,23);});
test('壊れた盤面データは読み込まない',()=>{assert.throws(()=>decodeBoard('bad'));const s=initial();s.board[0].type='script';assert.throws(()=>decodeBoard(encodeBoard(s)));assert.throws(()=>decodeBoard('x'.repeat(20001)));});

test('generated hands remain copyable above the original 81-piece limit',()=>{const s=initial();s.ply=200;s.hands[0].P=300;assert.equal(decodeBoard(encodeBoard(s)).hands[0].P,300);});
