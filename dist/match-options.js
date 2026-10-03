import {beforeParadox} from './engine.js';
export const minuteSteps=[0,1,2,3,4,5,6,7,8,10,15,20,30];
export const byoyomiSteps=[0,5,10,15,20,30,40,45,60];
export function normalizeTime(value){
 if(typeof value==='string'||value===undefined)return Object.hasOwn(timeOptions,value)?value:'none';
 if(!value||!minuteSteps.includes(value.minutes)||!Number.isInteger(value.increment)||value.increment<0||value.increment>15||!byoyomiSteps.includes(value.byoyomi))throw new Error('時間設定が不正です。');
 return {minutes:value.minutes,increment:value.increment,byoyomi:value.byoyomi};
}
// Disabled add-ons use the same wording in sliders, lobby help and room summaries.
export const clockSecondsLabel=seconds=>seconds?`${seconds}秒`:'なし';
export function timeHelp({minutes,increment,byoyomi}){
 if(!minutes&&!increment&&!byoyomi)return '時間制限なし（持ち時間の右端で「無限」を選べます）';
 const parts=[increment?`毎手＋${increment}秒`:'加算なし',byoyomi?`持ち時間の後は秒読み${byoyomi}秒`:'秒読みなし'];
 let text=parts.join(' ／ ')+'。';
 if(!byoyomi)text+=' 持ち時間が切れたら負け。';
 if(minutes===0&&increment>0&&byoyomi===0)text+=' 初手も加算秒数から開始。';
 return text;
}
export function clockRule(value){
 if(!value||typeof value==='string')return timeOptions[value]||timeOptions.none;
 const {minutes,increment,byoyomi}=value;
 if(!minutes&&!increment&&!byoyomi)return timeOptions.none;
 return {mode:'custom',base:minutes*60000||(!byoyomi?increment*1000:0),increment:increment*1000,byoyomi:byoyomi*1000,label:`持ち時間${minutes}分 ／ 加算${clockSecondsLabel(increment)} ／ 秒読み${clockSecondsLabel(byoyomi)}`};
}
export const timeOptions={
 none:{label:'なし',mode:'none'},
 turn30:{label:'1手30秒',mode:'turn',base:30000},turn60:{label:'1手60秒',mode:'turn',base:60000},
 sudden3:{label:'3分切れ負け',mode:'sudden',base:180000},sudden5:{label:'5分切れ負け',mode:'sudden',base:300000},sudden10:{label:'10分切れ負け',mode:'sudden',base:600000},
 fischer3:{label:'フィッシャー 3分＋2秒',mode:'fischer',base:180000,extra:2000},fischer5:{label:'フィッシャー 5分＋5秒',mode:'fischer',base:300000,extra:5000},
 byo5:{label:'5分＋秒読み30秒',mode:'byoyomi',base:300000,extra:30000},byo0:{label:'秒読み30秒のみ',mode:'byoyomi',base:0,extra:30000}
};
export const handicapOptions={none:'平手',bishop:'角落ち',rook:'飛車落ち',two:'二枚落ち',four:'四枚落ち',six:'六枚落ち'};
export function applyHandicap(state,hostSide,key){
 const types={bishop:['B'],rook:['R'],two:['R','B'],four:['R','B','L'],six:['R','B','L','N']}[key]||[];
 state.board=state.board.map(p=>p?.side===hostSide&&types.includes(p.type)?null:p);
}
export function startClock(data,now){
 const rule=clockRule(data.settings?.timeControl);
 data.clock=data.kind==='friend'&&rule.mode!=='none'?{remaining:[rule.base,rule.base],since:now+5000}:null;
}
export function clockBudget(data,side,now){
 const c=data.clock,r=clockRule(data.settings?.timeControl);if(!c||!r)return Infinity;
 const elapsed=!data.state.result&&side===data.state.turn?Math.max(0,now-c.since):0;
 return c.remaining[side]+(r.mode==='byoyomi'?r.extra:r.byoyomi||0)-elapsed;
}
export function chargeClock(data,now){
 if(!data.clock)return;const side=data.state.turn;
 data.clock.remaining[side]=Math.max(0,data.clock.remaining[side]-Math.max(0,now-data.clock.since));data.clock.since=now;
}
export function finishClockMove(data,mover,now){
 if(!data.clock)return;const r=clockRule(data.settings.timeControl);
 if(r.mode==='custom')data.clock.remaining[mover]+=r.increment;
 if(r.mode==='fischer')data.clock.remaining[mover]+=r.extra;
 if(r.mode==='turn')data.clock.remaining[mover]=r.base;
 // A shared animation allowance protects both players while controls are locked.
 const n=data.state.flipped.length;let delay=n?Array.from({length:n},(_,i)=>Math.max(140,360-i*32)+20).reduce((a,b)=>a+b,0)+225:330;
 if(n>=4)delay+=3400;else if(n>=2)delay+=1000;else delay+=1000;
 if(data.state.paradoxStarted)delay+=3000;
 else if(data.state.destroyed)delay+=1700; // 500ms wait + 1200ms lightning
 else if(data.state.spawned||data.state.paradoxEvent)delay+=1320; // 120ms wait + 1200ms arrival
 const played=beforeParadox(data.state);
 const to=data.state.last?.[1],from=data.state.last?.[0],previous=data.takebacks?.at(-1)?.state;
 if(to!==undefined&&played.board[to]?.prom&&!previous?.board[from]?.prom&&['R','B'].includes(played.board[to]?.type))delay+=1500;
 data.clock.since=now+delay+500;
}
