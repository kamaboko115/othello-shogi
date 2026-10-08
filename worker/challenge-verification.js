import {moves} from '../dist/engine.js';
import {unpackReplayState} from '../dist/replay-code.js';

// Low-cost plausibility check, NOT full replay or proof of playing genuine AI.
// Client histories and final boards remain untrusted; back up the aggregate.
export const challengeProofMaxBytes=98304;
export function verifyChallengeProof(body){
 const proof=body.proof;
 if(proof?.v!==1||!Array.isArray(proof.steps)||!proof.steps.length||proof.steps.length>1000||proof.steps.length!==body.ply)return false;
 let helpers=0;
 for(const step of proof.steps){
  if(!step||typeof step.helper!=='boolean'||step.helper&&++helpers>3)return false;
  const m=step.move;if(!m||!Number.isInteger(m.to)||m.to<0||m.to>80)return false;
  if(m.drop? !['P','L','N','S','G','B','R'].includes(m.drop)||m.from!==undefined||m.prom!==undefined:!Number.isInteger(m.from)||m.from<0||m.from>80||m.from===m.to||typeof m.prom!=='boolean')return false;
 }
 try{
  const final=unpackReplayState(proof.final);
  if(final.ply!==body.ply||!final.board.some(p=>p?.type==='K'&&p.side===1))return false;
  if(body.result==='後手の勝ち（指せる手なし）'){
   if(final.turn!==0)return false;
   const sources=[...final.board.flatMap((p,i)=>p?.side===0?[i]:[]),...Object.keys(final.hands[0])];
   return !sources.some(src=>moves(final,src).length);
  }
  if(!['後手の勝ち（王を取った）','後手の勝ち（王を反転）','後手の勝ち（パラドックスで王が崩壊）','後手の勝ち（復活の爆発で王が崩壊）'].includes(body.result))return false;
  return !final.board.some(p=>p?.type==='K'&&p.side===0);
 }catch{return false;}
}
