import {chooseAI} from './ai.js';
self.onmessage=({data:{state,level,thinkMs}})=>{
 const started=performance.now();
 try{
  const move=chooseAI(state,level,thinkMs,move=>self.postMessage({type:'best',move}));
  self.postMessage({type:'done',move,elapsedMs:performance.now()-started});
 }catch(error){self.postMessage({type:'error',message:error.message});}
};
