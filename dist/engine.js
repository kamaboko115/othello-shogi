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
export function raw(s,m){const n=clone(s);n.flipped=[];n.destroyed=null;n.spawned=null;n.paradoxStarted=false;if(m.drop){n.board[m.to]={type:m.drop,side:s.turn,prom:false};n.hands[s.turn][m.drop]--;}else{const p=n.board[m.from],q=n.board[m.to];if(q&&q.type!=='K')n.hands[s.turn][q.type]=(n.hands[s.turn][q.type]||0)+1;n.board[m.to]=p;n.board[m.from]=null;if(m.prom)p.prom=true;}if(s.mode)n.flipped=flip(n,m.to);n.last=m.drop?[m.to]:[m.from,m.to];n.turn=1-s.turn;n.ply++;return n;}
export function moves(s,source,skipPawnMate=false){if(s.result||(typeof source==='string'&&s.noDrops))return [];let out=[];const drop=typeof source==='string',p=drop?{type:source,side:s.turn,prom:false}:s.board[source];if(!p||p.side!==s.turn||(drop&&!s.hands[s.turn][source]))return out;for(let to=0;to<81;to++){const q=s.board[to],r=Math.floor(to/9);if(drop){if(q||dead(p.type,p.side,r))continue;if(p.type==='P'&&s.board.some((v,i)=>i%9===to%9&&v?.side===s.turn&&v.type==='P'&&!v.prom))continue;}else if(q?.side===s.turn||(!s.mode&&q?.type==='K')||!reaches(s,source,to))continue;let opts=[false];if(!drop&&!p.prom&&promoted[p.type]&&(zone(p.side,Math.floor(source/9))||zone(p.side,r)))opts=dead(p.type,p.side,r)?[true]:[false,true];for(const prom of opts){const m=drop?{drop:source,to}:{from:source,to,prom};const n=s.mode?null:raw(s,m);if(!s.mode&&inCheck(n,s.turn))continue;if(!s.mode&&drop&&source==='P'&&!skipPawnMate){const k=n.board.findIndex(v=>v?.side===n.turn&&v.type==='K');if(reaches(n,to,k)&&!hasMove(n,true))continue;}out.push(m);}}return out;}
export function hasMove(s,skip=false){for(let i=0;i<81;i++)if(s.board[i]?.side===s.turn&&moves(s,i,skip).length)return true;for(const t of Object.keys(s.hands[s.turn]))if(moves(s,t,skip).length)return true;return false;}
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
  else if(n.moveLimit!==false&&n.ply>=60){const [a,b]=points(n);n.result=`${a===b?'引き分け':a>b?'先手の勝ち':'後手の勝ち'}（60手・先手${a}枚／後手${b}枚）`;}
  return n;
 }
 n.history=[...s.history,{key:key(s),side:s.turn,check:inCheck(n,n.turn)}];
 if(!hasMove(n))n.result=`${n.turn===0?'後手':'先手'}の勝ち${inCheck(n,n.turn)?'（詰み）':'（合法手なし）'}`;
 const repeats=n.history.map((h,i)=>h.key===key(n)?i:-1).filter(i=>i>=0);
 if(repeats.length>=3){const cycle=n.history.slice(repeats[repeats.length-3]);const perpetual=[0,1].find(side=>cycle.some(h=>h.side===side)&&cycle.filter(h=>h.side===side).every(h=>h.check));n.result=perpetual===undefined?'千日手・引き分け':`${perpetual===0?'後手':'先手'}の勝ち（連続王手の千日手）`;}
 return n;
}
export function demo(){const s=empty(true);for(const [i,type,side,prom] of [[76,'K',0,false],[4,'K',1,false],[49,'G',0,false],[39,'R',1,true],[38,'P',1,false],[37,'S',0,false]])s.board[i]={type,side,prom};return s;}

// Randomness is resolved only by the authoritative server after a legal move.
export function collapseAfterMove(s,pick,spawn){
 const threshold=s.paradoxAt??150;
 if(threshold===false||!s.mode||s.result||s.ply<threshold)return s;
 const choices=s.board.flatMap((p,i)=>p?[i]:[]);
 if(!choices.length)return s;
 const suppliedPick=!!pick;
 if(!pick)pick=n=>{const a=new Uint32Array(1),limit=Math.floor(4294967296/n)*n;do{crypto.getRandomValues(a);}while(a[0]>=limit);return a[0]%n;};
 if(!spawn)spawn=suppliedPick?()=>false:()=>pick(8)===0;
 s.paradoxStarted=s.ply===threshold;
 if(spawn()){
  const emptySquares=s.board.flatMap((p,i)=>p?[]:[i]);if(!emptySquares.length)return s;
  const square=emptySquares[pick(emptySquares.length)],piece={type:pick(2)?'R':'B',side:pick(2),prom:false};s.board[square]=piece;
  s.destroyed=null;s.spawned={square,piece};return s;
 }
 const index=pick(choices.length);if(!Number.isInteger(index)||index<0||index>=choices.length)throw Error('Invalid random choice');
 const square=choices[index],piece={...s.board[square]};s.board[square]=null;
 s.destroyed={square,piece};s.spawned=null;
 if(piece.type==='K')s.result=(piece.side===1?'先手':'後手')+'の勝ち（パラドックスで王が崩壊）';
 return s;
}
