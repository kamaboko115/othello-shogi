import test from 'node:test';
import assert from 'node:assert/strict';
import {empty} from '../dist/engine.js';
import {resultView} from '../dist/result-view.js';
test('終局表示は見る側の勝敗と王の反転位置を返す',()=>{const s=empty();s.result='後手の勝ち（王を反転）';s.ply=48;s.board[40]={type:'K',side:1};s.flipped=[39,40];assert.deepEqual(resultView(s,1),{title:'あなたの勝ち',reason:'王を挟んで決着',detail:'48手',square:40});assert.equal(resultView(s,0).title,'あなたの負け');});
test('判定は持ち駒を含めず自分側の枚数を先に表示',()=>{const s=empty();s.result='先手の勝ち（60手・先手2枚／後手1枚）';s.ply=60;s.board[0]={type:'K',side:0};s.board[1]={type:'G',side:0};s.board[2]={type:'K',side:1};s.hands[1].P=12;assert.equal(resultView(s,1).detail,'60手 · 盤上の駒 あなた 1枚 ／ 相手 2枚');});
test('投了・合意・崩壊と進行中の表示',()=>{const s=empty();assert.equal(resultView(s),null);s.result='先手の勝ち（投了）';assert.equal(resultView(s,0).reason,'相手の投了で決着');s.result='合意による引き分け';assert.equal(resultView(s).title,'引き分け');s.result='後手の勝ち（パラドックスで王が崩壊）';s.destroyed={square:30};assert.equal(resultView(s).square,30);});
