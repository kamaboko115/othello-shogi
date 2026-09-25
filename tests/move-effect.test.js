import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from '../dist/engine.js';
import {moveEffect} from '../dist/move-effect.js';

function checked(side){const s=empty();s.turn=side;s.board[4]={type:'K',side};s.board[76]={type:'K',side:1-side};s.board[22]={type:'R',side:1-side};return s;}
test('通常の利きによる王手は先手・後手とも枚抜きより優先',()=>{for(const side of [0,1]){const s=checked(side);s.flipped=[30,31,32];assert.deepEqual(moveEffect(s),{kind:'check',text:'王手'});}});
test('王手も反転もある勝利では勝利だけを表示',()=>{const s=checked(1);s.flipped=[30,31,32];for(const reason of ['王を反転','王を取った','81手判定']){s.result='先手の勝ち（'+reason+'）';assert.deepEqual(moveEffect(s),{kind:'victory',text:'先手の勝ち'});}});
test('遮られた飛車の利きは王手にせず反転演出を表示',()=>{const s=checked(1);s.board[13]={type:'P',side:1};s.flipped=[30,31];assert.deepEqual(moveEffect(s),{kind:'flip',text:'2枚抜き'});s.flipped=[30];assert.equal(moveEffect(s),null);});
test('引き分け終了後に王手や枚抜きを表示しない',()=>{const s=checked(0);s.flipped=[30,31];s.result='引き分け';assert.equal(moveEffect(s),null);});
