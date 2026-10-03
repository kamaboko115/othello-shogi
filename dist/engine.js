import {adjudicationLimit} from './judge-options.js';
export const names={K:'玉',R:'飛',B:'角',G:'金',S:'銀',N:'桂',L:'香',P:'歩'};
export const promoted={R:'龍',B:'馬',S:'成銀',N:'成桂',L:'成香',P:'と'};
export const label=p=>p.prom?promoted[p.type]:names[p.type];
export const clone=s=>structuredClone(s);
export function empty(mode=true){return {board:Array(81).fill(null),hands:[{},{}],turn:0,mode,ply:0,last:[],flipped:[],history:[],result:''};}
export function initial(mode=true){const s=empty(mode);const row=['L','N','S','G','K','G','S','N','L'];for(let c=0;c<9;c++){s.board[c]={type:row[c],side:1,prom:false};s.board[72+c]={type:row[c],side:0,prom:false};s.board[18+c]={type:'P',side:1,prom:false};s.board[54+c]={type:'P',side:0,prom:false};}for(const [i,t,side] of [[10,'R',1],[16,'B',1],[64,'B',0],[70,'R',0]])s.board[i]={type:t,side,prom:false};return s;}
const inside=(r,c)=>r>=0&&r<9&&c>=0&&c<9;
export function reaches(s,a,b){if(a===b)return false;const p=s.board[a];if(!p)return false;let dr=Math.floor(b/9)-Math.floor(a/9),dc=b%9-a%9;const f=p.side===0?-1:1,y=dr*f,x=dc;let t=p.prom&&['P','L','N','S'].includes(p.type)?'G':p.type;let slide=false,ok=false;
 if(t==='K')ok=Math.max(Math.abs(dr),Math.abs(dc))===1;
 if(t==='G')ok=(y===1&&Math.abs(x)<=1)||(y===0&&Math.abs(x)===1)||(y===-1&&x===0);
 if(t==='S')ok=(y===1&&Math.abs(x)<=1)||(y===-1&&Math.abs(x)===1);
 if(t==='P')ok=y===1&&x===0;
 if(t==='N')ok=y===2&&Math.abs(x)===1;
 if(t==='L')slide=x===0&&y>0;
 if(t==='R'){slide=dr===0||dc===0;ok=p.prom&&Math.abs(dr)===1&&Math.abs(dc)===1;}
 if(t==='B'){slide=Math.abs(dr)===Math.abs(dc);ok=p.prom&&Math.abs(dr)+Math.abs(dc)===1;}
 if(slide){const rr=Math.sign(dr),cc=Math.sign(dc);let r=Math.floor(a/9)+rr,c=a%9+cc;while(r*9+c!==b){if(s.board[r*9+c])return false;r+=rr;c+=cc;}return true;}return ok;}
