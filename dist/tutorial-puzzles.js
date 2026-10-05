import {empty,moves,play,label,inCheck} from './engine.js';

export const tutorialPuzzles=[
 {title:'まっすぐ王を狙え',pieces:[[61,'R',0],[25,'K',1],[24,'S',1],[20,'P',1],[66,'G',0]],hint:'飛車は縦・横に進めます。飛車と相手の王の間を見てみましょう。',answer:{from:61,to:25},explanation:'飛車で相手の王を取れば勝ち。王を取る最後の一手まで数えます。'},
 {title:'王の横をふさげ',pieces:[[39,'L',0],[30,'P',0],[50,'P',0],[40,'K',1]],hint:'王の左には味方の香。歩を進めて、王の右側をふさいでみましょう。',answer:{from:50,to:41},explanation:'歩を進めて、香と歩で王を挟みました。王を直接取らなくても勝ちです。'},
 {title:'駒台から決めよう',pieces:[[20,'L',0],[30,'K',1],[40,'G',1],[28,'P',1],[32,'L',1]],hand:{G:1},hint:'駒台の金を使います。味方の香・敵の王・敵の金が斜めに並んでいます。その先の空きマスへ。',answer:{drop:'G',to:50},explanation:'金を打って斜めに挟むと、相手の金と王がまとめて反転。持ち駒でも王を挟んで勝てます。'},
 {title:'詰んだはずの王を救え',goal:'defend',pieces:[[4,'K',1],[67,'R',1],[58,'G',1],[66,'L',0],[75,'P',0],[77,'P',0]],hand:{G:1},hint:'王手している飛車を取る代わりに、挟んで味方にできないでしょうか。駒台の金を飛車の右隣へ打つのも一つの答えです。',answer:{drop:'G',to:68},explanation:'王手していた飛車が味方になり、王を救えました！通常の将棋なら逃げ道も王手を防ぐ手もなく詰みですが、反転ルールなら受けられます。ここでは勝利ではなく、受けの成功で正解です。'}
];
export function puzzleState(index){
 const p=tutorialPuzzles[index];if(!p)throw Error('Unknown puzzle');
 const s=empty();s.moveLimit=false;s.paradoxAt=false;s.board[76]={type:'K',side:0,prom:false};
 for(const [i,type,side] of p.pieces)s.board[i]={type,side,prom:false};s.hands[0]={...p.hand};return s;
}
export function tryPuzzleMove(state,move,goal='capture'){
 const legal=moves(state,move.drop??move.from).find(m=>m.to===move.to&&!!m.prom===!!move.prom);
 if(!legal)return {correct:false,state};
 const next=play(state,legal);
 if(goal==='defend'){
  const sources=[...next.board.flatMap((p,i)=>p?.side===1?[i]:[]),...Object.keys(next.hands[1])];
  const counterWin=sources.some(src=>moves(next,src).some(reply=>play(next,reply).result.startsWith('後手の勝ち')));
  return {correct:!next.result&&!inCheck(next,0)&&next.flipped.length>0&&!counterWin,state:next};
 }
 return {correct:next.result.startsWith('先手の勝ち'),state:next};
}
export function initTutorialPuzzles(doc){
 const $=id=>doc.getElementById(id),dialog=$('tutorialPuzzles');let index=0,state,selected=null,solved=false;const completed=new Set();
 const reset=()=>{state=puzzleState(index);selected=null;solved=false;$('puzzleHintText').hidden=true;$('puzzleStatus').textContent=tutorialPuzzles[index].goal==='defend'?'あなたは先手で、王手されています。1手で王手を外し、次の手に王を取られたり挟まれたりしないように助けてください。':'あなたは先手。1手で相手の王を取るか、挟んでください。';draw();};
 function draw(){
  const p=tutorialPuzzles[index];$('puzzleTitle').textContent=`仕上げ 第${index+1}問 / ${tutorialPuzzles.length}　${p.title}`;
  $('puzzleProgress').textContent=`正解 ${completed.size} / ${tutorialPuzzles.length}問`;
  $('puzzleNext').hidden=!solved;$('puzzleNext').textContent=index===tutorialPuzzles.length-1?'チュートリアルを終える':'次の問題へ';
  $('puzzleHint').disabled=solved;$('puzzleHintText').textContent=p.hint;
  $('puzzleTabs').replaceChildren(...tutorialPuzzles.map((p,i)=>{const b=doc.createElement('button');b.type='button';b.textContent=`第${i+1}問${completed.has(i)?' ✓':''}`;b.setAttribute('aria-pressed',String(index===i));b.onclick=()=>{index=i;reset();};return b;}));
  const legal=selected===null?[]:moves(state,selected);
  $('puzzleBoard').replaceChildren(...state.board.map((p,i)=>{
   const b=doc.createElement('button');b.type='button';b.className='cell'+(selected===i?' selected':'')+(legal.some(m=>m.to===i)?' legal':'')+(state.flipped.includes(i)?' flipped':'');b.disabled=solved;
   b.setAttribute('aria-label',`${9-i%9}列${Math.floor(i/9)+1}段 ${p?(p.side?'相手 ':'自分 ')+label(p):'空き'}`);
   if(p){const piece=doc.createElement('span');piece.className='piece'+(p.side?' enemy':'')+(p.prom?' prom':'');piece.textContent=label(p);b.append(piece);}
   b.onclick=()=>choose(i);return b;
  }));
  $('puzzleHand').replaceChildren();
  for(const [type,count]of Object.entries(state.hands[0]))if(count){const b=doc.createElement('button');b.type='button';b.textContent=label({type})+' ×'+count;b.disabled=solved;b.setAttribute('aria-pressed',String(selected===type));b.onclick=()=>{selected=type;draw();};$('puzzleHand').append(b);}
  if(!$('puzzleHand').children.length)$('puzzleHand').textContent='持ち駒なし';
 }
 function choose(to){
  if(solved)return;
  const options=selected===null?[]:moves(state,selected).filter(m=>m.to===to),move=options.find(m=>!m.prom)||options[0];
  if(!move){selected=state.board[to]?.side===0?to:null;draw();return;}
  const result=tryPuzzleMove(state,move,tutorialPuzzles[index].goal);selected=null;
  if(result.correct){state=result.state;solved=true;completed.add(index);$('puzzleStatus').textContent='正解！ '+tutorialPuzzles[index].explanation;}
  else $('puzzleStatus').textContent=tutorialPuzzles[index].goal==='defend'?'この手では王を守れません。元の局面でもう一度考えてみましょう。':'この手ではまだ王を取れません。元の局面でもう一度考えてみましょう。';
  draw();
 }
 $('tutorialPuzzleLaunch').onclick=()=>{$('tutorialMenu').close();index=0;completed.clear();reset();dialog.showModal();};
 $('closePuzzles').onclick=()=>{dialog.close();$('tutorialMenu').showModal();};
 $('puzzleReset').onclick=reset;$('puzzleHint').onclick=()=>{$('puzzleHintText').hidden=false;};
 $('puzzleNext').onclick=()=>{if(index===tutorialPuzzles.length-1){dialog.close();}else{index++;reset();}};
}
if(typeof document!=='undefined'&&document.getElementById('tutorialPuzzles'))initTutorialPuzzles(document);
