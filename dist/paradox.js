import {effectsVolume} from './audio-settings.js';

// The original synthesized WAV cues are compressed separately. Merely importing
// this module (or choosing collapse off) creates no Audio and fetches no sound.
export function createParadoxSounds({volume=effectsVolume,audioFactory=url=>new Audio(url)}={}){
 const sounds=new Map();let requested=false;
 const get=start=>{
  const key=start?'bell':'broken';let audio=sounds.get(key);
  if(!audio){audio=audioFactory('/sounds/'+key+'.mp3');audio.preload='auto';sounds.set(key,audio);audio.load();}
  return audio;
 };
 function prepare(enabled=true){
  if(!enabled)return;requested=true;if(volume.value===0)return;
  try{get(true);get(false);}catch{}
 }
 volume.subscribe(value=>{if(requested&&value>0)prepare();});
 return {prepare,play(start){if(volume.value===0)return;try{const audio=get(start);audio.currentTime=0;volume.audio(audio,start?.3:.65);audio.play().catch(()=>{});}catch{}}};
}
const sounds=createParadoxSounds();
export const prepareParadoxSounds=enabled=>sounds.prepare(enabled);
export const paradoxSound=start=>sounds.play(start);
export function paradoxBanner(){const e=document.createElement('div');e.className='paradox-banner';e.setAttribute('role','status');e.textContent='オセロ将棋パラドックスにより、盤面が崩れてゆく！';document.body.append(e);return ()=>e.remove();}
