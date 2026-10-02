// Visual preferences are local to this browser; no game state or network requests.
(() => {
 const key='othello-shogi-appearance-v1';
 const modes=['improved','readability-v1','hallmark-v1','original'], themes=['light','dark'];
 const params=new URLSearchParams(location.search);
 const local=['127.0.0.1','localhost','[::1]'].includes(location.hostname);
 // URL overrides belong to local design previews, never shared game links.
 let previewOverride=local&&/-(preview|before)\.html$/.test(location.pathname);
 let saved={};
 try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
 let mode=previewOverride&&modes.includes(params.get('design'))?params.get('design'):modes.includes(saved.design)?saved.design:'improved';
 let theme=previewOverride&&themes.includes(params.get('theme'))?params.get('theme'):themes.includes(saved.theme)?saved.theme:'light';
 const skinKey='othello-shogi-piece-skin-v1';
 let pieceSkin='wood';try{if(localStorage.getItem(skinKey)==='stones')pieceSkin='stones';}catch{}
 const boardKey='hanten-board-theme-v2';
 let boardTheme='green';
 try{if(JSON.parse(localStorage.getItem(boardKey))==='wood')boardTheme='wood';}catch{}
 function apply(){
  document.documentElement.dataset.design=mode;
  document.documentElement.dataset.uiTheme=theme;
  document.documentElement.dataset.boardTheme=boardTheme;
  document.documentElement.dataset.pieceSkin=pieceSkin;
  document.documentElement.style.colorScheme=theme;
  if(document.body)document.body.classList.toggle('hallmark-trial',mode!=='original');
  const help=document.querySelector('.room-help');
  if(help)help.open=!['improved','readability-v1'].includes(mode);
 }
 apply();
 function init(){
  apply();
  if(local)for(const placeholder of document.querySelectorAll('.ad-placeholder'))placeholder.hidden=false;
  if(!local) { const link=document.querySelector('.trial-compare');if(link)link.remove(); }
  const design=document.getElementById('designMode'),color=document.getElementById('uiTheme');
  const board=document.getElementById('boardTheme'),skin=document.getElementById('pieceSkin');
  if(skin){skin.value=pieceSkin;skin.addEventListener('change',()=>{pieceSkin=skin.value==='stones'?'stones':'wood';apply();try{localStorage.setItem(skinKey,pieceSkin);}catch{}});}
  if(board){board.value=boardTheme;board.addEventListener('change',()=>{boardTheme=board.value==='wood'?'wood':'green';apply();try{localStorage.setItem(boardKey,JSON.stringify(boardTheme));}catch{}});}
  if(!design||!color)return;
  const note=document.querySelector('#roomTools>.note');
  if(note){const help=document.createElement('details'),summary=document.createElement('summary');help.className='room-help';summary.textContent='対局の保存と終了';note.before(help);help.append(summary,note);help.open=!['improved','readability-v1'].includes(mode);}
  design.value=mode;color.value=theme;
  const change=()=>{
   mode=design.value;theme=color.value;apply();
   previewOverride=false;
   try{localStorage.setItem(key,JSON.stringify({design:mode,theme}));}catch{}
   // Remove temporary comparison overrides once the user chooses a preference.
   const url=new URL(location.href);url.searchParams.delete('design');url.searchParams.delete('theme');
   history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  };
  design.addEventListener('change',change);color.addEventListener('change',change);
  addEventListener('storage',event=>{
   if(event.key===skinKey){pieceSkin=event.newValue==='stones'?'stones':'wood';apply();if(skin)skin.value=pieceSkin;return;}
   if(event.key===boardKey){boardTheme=event.newValue==='"wood"'?'wood':'green';apply();if(board)board.value=boardTheme;return;}
   if(event.key!==key||previewOverride&&(params.has('design')||params.has('theme')))return;
   try{const value=JSON.parse(event.newValue||'{}');if(modes.includes(value.design))mode=value.design;if(themes.includes(value.theme))theme=value.theme;apply();design.value=mode;color.value=theme;}catch{}
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
