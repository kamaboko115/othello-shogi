import {packReplayState} from './replay-code.js';
// No polling: one cached lobby read, one idempotent report per won round.
export function createChallengeWins({fetchImpl=globalThis.fetch,storage=()=>globalThis.localStorage,now=Date.now}={}){
 const key='othello-challenge-wins-v1';let memory={},reading=null;const reporting=new Map();
 const load=()=>{try{memory=JSON.parse(storage().getItem(key))||memory;}catch{}return memory;};
 const save=()=>{try{storage().setItem(key,JSON.stringify(memory));}catch{}};
 const call=async(options)=>{const response=await fetchImpl('/api/challenge-wins',{...options,signal:AbortSignal.timeout(8000)});if(!response.ok){const detail=await response.json().catch(()=>({}));throw Object.assign(new Error(detail.error||'集計は後で再試行できます'),{status:response.status});}return response.json();};
 return {
  count(){const data=load();if(Number.isSafeInteger(data.total)&&now()-(data.at||0)<1800000)return Promise.resolve(data.total);if(reading)return reading;reading=call().then(value=>{if(!Number.isSafeInteger(value.total)||value.total<0)throw new Error('集計を確認できません');memory.total=value.total;memory.at=now();save();return value.total;}).finally(()=>reading=null);return reading;},
  eligible(data){const s=data?.settings;return data?.local&&data.kind==='ai'&&s?.aiLevel==='osesho'&&s.thinkMs===5000&&s.paradoxAt===200&&s.handicap==='none'&&!s.noDrops&&s.moveLimit===false&&s.timeControl?.minutes===20&&s.timeControl?.increment===5&&data.side===1&&data.state.result?.startsWith('後手の勝ち');},
  report(data){
   const matchKey=data.room+':'+(data.round||1),saved=load().reports?.[matchKey];if(saved)return Promise.resolve(saved);if(reporting.has(matchKey))return reporting.get(matchKey);
   const bytes=crypto.getRandomValues(new Uint8Array(32)),token=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
   const task=call({method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({matchKey,settings:data.settings,side:data.side,result:data.state.result,ply:data.state.ply,proof:data.challengeProof?{...data.challengeProof,final:packReplayState(data.state)}:undefined})}).then(value=>{
    if(!Number.isSafeInteger(value.ordinal)||value.ordinal<1)throw new Error('勝利番号を確認できません');
    load();memory.reports={...memory.reports,[matchKey]:value};memory.total=value.total;memory.at=now();save();return value;
   }).finally(()=>reporting.delete(matchKey));reporting.set(matchKey,task);return task;
  }
 };
}
