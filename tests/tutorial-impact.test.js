import test from 'node:test';
import assert from 'node:assert/strict';
import {lessons,lessonState,collapseReply,collapseLesson} from '../dist/tutorial-lessons.js';
import {play,moves,collapseAfterMove} from '../dist/engine.js';
globalThis.window={addEventListener(){}};
globalThis.matchMedia=()=>({matches:false});
const {kingCaptureSquare,runKingImpact}=await import('../dist/impact.js');

test('全レッスンの案内手が合法で、説明どおり反転・勝利・崩壊する',()=>{
 for(let i=0;i<lessons.length;i++){
  const lesson=lessons[i],s=lessonState(i);
  for(const side of [0,1])assert.equal(s.board.filter(p=>p?.type==='K'&&p.side===side).length,1);
  const n=play(s,lesson.move);assert.equal(n.flipped.length,lesson.flips,lesson.title);
  if(lesson.move.drop){assert.equal(n.hands[0].G,0);assert.equal(n.board[lesson.move.to].type,'G');}
  if(lesson.enemyKing!==undefined&&!lesson.collapse)assert.match(n.result,/先手の勝ち/);else assert.equal(n.result,'');
  if(lesson.collapse){assert.equal(n.ply,150);assert.equal(collapseAfterMove(n,()=>0).destroyed,null);assert.equal(n.paradoxStarted,true);}
 }
});
test('崩壊の練習は王と小駒5枚ずつ、雷から王を保護する',()=>{
 const s=lessonState(8);
 assert.equal(s.ply,149);
 for(const side of [0,1]){
  assert.equal(s.board.filter(p=>p?.side===side&&p.type!=='K').length,5);
 }
 assert.ok(s.board.every(p=>!p||!['R','B'].includes(p.type)));
 s.ply=151;
 for(let n=0;n<10;n++){
  collapseAfterMove(s,()=>0,undefined,0,{protectKings:true});
  assert.notEqual(s.destroyed?.piece.type,'K');
  assert.equal(s.result,'');
 }
 assert.equal(s.board.filter(Boolean).length,2);
 collapseAfterMove(s,()=>0,undefined,0,{protectKings:true});
 assert.equal(s.board.filter(p=>p?.type==='K').length,2);
});

test('直接の王取りだけ検出し、王反転・再受信・投了では発動しない',()=>{
 const captureIndex=lessons.findIndex(l=>l.enemyKing===31),flipIndex=lessons.findIndex(l=>l.enemyKing===38);
 const s=lessonState(captureIndex),n=play(s,lessons[captureIndex].move);
 assert.equal(kingCaptureSquare(s,n),31);assert.equal(kingCaptureSquare(n,n),null);
 const flip=lessonState(flipIndex);assert.equal(kingCaptureSquare(flip,play(flip,lessons[flipIndex].move)),null);
 assert.equal(kingCaptureSquare(s,{...s,result:'後手の勝ち（投了）'}),null);
 const reversed=lessonState(captureIndex);for(const p of reversed.board)if(p)p.side=1-p.side;reversed.turn=1;
 assert.equal(kingCaptureSquare(reversed,play(reversed,lessons[captureIndex].move)),31);
});
function view(){
 const events=[],rect={left:0,top:0,width:50,height:50};
 globalThis.document={createElement:()=>({style:{setProperty(){}},setAttribute(){},classList:{add(c){events.push(c);},remove(c){events.push('-'+c);}},remove(){events.push('removed');}})};
 return {events,board:{querySelector:()=>({getBoundingClientRect:()=>rect}),getBoundingClientRect:()=>rect,append(layer){events.push(layer.className);}}};
}
test('王取りは短い停止の後に衝撃波を出し、完了時に片付ける',async()=>{
 const {events,board}=view();await runKingImpact(board,31,new AbortController().signal);
 assert.deepEqual(events,['king-impact','impact-hold','-impact-hold','impact-burst','removed']);
});
test('王取りの停止中に閉じても衝撃波を残さず完了する',async()=>{
 const {events,board}=view(),controller=new AbortController(),done=runKingImpact(board,31,controller.signal);controller.abort();await done;
 assert.deepEqual(events,['king-impact','impact-hold','removed']);
});
test('動きを減らす設定では王取りの装飾を作らない',async()=>{
 const {events,board}=view();globalThis.matchMedia=()=>({matches:true});
 try{await runKingImpact(board,31);assert.deepEqual(events,[]);}finally{globalThis.matchMedia=()=>({matches:false});}
});
