import {empty} from './engine.js';

// The demonstrated move is also exercised by the rule tests.
export const lessons=[
 {title:'横に挟んでみよう',text:'5列6段の歩を1マス上へ。横に並ぶ3枚が味方になります。間に空きマスがあると挟めません。',pieces:[[36,'P',0],[49,'P',0],[37,'P',1],[38,'G',1],[39,'S',1]],move:{from:49,to:40},flips:3},
 {title:'縦にも挟める',text:'5列6段の金を1マス上へ。縦に並ぶ2枚を、上の味方の歩と挟みましょう。',pieces:[[49,'G',0],[31,'P',1],[22,'S',1],[13,'P',0]],move:{from:49,to:40},flips:2},
 {title:'斜めにも挟める',text:'5列6段の歩を1マス上へ。左上へ並ぶ2枚を挟めます。縦・横・斜めの合計8方向で同じルールです。',pieces:[[49,'P',0],[30,'P',1],[20,'S',1],[10,'G',0]],move:{from:49,to:40},flips:2},
 {title:'長い列もまとめて反転',text:'1列6段の歩を1マス上へ。横に並ぶ7枚を一度に挟めます。枚数による制限はなく、盤内で敵駒が途切れず続けば全部が味方になります。',pieces:[[36,'G',0],[53,'P',0],...['P','L','N','S','G','B','R'].map((t,i)=>[37+i,t,1])],move:{from:53,to:44},flips:7},
 {title:'持ち駒を打っても挟める',text:'下の駒台の「金」を選び、光る5列5段の空きマスへ打ちましょう。移動だけでなく、持ち駒を置いたときも挟んだ2枚が反転します。',pieces:[[37,'P',0],[38,'P',1],[39,'S',1]],hand:{G:1},move:{drop:'G',to:40},flips:2},
 {title:'王を取ってみよう',text:'5列7段の飛車で5列4段の王を取りましょう。衝撃波のあとに勝利が表示されます。',pieces:[[58,'R',0],[31,'K',1]],enemyKing:31,move:{from:58,to:31},flips:0},
 {title:'王も挟める！',text:'5列6段の歩を1マス上へ。王と金を挟んで、王ごと味方にすると勝利です。',pieces:[[37,'P',0],[49,'P',0],[38,'K',1],[39,'G',1]],enemyKing:38,move:{from:49,to:40},flips:2},
 {title:'盤面崩壊（終末）',text:'149手目から開始です。光る飛車を1マス前へ動かして150手目の崩壊を体験しましょう。毎手、敵味方の盤上からランダムに1枚壊れます。王も対象です。対局前に「盤面崩壊：無制限」を選ぶとオフにできます。',collapse:true,pieces:[[58,'R',0],[10,'R',1],[64,'B',0],[16,'B',1],[75,'G',0],[77,'G',0],[3,'G',1],[5,'G',1],[74,'S',0],[78,'S',0],[2,'S',1],[6,'S',1],[54,'P',0],[56,'P',0],[60,'P',0],[62,'P',0],[18,'P',1],[20,'P',1],[24,'P',1],[26,'P',1]],move:{from:58,to:49},flips:0}
];

export function lessonState(index){
 const lesson=lessons[index];if(!lesson)throw Error('Unknown lesson');
 const s=empty();s.moveLimit=false;s.paradoxAt=lesson.collapse?150:false;s.ply=lesson.collapse?149:0;
 for(const [i,type,side]of [[76,'K',0],[lesson.enemyKing??4,'K',1],...lesson.pieces])s.board[i]={type,side,prom:false};
 s.hands[0]={...lesson.hand};return s;
}
