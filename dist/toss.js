// Five coins land over 1 second with 100 ms stagger. The ordinary result
// stays visible for a second before Osesho shatters it, cuts in, and changes it.
const interventionSpeed=3/5;
export const tossLandingMs=1400, tossPauseMs=1000, tossShatterMs=Math.round(650/interventionSpeed), tossCutInMs=1000, tossInterventionMs=Math.round(1400/interventionSpeed);
export function presentToss({toss,playerSide,dialog,coins,result,banner,cutin,close,isCurrent,onShatter=()=>{},schedule=setTimeout}){
 const show=faces=>coins.replaceChildren(...faces.map((face,i)=>{
  const el=document.createElement('span');el.className='toss-piece';el.textContent=face?'歩':'と';el.style.animationDelay=(i*.1)+'s';return el;
 }));
 const counts=faces=>'歩 '+faces.filter(Boolean).length+'枚・と '+faces.filter(v=>!v).length+'枚。';
 const showSide=n=>{
  const text=n===0?'先手':'後手',label=document.createElement('strong');label.className='toss-side-label';label.textContent=text;
  // Copies of the glyphs are clipped into fragments; the intact label is the
  // only accessible text, and returns after the intervention finishes.
  const shards=Array.from({length:8},(_,i)=>{const el=document.createElement('span');el.className='toss-side-shard';el.textContent=text;el.setAttribute('aria-hidden','true');el.style.setProperty('--shard',i);el.style.setProperty('--fly-x',(i%2?-1:1)*(45+i*14)+'px');el.style.setProperty('--fly-y',(-85+i*25)+'px');el.style.setProperty('--spin',(i%2?-1:1)*(16+i*7)+'deg');return el;});
  banner.replaceChildren(label,...shards);banner.hidden=false;
 };
 const original=toss.intervened?toss.originalCoins:toss.coins;
 // Use the same durations for the CSS motion and its stage transitions.
 dialog.style.setProperty('--toss-shatter-duration',tossShatterMs+'ms');
 dialog.style.setProperty('--toss-intervention-duration',tossInterventionMs+'ms');
 dialog.style.setProperty('--toss-cutin-duration',tossCutInMs+'ms');
 if(cutin)cutin.hidden=true;
 dialog.classList.remove('osesho-intervention','toss-settled','toss-shattering');dialog.hidden=false;banner.hidden=true;
 show(original);close.disabled=true;result.textContent=counts(original);
 schedule(()=>{
  if(!isCurrent())return;
  const initialSide=toss.intervened?1-playerSide:playerSide;showSide(initialSide);
  result.textContent=counts(original)+'あなたは'+(initialSide===0?'先手':'後手')+'です。';
  if(!toss.intervened){close.disabled=false;return;}
  schedule(()=>{
   if(!isCurrent())return;
   dialog.classList.add('toss-shattering');result.textContent='先手のはずが…！？';
   onShatter();
   schedule(()=>{
    if(!isCurrent())return;
    banner.hidden=true;dialog.classList.remove('toss-shattering');
    if(cutin)cutin.hidden=false;result.textContent='オセショ様が振り駒に介入！';
    schedule(()=>{
     if(!isCurrent())return;
     if(cutin)cutin.hidden=true;
     for(const coin of coins.children)coin.style.animationDelay='0s';
     dialog.classList.add('osesho-intervention');result.textContent='謎の力が駒に働きかける！！';
     schedule(()=>{
      if(!isCurrent())return;
      dialog.classList.remove('osesho-intervention');dialog.classList.add('toss-settled');show(toss.coins);showSide(playerSide);
      result.textContent=counts(toss.coins)+'あなたは'+(playerSide===0?'先手':'後手')+'です。';close.disabled=false;
     },tossInterventionMs);
    },tossCutInMs);
   },tossShatterMs);
  },tossPauseMs);
 },tossLandingMs);
}
