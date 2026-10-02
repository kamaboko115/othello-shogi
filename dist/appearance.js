// Visual preferences are local to this browser; no game state or network requests.
(() => {
 const key='othello-shogi-appearance-v1';
 const modes=['improved','readability-v1','hallmark-v1','original'], themes=['light','dark'];
 const params=new URLSearchParams(location.search);
 let saved={};
 try{saved=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}
 let mode=modes.includes(params.get('design'))?params.get('design'):modes.includes(saved.design)?saved.design:'improved';
 let theme=themes.includes(params.get('theme'))?params.get('theme'):themes.includes(saved.theme)?saved.theme:'light';
 function apply(){
  document.documentElement.dataset.design=mode;
  document.documentElement.dataset.uiTheme=theme;
  document.documentElement.style.colorScheme=theme;
  if(document.body)document.body.classList.toggle('hallmark-trial',mode!=='original');
  const help=document.querySelector('.room-help');
  if(help)help.open=!['improved','readability-v1'].includes(mode);
 }
 apply();
 function init(){
  apply();
  if(!['127.0.0.1','localhost'].includes(location.hostname)) { const link=document.querySelector('.trial-compare');if(link)link.remove(); }
  const design=document.getElementById('designMode'),color=document.getElementById('uiTheme');
  if(!design||!color)return;
  const note=document.querySelector('#roomTools>.note');
  if(note){const help=document.createElement('details'),summary=document.createElement('summary');help.className='room-help';summary.textContent='対局の保存と終了';note.before(help);help.append(summary,note);help.open=!['improved','readability-v1'].includes(mode);}
  design.value=mode;color.value=theme;
  const change=()=>{
   mode=design.value;theme=color.value;apply();
   try{localStorage.setItem(key,JSON.stringify({design:mode,theme}));}catch{}
   // Remove temporary comparison overrides once the user chooses a preference.
   const url=new URL(location.href);url.searchParams.delete('design');url.searchParams.delete('theme');
   history.replaceState(history.state,'',url.pathname+url.search+url.hash);
  };
  design.addEventListener('change',change);color.addEventListener('change',change);
  addEventListener('storage',event=>{
   if(event.key!==key||params.has('design')||params.has('theme'))return;
   try{const value=JSON.parse(event.newValue||'{}');if(modes.includes(value.design))mode=value.design;if(themes.includes(value.theme))theme=value.theme;apply();design.value=mode;color.value=theme;}catch{}
  });
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
