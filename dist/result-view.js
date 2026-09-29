import {points} from './engine.js';
export function resultView(state,side=0){
 const result=state.result||'';
 if(!result)return null;
 const winner=result.startsWith('先手の勝ち')?0:result.startsWith('後手の勝ち')?1:null;
 const title=winner===null?'引き分け':winner===side?'あなたの勝ち':'あなたの負け';
 let reason=result.match(/（(.+)）/)?.[1]||result;
 let detail=state.ply+'手',square=null;
 if(result.includes('王を反転')){reason='王を挟んで決着';square=state.flipped.find(i=>state.board[i]?.type==='K')??null;}
 else if(result.includes('王を取った')){reason='王を取って決着';square=state.last.at(-1)??null;}
 else if(result.includes('王が崩壊')){reason='盤面崩壊で王が消滅';square=state.destroyed?.square??null;}
 else if(result.includes('60手')){reason='オセロジャッジで'+(winner===null?'引き分け':'決着');const scores=points(state);detail='60手 · 盤上の駒 あなた '+scores[side]+'枚 ／ 相手 '+scores[1-side]+'枚';}
 else if(result.includes('投了'))reason=winner===side?'相手の投了で決着':'あなたの投了で決着';
 else if(result.includes('合意'))reason='両者の合意で引き分け';
 else if(result.includes('指せる手なし'))reason='指せる手がなくなり決着';
 return {title,reason,detail,square};
}
