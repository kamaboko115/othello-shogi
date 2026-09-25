import {inCheck} from './engine.js';

// Called only for a newly played move, never for polling or undo.
export function moveEffect(state){
 if(state.result)return state.result.includes('の勝ち')?{kind:'victory',text:state.result.split('（')[0]}:null;
 if(inCheck(state,state.turn))return {kind:'check',text:'王手'};
 if(state.flipped.length>=2)return {kind:'flip',text:state.flipped.length+'枚抜き'};
 return null;
}
