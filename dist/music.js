export const musicKey='othello-shogi-music-v1';
export function createMusic({audioFactory=()=>new Audio(),storage=()=>globalThis.localStorage,document=globalThis.document}={}){
 let enabled=false,audio=null,paused=false;
 const backend=()=>typeof storage==='function'?storage():storage;
 try{enabled=backend().getItem(musicKey)==='on';}catch{}
 const play=()=>{
  if(!enabled||paused||document?.hidden){audio?.pause();return Promise.resolve(false);}
  // The file is fetched only after the player opts in and interacts with the page.
  if(!audio){audio=audioFactory();audio.src='/music/electrodoodle.mp3';audio.loop=true;audio.volume=.16;audio.preload='none';}
  return Promise.resolve(audio.play()).then(()=>true,()=>false);
 };
 document?.addEventListener('visibilitychange',play);
 document?.addEventListener('pointerdown',()=>{if(enabled)play();});
 document?.addEventListener('keydown',()=>{if(enabled)play();});
 return {get enabled(){return enabled;},setEnabled(value){enabled=!!value;try{backend().setItem(musicKey,enabled?'on':'off');}catch{}return play();},pause(){paused=true;audio?.pause();},resume(){paused=false;return play();}};
}
export function initMusic(document){
 const control=document.getElementById('bgmEnabled'),note=document.getElementById('bgmStatus'),music=createMusic({document});control.checked=music.enabled;note.textContent=music.enabled?'画面を操作すると再生します。':'BGMオフ';
 control.addEventListener('change',async()=>{const playing=await music.setEnabled(control.checked);note.textContent=control.checked?(playing?'BGM再生中':'画面を操作すると再生します。'):'BGMオフ';});
 return music;
}
