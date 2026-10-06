// These tools only use local DOM/browser APIs. They do not fetch room data.
export function initBoardPreview(document){
 const select=document.getElementById('boardTheme'),preview=document.getElementById('boardThemePreview'),name=document.getElementById('boardThemePreviewName');
 const paint=()=>{
  const theme=select.value==='wood'?'wood':'green',label=theme==='wood'?'木目':'深緑';
  preview.dataset.theme=theme;preview.setAttribute('aria-label',label+'の将棋盤プレビュー');name.textContent=label+'の表示例';
 };
 select.addEventListener('change',paint);
 document.defaultView?.addEventListener('storage',event=>{if(event.key==='hanten-board-theme-v2')paint();});
 paint();
}

export async function shareInvitation(url,{navigator=globalThis.navigator}={}){
 if(typeof navigator?.share==='function'){
  try{await navigator.share({title:'OSE SHOGI（オセロ将棋）に招待',text:'OSE SHOGI（オセロ将棋）で対局しよう！',url});return 'shared';}
  catch(error){if(error.name==='AbortError')return 'cancelled';}
 }
 try{await navigator.clipboard.writeText(url);return 'copied';}catch{return 'select';}
}

const pageSize=50;
export function recordPage(logs,page){
 const pages=Math.max(1,Math.ceil(logs.length/pageSize)),current=Math.max(0,Math.min(pages-1,page)),start=current*pageSize;
 return {page:current,pages,start,end:Math.min(start+pageSize,logs.length),lines:logs.slice(start,start+pageSize)};
}

export function initRecordViewer(document,recordLine){
 const $=id=>document.getElementById(id),dialog=$('recordDialog');
 let logs=[],page=0,key=null;
 function paint(){
  const data=recordPage(logs,page);page=data.page;
  $('recordPagination').hidden=data.pages<=1;
  $('recordList').replaceChildren(...data.lines.map(recordLine));$('recordList').scrollTop=0;
  $('recordRange').textContent=logs.length?`全${logs.length}手 · ${data.start+1}〜${data.end}手`:'まだ指されていません。';
  $('recordFirst').disabled=$('recordPrevious').disabled=page===0;
  $('recordNext').disabled=$('recordLast').disabled=page===data.pages-1;
 }
 $('openRecord').addEventListener('click',()=>{page=recordPage(logs,Infinity).pages-1;paint();dialog.showModal();});
 $('closeRecord').addEventListener('click',()=>dialog.close());
 for(const [id,target] of [['recordFirst',()=>0],['recordPrevious',()=>page-1],['recordNext',()=>page+1],['recordLast',()=>Infinity]])$(id).addEventListener('click',()=>{page=target();paint();});
 return {update(next,matchKey){
  const old=logs;if(matchKey!==key){key=matchKey;page=0;if(dialog.open)dialog.close();}
  logs=next;$('openRecord').hidden=!logs.length;$('openRecord').textContent=`すべての棋譜（${logs.length}手）`;
  if(dialog.open&&old!==logs&&(old.length!==logs.length||old.some((line,i)=>line!==logs[i])))paint();
 }};
}

export function buildInfoText(info){
 const date=new Date(info?.builtAt);
 if(!info?.builtAt||Number.isNaN(date.getTime()))return '更新日時：不明（ビルド情報なし）';
 const time=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date);
 const revision=/^[a-f0-9]{7,40}$/i.test(info.revision||'')?info.revision.slice(0,7):'不明';
 return `最終更新（ビルド）：${time}（日本時間）\nバージョン：${revision}${info.dirty===true?'（未コミットの変更あり）':''}`;
}
export function initBuildInfo(document){
 let info;try{info=JSON.parse(document.querySelector('meta[name="app-build"]')?.content||'null');}catch{}
 document.getElementById('buildInfo').textContent=buildInfoText(info);
}
