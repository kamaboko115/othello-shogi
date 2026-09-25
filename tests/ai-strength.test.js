import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,empty,play,moves,reaches} from '../dist/engine.js';
import {chooseAI,evaluateAI} from '../dist/ai.js';
const base=()=>{const s=empty();s.moveLimit=false;s.board[76]={type:'K',side:0};s.board[4]={type:'K',side:1};return s;};
const allMoves=s=>[...s.board.flatMap((p,i)=>p?.side===s.turn?[i]:[]),...Object.keys(s.hands[s.turn])].flatMap(src=>moves(s,src));
test('序盤の初手は合法で、直後に高額駒をただ取りされない',()=>{
 const s=initial(),move=chooseAI(s,'strong',500),next=play(s,move);
 assert.doesNotThrow(()=>play(s,move));
 assert.ok(!allMoves(next).some(m=>next.board[m.to]?.side===0&&['R','B','K'].includes(next.board[m.to].type)));
});
test('歩を取ると飛車をただ取りされる罠を避ける',()=>{
 const s=base();s.board[40]={type:'R',side:0};s.board[31]={type:'P',side:1};s.board[13]={type:'R',side:1};
 const move=chooseAI(s,'strong',500);
 assert.ok(!(move.from===40&&move.to===31),'do not sacrifice rook for pawn');
 assert.doesNotThrow(()=>play(s,move));
});
test('駒打ちで王を挟まれる一手勝ちを回避する',()=>{
 const s=base();s.board[74]={type:'P',side:1};s.board[75]={type:'P',side:0};s.hands[1].G=1;
 const next=play(s,chooseAI(s,'strong',500));
 assert.ok(!allMoves(next).some(move=>play(next,move).result.includes('後手の勝ち')));
});
test('龍と角を同時に寝返らせる手を選ぶ',()=>{
 const s=base();s.board[49]={type:'P',side:0};s.board[39]={type:'R',side:1,prom:true};s.board[38]={type:'B',side:1};s.board[37]={type:'P',side:0};
 const next=play(s,chooseAI(s,'strong',500));assert.deepEqual(next.flipped,[39,38]);assert.equal(next.board[39].prom,true);
});
test('自玉が狙われていても王反転での即勝利を優先',()=>{
 const s=base();s.board[4]=null;s.board[39]={type:'K',side:1};s.board[38]={type:'P',side:0};s.hands[0].G=1;s.board[67]={type:'R',side:1};
 const next=play(s,chooseAI(s,'expert',500));assert.match(next.result,/先手の勝ち.*王を反転/);
});
test('81手では駒の価値や持ち駒より盤上の枚数で勝つ手を選ぶ',()=>{
 const s=base();s.moveLimit=true;s.ply=80;s.board[49]={type:'G',side:0};s.board[39]={type:'P',side:1};s.board[38]={type:'P',side:1};s.board[37]={type:'P',side:0};s.hands[1].R=9;
 const next=play(s,chooseAI(s,'expert',500));assert.match(next.result,/先手の勝ち.*81手/);
});
test('探索は入力盤面を変更しない・深さの完了値を通知する',()=>{
 const s=initial(),before=structuredClone(s);let stats;const move=chooseAI(s,'expert',500,()=>{},value=>stats=value);
 assert.deepEqual(s,before);assert.ok(stats.completedDepth>=2);assert.ok(stats.elapsedMs<750);assert.doesNotThrow(()=>play(s,move));
});

test('逃げられる王手だけを飛車以上に過大評価しない',()=>{
 const s=base();s.turn=1;s.board[40]={type:'R',side:0};const check=evaluateAI(s,0);s.board[4]=null;s.board[3]={type:'K',side:1};assert.ok(check-evaluateAI(s,0)<950);
});

