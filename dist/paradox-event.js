import {beforeParadox,paradoxEventTiming,paradoxSummary,label} from './engine.js';
import {playTossCutInSound,playParadoxMotionSound,playParadoxRareSound} from './sound.js';

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
  const piece=document.createElement('span');piece.className='piece'+(p.side!==perspective?' enemy':'')+(p.prom?' prom':'')+(p.wings?' has-wings':'');piece.dataset.side=p.side;piece.textContent=label(p);
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
  caption=document.createElement('div');caption.className='paradox-cinema-title'+(['shuffle','invert','promote','supply','extra','annihilate','dragons','wings','rebirth','thunder','wind'].includes(event.kind)?' rainbow':'');
   caption.textContent=event.kind==='thunder'?'オセショ様が雷雲を呼ぶ':event.kind==='shuffle'&&!event.skipped?'すべての駒がシャッフルする':event.kind==='invert'?'すべての駒が反転する':event.kind==='promote'?'盤上の全駒が成る':paradoxSummary(state);
  layer.append(caption);await wait(timing.noticeMs);if(signal?.aborted)return;
  if(event.kind==='promote'&&!event.squares.length)caption.textContent='しかし、コマはすでに全てなっていた';
  else if(event.kind==='thunder'&&!event.pieces.length)caption.textContent='しかし雷は落ちなかった';
  else caption.classList.add('during');
  if(event.kind==='wind'){
   sound('wind',timing.motionMs);
   for(const column of event.columns){
    const top=rects.get(column),bottom=rects.get(column+72);if(!top||!bottom)continue;
    const gust=document.createElement('span');gust.className='paradox-wind-column';
    Object.assign(gust.style,{left:top.x+'%',top:Math.min(top.y,bottom.y)+'%',width:top.w+'%',height:(Math.abs(bottom.y-top.y)+top.h)+'%'});field.append(gust);
    animate(gust,[{opacity:0},{offset:.2,opacity:1},{offset:.7,opacity:1},{opacity:0}],{duration:timing.motionMs,fill:'both'});
   }
   await wait(300);if(signal?.aborted)return;
   await Promise.all(event.pieces.map(async({square},index)=>{
    const token=tokens.get(square);if(!token)return;await wait(index*300/Math.max(1,event.pieces.length));if(signal?.aborted)return;
    animate(token.wrap,[{opacity:1,transform:'translate(0,0) rotate(0)'},{offset:.25,opacity:1,transform:'translate(20%,-30%) rotate(35deg)'},{opacity:0,transform:'translate(100%,-500%) rotate(300deg) scale(.2)'}],{duration:1000,fill:'both',easing:'ease-in'});
    await wait(1000);if(signal?.aborted)return;token.wrap.style.visibility='hidden';
   }));
   await wait(event.pieces.length?200:1500);
  }else if(event.kind==='thunder'){
   if(event.pieces.length){
    const cloud=document.createElement('span');cloud.className='paradox-thunder-cloud';field.append(cloud);
    sound('rumble',timing.motionMs);
    await Promise.all(event.pieces.map(async({square},index)=>{
     await wait(index*450);if(signal?.aborted)return;
     const token=tokens.get(square);if(!token)return;
     const strike=document.createElement('span');strike.className='paradox-token';place(strike,square);
     const bolt=document.createElement('span');bolt.className='collapse-lightning';strike.append(bolt);field.append(strike);
     sound('thunder',450,index);
     animate(token.wrap,[{opacity:1,filter:'brightness(3)'},{offset:.35,opacity:1,filter:'brightness(1)'},{opacity:0,transform:'translateY(14px) scale(.25)',filter:'grayscale(1)'}],{duration:750,fill:'both',easing:'ease-out'});
     await wait(750);if(signal?.aborted)return;token.wrap.style.visibility='hidden';
     await wait(450);strike.remove();
    }));
   }else await wait(timing.motionMs);
  }else if(event.kind==='wings'){
   const stop=playParadoxRareSound('wings');if(stop)sounds.push(stop);
   const token=tokens.get(event.square);if(token){token.piece.classList.add('has-wings');token.wrap.classList.add('rebirth-halo');animate(token.wrap,[{transform:'scale(.8)',filter:'brightness(3)'},{offset:.5,transform:'scale(1.35)',filter:'brightness(1.5)'},{transform:'scale(1)',filter:'brightness(1)'}],{duration:1500,fill:'both',easing:'ease-out'});}
   await wait(timing.motionMs);
  }else if(event.kind==='rebirth'){
   const stop=playParadoxRareSound('rebirth');if(stop)sounds.push(stop);
   await Promise.all(event.entries.map(async r=>{
    const oldToken=tokens.get(r.square);
    if(oldToken){oldToken.wrap.classList.add('rebirth-explosion');animate(oldToken.piece,[{opacity:1,filter:'brightness(5)'},{opacity:0,transform:'scale(2) rotate(35deg)'}],{duration:450,fill:'both'});}
    const burst=document.createElement('span');burst.className='paradox-token rebirth-burst';place(burst,r.square);field.append(burst);
    animate(burst,[{opacity:0,transform:'scale(.2)'},{offset:.15,opacity:1},{opacity:0,transform:'scale(2.6)'}],{duration:750,fill:'both'});
    await wait(450);if(signal?.aborted)return;if(oldToken)oldToken.wrap.style.visibility='hidden';
    const wrap=document.createElement('span');wrap.className='paradox-token rebirth-halo';place(wrap,r.square);
    const piece=document.createElement('span');piece.className='piece has-wings'+(r.side!==perspective?' enemy':'');piece.dataset.side=r.side;piece.textContent='玉';wrap.append(piece);field.append(wrap);
    const source=rects.get(r.from),target=rects.get(r.square),dx=source&&target?(source.x-target.x)/target.w*100:0,dy=source&&target?(source.y-target.y)/target.h*100:-65;
    animate(wrap,[{opacity:0,transform:`translate(${dx}%,${dy}%) scale(.4)`,filter:'brightness(4)'},{offset:.7,opacity:1,transform:'translate(0,0) scale(1.25)',filter:'brightness(2)'},{opacity:1,transform:'translate(0,0) scale(1)',filter:'brightness(1)'}],{duration:1000,fill:'both',easing:'ease-out'});
    await wait(1000);if(signal?.aborted)return;piece.classList.remove('has-wings');await wait(350);
   }));
  }else if(['extra','annihilate','dragons'].includes(event.kind)){
   const stop=playParadoxRareSound(event.kind);if(stop)sounds.push(stop);
   if(event.kind==='extra'){
    field.classList.add('paradox-extra-turn');await wait(timing.motionMs);
   }else if(event.kind==='annihilate'){
    await Promise.all(event.pieces.map(async({square},index)=>{
     await wait(index*600/Math.max(1,event.pieces.length));if(signal?.aborted)return;
     const token=tokens.get(square);if(!token)return;const spear=document.createElement('span');spear.className='paradox-spear-cell';place(spear,square);field.append(spear);
     animate(spear,[{transform:'translateY(-260%)',opacity:0},{offset:.15,opacity:1},{transform:'translateY(0)',opacity:1}],{duration:380,fill:'both',easing:'ease-in'});
     await wait(380);if(signal?.aborted)return;
     token.wrap.classList.add('paradox-spear-impact');
     animate(token.wrap,[{filter:'brightness(3)',transform:'scale(1.08)'},{opacity:0,transform:'translateY(20px) scale(.1) rotate(50deg)'}],{duration:450,fill:'both',easing:'ease-out'});
     animate(spear,[{opacity:1},{opacity:0}],{duration:350,fill:'both'});
     await wait(450);token.wrap.style.visibility='hidden';spear.remove();
    }));
    if(!event.pieces.length)await wait(timing.motionMs);
   }else{
    const veil=document.createElement('span');veil.className='paradox-dragon-veil';field.append(veil);
    field.classList.add('paradox-dragon-charge');await wait(650);if(signal?.aborted)return;
    animate(veil,[{opacity:0},{offset:.45,opacity:.94},{offset:.65,opacity:.94},{opacity:0}],{duration:300,fill:'both'});
    await wait(300);if(signal?.aborted)return;field.classList.remove('paradox-dragon-charge');
    await Promise.all(event.pieces.map(async({square})=>{
     const token=tokens.get(square);if(!token)return;token.wrap.classList.add('paradox-token-flipping');
     const start=old.board[square].side===perspective?0:180;
     animate(token.piece,[{transform:`rotate(${start}deg) scale(1)`},{offset:.5,transform:`rotate(${start+180}deg) scale(1.25)`,filter:'brightness(2)'},{transform:`rotate(${start+360}deg) scale(1)`}],{duration:1650,fill:'both',easing:'ease-in-out'});
     await wait(825);if(signal?.aborted)return;token.piece.textContent='龍';token.piece.classList.add('prom');
     await wait(825);token.wrap.classList.remove('paradox-token-flipping');
    }));
    if(!event.pieces.length)await wait(1650);
   }
  }else if(event.kind==='supply'){
   const types='PLNSGBR',rect=board.getBoundingClientRect(),size=Math.min(52,rect.width/9),duration=timing.motionMs/types.length;
   for(const [index,type]of Array.from(types).entries()){
    if(signal?.aborted)return;sound('flip',duration,index);
    for(const side of [event.side]){
     const tray=document.getElementById((board.id==='devBoard'?'devHand':'hand')+side),slot=tray?.querySelector('[data-type="'+type+'"]');
     if(!slot)continue;const target=slot.getBoundingClientRect(),x=rect.left+rect.width/2-size/2,y=rect.top+rect.height/2-size/2,dx=target.left+target.width/2-size/2-x,dy=target.top+target.height/2-size/2-y;
     const token=document.createElement('span');token.className='paradox-supply-token';Object.assign(token.style,{left:x+'px',top:y+'px',width:size+'px',height:size+'px'});
     const piece=document.createElement('span');piece.className='piece'+(side!==perspective?' enemy':'');piece.dataset.side=side;piece.textContent=label({type,prom:false});token.append(piece);layer.append(token);
     token.style.transform=`translate(${dx}px,${dy}px)`;
     animate(token,[{transform:'translate(0,0) scale(.3)',opacity:0},{offset:.2,transform:'translate(0,0) scale(1.2)',opacity:1},{transform:`translate(${dx}px,${dy}px) scale(1)`,opacity:1}],{duration,fill:'both',easing:'ease-out'});
    }
    await wait(duration);
   }
  }else if(event.kind==='shuffle'||event.kind==='warp'){
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