export function inCheck(s,side){const k=s.board.findIndex(p=>p?.side===side&&p.type==='K');return k<0||s.board.some((p,i)=>p&&p.side!==side&&reaches(s,i,k));}
export function flip(s,to){const side=s.board[to].side,out=[];for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){if(!dr&&!dc)continue;let r=Math.floor(to/9)+dr,c=to%9+dc,run=[];while(inside(r,c)){const i=r*9+c,p=s.board[i];if(!p)break;if(p.side===side){if(run.length)out.push(...run);break;}run.push(i);r+=dr;c+=dc;}}for(const i of out)s.board[i].side=side;return out;}
const zone=(side,r)=>side===0?r<=2:r>=6;
const dead=(t,side,r)=>((t==='P'||t==='L')&&(side===0?r===0:r===8))||(t==='N'&&(side===0?r<=1:r>=7));
export function raw(s,m){const n=clone(s);n.flipped=[];n.destroyed=null;n.spawned=null;n.paradoxStarted=false;delete n.paradoxEvent;if(m.drop){n.board[m.to]={type:m.drop,side:s.turn,prom:false};n.hands[s.turn][m.drop]--;}else{const p=n.board[m.from],q=n.board[m.to];if(q&&q.type!=='K')n.hands[s.turn][q.type]=(n.hands[s.turn][q.type]||0)+1;n.board[m.to]=p;n.board[m.from]=null;if(m.prom)p.prom=true;}if(s.mode)n.flipped=flip(n,m.to);n.last=m.drop?[m.to]:[m.from,m.to];n.turn=1-s.turn;n.ply++;return n;}
export function moves(s,source,skipPawnMate=false){if(s.result||(typeof source==='string'&&s.noDrops))return [];let out=[];const drop=typeof source==='string',p=drop?{type:source,side:s.turn,prom:false}:s.board[source];if(!p||p.side!==s.turn||(drop&&!s.hands[s.turn][source]))return out;for(let to=0;to<81;to++){const q=s.board[to],r=Math.floor(to/9);if(drop){if(q||dead(p.type,p.side,r))continue;if(p.type==='P'&&s.board.some((v,i)=>i%9===to%9&&v?.side===s.turn&&v.type==='P'&&!v.prom))continue;}else if(q?.side===s.turn||(!s.mode&&q?.type==='K')||!reaches(s,source,to))continue;let opts=[false];if(!drop&&!p.prom&&promoted[p.type]&&(zone(p.side,Math.floor(source/9))||zone(p.side,r)))opts=dead(p.type,p.side,r)?[true]:[false,true];for(const prom of opts){const m=drop?{drop:source,to}:{from:source,to,prom};const n=s.mode?null:raw(s,m);if(!s.mode&&inCheck(n,s.turn))continue;if(!s.mode&&drop&&source==='P'&&!skipPawnMate){const k=n.board.findIndex(v=>v?.side===n.turn&&v.type==='K');if(reaches(n,to,k)&&!hasMove(n,true))continue;}out.push(m);}}return out;}
export function hasMove(s,skip=false){for(let i=0;i<81;i++)if(s.board[i]?.side===s.turn&&moves(s,i,skip).length)return true;for(const t of Object.keys(s.hands[s.turn]))if(moves(s,t,skip).length)return true;return false;}
// Inspection does not change the turn or create a playable selection.
export function movementTargets(s,source){
 if(!Number.isInteger(source)||source<0||source>=81||!s.board[source])return [];
 return [...new Set(moves({...s,turn:s.board[source].side,result:''},source).map(m=>m.to))];
}
export const key=s=>JSON.stringify([s.board,s.hands,s.turn]);
export function points(s){
 const scores=[0,0];const value=()=>1;
 for(const p of s.board)if(p)scores[p.side]+=value(p.type);
 return scores;
}
export function play(s,m){
 if(!m||!Number.isInteger(m.to)||m.to<0||m.to>80)throw Error('指せない手です');
 const source=m.drop||m.from;
 if(!moves(s,source).some(x=>x.to===m.to&&x.from===m.from&&x.drop===m.drop&&!!x.prom===!!m.prom))throw Error('指せない手です');
 const n=raw(s,m),winner=s.turn===0?'先手':'後手';
 if(s.mode){
  const enemyKing=n.board.some(p=>p?.type==='K'&&p.side===n.turn);
  if(!enemyKing)n.result=`${winner}の勝ち（${n.flipped.some(i=>n.board[i].type==='K')?'王を反転':'王を取った'}）`;
  else if(adjudicationLimit(n)!==false&&n.ply>=adjudicationLimit(n)){const [a,b]=points(n);n.result=`${a===b?'引き分け':a>b?'先手の勝ち':'後手の勝ち'}（${adjudicationLimit(n)}手・先手${a}枚／後手${b}枚）`;}
  return n;
 }
 n.history=[...s.history,{key:key(s),side:s.turn,check:inCheck(n,n.turn)}];
 if(!hasMove(n))n.result=`${n.turn===0?'後手':'先手'}の勝ち${inCheck(n,n.turn)?'（詰み）':'（合法手なし）'}`;
 const repeats=n.history.map((h,i)=>h.key===key(n)?i:-1).filter(i=>i>=0);
 if(repeats.length>=3){const cycle=n.history.slice(repeats[repeats.length-3]);const perpetual=[0,1].find(side=>cycle.some(h=>h.side===side)&&cycle.filter(h=>h.side===side).every(h=>h.check));n.result=perpetual===undefined?'千日手・引き分け':`${perpetual===0?'後手':'先手'}の勝ち（連続王手の千日手）`;}
 return n;
}
export function demo(){const s=empty(true);for(const [i,type,side,prom] of [[76,'K',0,false],[4,'K',1,false],[49,'G',0,false],[39,'R',1,true],[38,'P',1,false],[37,'S',0,false]])s.board[i]={type,side,prom};return s;}

