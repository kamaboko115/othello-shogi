import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,empty,moves,raw,play} from '../dist/engine.js';
import {chooseAI,searchPosition,winningMove} from '../dist/ai.js';

const all=s=>[...s.board.flatMap((p,i)=>p?.side===s.turn?[i]:[]),...Object.keys(s.hands[s.turn])].flatMap(src=>moves(s,src));
const base=()=>{const s=empty();s.moveLimit=false;s.paradoxAt=false;s.board[76]={type:'K',side:0,prom:false};s.board[4]={type:'K',side:1,prom:false};return s;};

test('高速探索の盤面更新は共有エンジンと一致し、元の局面を変更しない',()=>{
 let s=initial(),seed=71;s.moveLimit=false;
 for(let ply=0;ply<100;ply++){
  const before=structuredClone(s),options=all(s);
  for(const m of options)assert.deepEqual(searchPosition(s,m),raw(s,m));
  assert.deepEqual(s,before);
  if(!options.length)break;
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;s=play(s,options[seed%options.length]);
  if(s.result){s=initial();s.moveLimit=false;}
 }
 // Explicitly cover promoted captures, drops and promotion.
 const p=base();p.board[40]={type:'R',side:0,prom:false};p.board[31]={type:'S',side:1,prom:true};p.hands[0]={P:1,G:1};
 for(const m of all(p))assert.deepEqual(searchPosition(p,m),raw(p,m));
});

test('王取り・反転の検出は合法手の総当たりと一致する（両陣営・駒打ち制限）',()=>{
 let seed=409;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let sample=0;sample<60;sample++){
  const s=base();s.turn=sample%2;s.noDrops=sample%3===0;
  for(let n=0;n<12;n++){const square=random(81);if(!s.board[square])s.board[square]={type:['P','G','S','R','B','N','L'][random(7)],side:random(2),prom:false};}
  s.hands=[{G:1,P:1},{G:1,P:1}];
  const expected=all(s).some(m=>!raw(s,m).board.some(p=>p?.type==='K'&&p.side!==s.turn));
  const actual=winningMove(s);assert.equal(!!actual,expected);
  if(actual)assert.match(play(s,actual).result,/王を(取った|反転)/);
 }
});

test('オセショは駒打ちで王を挟まれる即負けを避ける（先後両方）',()=>{
 for(const side of [0,1]){
  const s=base();s.board[74]={type:'P',side:1,prom:false};s.board[75]={type:'P',side:0,prom:false};s.hands[1].G=1;
  if(side){s.board.reverse();s.board.forEach(p=>{if(p)p.side=1-p.side;});s.hands.reverse();s.turn=1;}
  const before=structuredClone(s),n=play(s,chooseAI(s,'helper',500));
  assert.equal(winningMove(n),null);assert.deepEqual(s,before);
 }
});

test('オセショは自玉への脅威より即勝利・60手判定を優先する',()=>{
 const s=base();s.board[4]=null;s.board[39]={type:'K',side:1,prom:false};s.board[38]={type:'P',side:0,prom:false};s.hands[0].G=1;s.board[67]={type:'R',side:1,prom:false};
 assert.match(play(s,chooseAI(s,'helper',500)).result,/先手の勝ち.*王を反転/);
 const p=base();p.moveLimit=true;p.ply=59;p.board[49]={type:'G',side:0,prom:false};p.board[39]={type:'P',side:1,prom:false};p.board[38]={type:'P',side:1,prom:false};p.board[37]={type:'P',side:0,prom:false};
 assert.match(play(p,chooseAI(p,'helper',500)).result,/先手の勝ち.*60手/);
});

test('オセショは時間制限内に合法手を返す・指せない局面はnull',()=>{
 const s=initial();let stats;const published=[];
 const m=chooseAI(s,'helper',500,m=>published.push(m),v=>stats=v);
 assert.doesNotThrow(()=>play(s,m));assert.ok(published.length);assert.ok(stats.completedDepth>=1);assert.ok(stats.elapsedMs<1000);
 const ended=base();ended.result='先手の勝ち';assert.equal(chooseAI(ended,'helper',500),null);
});
