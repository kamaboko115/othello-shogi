import {label,pieceGlyph,arrivals,paradoxSummary} from './engine.js';

export function paintParadoxEvent(board,state){
 board.querySelectorAll('.paradox-event-marker').forEach(el=>el.remove());
 const event=state?.paradoxEvent;if(!event)return;
 const squares=event.squares||event.moves.map(m=>m.to);
 for(const square of squares){
  const cell=board.querySelector('[data-square="'+square+'"]');if(!cell)continue;
  const glow=document.createElement('span');glow.className='paradox-event-marker paradox-event-ring event-'+event.kind;
  glow.setAttribute('aria-hidden','true');cell.append(glow);
 }
 const caption=document.createElement('div');caption.className='paradox-event-marker paradox-event-caption';
 caption.setAttribute('role','status');caption.textContent=paradoxSummary(state);board.append(caption);
}

export function paintArrival(board,state,breaking=false){
 for(const d of arrivals(state)){
  const cell=board.querySelector('[data-square="'+d.square+'"]');if(!cell)continue;
  cell.querySelectorAll('.spawn-marker').forEach(el=>el.remove());
  const glow=document.createElement('span');glow.className='spawn-marker paradox-spawn-glow'+(breaking?' arriving':'');
  glow.setAttribute('aria-label',label(d.piece)+'が降臨');cell.append(glow);cell.classList.toggle('paradox-spawn-cell',breaking);
 }
}

const displays=new WeakMap();
export const collapseStrikeDuration=1200;
export const collapseStrikeDelay=500;
export const collapseAshDuration=500;
const ashDuration=collapseStrikeDuration+collapseAshDuration;
function clearMarkers(board){
 board.querySelectorAll('.collapse-marker').forEach(el=>el.remove());
 board.querySelectorAll('.collapse-square').forEach(cell=>{
  cell.classList.remove('collapse-square');
  cell.setAttribute('aria-label',cell.dataset.collapseLabel||'');
  delete cell.dataset.collapseLabel;cell.removeAttribute('title');
 });
}
// Count from the strike, not from each render or the end of the warning banner.
export function paintCollapse(board,destroyed,{perspective=0,phase='ash',eventKey=destroyed}={}){
 clearMarkers(board);
 let display=displays.get(board);
 if(!destroyed){clearTimeout(display?.timer);displays.delete(board);return;}
 if(!display||display.key!==eventKey){
  clearTimeout(display?.timer);display={key:eventKey,expiresAt:null};displays.set(board,display);
 }
 if(phase!=='waiting'&&display.expiresAt===null){
  display.expiresAt=Date.now()+ashDuration;
  display.timer=setTimeout(()=>{if(displays.get(board)===display)clearMarkers(board);},ashDuration);
 }
 if(display.expiresAt!==null&&Date.now()>=display.expiresAt)return;
 const cell=board.querySelector('[data-square="'+destroyed.square+'"]');if(!cell)return;
 const name=label(destroyed.piece);
 cell.classList.add('collapse-square');
 cell.dataset.collapseLabel=cell.getAttribute('aria-label')||'';
 cell.setAttribute('aria-label',(cell.getAttribute('aria-label')||'')+'（直前の崩壊で'+name+'が消滅）');
 const add=(className)=>{const el=document.createElement('span');el.className='collapse-marker '+className;el.setAttribute('aria-hidden','true');cell.append(el);return el;};
 if(phase!=='ash'){
  const ghost=add('piece paradox-ghost'+(destroyed.piece.side!==perspective?' enemy':'')+(destroyed.piece.prom?' prom':'')+(phase==='breaking'?' paradox-breaking':''));ghost.dataset.side=destroyed.piece.side;ghost.textContent=pieceGlyph(destroyed.piece);
 }
 if(phase==='breaking')add('collapse-lightning');
 if(phase==='ash'){
  add('collapse-ash');
  const caption=add('collapse-caption');caption.textContent=name+'の灰';
 }
 cell.title='直前の崩壊：'+name+'が消滅';
}
