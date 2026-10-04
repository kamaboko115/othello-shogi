import {showChallengeCelebration} from './challenge-celebration.js';
import {showVictory,runEffects} from './move-effect.js';
import {playResultSound} from './sound.js';
const button=document.getElementById('previewWin'),result=document.getElementById('resultHeading'),status=document.getElementById('previewStatus'),badge=document.getElementById('challengeVictory');
let controller=null;
button.onclick=async()=>{
 controller?.abort();controller=new AbortController();const signal=controller.signal;let flare=null;
 button.disabled=true;result.hidden=true;badge.classList.remove('challenge-crowned');status.textContent='勝利演出を再生中…';
 await runEffects([{kind:'victory',text:'後手の勝ち'}],{signal,show:effect=>flare=showVictory(effect,1),hide:()=>{flare?.remove();flare=null;},victory:()=>playResultSound(true,signal),applause:()=>{}});
 if(signal.aborted)return;result.hidden=false;showChallengeCelebration(badge,123);button.disabled=false;status.textContent='再生完了。何度でも試せます。';
};
window.addEventListener('pagehide',()=>controller?.abort());
