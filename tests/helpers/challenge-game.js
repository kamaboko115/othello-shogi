import {packReplayState} from '../../dist/replay-code.js';
import {initial,moves,play,collapseAfterMove} from '../../dist/engine.js';
export function challengeGame(seed=1,{long=false}={}){
 let value=seed>>>0;const rand=n=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value%n;};
 let state=initial(true);state.noDrops=false;state.moveLimit=false;state.paradoxAt=200;
 const steps=[];
 while(!state.result&&state.ply<1000){
  const all=[...state.board.flatMap((p,i)=>p?.side===state.turn?[i]:[]),...Object.keys(state.hands[state.turn])].flatMap(src=>moves(state,src));
  if(!all.length)break;
  let candidates=all;
  if(long&&state.ply<205){const quiet=all.filter(m=>!play(state,m).result);if(quiet.length)candidates=quiet;}
  else {const win=all.filter(m=>state.board[m.to]?.type==='K');if(win.length)candidates=win;}
  const move=candidates[rand(candidates.length)],rolls=[];
  state=collapseAfterMove(play(state,move));
  steps.push({move,helper:false});
 }
 return {proof:{v:1,steps,final:packReplayState(state)},ply:state.ply,result:state.result};
}
export function winningChallenge(long=false){for(let seed=1;seed<100;seed++){const game=challengeGame(seed,{long});if(game.result.startsWith('後手の勝ち')&&(!long||game.ply>200))return game;}throw Error('No fixture');}
