import {adjudicationLimit} from './judge-options.js';
// Othello-shogi search uses the same rules as engine.js, with reversible moves.
// Piece codes: type (1..8), promoted (16), side (32). Zero is an empty square.
const TYPES=['','P','L','N','S','G','B','R','K'];
const VALUES=[0,100,280,300,440,520,900,1050,20000];
const PV=[0,520,520,520,520,520,1250,1450,20000];
const WIN=1000000,INF=1100000,MAX_PLY=96;
const DIR=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
const rays=Array.from({length:81},(_,sq)=>DIR.map(([dr,dc])=>{
 const out=[];let r=(sq/9|0)+dr,c=sq%9+dc;
 while(r>=0&&r<9&&c>=0&&c<9){out.push(r*9+c);r+=dr;c+=dc;}return out;
}));
const steps=Array.from({length:64},()=>Array.from({length:81},()=>[]));
const slides=Array.from({length:64},()=>[]);
for(let code=1;code<64;code++){
 const t=code&15;if(t<1||t>8)continue;
 const f=code&32?1:-1,prom=!!(code&16);
 const g=[[f,-1],[f,0],[f,1],[0,-1],[0,1],[-f,0]];
 let deltas=[];
 if(t===8)deltas=DIR;
 else if(t===5||(prom&&t<=4))deltas=g;
 else if(t===1)deltas=[[f,0]];
 else if(t===3)deltas=[[2*f,-1],[2*f,1]];
 else if(t===4)deltas=[[f,-1],[f,0],[f,1],[-f,-1],[-f,1]];
 else if(t===6){slides[code]=[4,5,6,7];if(prom)deltas=DIR.slice(0,4);}
 else if(t===7){slides[code]=[0,1,2,3];if(prom)deltas=DIR.slice(4);}
 else if(t===2)slides[code]=[f<0?0:1];
 for(let sq=0;sq<81;sq++)for(const [dr,dc]of deltas){
  const r=(sq/9|0)+dr,c=sq%9+dc;if(r>=0&&r<9&&c>=0&&c<9)steps[code][sq].push(r*9+c);
 }
}
let seed=0x714af349;
// A nonlinear output mix keeps the secondary lock independent of the primary
// XOR hash; offset sequences from a linear xorshift generator do not do that.
const random=()=>{let x=seed=(seed+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x21f0aaad);x=Math.imul(x^(x>>>15),0x735a2d97);return (x^(x>>>15))>>>0;};
const z1=Uint32Array.from({length:81*64+2*8*82+1},random);
const z2=Uint32Array.from({length:z1.length},random);
const SIDE_HASH=z1.length-1,HAND_HASH=81*64;
// Generated reserves can exceed the original 81-piece lookup range.
const handHash=(table,index,amount)=>{
 if(amount<=81)return table[HAND_HASH+index*82+amount];
 let x=amount^table[HAND_HASH+index*82];x=Math.imul(x^(x>>>16),0x21f0aaad);x=Math.imul(x^(x>>>15),0x735a2d97);return (x^(x>>>15))>>>0;
};
const value=p=>(p&16?PV:VALUES)[p&15];
const objectMove=m=>{const from=m>>7&127,to=m&127;return from>=81?{drop:TYPES[from-80],to}:{from,to,prom:!!(m&16384)};};
const encode=m=>m.to|((m.drop?80+TYPES.indexOf(m.drop):m.from)<<7)|(m.prom?16384:0);

