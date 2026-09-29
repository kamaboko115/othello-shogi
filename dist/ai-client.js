import {moves} from './engine.js';

// Search never blocks the UI or holds an HTTP request open. The main thread
// enforces the budget and retains the last completed search's legal move.
export function startAI(state,level,thinkMs){
 const budget=[500,1000,3000,5000].includes(thinkMs)?thinkMs:1000;
 const started=performance.now();
 const sources=[...state.board.flatMap((p,i)=>p?.side===state.turn?[i]:[]),...Object.keys(state.hands[state.turn])];
 let best=null;
 for(const src of sources){best=moves(state,src)[0]||null;if(best)break;}
 let worker,timer,settled=false,rejectJob;
 const promise=new Promise((resolve,reject)=>{
  rejectJob=reject;
  const finish=(move,reason)=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();resolve({move,reason,elapsedMs:performance.now()-started,budgetMs:budget});};
  if(!best){finish(null,'no-moves');return;}
  try{
   worker=new Worker(new URL('./ai-worker.js',import.meta.url),{type:'module'});
   worker.onmessage=({data})=>{if(data.type==='best')best=data.move;else if(data.type==='done')finish(data.move,'completed');else if(data.type==='error')finish(best,'fallback');};
   worker.onerror=event=>{event.preventDefault();finish(best,'fallback');};
   timer=setTimeout(()=>finish(best,'budget'),Math.max(0,budget-(performance.now()-started)));
   worker.postMessage({state,level,thinkMs:budget});
  }catch{finish(best,'fallback');}
 });
 return {promise,cancel(){if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();rejectJob(new DOMException('AI search cancelled','AbortError'));}};
}
