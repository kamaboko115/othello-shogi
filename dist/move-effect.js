import {inCheck} from './engine.js';
export const isVictoryFor=(effect,perspective=0)=>effect.text.startsWith(perspective===0?'先手':'後手');
export function showVictory(effect,perspective=0,parent=document.body){
 const won=isVictoryFor(effect,perspective);
 const el=document.createElement('div');el.className='victory-flare'+(won?'':' defeat');el.setAttribute('role','status');
 const words=document.createElement('strong');words.textContent=won?'YOU WIN':'YOU LOSE';el.append(words);parent.append(el);return el;
}

// Called only for a newly played move, never for polling or undo.
export function moveEffect(state){
 if(state.result)return state.result.includes('の勝ち')?{kind:'victory',text:state.result.split('（')[0]}:null;
 if(inCheck(state,state.paradoxEvent?.kind==='extra'?1-state.paradoxEvent.side:state.turn))return {kind:'check',text:'王手'};
 if(state.flipped.length>=2)return {kind:'flip',text:state.flipped.length+'枚抜き'};
 return null;
}

export function moveEffects(state){
 const effect=moveEffect(state);
 if(state.result||state.flipped.length<4)return effect?[effect]:[];
 return [{kind:'flip',text:state.flipped.length+'枚抜き'},{kind:'applause'},...(effect?.kind==='check'?[effect]:[])];
}

export async function runEffects(effects,{show,hide,applause,victory,signal}){
 const wait=(ms=1000)=>new Promise(resolve=>{const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,ms);signal?.addEventListener('abort',done,{once:true});if(signal?.aborted)done();});
 try{for(let i=0;i<effects.length;i++){const effect=effects[i];
  if(signal?.aborted)return;
  if(effect.kind==='applause'){applause(signal);continue;}
  if(effect.kind==='victory')victory(effect);
  show(effect);
  if(effect.kind==='flip'&&effects[i+1]?.kind==='applause'){
   await wait(1900);if(signal?.aborted)return;applause(signal);i++;await wait(500);
  }else await wait(effect.kind==='victory'?2100:1000);
  hide();
 }}finally{hide();}
}
