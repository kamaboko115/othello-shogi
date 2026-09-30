import {chooseAI} from './ai.js';
import {chooseOsesho} from './osesho-ai.js';
self.onmessage=({data:{state,level,thinkMs}})=>{
 const started=performance.now();
 try{
  const publish=move=>self.postMessage({type:'best',move});
  const move=level==='osesho'&&state.mode
   ?chooseOsesho(state,thinkMs,publish)
   :chooseAI(state,level==='osesho'?'expert':level,thinkMs,publish);
  self.postMessage({type:'done',move,elapsedMs:performance.now()-started});
 }catch(error){self.postMessage({type:'error',message:error.message});}
};
