// Reparent the existing character, retaining its old on-screen position while
// it flies to the new layout position. Repeated renders do not restart travel.
const travels=new WeakMap();
export function placeHelper(actor,{home,opponent,visiting=false,travel=false,sound=()=>{},reducedMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches}){
 const target=opponent&&!visiting?opponent:home.parentElement;
 const alreadyPlaced=opponent&&!visiting?actor.parentElement===target:actor.previousElementSibling===home;
 if(alreadyPlaced)return false;
 const before=actor.getBoundingClientRect();
 travels.get(actor)?.cancel();travels.delete(actor);actor.classList.remove('helper-travelling');
 if(opponent&&!visiting)target.prepend(actor);else home.after(actor);
 if(!travel||actor.hidden)return true;
 sound();
 const after=actor.getBoundingClientRect();
 if(reducedMotion()||!before.width||!after.width)return true;
 actor.classList.add('helper-travelling');
 const animation=actor.animate([
  {transform:`translate(${before.left-after.left}px,${before.top-after.top}px) scale(${before.width/after.width})`},
  {transform:'translate(0,0) scale(1)'}
 ],{duration:450,easing:'cubic-bezier(.2,.8,.3,1)'});
 travels.set(actor,animation);
 const finished=()=>{if(travels.get(actor)!==animation)return;travels.delete(actor);actor.classList.remove('helper-travelling');};
 animation.onfinish=finished;animation.oncancel=finished;
 return true;
}
