import {label} from './engine.js';

// The marker comes from the server's last resolved destruction, so reconnects
// preserve it and the next move naturally clears it.
export function paintCollapse(board,destroyed,{perspective=0,phase='ash'}={}){
 board.querySelectorAll('.collapse-marker').forEach(el=>el.remove());
 board.querySelectorAll('.collapse-square').forEach(cell=>{
  cell.classList.remove('collapse-square');
  cell.setAttribute('aria-label',cell.dataset.collapseLabel||'');
  delete cell.dataset.collapseLabel;cell.removeAttribute('title');
 });
 if(!destroyed)return;
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
