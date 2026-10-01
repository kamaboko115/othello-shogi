import {pathToFileURL} from 'node:url';
import {initial} from '../dist/engine.js';
import {createRoomTransport,pollDelay} from '../dist/room-network.js';

// Deterministic response/scheduler model, not an engine-strength or latency test.
// One visible client, eighty alternating moves at 44-second intervals, then
// eighty seconds of result/rematch polling, no errors, offers or animations.
export async function networkBenchmark(){
 const duration=3600000,moveEvery=44000,plies=80;
 async function simulate(improved){
  let now=0,knownVersion=0,nextPoll=improved?8000:2000,nextOwnMove=moveEvery;
  const snapshot=()=>{
   const version=Math.min(plies,Math.floor(now/moveEvery));
   return {serverNow:now+1700000000000,canUndo:version>0,room:'0'.repeat(32),seat:0,side:0,version,joined:true,expires:1700604800000,kind:'friend',round:1,settings:{timeControl:'none',moveLimit:60,noDrops:false},toss:{coins:[1,1,1,0,0],hostSide:0},offer:null,undoOffer:null,rematch:null,clock:null,state:{...initial(true),ply:version,turn:version%2,result:version===plies?'合意による引き分け':''},logs:Array.from({length:version},(_,i)=>`${i+1}. ${i%2?'▽':'▲'}７六 歩 ／ 2枚反転`)};
  };
  const transport=createRoomTransport({fetchImpl:async(url,options)=>{
   const data=snapshot(),query=new URL(url,'http://model.local').searchParams;
   if(options.method==='GET'&&query.get('version')===String(data.version))return new Response(null,{status:304,headers:{'X-Room-Server-Now':String(data.serverNow)}});
   return Response.json(data);
  }});
  const delay=()=>pollDelay({joined:true,turn:knownVersion%2,side:0,result:knownVersion===plies});
  while(Math.min(nextPoll,nextOwnMove)<=duration){
   now=Math.min(nextPoll,nextOwnMove);
   if(nextOwnMove<=nextPoll){
    const data=await transport.request('/'+'0'.repeat(32)+'/action','model-token',{action:'move',version:knownVersion});knownVersion=data.version;
    nextOwnMove+=2*moveEvery;if(nextOwnMove>plies*moveEvery)nextOwnMove=Infinity;
    if(improved)nextPoll=now+delay();
   }else{
    const data=await transport.request('/'+'0'.repeat(32),'model-token',undefined,improved?{version:knownVersion}:{});if(data)knownVersion=data.version;
    nextPoll=now+(improved?delay():2000);
   }
  }
  return transport.getStats();
 }
 const baseline=await simulate(false),improved=await simulate(true);
 return {durationMs:duration,plies,baseline,improved,requestReductionPercent:100*(1-improved.requests/baseline.requests),bodyReductionPercent:100*(1-improved.responseBytes/baseline.responseBytes)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await networkBenchmark(),null,2));
