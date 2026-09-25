// Two soft pulses cross-fade from the old owner's stone color to the new one.
export function animateFlipLight(cell,newSide,duration,elapsed=0){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches||elapsed>=duration)return;
 for(const [index,color] of [newSide===0?'white':'black',newSide===0?'black':'white'].entries()){
  const glow=document.createElement('span');glow.className='flip-light '+color;glow.setAttribute('aria-hidden','true');cell.append(glow);
  const animation=glow.animate(index===0?
   [{opacity:0,transform:'scale(.25)'},{offset:.2,opacity:.85,transform:'scale(.85)'},{offset:.55,opacity:0,transform:'scale(1.15)'},{opacity:0,transform:'scale(1.2)'}]:
   [{opacity:0,transform:'scale(.25)'},{offset:.35,opacity:0,transform:'scale(.35)'},{offset:.65,opacity:.85,transform:'scale(.95)'},{opacity:0,transform:'scale(1.2)'}],
   {duration,easing:'ease-out'});
  animation.currentTime=elapsed;animation.onfinish=()=>glow.remove();
 }
}
