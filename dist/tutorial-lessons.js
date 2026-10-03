import {empty,moves,play,collapseAfterMove,collapseTargets} from './engine.js';

// The demonstrated move is also exercised by the rule tests.
export const lessons=[
 {title:'横に挟んでみよう',text:'5列6段の歩を1マス上へ。横に並ぶ3枚が味方になります。間に空きマスがあると挟めません。',pieces:[[36,'P',0],[49,'P',0],[37,'P',1],[38,'G',1],[39,'S',1]],move:{from:49,to:40},flips:3},
 {title:'縦にも挟める',text:'5列6段の金を1マス上へ。縦に並ぶ2枚を、上の味方の歩と挟みましょう。',pieces:[[49,'G',0],[31,'P',1],[22,'S',1],[13,'P',0]],move:{from:49,to:40},flips:2},
 {title:'斜めにも挟める',text:'5列6段の歩を1マス上へ。左上へ並ぶ2枚を挟めます。縦・横・斜めの合計8方向で同じルールです。',pieces:[[49,'P',0],[30,'P',1],[20,'S',1],[10,'G',0]],move:{from:49,to:40},flips:2},
 {title:'縦・横・斜めを同時に挟む',text:'5列6段の歩を1マス上へ。縦・横・斜めの3方向で同時に挟み、3枚まとめて味方にできます。',pieces:[[49,'P',0],[39,'P',1],[38,'G',0],[31,'S',1],[22,'P',0],[30,'N',1],[20,'G',0]],move:{from:49,to:40},flips:3},
 {title:'長い列もまとめて反転',text:'1列6段の歩を1マス上へ。横に並ぶ7枚を一度に挟めます。枚数による制限はなく、盤内で敵駒が途切れず続けば全部が味方になります。',pieces:[[36,'G',0],[53,'P',0],...['P','L','N','S','G','B','R'].map((t,i)=>[37+i,t,1])],move:{from:53,to:44},flips:7},
 {title:'持ち駒を打っても挟める',text:'下の駒台の「金」を選び、光る5列5段の空きマスへ打ちましょう。移動だけでなく、持ち駒を置いたときも挟んだ2枚が反転します。',pieces:[[37,'P',0],[38,'P',1],[39,'S',1]],hand:{G:1},move:{drop:'G',to:40},flips:2},
 {title:'王を取ってみよう',text:'5列7段の飛車で5列4段の王を取りましょう。衝撃波のあとに勝利が表示されます。',pieces:[[58,'R',0],[31,'K',1]],enemyKing:31,move:{from:58,to:31},flips:0},
 {title:'王も挟める！',text:'5列6段の歩を1マス上へ。王と金を挟んで、王ごと味方にすると勝利です。',pieces:[[37,'P',0],[49,'P',0],[38,'K',1],[39,'G',1]],enemyKing:38,move:{from:49,to:40},flips:2},
 {title:'盤面崩壊（終末）',text:'149手目から開始です。開始手では予告だけが出て、次の手から敵・味方の駒がランダムに1枚壊れます。ここでは破壊の代わりに龍か馬が合計3枚降臨する場面も体験できます。王の壊れやすさはほかの駒の1/10です。王が壊れると決着です。対局前に「盤面崩壊：無制限」を選ぶとオフにできます。上級者にはオフがおすすめです。',collapse:true,enemyKing:8,collapseSequence:[54,7,17,16,6,null,8],pieces:[[58,'R',0],[64,'B',0],[75,'G',0],[77,'G',0],[74,'S',0],[78,'S',0],[54,'P',0],[56,'P',0],[60,'P',0],[62,'P',0],[10,'R',1],[20,'B',1],[7,'G',1],[17,'G',1],[16,'S',1],[6,'L',1],[24,'P',1],[25,'P',1],[26,'P',1]],move:{from:58,to:49},flips:0}
];

// Guided lessons allow only the demonstrated first move; collapse remains free play.
export function tutorialMoves(state,index,source){
 const available=moves(state,source),lesson=lessons[index];
 if(lesson.collapse)return available;
 if(state.ply!==0)return [];
 const expected=lesson.move;
 return available.filter(m=>m.from===expected.from&&m.to===expected.to&&m.drop===expected.drop&&!m.prom);
}

export function lessonState(index){
 const lesson=lessons[index];if(!lesson)throw Error('Unknown lesson');
 const s=empty();s.moveLimit=false;s.paradoxAt=lesson.collapse?150:false;s.ply=lesson.collapse?149:0;
 for(const [i,type,side]of [[76,'K',0],[lesson.enemyKing??4,'K',1],...lesson.pieces])s.board[i]={type,side,prom:false};
 s.hands[0]={...lesson.hand};return s;
}

// Keep the demonstration's remaining collapse targets in place.
export function collapseReply(state,remaining){
 const sources=state.board.flatMap((p,i)=>p?.side===state.turn&&p.type!=='K'?[i]:[]);
 return sources.flatMap(src=>moves(state,src)).find(move=>{
  if(remaining.includes(move.from)||remaining.includes(move.to))return false;
  const next=play(state,move);return !next.result&&remaining.every(i=>next.board[i]?.side===state.board[i]?.side);
 });
}

// Deterministic outcomes only in the lesson. Real matches keep normal randomness.
export function collapseLesson(state,step){
 const preferred=lessons.at(-1).collapseSequence[step];
 if(preferred===null)return collapseAfterMove(state,()=>0,()=>true);
 const choices=collapseTargets(state),picked=choices.indexOf(preferred);
 return collapseAfterMove(state,()=>picked>=0?picked:0);
}
