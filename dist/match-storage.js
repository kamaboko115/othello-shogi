// Only private history is compressed. Live state and public replay records keep
// their existing shapes, and saves without this marker remain readable.
const matchStorageTypes='PLNSGBRK';
const encodePiece=p=>matchStorageTypes.indexOf(p.type)+8*p.side+(p.prom?16:0)+(p.wings?32:0);
const decodePiece=code=>({type:matchStorageTypes[code%8],side:(code>>3)&1,prom:!!(code&16),...(code&32?{wings:true}:{})});
function packHistory(value){
 return JSON.parse(JSON.stringify(value,(key,item)=>{
  if(key==='board'&&Array.isArray(item))return item.map(p=>p?String.fromCharCode(65+encodePiece(p)):'.').join('');
  if(key==='pieces'&&Array.isArray(item))return item.map(d=>[d.square,encodePiece(d.piece)]);
  if((key==='piece'||key==='displaced')&&item)return encodePiece(item);
  if(key==='moves'&&Array.isArray(item))return item.map(m=>[m.from,m.to]);
  return item;
 }));
}
function unpackHistory(value){
 return JSON.parse(JSON.stringify(value),(key,item)=>{
  if(key==='board'&&typeof item==='string')return Array.from(item,c=>c==='.'?null:decodePiece(c.charCodeAt(0)-65));
  if(key==='pieces'&&Array.isArray(item))return item.map(d=>Array.isArray(d)?{square:d[0],piece:decodePiece(d[1])}:d);
  if((key==='piece'||key==='displaced')&&Number.isInteger(item))return decodePiece(item);
  if(key==='moves'&&Array.isArray(item))return item.map(m=>Array.isArray(m)?{from:m[0],to:m[1]}:m);
  return item;
 });
}
export function packMatchData(data){
 const out={...data,historyEncoding:1};
 if(data.takebacks)out.takebacks=packHistory(data.takebacks.map(({logs,...snapshot})=>({...snapshot,logLength:snapshot.logLength??logs?.length??0})));
 if(data.replay)out.replay=packHistory(data.replay);
 return out;
}
export function unpackMatchData(data){
 if(data.historyEncoding!==1)return data;
 const out={...data};delete out.historyEncoding;
 if(data.takebacks)out.takebacks=unpackHistory(data.takebacks);
 if(data.replay)out.replay=unpackHistory(data.replay);
 return out;
}
export const serializeMatchData=data=>JSON.stringify(packMatchData(data));
export const parseMatchData=text=>unpackMatchData(JSON.parse(text));
