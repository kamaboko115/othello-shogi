import {playCaptureSound} from './sound.js';

export function kingCaptureSquare(before,after){
 if(before.result||!after.result||after.ply!==before.ply+1||after.last.length!==2)return null;
 const [from,to]=after.last,p=before.board[from],victim=before.board[to];
 return p?.side===before.turn&&victim?.type==='K'&&victim.side!==before.turn&&after.board[to]?.side===before.turn?to:null;
}
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function wait(ms,signal){return new Promise(resolve=>{const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,ms);signal?.addEventListener('abort',done,{once:true});if(signal?.aborted)done();});}
function layerAt(board,square,className){
 const cell=board.querySelector(`[data-square="${square}"]`);if(!cell)return null;
 const b=cell.getBoundingClientRect(),r=board.getBoundingClientRect(),layer=document.createElement('span');
 layer.className=className;layer.setAttribute('aria-hidden','true');layer.style.left=b.left-r.left+b.width/2+'px';layer.style.top=b.top-r.top+b.height/2+'px';layer.style.setProperty('--cell-size',b.width+'px');board.append(layer);return layer;
}
export async function runKingImpact(board,square,signal){
 if(signal?.aborted)return;
 playCaptureSound(true);if(reduced())return;
 const layer=layerAt(board,square,'king-impact');if(!layer)return;
 try{
  // An asynchronous hold keeps input and cancellation responsive.
  layer.classList.add('impact-hold');await wait(110,signal);if(signal?.aborted)return;
  layer.classList.remove('impact-hold');layer.classList.add('impact-burst');await wait(420,signal);
 }finally{layer.remove();}
}
export async function runDropImpact(board,square,major,signal){
 if(signal?.aborted)return;
 if(major)playCaptureSound(true);
 if(reduced())return;
 const layer=layerAt(board,square,'drop-impact'+(major?' major':''));if(!layer)return;
 try{await wait(major?650:280,signal);}finally{layer.remove();}
}
