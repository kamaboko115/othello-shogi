// One local cue per threshold and turn. No requests or extra timer are needed.
const thresholds=[1,2,3,4,5,10,30];
export function createClockWarning(play){
 let key=null,previous=null,heard=new Set();
 return ({turnKey,remaining,active,audible=true})=>{
  if(!active||!Number.isFinite(remaining)||remaining<=0){key=null;previous=null;heard.clear();return;}
  const seconds=Math.ceil(remaining/1000);
  if(key!==turnKey){key=turnKey;previous=seconds+1;heard.clear();}
  // If a delayed timer crosses several thresholds, sound only the closest one.
  const threshold=thresholds.find(value=>seconds<=value&&previous>value&&!heard.has(value));
  for(const value of thresholds)if(seconds<=value)heard.add(value);
  previous=seconds;
  if(threshold!==undefined&&audible)play(threshold<=5);
 };
}
