import {label} from './engine.js';

const displays=new WeakMap();
const ashDuration=1700;
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
  const ghost=add('piece paradox-ghost'+(destroyed.piece.side!==perspective?' enemy':'')+(phase==='breaking'?' paradox-breaking':''));ghost.textContent=name;
 }
 if(phase==='breaking')add('collapse-lightning');
 if(phase!=='waiting'){
  add('collapse-ash');
  const caption=add('collapse-caption');caption.textContent=name+'の灰';
 }
 cell.title='直前の崩壊：'+name+'が消滅';
}