// Evaluate the opponent's next legal move, including drops and simultaneous flips.
// Read hypothetical occupancy instead of cloning the entire state per candidate.
export function safeArrivalSquares(s,piece,candidates=Array.from({length:81},(_,i)=>i)){
 const enemy=1-piece.side,trial={...s,board:s.board.slice(),turn:enemy,result:''},safe=[];
 for(const square of candidates){
  if(trial.board[square])continue;
  trial.board[square]=piece;
  const threatened=move=>{
   if(move.to===square)return true;
   if(!s.mode)return false;
   const at=i=>i===move.to?{side:enemy}:i===move.from?null:trial.board[i];
   for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){
    if(!dr&&!dc)continue;
    let r=Math.floor(move.to/9)+dr,c=move.to%9+dc,contains=false;
    while(inside(r,c)){
     const i=r*9+c,p=at(i);if(!p)break;
     if(p.side===enemy){if(contains)return true;break;}
     if(i===square)contains=true;r+=dr;c+=dc;
    }
   }
   return false;
  };
  let danger=false;
  for(let from=0;from<81&&!danger;from++)if(trial.board[from]?.side===enemy)danger=moves(trial,from).some(threatened);
  for(const type of Object.keys(trial.hands[enemy]))if(!danger)danger=moves(trial,type).some(threatened);
  if(!danger)safe.push(square);
  trial.board[square]=null;
 }
 return safe;
}

