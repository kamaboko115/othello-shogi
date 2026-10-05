import {adjudicationLimit} from './judge-options.js';
import {moves,raw,reaches,points,inCheck,MAX_GAME_PLIES} from './engine.js';
export const AI_LEVELS=['weak','normal','strong','expert'];
const WIN=1000000,VALUE={K:20000,R:950,B:850,G:480,S:400,N:280,L:240,P:100};
const value=p=>VALUE[p.type]+(p.prom?({R:300,B:300,S:100,N:200,L:240,P:380}[p.type]||0):0);
const distance=(a,b)=>Math.max(Math.abs(Math.floor(a/9)-Math.floor(b/9)),Math.abs(a%9-b%9));
const moveKey=m=>m.drop?m.drop+'@'+m.to:m.from+'-'+m.to+(m.prom?'+':'');
const budgetError=new Error('AI budget');
function terminal(s,side){
 if(!s.board.some(p=>p?.type==='K'&&p.side===side))return -WIN;
 if(!s.board.some(p=>p?.type==='K'&&p.side!==side))return WIN;
 if(adjudicationLimit(s)!==false&&s.ply>=adjudicationLimit(s)){const count=points(s);return Math.sign(count[side]-count[1-side])*900000;}
 if(s.ply>=MAX_GAME_PLIES)return 0;
 return null;
}
function attacks(s){
 const map=[new Uint8Array(81),new Uint8Array(81)];
 for(let from=0;from<81;from++){const p=s.board[from];if(!p)continue;for(let to=0;to<81;to++)if(reaches(s,from,to))map[p.side][to]++;}
 return map;
}
export function evaluateAI(s,side){
 const end=terminal(s,side);if(end!==null)return end;
 const control=attacks(s),king=[0,1].map(n=>s.board.findIndex(p=>p?.type==='K'&&p.side===n));
 const score=[0,0],count=[0,0];
 for(let i=0;i<81;i++){
  const p=s.board[i];if(!p)continue;const n=p.side,r=n===0?Math.floor(i/9):8-Math.floor(i/9),c=i%9;count[n]++;
  if(p.type==='K'){
   // King capture is legal here; an exposed king must outweigh a material gain.
   if(control[1-n][i])score[n]-=(n===s.turn?180:22000);
   for(let j=0;j<81;j++)if(distance(i,j)===1){
    if(s.board[j]?.side===n&&['G','S'].includes(s.board[j].type))score[n]+=24;
    if(control[1-n][j])score[n]-=16;
   }
   score[n]-=Math.max(0,7-r)*22;
   continue;
  }
  const v=value(p);score[n]+=v;
  if(control[1-n][i]){
 let cheapest=Infinity;
 for(let j=0;j<81;j++)if(s.board[j]?.side===1-n&&reaches(s,j,i))cheapest=Math.min(cheapest,value(s.board[j]));
 const loss=control[n][i]?Math.max(0,v-cheapest):v;
 score[n]-=loss*(n===s.turn?.35:.9);
 }
  if(control[n][i])score[n]+=Math.min(v*.025,14);
  if(p.type==='R'||p.type==='B'){
   // Reward opening lines for the major pieces, instead of rushing at the king.
   let mobility=0;for(let j=0;j<81;j++)if(s.board[j]?.side!==n&&reaches(s,i,j))mobility++;
   score[n]+=mobility*(p.type==='B'?5:4);
  }
  if(['G','S','N'].includes(p.type)){
   score[n]+=(4-Math.abs(4-c))*3+Math.min(2,Math.max(0,8-r))*6;
   if(['G','S'].includes(p.type))score[n]+=Math.max(0,3-distance(i,king[n]))*8;
  }
  if(p.type==='P'&&!p.prom){
   if(r<=2)score[n]+=22;
   if(s.ply<24&&r<5&&!control[n][i])score[n]-=(5-r)*16;
  }
 }
 if(!s.noDrops)for(const n of [0,1])for(const [type,amount] of Object.entries(s.hands[n]))score[n]+=amount*VALUE[type]*.8;
 // Near the limit the actual board-only count matters more than piece value.
 if(adjudicationLimit(s)!==false){const weight=Math.max(0,s.ply-(adjudicationLimit(s)-30))*16;score[0]+=count[0]*weight;score[1]+=count[1]*weight;}
 const flipScore=[0,0];
 if(s.mode)for(let anchor=0;anchor<81;anchor++){
 const p=s.board[anchor];if(!p)continue;const n=p.side;
 for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
 if(!dr&&!dc)continue;let r=Math.floor(anchor/9)+dr,c=anchor%9+dc,total=0,kingRun=false;
 while(r>=0&&r<9&&c>=0&&c<9){const q=s.board[r*9+c];
 if(!q){if(total&&control[n][r*9+c])flipScore[n]=Math.max(flipScore[n],kingRun?1800:total*.25);break;}
 if(q.side===n)break;total+=2*value(q);kingRun||=q.type==='K';r+=dr;c+=dc;
 }
 }
 }
 return score[side]-score[1-side]+flipScore[side]-flipScore[1-side];
}
function candidates(s,checkBudget){
 const list=[];
 const sources=[...s.board.flatMap((p,i)=>p?.side===s.turn?[i]:[]),...Object.keys(s.hands[s.turn])];
 for(const src of sources){
  checkBudget();
  for(const move of moves(s,src)){
   checkBudget();const next=raw(s,move),end=terminal(next,s.turn);
   const captured=s.board[move.to];
   let order=end===WIN?WIN:0;
   if(captured)order+=value(captured)*(s.noDrops?1:1.8);
   for(const i of next.flipped)order+=2*value(next.board[i]);
   if(move.prom&&!s.board[move.from]?.prom)order+=value(next.board[move.to])-value(s.board[move.from]);
   list.push({move,next,order,tactical:!!captured||next.flipped.length>0||!!move.prom});
  }
 }
 return list.sort((a,b)=>b.order-a.order);
}
function evaluateLegacy(s,side){
 const end=terminal(s,side);if(end!==null)return end;
 const control=attacks(s),king=[0,1].map(n=>s.board.findIndex(p=>p?.type==='K'&&p.side===n));
 const score=[0,0],count=[0,0];
 for(let i=0;i<81;i++){
  const p=s.board[i];if(!p)continue;const n=p.side,r=n===0?Math.floor(i/9):8-Math.floor(i/9),c=i%9;count[n]++;
  if(p.type==='K'){
   // King capture is legal here; an exposed king must outweigh a material gain.
   if(control[1-n][i])score[n]-=22000;
   for(let j=0;j<81;j++)if(distance(i,j)===1){
    if(s.board[j]?.side===n&&['G','S'].includes(s.board[j].type))score[n]+=24;
    if(control[1-n][j])score[n]-=16;
   }
   score[n]-=Math.max(0,7-r)*22;
   continue;
  }
  const v=value(p);score[n]+=v;
  if(control[1-n][i])score[n]-=v*(control[n][i]?0.12:0.65);
  if(control[n][i])score[n]+=Math.min(v*.025,14);
  if(p.type==='R'||p.type==='B'){
   // Reward opening lines for the major pieces, instead of rushing at the king.
   let mobility=0;for(let j=0;j<81;j++)if(s.board[j]?.side!==n&&reaches(s,i,j))mobility++;
   score[n]+=mobility*(p.type==='B'?5:4);
  }
  if(['G','S','N'].includes(p.type)){
   score[n]+=(4-Math.abs(4-c))*3+Math.min(2,Math.max(0,8-r))*6;
   if(['G','S'].includes(p.type))score[n]+=Math.max(0,3-distance(i,king[n]))*8;
  }
  if(p.type==='P'&&!p.prom){
   if(r<=2)score[n]+=22;
   if(s.ply<24&&r<5&&!control[n][i])score[n]-=(5-r)*16;
  }
 }
 if(!s.noDrops)for(const n of [0,1])for(const [type,amount] of Object.entries(s.hands[n]))score[n]+=amount*VALUE[type]*.8;
 // Near the limit the actual board-only count matters more than piece value.
 if(adjudicationLimit(s)!==false){const weight=Math.max(0,s.ply-(adjudicationLimit(s)-30))*16;score[0]+=count[0]*weight;score[1]+=count[1]*weight;}
 return score[side]-score[1-side];
}