export class SearchPosition {
 constructor(s){
  this.board=new Uint8Array(81);this.hands=new Uint32Array(16);this.kings=new Int16Array([-1,-1]);
  this.turn=s.turn;this.ply=s.ply;this.limit=adjudicationLimit(s);this.mode=s.mode;
  this.hash=0;this.lock=0;this.stack=[];this.count=new Int16Array(2);this.material=new Int32Array(2);
  s.board.forEach((p,i)=>{if(p)this.set(i,TYPES.indexOf(p.type)|(p.prom?16:0)|(p.side<<5));});
  for(let n=0;n<2;n++)for(let t=1;t<=7;t++)this.hand(n,t,s.hands[n][TYPES[t]]||0);
  if(this.turn){this.hash^=z1[SIDE_HASH];this.lock^=z2[SIDE_HASH];}
  this.noDrops=!!s.noDrops;
 }
 set(sq,p){
  const old=this.board[sq];
  if(old){const n=old>>5;this.count[n]--;this.material[n]-=value(old);if((old&15)===8)this.kings[n]=-1;}
  this.hash^=z1[sq*64+old]^z1[sq*64+p];this.lock^=z2[sq*64+old]^z2[sq*64+p];this.board[sq]=p;
  if(p){const n=p>>5;this.count[n]++;this.material[n]+=value(p);if((p&15)===8)this.kings[n]=sq;}
 }
 hand(n,t,amount){
  const index=n*8+t,old=this.hands[index];
  this.hash^=handHash(z1,index,old)^handHash(z1,index,amount);this.lock^=handHash(z2,index,old)^handHash(z2,index,amount);this.hands[index]=amount;
 }
 make(m){
  const to=m&127,from=m>>7&127,n=this.turn,board=this.board,captured=board[to];
  const u={m,captured,piece:from<81?board[from]:0,flips:[],k0:this.kings[0],k1:this.kings[1]};this.stack.push(u);
  if(from>=81){const t=from-80;this.hand(n,t,this.hands[n*8+t]-1);this.set(to,t|(n<<5));}
  else{
   if(captured&&(captured&15)!==8){const t=captured&15;this.hand(n,t,this.hands[n*8+t]+1);}
   this.set(from,0);this.set(to,u.piece|(m&16384?16:0));
  }
  if(this.mode)for(const ray of rays[to]){
   let length=0;
   for(const sq of ray){const p=board[sq];if(!p)break;if((p>>5)===n){
    for(let j=0;j<length;j++){const target=ray[j];u.flips.push(target);this.set(target,board[target]^32);}break;
   }length++;}
  }
  this.turn^=1;this.ply++;this.hash^=z1[SIDE_HASH];this.lock^=z2[SIDE_HASH];
 }
 unmake(){
  const u=this.stack.pop(),m=u.m,to=m&127,from=m>>7&127;this.turn^=1;this.ply--;
  this.hash^=z1[SIDE_HASH];this.lock^=z2[SIDE_HASH];
  for(const sq of u.flips)this.set(sq,this.board[sq]^32);
  this.set(to,u.captured);
  if(from>=81){const t=from-80;this.hand(this.turn,t,this.hands[this.turn*8+t]+1);}
  else{this.set(from,u.piece);if(u.captured&&(u.captured&15)!==8){const t=u.captured&15;this.hand(this.turn,t,this.hands[this.turn*8+t]-1);}}
  this.kings[0]=u.k0;this.kings[1]=u.k1;
 }
 terminal(height=0){
  if(this.kings[this.turn]<0)return -WIN+height;
  if(this.kings[1-this.turn]<0)return WIN-height;
  if(this.limit&&this.ply>=this.limit)return Math.sign(this.count[this.turn]-this.count[1-this.turn])*(WIN-1000);
  return null;
 }
 generate(){
  const board=this.board,n=this.turn,out=[];
  const add=(from,to,p)=>{
   if(board[to]&&(board[to]>>5)===n)return;
   const t=p&15,r=to/9|0,start=from/9|0;
   if(!(p&16)&&t!==5&&t!==8&&(n===0?(r<=2||start<=2):(r>=6||start>=6))){
    const dead=(t===1||t===2)&&(n===0?r===0:r===8)||t===3&&(n===0?r<=1:r>=7);
    out.push(to|(from<<7)|16384);if(dead)return;
   }
   out.push(to|(from<<7));
  };
  for(let from=0;from<81;from++){
   const p=board[from];if(!p||(p>>5)!==n)continue;
   for(const to of steps[p][from])add(from,to,p);
   for(const d of slides[p])for(const to of rays[from][d]){add(from,to,p);if(board[to])break;}
  }
  if(!this.noDrops){
   let pawns=0;for(let i=0;i<81;i++)if(board[i]===(1|(n<<5)))pawns|=1<<(i%9);
   for(let t=1;t<=7;t++)if(this.hands[n*8+t])for(let to=0;to<81;to++){
    if(board[to])continue;const r=to/9|0;
    if((t<=2&&(n===0?r===0:r===8))||(t===3&&(n===0?r<=1:r>=7))||(t===1&&(pawns&(1<<(to%9)))))continue;
    out.push(to|((80+t)<<7));
   }
  }
  return out;
 }
 // Includes king flips, and excludes the vacated origin as a closing anchor.
 gain(m){
  const to=m&127,from=m>>7&127,n=this.turn,b=this.board;
  let score=b[to]?((b[to]&15)===8?WIN:value(b[to])*(this.noDrops?1:1.8)):0;
  if(m&16384)score+=value(b[from]|16)-value(b[from]);
  if(this.mode)for(const ray of rays[to]){
   let total=0;for(const sq of ray){if(sq===from)break;const p=b[sq];if(!p)break;if((p>>5)===n){score+=total;break;}total+=(p&15)===8?WIN:2*value(p);}
  }
  return score;
 }
}

