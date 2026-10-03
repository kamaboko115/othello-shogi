import {beforeParadox,paradoxEventTiming,paradoxSummary,label} from './engine.js';
import {playTossCutInSound,playParadoxMotionSound} from './sound.js';

// Presentation only: the authoritative board has already been resolved once.
// Animate independent copies so a network/UI redraw cannot reveal final ownership early.
export async function runParadoxEvent(board,state,perspective=0,signal){
 const event=state.paradoxEvent;if(!event||signal?.aborted)return;
 const timing=paradoxEventTiming(event),old=beforeParadox(state),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const host=board.closest('dialog[open]')||document.body,layer=document.createElement('div');
 layer.className='paradox-cinema';layer.setAttribute('aria-hidden','true');host.append(layer);
 const field=document.createElement('div');field.className='paradox-cinema-board';layer.append(field);
 const rects=new Map(),tokens=new Map(),animations=[],sounds=[],timers=new Set();
 const sync=()=>{
  const rect=board.getBoundingClientRect();Object.assign(field.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});
  for(const cell of board.querySelectorAll('[data-square]')){const r=cell.getBoundingClientRect();rects.set(Number(cell.dataset.square),{x:100*(r.left-rect.left)/rect.width,y:100*(r.top-rect.top)/rect.height,w:100*r.width/rect.width,h:100*r.height/rect.height});}
 };
 sync();window.addEventListener('resize',sync);window.addEventListener('scroll',sync,true);
 const place=(el,square)=>{const r=rects.get(square);if(r)Object.assign(el.style,{left:r.x+'%',top:r.y+'%',width:r.w+'%',height:r.h+'%'});};
 for(let i=0;i<81;i++){
  const p=old.board[i];if(!p)continue;const wrap=document.createElement('span');wrap.className='paradox-token';place(wrap,i);
  const piece=document.createElement('span');piece.className='piece'+(p.side!==perspective?' enemy':'')+(p.prom?' prom':'');piece.dataset.side=p.side;piece.textContent=label(p);
  const source=board.querySelector('[data-square="'+i+'"] .piece');if(source)piece.style.fontSize=getComputedStyle(source).fontSize;
  wrap.append(piece);field.append(wrap);tokens.set(i,{wrap,piece});
 }
 board.classList.add('paradox-cinema-hidden');
 const wait=ms=>new Promise(resolve=>{const done=()=>{clearTimeout(timer);timers.delete(timer);signal?.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,ms);timers.add(timer);signal?.addEventListener('abort',done,{once:true});if(signal?.aborted)done();});
 const animate=(el,frames,options)=>{if(!reduced){const a=el.animate(frames,options);animations.push(a);return a;}};
 const sound=(kind,duration,index)=>{const stop=playParadoxMotionSound(kind,duration,index);if(stop)sounds.push(stop);};
 let caption;
 try{
  for(const position of timing.cutins){
   if(signal?.aborted)return;
   const band=document.createElement('div');band.className='paradox-cutin '+position;
   const img=document.createElement('img');img.src='osesho.png';img.alt='';band.append(img);layer.append(band);const stop=playTossCutInSound();if(stop)sounds.push(stop);
   animate(band,[{opacity:0,transform:'translateX(-105%) skewX(-12deg)'},{offset:.2,opacity:1,transform:'translateX(0) skewX(-12deg)'},{offset:.75,opacity:1,transform:'translateX(0) skewX(-12deg)'},{opacity:0,transform:'translateX(105%) skewX(-12deg)'}],{duration:timing.cutinMs,fill:'both',easing:'ease-out'});
   await wait(timing.cutinMs);band.remove();
  }
  if(signal?.aborted)return;
  caption=document.createElement('div');caption.className='paradox-cinema-title'+(['shuffle','invert','promote'].includes(event.kind)?' rainbow':'');
   caption.textContent=event.kind==='shuffle'&&!event.skipped?'すべての駒がシャッフルする':event.kind==='invert'?'すべての駒が反転する':paradoxSummary(state);
  layer.append(caption);await wait(timing.noticeMs);if(signal?.aborted)return;
  caption.classList.add('during');
  if(event.kind==='shuffle'||event.kind==='warp'){
   const moving=event.moves,waveStart=performance.now();
   for(let i=0;i<moving.length;i++){
    if(signal?.aborted)return;const {from,to}=moving[i],token=tokens.get(from),a=rects.get(from),b=rects.get(to);if(!token||!a||!b)continue;
    const duration=Math.max(0,(i+1)*timing.motionMs/Math.max(1,moving.length)-(performance.now()-waveStart)),dx=(b.x-a.x)*field.clientWidth/100,dy=(b.y-a.y)*field.clientHeight/100;
    token.wrap.style.zIndex='3';token.wrap.classList.add('paradox-token-travel');sound(event.kind,duration,i);
    let target;
    if(event.kind==='warp'){
     target=document.createElement('span');target.className='paradox-warp-target';place(target,to);field.append(target);
     token.wrap.classList.add('paradox-warp-king');
    }
    animate(token.wrap,[{transform:'translate(0,0) scale(1)',filter:'brightness(1)'},{offset:.35,transform:`translate(${dx*.3}px,${dy*.3}px) scale(.45)`,filter:'brightness(2.5)'},{offset:.8,transform:`translate(${dx}px,${dy}px) scale(1.3)`,filter:'brightness(2)'},{transform:`translate(${dx}px,${dy}px) scale(1)`,filter:'brightness(1)'}],{duration,fill:'none',easing:'ease-in-out'});
    await wait(duration);if(signal?.aborted)return;place(token.wrap,to);token.wrap.classList.remove('paradox-token-travel');
    if(target){target.classList.add('arrived');token.wrap.classList.add('paradox-warp-arrived');}else token.wrap.style.zIndex='';
   }
   if(!moving.length)await wait(timing.motionMs);
   if(event.kind==='shuffle'&&!event.skipped&&!signal?.aborted){
    for(const {from,to}of moving){
     if(state.board[to]?.type!=='K')continue;
     const token=tokens.get(from);if(!token)continue;
     token.wrap.style.zIndex='3';token.wrap.classList.add('paradox-shuffle-king');
     token.wrap.classList.add('paradox-warp-king');token.wrap.classList.add('paradox-warp-arrived');
    }
   }
  }else{
   if(event.kind==='invert')sound('rumble',timing.motionMs);
   if(event.kind==='promote'&&event.squares.length)sound('flip',timing.motionMs,4);
   const flipOne=async(square,index)=>{
    const token=tokens.get(square);if(!token)return;
    const delay=event.kind==='flip'?index*timing.staggerMs:0;await wait(delay);if(signal?.aborted)return;
    if(event.kind==='flip')sound('flip',timing.flipMs,index);
    token.wrap.classList.add('paradox-token-flipping');
    const start=old.board[square].side===perspective?0:180,rotation=event.kind==='promote'?360:540,end=start+rotation;
    animate(token.piece,[{transform:`rotate(${start}deg) scale(1)`},{offset:.5,transform:`rotate(${start+rotation/2}deg) scale(1.15)`,filter:'brightness(1.5)'},{transform:`rotate(${end}deg) scale(1)`,filter:'brightness(1)'}],{duration:timing.flipMs,easing:'ease-in-out',fill:'both'});
    await wait(timing.flipMs/2);if(signal?.aborted)return;
    token.piece.dataset.side=state.board[square].side;
    if(event.kind==='promote'){token.piece.classList.add('prom');token.piece.textContent=label(state.board[square]);}
    await wait(timing.flipMs/2);if(signal?.aborted)return;
    token.piece.classList.toggle('enemy',state.board[square].side!==perspective);token.wrap.classList.remove('paradox-token-flipping');
   };
   await Promise.all(event.squares.map(flipOne));
   if(!event.squares.length)await wait(timing.motionMs);
  }
  if(!signal?.aborted)await wait(timing.tailMs);
 }finally{
  timers.forEach(clearTimeout);animations.forEach(a=>a.cancel());sounds.forEach(stop=>stop());
  board.classList.remove('paradox-cinema-hidden');layer.remove();window.removeEventListener('resize',sync);window.removeEventListener('scroll',sync,true);
 }
}