// Keep the first arrival in the old shape so saved rooms remain readable.
export const arrivals=s=>s.spawned?[s.spawned,...(s.spawned.additional||[])]:[];
export const arrivalSummary=s=>arrivals(s).map(d=>(d.piece.side?'後手':'先手')+'の'+label(d.piece)).join('・')+'が降臨';
// One ticket per king; ten tickets per other piece.
export const collapseTargets=s=>s.board.flatMap((p,i)=>!p?[]:Array(p.type==='K'?1:10).fill(i));
// Total 9240 (=120*77): preserve existing special odds with promotion at 1/77 and hand supply at 1/60.
export const paradoxWeights=Object.freeze({arrival:770,warp:770,flip:462,shuffle:154,invert:77,promote:120,supply:154,destroy:6733});
export function paradoxCutinCount(kind,weights=paradoxWeights){
 const weight=weights[kind],total=Object.values(weights).reduce((a,b)=>a+b,0);
 if(!(weight>0))return 0;
 return total>=weight*120?3:total>=weight*40?1:0;
}
// Shared with the clock: presentation never consumes a player's thinking time.
export function paradoxEventTiming(event){
 const kind=event?.kind,count=paradoxCutinCount(kind),cutins=count===3?['middle','upper','lower']:count===1?['middle']:[];
 const cutinMs=650,noticeMs=kind==='invert'||kind==='shuffle'?1600:kind==='supply'?600:kind==='promote'?800:kind==='flip'?500:200;
 const flipMs=kind==='invert'?4000:kind==='promote'?1200:1100,staggerMs=280,tailMs=kind==='warp'?1400:kind==='shuffle'&&!event.skipped?1500:350;
 const motionMs=kind==='supply'?1800:kind==='shuffle'?2800:kind==='invert'?4000:kind==='promote'?flipMs:kind==='flip'?flipMs+Math.max(0,(event.squares?.length||1)-1)*staggerMs:800;
 return {cutins,cutinMs,noticeMs,flipMs,staggerMs,motionMs,tailMs,totalMs:cutins.length*cutinMs+noticeMs+motionMs+tailMs};
}
export function chooseParadoxEvent(pick){let roll=pick(Object.values(paradoxWeights).reduce((a,b)=>a+b,0));if(!Number.isInteger(roll)||roll<0)throw Error('Invalid paradox roll');for(const [kind,weight]of Object.entries(paradoxWeights)){if(roll<weight)return kind;roll-=weight;}throw Error('Invalid paradox roll');}
const shuffle=(items,pick)=>{for(let i=items.length-1;i>0;i--){const j=pick(i+1);[items[i],items[j]]=[items[j],items[i]];}return items;};
export function paradoxSummary(s){
 const e=s.paradoxEvent;if(!e)return '';
 if(e.kind==='supply')return (e.side?'後手':'先手')+'の駒台に7種類の駒が1枚ずつ出現';
 if(e.kind==='warp')return e.moves.length?(e.side?'後手':'先手')+'の玉がワープ':'玉のワープは不発';
 if(e.kind==='flip')return '王以外の'+e.squares.length+'枚が反転';
 if(e.kind==='promote')return e.squares.length?'盤上の全駒が成る':'全駒成りは不発（成れる駒なし）';
 return e.kind==='shuffle'?(e.skipped?'シャッフルは不発':'全駒の位置がシャッフル'):'盤上の全駒が反転';
}
// Reconstruct the just-played position for move animations, before the random event.
export function beforeParadox(s){
 const e=s.paradoxEvent;if(!e)return s;const n={...s,board:s.board.slice()};delete n.paradoxEvent;
 if(e.kind==='supply')n.hands=s.hands.map((h,side)=>{const old={...h};if(side===e.side)for(const type of 'PLNSGBR')old[type]--;return old;});
 if(e.moves){for(const m of e.moves)n.board[m.to]=null;for(const m of e.moves)n.board[m.from]=s.board[m.to];}
 if(e.squares)for(const i of e.squares)n.board[i]=e.kind==='promote'?{...n.board[i],prom:false}:{...n.board[i],side:1-n.board[i].side};
 return n;
}
export function applyParadoxEvent(s,kind,pick){
 if(!['warp','flip','shuffle','invert','promote','supply'].includes(kind))throw Error('Invalid paradox event');
 s.destroyed=null;s.spawned=null;
 if(kind==='supply'){const side=1-s.turn,hand=s.hands[side];for(const type of 'PLNSGBR')hand[type]=(hand[type]||0)+1;s.paradoxEvent={kind,side};return s;}
 if(kind==='promote'){
  const squares=s.board.flatMap((p,i)=>p&&!p.prom&&['P','L','N','S','B','R'].includes(p.type)?[i]:[]);
  for(const i of squares)s.board[i]={...s.board[i],prom:true};s.paradoxEvent={kind,squares};return s;
 }
 if(kind==='warp'){
  const kings=shuffle(s.board.flatMap((p,i)=>p?.type==='K'?[i]:[]),pick);
  for(const from of kings){const piece=s.board[from],trial={...s,board:s.board.slice()};trial.board[from]=null;
   const safe=safeArrivalSquares(trial,piece).filter(i=>i!==from);if(!safe.length)continue;
   const to=safe[pick(safe.length)];s.board[from]=null;s.board[to]=piece;s.paradoxEvent={kind,side:piece.side,moves:[{from,to}]};return s;
  }
  s.paradoxEvent={kind,moves:[]};return s;
 }
 if(kind==='shuffle'){
  const old=s.board,kings=old.flatMap((piece,from)=>piece?.type==='K'?[{piece,from}]:[]);
  // Bounded retries keep dense positions responsive. Commit only if every king
  // survives every enemy move/drop, including sandwich captures, on the final board.
  for(let attempt=0;attempt<16;attempt++){
   const destinations=shuffle(Array.from({length:81},(_,i)=>i),pick),trial={...s,board:Array(81).fill(null)},changes=[];
   old.forEach((piece,from)=>{if(!piece||piece.type==='K')return;const to=destinations[from];trial.board[to]=piece;changes.push({from,to});});
   let valid=true;
   for(const {piece,from}of shuffle([...kings],pick)){
    const safe=safeArrivalSquares(trial,piece);if(!safe.length){valid=false;break;}
    const to=safe[pick(safe.length)];trial.board[to]=piece;changes.push({from,to});
   }
   if(!valid)continue;
   for(const {from,to}of changes){
    if(old[from].type!=='K')continue;const piece=trial.board[to];trial.board[to]=null;
    const safe=safeArrivalSquares(trial,piece,[to]).length>0;trial.board[to]=piece;if(!safe){valid=false;break;}
   }
   if(valid){s.board=trial.board;s.paradoxEvent={kind,moves:changes};return s;}
  }
  s.paradoxEvent={kind,moves:[],skipped:true};return s;
 }
 const squares=s.board.flatMap((p,i)=>p&&(kind==='invert'||p.type!=='K')?[i]:[]);
 if(kind==='flip'){shuffle(squares,pick);squares.splice(5);}
 for(const i of squares)s.board[i]={...s.board[i],side:1-s.board[i].side};
 s.paradoxEvent={kind,squares};return s;
}
// Resolve randomness once, in the authoritative match engine.
export function collapseAfterMove(s,pick,spawn){
 const threshold=s.paradoxAt??150;
 if(threshold===false||!s.mode||s.result||s.ply<threshold)return s;
 s.paradoxStarted=s.ply===threshold;
 // Activation is an announcement only: the first random event is the next move.
 if(s.paradoxStarted){s.destroyed=null;s.spawned=null;delete s.paradoxEvent;return s;}
 const choices=collapseTargets(s);
 if(!choices.length)return s;
 const suppliedPick=!!pick;
 if(!pick)pick=n=>{const a=new Uint32Array(1),limit=Math.floor(4294967296/n)*n;do{crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%n;};
 const event=spawn?(spawn()?'arrival':'destroy'):suppliedPick?'destroy':chooseParadoxEvent(pick);
 delete s.paradoxEvent;
 if(!['arrival','destroy'].includes(event))return applyParadoxEvent(s,event,pick);
 if(event==='arrival'){
  const batch=[];s.destroyed=null;s.spawned=null;
  for(let i=0;i<3;i++){
   const emptySquares=s.board.flatMap((p,i)=>p?[]:[i]);if(!emptySquares.length)break;
   const piece={type:pick(2)?'R':'B',side:pick(2),prom:true};
   const safe=safeArrivalSquares(s,piece),pool=safe.length&&pick(10)<9?safe:emptySquares;
   const square=pool[pick(pool.length)];s.board[square]=piece;batch.push({square,piece});
  }
  if(batch.length)s.spawned={...batch[0],...(batch.length>1?{additional:batch.slice(1)}:{})};return s;
 }
 const index=pick(choices.length);if(!Number.isInteger(index)||index<0||index>=choices.length)throw Error('Invalid random choice');
 const square=choices[index],piece={...s.board[square]};s.board[square]=null;
 s.destroyed={square,piece};s.spawned=null;
 if(piece.type==='K')s.result=(piece.side===1?'先手':'後手')+'の勝ち（パラドックスで王が崩壊）';
 return s;
}