const controls=new Uint8Array(162),cheap=new Int32Array(162);
function evaluate(p){
 controls.fill(0);cheap.fill(30000);const b=p.board;
 const scores=[p.material[0],p.material[1]];
 for(let from=0;from<81;from++){
  const piece=b[from];if(!piece)continue;const n=piece>>5,v=value(piece),type=piece&15;
  let mobility=0;
  for(const to of steps[piece][from]){const ix=n*81+to;controls[ix]++;cheap[ix]=Math.min(cheap[ix],v);if(!b[to]||(b[to]>>5)!==n)mobility++;}
  for(const d of slides[piece])for(const to of rays[from][d]){const ix=n*81+to;controls[ix]++;cheap[ix]=Math.min(cheap[ix],v);if(!b[to]||(b[to]>>5)!==n)mobility++;if(b[to])break;}
  const rank=n?8-(from/9|0):(from/9|0),center=4-Math.abs(4-from%9);
  if(type===6||type===7)scores[n]+=mobility*5;
  else if(type!==8)scores[n]+=mobility*2+center*3+Math.min(3,8-rank)*4;
  if(type===8)scores[n]-=Math.max(0,7-rank)*15;
 }
 for(let sq=0;sq<81;sq++){
  const piece=b[sq];if(!piece)continue;const n=piece>>5,enemy=1-n,t=piece&15;
  if(t===8){
   if(controls[enemy*81+sq])scores[n]-=n===p.turn?80:24000;
   for(const to of steps[piece][sq]){if(controls[enemy*81+to])scores[n]-=20;if(b[to]&&(b[to]>>5)===n&&[4,5].includes(b[to]&15))scores[n]+=18;}
  }else{
   const v=value(piece);if(controls[enemy*81+sq]){
    const loss=controls[n*81+sq]?Math.max(0,v-cheap[enemy*81+sq]):v;
    scores[n]-=loss*(n===p.turn?.18:.55);
   }
   if(controls[n*81+sq])scores[n]+=Math.min(12,v*.02);
  }
 }
 if(!p.noDrops)for(let n=0;n<2;n++)for(let t=1;t<=7;t++)scores[n]+=p.hands[n*8+t]*VALUES[t]*.85;
 if(p.limit){const weight=Math.max(0,p.ply-(p.limit-30))*22;scores[0]+=p.count[0]*weight;scores[1]+=p.count[1]*weight;}
 return Math.round(scores[p.turn]-scores[1-p.turn])+10;
}

