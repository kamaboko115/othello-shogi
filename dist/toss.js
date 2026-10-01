// Five coins land over 1 second with 100 ms stagger. Keep the result still
// for another second before Osesho changes it.
export const tossLandingMs=1400, tossPauseMs=1000, tossInterventionMs=1400;
export function presentToss({toss,playerSide,dialog,coins,result,close,isCurrent,schedule=setTimeout}){
 const show=faces=>coins.replaceChildren(...faces.map((face,i)=>{
  const el=document.createElement('span');el.className='toss-piece';el.textContent=face?'歩':'と';el.style.animationDelay=(i*.1)+'s';return el;
 }));
 const counts=faces=>'歩 '+faces.filter(Boolean).length+'枚・と '+faces.filter(v=>!v).length+'枚。';
 dialog.classList.remove('osesho-intervention','toss-settled');dialog.hidden=false;
 show(toss.intervened?toss.originalCoins:toss.coins);close.disabled=!!toss.intervened;
 if(!toss.intervened){result.textContent=counts(toss.coins)+'あなたは'+(playerSide===0?'先手':'後手')+'です。';return;}
 result.textContent=counts(toss.originalCoins);
 schedule(()=>{
  if(!isCurrent())return;
  // The replacement spins all five coins together after the staggered toss.
  for(const coin of coins.children)coin.style.animationDelay='0s';
  dialog.classList.add('osesho-intervention');result.textContent='謎の力が駒に働きかける！！';
  schedule(()=>{
   if(!isCurrent())return;
   dialog.classList.remove('osesho-intervention');dialog.classList.add('toss-settled');show(toss.coins);
   result.textContent=counts(toss.coins)+'あなたは'+(playerSide===0?'先手':'後手')+'です。';close.disabled=false;
  },tossInterventionMs);
 },tossLandingMs+tossPauseMs);
}
