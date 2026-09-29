import {label} from './engine.js';
export const comboTier=count=>count>=4?'tier-rainbow':count===3?'tier-platinum':count===2?'tier-gold':'';
export async function runSword(board,square,signal){
 if(signal?.aborted||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const cell=board.querySelector(`[data-square="${square}"]`);if(!cell)return;
 const b=cell.getBoundingClientRect(),r=board.getBoundingClientRect(),layer=document.createElement('span');
 layer.className='sword-impact';layer.setAttribute('aria-hidden','true');layer.style.left=b.left-r.left+b.width/2+'px';layer.style.top=b.top-r.top+b.height/2+'px';
 layer.innerHTML='<span class="sword-halo"></span><svg class="falling-sword" viewBox="0 0 100 240"><path fill="#26385a" stroke="#b5edff" stroke-width="3" d="M43 8H57V53H43Z"/><path fill="#ffd66d" stroke="#fff3b0" stroke-width="3" d="M18 49L50 61L82 49L88 65L55 77H45L12 65Z"/><path fill="#dbf7ff" stroke="#68caff" stroke-width="3" d="M39 76H61L58 194L50 233L42 194Z"/><path fill="#fff" d="M49 77H53L50 223Z"/><circle cx="50" cy="61" r="9" fill="#ff58ce"/></svg><span class="sword-shock"></span>';
 board.append(layer);let timer;
 try{await new Promise(resolve=>{const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();};timer=setTimeout(done,950);signal?.addEventListener('abort',done,{once:true});if(signal?.aborted)done();});}finally{layer.remove();}
}
export function slidingMove(before,after){
 if(after.ply!==before.ply+1||after.last.length!==2)return null;
 const [from,to]=after.last,p=before.board[from];
 return p?{from,to,major:['R','B'].includes(p.type),rainbow:['R','B'].includes(p.type)&&!!p.prom,promoting:!p.prom&&!!after.board[to]?.prom,beforeLabel:label(p)}:null;
}
export async function runSlide(move,board,signal){
 if(!move||signal?.aborted||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const from=board.querySelector(`[data-square="${move.from}"]`),to=board.querySelector(`[data-square="${move.to}"]`),piece=to?.querySelector('.piece');
 if(!from||!piece)return;
 const a=from.getBoundingClientRect(),b=to.getBoundingClientRect(),r=board.getBoundingClientRect(),dx=a.left-b.left,dy=a.top-b.top,duration= Math.min(480,260+Math.hypot(dx,dy)*.4),rotation=piece.classList.contains('enemy')?' rotate(180deg)':'',animations=[],nodes=[],oldZ=to.style.zIndex;
 to.style.zIndex='8';
 const finalLabel=piece.textContent,wasProm=piece.classList.contains('prom');if(move.promoting){piece.textContent=move.beforeLabel;piece.classList.remove('prom');}
 const add=(node,frames,options)=>{board.append(node);nodes.push(node);animations.push(node.animate(frames,options));};
 try{
  if(move.rainbow){
   const angle=Math.atan2(dy,dx)*180/Math.PI,length=Math.min(115,Math.max(48,Math.hypot(dx,dy)*.55));
   for(const spread of [-30,0,30]){
    const ray=document.createElement('span');ray.className='slide-rainbow-ray';ray.setAttribute('aria-hidden','true');
    ray.style.cssText=`left:${a.left-r.left+a.width/2}px;top:${a.top-r.top+a.height/2}px;width:${length}px;`;
    const pose=(x,y,scale)=>`translate(${x}px,${y}px) rotate(${angle+spread}deg) scaleX(${scale})`;
    add(ray,[{opacity:0,transform:pose(0,0,.15)},{offset:.15,opacity:.9,transform:pose(-dx*.32,-dy*.32,.8)},{offset:.8,opacity:.85,transform:pose(-dx*.97,-dy*.97,1)},{opacity:0,transform:pose(-dx,-dy,.3)}],{duration,fill:'both',easing:'linear'});
   }
  }
  for(let i=0;i<(move.major?(move.rainbow?18:7):0);i++){
   const t=i/(move.rainbow?18:7),dot=document.createElement('span');dot.className='slide-spark';
   dot.style.cssText=`left:${a.left-r.left+a.width/2-dx*t}px;top:${a.top-r.top+a.height/2-dy*t}px;background:${move.rainbow?`hsl(${t*360} 100% 70%)`:'#a9f4ff'};color:${move.rainbow?`hsl(${t*360} 100% 70%)`:'#a9f4ff'};`;
   add(dot,[{opacity:0,transform:'scale(.3)'},{offset:.15,opacity:.9,transform:'scale(1.2)'},{opacity:0,transform:'scale(.1)'}],{delay:duration*t*.7,duration:220,fill:'both'});
  }
  const glide=piece.animate([{transform:`translate(${dx}px,${dy}px)${rotation}`,filter:move.major?'brightness(1.2)':'none'},{offset:.8,transform:`translate(${dx*.03}px,${dy*.03}px)${rotation}`,filter:move.rainbow?'brightness(1.5) drop-shadow(0 0 8px #b5ffff)':move.major?'brightness(1.15)':'none'},{transform:`translate(0,0)${rotation}`,filter:'brightness(1)'}],{duration,easing:'cubic-bezier(.2,.65,.25,1)',fill:'both'});
  animations.push(glide);
  const abort=()=>animations.forEach(a=>a.cancel());signal?.addEventListener('abort',abort,{once:true});
  try{
   await Promise.all(animations.map(a=>a.finished.catch(()=>{})));
   if(move.promoting&&!signal?.aborted){
    // Cancelling a finished Web Animation creates a new pending finished promise.
    // Only await animations created for the promotion phase.
    const promotionStart=animations.length;glide.cancel();
    if(move.major)await runSword(board,move.to,signal);
    if(signal?.aborted)return;
    piece.textContent=finalLabel;piece.classList.toggle('prom',wasProm);
    const turn=piece.animate([{transform:`${rotation} rotateY(0deg) scale(1)`},{offset:.5,transform:`${rotation} rotateY(180deg) scale(${move.major?1.4:1.16})`,filter:move.major?'brightness(1.7) drop-shadow(0 0 12px #ffe780)':'brightness(1.2)'},{transform:`${rotation} rotateY(360deg) scale(1)`}],{duration:move.major?600:400,easing:'ease-in-out'});animations.push(turn);
    if(move.major)for(let i=0;i<16;i++){
     const dot=document.createElement('span');dot.className='slide-spark';dot.style.cssText=`left:${b.left-r.left+b.width/2}px;top:${b.top-r.top+b.height/2}px;background:hsl(${i*22.5} 100% 75%);color:hsl(${i*22.5} 100% 75%)`;
     const angle=i*Math.PI/8,reach=b.width*.95;
     add(dot,[{opacity:0,transform:'translate(0,0) scale(.2)'},{offset:.2,opacity:1},{opacity:0,transform:`translate(${Math.cos(angle)*reach}px,${Math.sin(angle)*reach}px) scale(.1)`}],{duration:500,delay:100,fill:'both'});
    }
    await Promise.all(animations.slice(promotionStart).map(a=>a.finished.catch(()=>{})));
   }
  }finally{signal?.removeEventListener('abort',abort);}
 }finally{animations.forEach(a=>a.cancel());nodes.forEach(n=>n.remove());piece.textContent=finalLabel;piece.classList.toggle('prom',wasProm);to.style.zIndex=oldZ;}
}
export const isImpactPiece=piece=>!!piece&&(piece.prom||piece.type==='R'||piece.type==='B');
export const flipNeedsShake=state=>state.flipped.length>=2||state.flipped.some(i=>isImpactPiece(state.board[i]));
export function shakeScreen(root,signal,strong=false){
 if(signal?.aborted||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const target=root?.closest?.('dialog')||document.querySelector?.('main');if(!target?.animate)return;
 const amount=strong?8:5;
 const anim=target.animate([{transform:'translate(0,0)'},{transform:`translate(${-amount}px,2px)`},{transform:`translate(${amount}px,-3px)`},{transform:`translate(${-amount*.65}px,1px)`},{transform:`translate(${amount*.35}px,-1px)`},{transform:'translate(0,0)'}],{duration:220,easing:'ease-out'});
 const cancel=()=>anim.cancel();signal?.addEventListener('abort',cancel,{once:true});anim.finished.catch(()=>{}).finally(()=>signal?.removeEventListener('abort',cancel));return anim;
}
import {playComboSound,quietComboSounds,playComboImpact,playSmallComboFinish,playFireworks,fireworkInterval,playCaptureSound,playMoveSound} from './sound.js';
export function capturedPiece(before,after){
 if(after.result||after.ply!==before.ply+1||after.last.length!==2)return null;
 const piece=before.board[after.last[1]];
 return piece&&piece.side!==before.turn&&piece.type!=='K'?{...piece,side:before.turn,square:after.last[1]}:null;
}
export async function runCapture(capture,signal,view={}){
 if(signal?.aborted)return;
 playMoveSound();
 const source=(view.board||document.querySelector('#board')).querySelector('[data-square="'+capture.square+'"]'),target=(view.hand||document.querySelector('#hand'+capture.side)).querySelector('[data-type="'+capture.type+'"]');
 if(!source||!target)return;
 const major=['R','B'].includes(capture.type),a=source.getBoundingClientRect(),b=target.getBoundingClientRect(),dot=document.createElement('span'),animations=[];
 dot.className='capture-light'+(major?' major':'');dot.setAttribute('aria-hidden','true');dot.style.left=(a.left+a.width/2)+'px';dot.style.top=(a.top+a.height/2)+'px';(view.overlay||document.body).append(dot);playCaptureSound(major);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(view.shake!==false&&isImpactPiece(capture)){const shake=shakeScreen(view.overlay||source,signal);if(shake)animations.push(shake);}
 let timer,abort;
 try{
  if(!reduced){const dx=b.left+b.width/2-a.left-a.width/2,dy=b.top+b.height/2-a.top-a.height/2;
   animations.push(dot.animate([{opacity:1,transform:'translate(-50%,-50%) scale(1.3)'},{offset:.5,opacity:1,transform:`translate(calc(-50% + ${dx*.5}px),calc(-50% + ${dy*.5-35}px)) scale(1)`},{opacity:0,transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(.4)`}],{duration:230,fill:'both',easing:'ease-in'}));
  }else dot.hidden=true;
  animations.push(target.animate([{boxShadow:'inset 0 0 0 2px #fff2a5,0 0 18px #ffe18c',filter:'brightness(1.5)'},{boxShadow:'none',filter:'brightness(1)'}],{delay:reduced?0:230,duration:100,fill:'none'}));
  await new Promise(resolve=>{abort=resolve;timer=setTimeout(resolve,330);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)resolve();});
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);animations.forEach(a=>a.cancel());dot.remove();}
}
export const comboTiming=(index,total)=>({duration:Math.max(140,360-index*32),pause:0});
export function decorateFinish(el,count){
 const stopSound=count>=4?playFireworks(count):()=>{};
 if(count<2||matchMedia('(prefers-reduced-motion: reduce)').matches)return stopSound;
 const nodes=[],animations=[];
 let layer=el.parentElement;
 if(count>=4){layer=document.createElement('div');layer.className='firework-layer';layer.setAttribute('aria-hidden','true');el.parentElement.append(layer);nodes.push(layer);}
 const add=cls=>{const node=document.createElement('span');node.className=cls;node.setAttribute('aria-hidden','true');layer.append(node);nodes.push(node);return node;};
 const parent=el.parentElement.getBoundingClientRect();
 if(count>=4){
  const ringRadius=Math.min(parent.width,parent.height)*.32;
  const centers=Array.from({length:count},(_,i)=>{const angle=-Math.PI/2+i*2*Math.PI/count;return [.5+Math.cos(angle)*ringRadius/parent.width,.45+Math.sin(angle)*ringRadius/parent.height];});
  for(let b=0;b<centers.length;b++)for(let i=0;i<36;i++){
   const dot=add('finish-spark firework-spark'),angle=i/36*Math.PI*2,radius=Math.min(parent.width*.23,parent.height*.18)*(i%2?1:.65);
   dot.style.left=parent.width*centers[b][0]+'px';dot.style.top=parent.height*centers[b][1]+'px';dot.style.background=`hsl(${b*59+i*2} 100% 70%)`;dot.style.color=dot.style.background;
   animations.push(dot.animate([{opacity:0,transform:'translate(0,0) scale(.3)'},{opacity:1,offset:.12},{opacity:1,offset:.5},{opacity:0,transform:`translate(${Math.cos(angle)*radius}px,${Math.sin(angle)*radius+18}px) scale(.15)`}],{duration:850,delay:150+b*fireworkInterval(count),fill:'both',easing:'ease-out'}));
  }
  animations.push(el.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.8)'},{offset:.08,opacity:1,transform:'translate(-50%,-50%) scale(1.13)'},{offset:.16,opacity:1,transform:'translate(-50%,-50%) scale(1)'},{offset:.9,opacity:1},{opacity:0,transform:'translate(-50%,-50%) scale(1)'}],{duration:2400,fill:'forwards'}));
 }
 for(let i=0,n=count===2?10:count===3?18:0;i<n;i++){
  const dot=add(count>=4?'finish-spark firework-spark':'finish-spark'),angle=i/n*Math.PI*2;dot.style.left=parent.width*.5+'px';dot.style.top=parent.height*.45+'px';dot.style.background=count===2?'#ffe284':count===3?'#edfbff':`hsl(${i/n*360} 100% 65%)`;dot.style.color=dot.style.background;
  const radius=count>=4?Math.min(parent.width*.48,250)*(i%3===0?1:.7):100+count*10;
  animations.push(dot.animate([{opacity:0,transform:'translate(0,0) scale(.4)'},{opacity:1,offset:.12},{opacity:1,offset:.45},{opacity:0,transform:`translate(${Math.cos(angle)*radius}px,${Math.sin(angle)*radius*.75+35}px) scale(.2)`}],{duration:count>=4?700:650,delay:count>=4?80+(i%3)*85:80,fill:'forwards',easing:'ease-out'}));
 }
 if(count===2)animations.push(el.animate([{transform:'translate(-50%,-75%) scale(1.4)',opacity:0},{offset:.16,transform:'translate(-50%,-50%) scale(.95)',opacity:1},{offset:.3,transform:'translate(-50%,-50%) scale(1.06)'},{offset:.75,transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:'translate(-50%,-50%) scale(1)',opacity:0}],{duration:1000,fill:'forwards'}));
 if(count===3)animations.push(el.animate([{backgroundPosition:'180% 0'},{backgroundPosition:'-80% 0'}],{duration:650,fill:'forwards'}));
 return ()=>{stopSound();animations.forEach(a=>a.cancel());nodes.forEach(n=>n.remove());};
}
export function flipOrder(state){const to=state.last.at(-1);const distance=i=>Math.max(Math.abs(Math.floor(i/9)-Math.floor(to/9)),Math.abs(i%9-to%9));return [...state.flipped].sort((a,b)=>distance(a)-distance(b)||a-b);}
export async function runCombo(state,root,perspective,signal){
 const order=flipOrder(state),notice=document.createElement('div');notice.className='combo-notice';notice.setAttribute('aria-live','polite');root.append(notice);
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,particles=[],animations=[];
 const track=a=>{if(a)animations.push(a);};
 function smallFinish(el,count){
  playSmallComboFinish(Math.max(2,count));
  if(reduced||!el?.getBoundingClientRect||!root.getBoundingClientRect)return;
  const box=root.getBoundingClientRect(),source=el.getBoundingClientRect();
  const add=(className)=>{const node=document.createElement('span');node.className=className;node.setAttribute('aria-hidden','true');root.append(node);particles.push(node);return node;};
  if(count<=2){
   const ring=add('combo-gold-ring');ring.style.left=(source.left+source.width/2-box.left)+'px';ring.style.top=(source.top+source.height/2-box.top)+'px';
   track(ring.animate([{opacity:1,transform:'translate(-50%,-50%) scale(.3)'},{opacity:.9,offset:.35},{opacity:0,transform:'translate(-50%,-50%) scale(2.6)'}],{duration:240,easing:'ease-out',fill:'forwards'}));
  }else{
   const sweep=add('combo-silver-sweep');
   track(sweep.animate([{opacity:0,transform:'translateX(-110%) skewX(-20deg)'},{opacity:1,offset:.35},{opacity:0,transform:'translateX(110%) skewX(-20deg)'}],{duration:240,easing:'ease-out',fill:'forwards'}));
   for(let n=0;n<12;n++){
    const spark=add('combo-silver-spark'),angle=n*Math.PI/6;spark.style.left='50%';spark.style.top='45%';
    track(spark.animate([{opacity:0,transform:'translate(0,0) scale(.3)'},{opacity:1,offset:.2},{opacity:0,transform:`translate(${Math.cos(angle)*100}px,${Math.sin(angle)*70}px) scale(.2)`}],{duration:240,easing:'ease-out',fill:'forwards'}));
   }
  }
  track(notice.animate?.([{transform:'translate(-50%,-50%) scale(1)'},{offset:.35,transform:'translate(-50%,-50%) scale(1.26)'},{transform:'translate(-50%,-50%) scale(1)'}],{duration:230,easing:'ease-out'}));
 }
 function gather(el){
  if(reduced||!el?.getBoundingClientRect||!root.getBoundingClientRect)return;
  const box=root.getBoundingClientRect(),source=el.getBoundingClientRect(),target=notice.getBoundingClientRect();
  for(let n=0;n<3;n++){
   const dot=document.createElement('span');dot.className='combo-particle';dot.setAttribute('aria-hidden','true');dot.style.left=(source.left+source.width/2-box.left)+'px';dot.style.top=(source.top+source.height/2-box.top)+'px';dot.style.background=['#fff4b7','#aef7ef','#ecc3ff'][n];root.append(dot);particles.push(dot);
   const dx=target.left+target.width/2-source.left-source.width/2,dy=target.top+target.height/2-source.top-source.height/2;
   const animation=dot.animate([{opacity:0,transform:'translate(0,0) scale(.5)'},{offset:.15,opacity:1},{offset:.55,opacity:1,transform:`translate(${dx*.55+(n-1)*18}px,${dy*.55-22}px) scale(1)`},{opacity:0,transform:`translate(${dx}px,${dy}px) scale(.2)`}],{duration:220,delay:n*12,easing:'ease-in',fill:'forwards'});track(animation);animation.finished.then(()=>dot.remove()).catch(()=>{});
  }
 }
 const pieces=order.map(i=>root.querySelector('[data-square="'+i+'"] .piece'));
 pieces.forEach((el,j)=>{if(!el)return;el.classList.toggle('enemy',(state.board[order[j]]?.side??1-state.turn)===perspective);el.getAnimations().forEach(a=>a.cancel());el.style.transform=(state.board[order[j]]?.side??1-state.turn)===perspective?'rotate(180deg)':'rotate(0deg)';});
 const wait=ms=>new Promise(resolve=>{const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,ms);signal?.addEventListener('abort',done,{once:true});if(signal?.aborted)done();});
 try{for(let j=0;j<order.length;j++){
  if(signal?.aborted)return;
  const timing=comboTiming(j,order.length);
  if(timing.pause){quietComboSounds();await wait(timing.pause);if(signal?.aborted)return;}
  const el=pieces[j],enemy=(state.board[order[j]]?.side??1-state.turn)!==perspective,start=enemy?0:180;
  notice.className='combo-notice '+comboTier(j+1);notice.style.fontSize=`calc(clamp(32px,5vw,58px) * ${1.04**j})`;notice.textContent=order.length===1?'1combo':(j+1)+' combo';playComboSound(j+1);
  if(el){el.classList.toggle('enemy',enemy);el.style.transform='rotate('+(start+540)+'deg)';if(!reduced)track(el.animate([{transform:'rotate('+start+'deg) scale(1)'},{offset:.5,transform:'rotate('+(start+270)+'deg) scale(1.2)'},{transform:'rotate('+(start+540)+'deg) scale(1)'}],{duration:timing.duration,easing:'ease-in-out'}));}
  await wait(timing.duration);if(signal?.aborted)return;
  gather(el);
  if(j===order.length-1&&flipNeedsShake(state))track(shakeScreen(root,signal,order.length>=4));
  if(j===order.length-1&&(order.length>=1&&order.length<=3))smallFinish(el,order.length);
  if(j===order.length-1&&order.length>=4){
   playComboImpact();
   if(!reduced){track(notice.animate?.([{transform:'translate(-50%,-50%) scale(1)'},{transform:'translate(-50%,-50%) scale(1.3)'},{transform:'translate(-50%,-50%) scale(1)'}],{duration:220,easing:'ease-out'}));}
  }
  await wait(j===order.length-1&&!reduced?245:20);
 }}finally{notice.remove();particles.forEach(el=>el.remove());animations.forEach(a=>a.cancel());if(signal?.aborted)quietComboSounds();}
}

