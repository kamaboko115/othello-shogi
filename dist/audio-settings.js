export const effectsVolumeKey='othello-shogi-effects-volume-v1';
const normalize=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(100,Math.round(Number(value)))):100;

// Keep every cue's original level; this is a separate final multiplier.
export function createEffectsVolume({storage=()=>globalThis.localStorage}={}){
 let value=100;
 const listeners=new Set(),playing=new Map(),outputs=new WeakMap();
 try{const saved=storage()?.getItem(effectsVolumeKey);if(saved!==null&&saved!==undefined)value=normalize(saved);}catch{}
 function set(next,persist=true){
  value=normalize(next);
  if(persist)try{storage()?.setItem(effectsVolumeKey,String(value));}catch{}
  for(const [audio,base] of playing){audio.volume=base*value/100;audio.muted=value===0;}
  for(const listener of listeners)listener(value);
 }
 return {
  get value(){return value;},set,
  subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
  audio(audio,base){
   if(!playing.has(audio)){
    const release=()=>{playing.delete(audio);audio.removeEventListener('ended',release);audio.removeEventListener('error',release);};
    audio.addEventListener('ended',release);audio.addEventListener('error',release);
   }
   playing.set(audio,base);audio.volume=base*value/100;audio.muted=value===0;return audio;
  },
  output(context){
   let output=outputs.get(context);
   if(!output){output=context.createGain();output.gain.value=value/100;output.connect(context.destination);outputs.set(context,output);listeners.add(next=>{output.gain.value=next/100;});}
   return output;
  }
 };
}
export const effectsVolume=createEffectsVolume();

export function initEffectsVolume(document){
 const input=document.getElementById('effectsVolume'),output=document.getElementById('effectsVolumeValue');
 const paint=value=>{input.value=String(value);const label=value===0?'消音':value+'%';output.textContent=label;input.setAttribute('aria-valuetext',label);};
 input.addEventListener('input',()=>effectsVolume.set(input.value));
 effectsVolume.subscribe(paint);paint(effectsVolume.value);
 document.defaultView?.addEventListener('storage',event=>{if(event.key===effectsVolumeKey)effectsVolume.set(event.newValue===null?100:event.newValue,false);});
}