// Replay analysis uses the same static evaluator, without running a search.
export function evaluateOsesho(state,side=0){
 const position=new SearchPosition(state);
 if(position.kings[side]<0)return -WIN;
 if(position.kings[1-side]<0)return WIN;
 const score=evaluate(position);return position.turn===side?score:-score;
}
export function chooseOsesho(state,thinkMs=5000,onBest=()=>{},onStats=()=>{}){
 if(!state.mode)throw new Error('Osesho search requires othello-shogi mode');
 if(state.result)return null;
 const started=performance.now(),deadline=started+Math.max(1,thinkMs),p=new SearchPosition(state);
 const initial=p.generate();if(!initial.length||p.terminal()!==null)return null;
 let best=initial[0],nodes=0,completedDepth=0,bestScore=0;
 onBest(objectMove(best));
 const size=1<<18,mask=size-1,keys=new Int32Array(size),locks=new Int32Array(size),depths=new Int8Array(size),bounds=new Uint8Array(size),scores=new Int32Array(size),ttMoves=new Int32Array(size),ages=new Uint16Array(size);
 const killers=Array.from({length:MAX_PLY},()=>[0,0]),history=new Int32Array(2*128*81),path=[];
 const expired={};
 const check=()=>{if(performance.now()>=deadline)throw expired;};
 const idx=()=>((p.hash^(p.limit?Math.imul(p.ply,0x9e3779b9):0))&mask);
 const historyIndex=m=>p.turn*128*81+(m>>7&127)*81+(m&127);
 function ordered(list,hint,height){
  return list.map(m=>({m,gain:p.gain(m)})).map(x=>({...x,order:x.m===hint?3000000:x.gain>0?100000+x.gain:killers[height]?.includes(x.m)?80000:history[historyIndex(x.m)]})).sort((a,b)=>b.order-a.order);
 }
 // Detect every direct or bracket king win, including legal drops.
 function threatened(){
  p.turn^=1;const list=p.generate();let yes=false;
  for(const m of list)if(p.gain(m)>=WIN){yes=true;break;}
  p.turn^=1;return yes;
 }
 function qsearch(alpha,beta,height,left){
  nodes++;if((nodes&127)===0)check();
  const terminal=p.terminal(height);if(terminal!==null)return terminal;
  const list=p.generate(),choices=ordered(list,0,height);
  if(!list.length)return -WIN+height;
  if(choices[0]?.gain>=WIN)return WIN-height-1;
  if(height>=MAX_PLY-1)return evaluate(p);
  const danger=threatened(),stand=evaluate(p);
  if(!danger){if(stand>=beta)return stand;alpha=Math.max(alpha,stand);if(left<=0)return stand;}
  else if(left<=-2)return stand;
  for(const c of choices){
   if(!danger&&c.gain<=0)continue;
   p.make(c.m);let score;try{score=-qsearch(-beta,-alpha,height+1,left-1);}finally{p.unmake();}
   if(score>=beta)return score;if(score>alpha)alpha=score;
  }
  return alpha;
 }
 function search(depth,alpha,beta,height,pv){
  nodes++;if((nodes&127)===0)check();
  const terminal=p.terminal(height);if(terminal!==null)return terminal;
  if(height>=MAX_PLY-1)return evaluate(p);
  // Repeated positions are neutral inside this search, not adjudicated game results.
  for(let i=height-2;i>=0;i-=2)if(path[i]?.[0]===p.hash&&path[i]?.[1]===p.lock)return 0;
  if(depth<=0)return qsearch(alpha,beta,height,3);
  const index=idx(),originalAlpha=alpha,key=p.hash,lock=p.lock;
  const hit=bounds[index]&&keys[index]===key&&locks[index]===lock&&(!p.limit||ages[index]===p.ply);
  let hint=hit?ttMoves[index]:0;
  if(hit&&depths[index]>=depth&&!pv){
   const s=scores[index]>WIN-500?scores[index]-height:scores[index]<-WIN+500?scores[index]+height:scores[index];
   if(bounds[index]===1||bounds[index]===2&&s>=beta||bounds[index]===3&&s<=alpha)return s;
  }
  const choices=ordered(p.generate(),hint,height);if(!choices.length)return -WIN+height;
  if(choices[0].gain>=WIN)return WIN-height-1;
  path[height]=[key,lock];let value=-INF,chosen=choices[0].m,count=0;
  for(const c of choices){
   p.make(c.m);let score;
   try{
    if(count===0)score=-search(depth-1,-beta,-alpha,height+1,pv);
    else{
     const reduction=depth>=3&&count>=5&&c.gain===0&&!pv?1:0;
     score=-search(depth-1-reduction,-alpha-1,-alpha,height+1,false);
     if(reduction&&score>alpha)score=-search(depth-1,-alpha-1,-alpha,height+1,false);
     if(score>alpha&&score<beta)score=-search(depth-1,-beta,-alpha,height+1,pv);
    }
   }finally{p.unmake();}
   count++;if(score>value){value=score;chosen=c.m;}if(score>alpha)alpha=score;
   if(alpha>=beta){if(c.gain===0){killers[height]=[c.m,killers[height][0]];const h=historyIndex(c.m);history[h]=Math.min(60000,history[h]+depth*depth*8);}break;}
  }
  if(!hit||depth>=depths[index]-2){keys[index]=key;locks[index]=lock;depths[index]=depth;ttMoves[index]=chosen;ages[index]=p.ply;scores[index]=value>WIN-500?value+height:value<-WIN+500?value-height:value;bounds[index]=value<=originalAlpha?3:value>=beta?2:1;}
  return value;
 }
 try{
  let root=ordered(initial,0,0);
  const win=root.find(c=>c.gain>=WIN);
  if(win){best=win.m;bestScore=WIN-1;onBest(objectMove(best));return objectMove(best);}
  for(let depth=1;depth<=30;depth++){
   check();let alpha=-INF,chosen=best;const results=[];path[0]=[p.hash,p.lock];
   for(const c of root){
    check();p.make(c.m);let score;
    try{
     score=results.length?-search(depth-1,-alpha-1,-alpha,1,false):-search(depth-1,-INF,INF,1,true);
     if(results.length&&score>alpha)score=-search(depth-1,-INF,-alpha,1,true);
    }finally{p.unmake();}
    results.push({...c,score});if(score>alpha){alpha=score;chosen=c.m;}
   }
   best=chosen;bestScore=alpha;completedDepth=depth;root=results.sort((a,b)=>b.score-a.score);onBest(objectMove(best));
   if(Math.abs(alpha)>WIN-500)break;
  }
 }catch(error){if(error!==expired)throw error;}
 finally{onStats({nodes,completedDepth,score:bestScore,elapsedMs:performance.now()-started});}
 return objectMove(best);
}

export const searchMoveCodec={encode,decode:objectMove};