export function chooseAI(s,level='normal',thinkMs=1000,onBest=()=>{},onStats=()=>{}){
 const evaluate=['strong','expert'].includes(level)?evaluateAI:evaluateLegacy;
 const started=performance.now(),budget=[500,1000,3000,5000].includes(thinkMs)?thinkMs:level==='normal'?200:1000;
 const deadline=started+budget;
 let nodes=0,completedDepth=0,best=null,root;
 const checkBudget=()=>{if(performance.now()>=deadline)throw budgetError;};
 // A legal fallback is always published before expensive evaluation starts.
 for(const src of [...s.board.flatMap((p,i)=>p?.side===s.turn?[i]:[]),...Object.keys(s.hands[s.turn])]){const first=moves(s,src)[0];if(first){best=first;onBest(best);break;}}
 if(!best)return null;
 const table=new Map();
 function stateKey(p){return p.turn+'|'+p.ply+'|'+p.board.map(x=>x?x.side+x.type+(x.prom?'+':'')+(x.wings?'w':''):'_').join(',')+'|'+JSON.stringify(p.hands);}
 function ordered(p,hint){const list=candidates(p,checkBudget);if(hint)list.sort((a,b)=>(moveKey(b.move)===hint?2*WIN:0)+b.order-((moveKey(a.move)===hint?2*WIN:0)+a.order));return list;}
 function quiet(p,alpha,beta,left){
  checkBudget();nodes++;const stand=evaluate(p,p.turn);if(Math.abs(stand)>=900000||left===0)return stand;
  const threatened=inCheck(p,p.turn);
  if(!threatened){if(stand>=beta)return stand;alpha=Math.max(alpha,stand);}
  const choices=ordered(p);
  for(const c of choices){if(!threatened&&!c.tactical)continue;const score=-quiet(c.next,-beta,-alpha,left-1);if(score>=beta)return score;alpha=Math.max(alpha,score);}
  return alpha;
 }
 function search(p,depth,alpha,beta){
  checkBudget();nodes++;const end=terminal(p,p.turn);if(end!==null)return end;
  if(depth===0)return quiet(p,alpha,beta,2);
  const key=stateKey(p),cached=table.get(key),originalAlpha=alpha,originalBeta=beta;
  if(cached?.depth>=depth){if(cached.bound==='exact')return cached.score;if(cached.bound==='lower')alpha=Math.max(alpha,cached.score);else beta=Math.min(beta,cached.score);if(alpha>=beta)return cached.score;}
  const choices=ordered(p,cached?.move);if(!choices.length)return -WIN;
  let score=-Infinity,chosen=null;
  for(const c of choices){const v=-search(c.next,depth-1,-beta,-alpha);if(v>score){score=v;chosen=moveKey(c.move);}alpha=Math.max(alpha,v);if(alpha>=beta)break;}
  if(table.size>16000)table.clear();
  table.set(key,{depth,score,move:chosen,bound:score<=originalAlpha?'upper':score>=originalBeta?'lower':'exact'});
  return score;
 }
 try{
  root=candidates(s,checkBudget);
  if(level==='weak'){
   // Prefer quiet random moves, so the beginner level rarely finds a combo.
   const quiet=root.filter(c=>!c.tactical),pool=[...root,...quiet,...quiet];
   best=pool[crypto.getRandomValues(new Uint32Array(1))[0]%pool.length].move;onBest(best);return best;
  }
  const win=root.find(c=>terminal(c.next,s.turn)===WIN);if(win){best=win.move;onBest(best);return best;}
  // Evaluate every root candidate before choosing a positional fallback.
  for(const c of root){checkBudget();c.score=evaluate(c.next,s.turn);}
  root.sort((a,b)=>b.score-a.score);best=root[0].move;onBest(best);
  if(level==='normal'){
   // One-move judgement only: similar choices add variety without deep tactics.
   const close=root.slice(0,3).filter(c=>c.score>=root[0].score-60);
   const pool=close.flatMap((c,i)=>Array(3-i).fill(c));
   best=pool[crypto.getRandomValues(new Uint32Array(1))[0]%pool.length].move;onBest(best);return best;
  }
  const maxDepth=level==='expert'?12:level==='strong'?8:2;
  for(let depth=1;depth<=maxDepth;depth++){
   let alpha=-Infinity,nextBest=best;const scored=[];
   for(const c of root){const score=-search(c.next,depth-1,-Infinity,-alpha);scored.push({...c,score});if(score>alpha){alpha=score;nextBest=c.move;}}
   // Publish only fully completed iterations so a cutoff cannot mix depths.
   best=nextBest;completedDepth=depth;root=scored.sort((a,b)=>b.score-a.score);onBest(best);
   if(alpha>=900000)break;
  }
 }catch(error){if(error!==budgetError)throw error;}
 finally{onStats({nodes,completedDepth,elapsedMs:performance.now()-started});}
 return best;
}
