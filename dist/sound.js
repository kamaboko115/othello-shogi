// Load Shogi3 from its creator at runtime; do not redistribute the audio file.
let context,flipBufferPromise=Promise.resolve(null);
const shogiUrl='https://taira-komori.net/sound/playing01/Shogi3.mp3';
let shogiSample;
function playShogi(rate=1,volume=.7){
 try{shogiSample ||= new Audio(shogiUrl);shogiSample.preload='auto';const sound=shogiSample.cloneNode();sound.playbackRate=rate;sound.volume=volume;sound.play().catch(()=>tone(700,.06));}
 catch{tone(700,.06);}
}
function prepare(){try{context ||= new (window.AudioContext||window.webkitAudioContext)();if(context.state==='suspended')context.resume().catch(()=>{});}catch{}}
function tone(freq,duration){prepare();if(!context||context.state!=='running')return;const o=context.createOscillator(),g=context.createGain(),at=context.currentTime;o.type='triangle';o.frequency.setValueAtTime(freq,at);o.frequency.exponentialRampToValueAtTime(freq*.45,at+duration);g.gain.setValueAtTime(.12,at);g.gain.exponentialRampToValueAtTime(.001,at+duration);o.connect(g);g.connect(context.destination);o.start(at);o.stop(at+duration);}
export function playMoveSound(){playShogi();}
export function playMultiFlipSound(){for(let i=0;i<3;i++)setTimeout(()=>playShogi(1+i*.14,.42),i*85);}
export function playVictorySound(){
 prepare();if(!context||context.state!=='running')return;
 const start=context.currentTime;
 // A soft rising shimmer, followed by a bright, lingering metallic chord.
 for(const [i,freq] of [784,1046.5,1318.5,1568,2093].entries()){
  const osc=context.createOscillator(),gain=context.createGain(),at=start+i*.025;
  osc.type='sine';osc.frequency.setValueAtTime(freq*.65,at);osc.frequency.exponentialRampToValueAtTime(freq,at+.38);
  gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.045,at+.12);gain.gain.exponentialRampToValueAtTime(.001,at+1.7);
  osc.connect(gain);gain.connect(context.destination);osc.start(at);osc.stop(at+1.75);
 }
 const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*.65),context.sampleRate),data=buffer.getChannelData(0);
 for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
 const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=buffer;filter.type='bandpass';filter.Q.value=.7;filter.frequency.setValueAtTime(1000,start);filter.frequency.exponentialRampToValueAtTime(6500,start+.55);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.11,start+.18);gain.gain.exponentialRampToValueAtTime(.001,start+.65);source.connect(filter);filter.connect(gain);gain.connect(context.destination);source.start(start);
}

// A short crowd applause made from overlapping, filtered hand-clap bursts.
export function playApplauseSound(signal){
 prepare();if(!context||context.state!=='running'||signal?.aborted)return;
 const output=context.createGain();output.gain.value=.5;output.connect(context.destination);
 const nodes=[],start=context.currentTime;
 for(let i=0;i<18;i++){
  const duration=.065+Math.random()*.04,buffer=context.createBuffer(1,Math.ceil(context.sampleRate*duration),context.sampleRate),samples=buffer.getChannelData(0);
  for(let j=0;j<samples.length;j++)samples[j]=(Math.random()*2-1)*Math.exp(-j/samples.length*6);
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=buffer;filter.type='bandpass';filter.frequency.value=1000+Math.random()*1600;filter.Q.value=.6;gain.gain.value=.5+Math.random()*.3;
  source.connect(filter);filter.connect(gain);gain.connect(output);source.start(start+i*.055+Math.random()*.025);nodes.push(source);
 }
 const stop=()=>{for(const node of nodes){try{node.stop();}catch{}}output.disconnect();signal?.removeEventListener('abort',stop);};
 signal?.addEventListener('abort',stop,{once:true});setTimeout(stop,1300);
}

const comboGains=new Set();
// Short original arcade cues, kept below the main capture and victory sounds.
export function playArcadeCue(kind){
 prepare();if(!context||context.state!=='running')return;
 const patterns={tap:[[0,880,.055],[.04,1320,.07]],start:[[0,523,.1],[.09,659,.1],[.18,784,.1],[.3,1047,.3],[.3,1568,.28]],promote:[[0,660,.09],[.065,880,.09],[.13,1175,.11],[.21,1760,.24]],check:[[0,1568,.11],[.12,1175,.1],[.23,1568,.18]]};
 const notes=patterns[kind];if(!notes)return;const now=context.currentTime;
 for(const [offset,freq,duration] of notes){const osc=context.createOscillator(),gain=context.createGain(),at=now+offset;osc.type='triangle';osc.frequency.setValueAtTime(freq*.96,at);osc.frequency.exponentialRampToValueAtTime(freq,at+.025);gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(kind==='tap'?.025:.055,at+.006);gain.gain.exponentialRampToValueAtTime(.001,at+duration);osc.connect(gain);gain.connect(context.destination);osc.start(at);osc.stop(at+duration+.01);}
}
export function playCaptureSound(major=false){
 prepare();if(!context||context.state!=='running')return;
 for(const [i,freq] of (major?[1200,1800,2400]:[1500,2250]).entries()){
  const osc=context.createOscillator(),gain=context.createGain(),at=context.currentTime+i*.015;osc.type='sine';osc.frequency.setValueAtTime(freq,at);osc.frequency.exponentialRampToValueAtTime(freq*.75,at+.08);gain.gain.setValueAtTime(.055,at);gain.gain.exponentialRampToValueAtTime(.001,at+(major?.2:.1));osc.connect(gain);gain.connect(context.destination);osc.start(at);osc.stop(at+.22);
 }
}
export const fireworkInterval=count=>Math.min(220,1100/Math.max(1,count-1));
export function playFireworks(count=6){
 prepare();if(!context||context.state!=='running')return ()=>{};
 const output=context.createGain();output.gain.value=.55;output.connect(context.destination);const nodes=[],now=context.currentTime;
 const whistle=context.createOscillator(),wg=context.createGain();whistle.frequency.setValueAtTime(700,now);whistle.frequency.exponentialRampToValueAtTime(1800,now+.15);wg.gain.setValueAtTime(.025,now);wg.gain.exponentialRampToValueAtTime(.001,now+.18);whistle.connect(wg);wg.connect(output);whistle.start(now);whistle.stop(now+.19);nodes.push(whistle);
 for(let b=0;b<count;b++){
  const at=now+.15+b*fireworkInterval(count)/1000,buffer=context.createBuffer(1,Math.ceil(context.sampleRate*.35),context.sampleRate),data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/data.length*7);
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=buffer;filter.type='lowpass';filter.frequency.value=2400+(b%6)*900;gain.gain.value=.55*Math.min(1,Math.sqrt(6/count));source.connect(filter);filter.connect(gain);gain.connect(output);source.start(at);nodes.push(source);
  const boom=context.createOscillator(),bg=context.createGain();boom.frequency.setValueAtTime(130,at);boom.frequency.exponentialRampToValueAtTime(45,at+.18);bg.gain.setValueAtTime(.22*Math.min(1,Math.sqrt(6/count)),at);bg.gain.exponentialRampToValueAtTime(.001,at+.24);boom.connect(bg);bg.connect(output);boom.start(at);boom.stop(at+.25);nodes.push(boom);
 }
 let stopped=false;const stop=()=>{if(stopped)return;stopped=true;nodes.forEach(n=>{try{n.stop();}catch{}});output.disconnect();};setTimeout(stop,2200);return stop;
}
function rememberComboGain(gain){comboGains.add(gain);setTimeout(()=>comboGains.delete(gain),2000);}
export function quietComboSounds(){if(!context)return;for(const gain of comboGains){gain.gain.cancelScheduledValues(context.currentTime);gain.gain.setTargetAtTime(0,context.currentTime,.008);}comboGains.clear();}
export function playSmallComboFinish(count){
 prepare();if(!context||context.state!=='running')return;
 const tones=count===2?[1046.5,2114]:[1318.5,1975.5,2637,3951,3136,4186];
 for(const [index,freq] of tones.entries()){
  const osc=context.createOscillator(),gain=context.createGain(),at=context.currentTime+(index>=4?.2+(index-4)*.065:index*(count===2?.008:.028)),duration=count===2?.24:.48;
  osc.type='sine';osc.frequency.setValueAtTime(freq*1.025,at);osc.frequency.exponentialRampToValueAtTime(freq,at+.05);
  gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime((count===2?.12:.15)/tones.length,at+.004);gain.gain.exponentialRampToValueAtTime(.001,at+duration);
  osc.connect(gain);gain.connect(context.destination);rememberComboGain(gain);osc.start(at);osc.stop(at+duration+.02);
 }
}
export function playComboImpact(){
 prepare();if(!context||context.state!=='running')return;
 const osc=context.createOscillator(),gain=context.createGain(),at=context.currentTime;osc.type='sine';osc.frequency.setValueAtTime(100,at);osc.frequency.exponentialRampToValueAtTime(42,at+.16);gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.24,at+.008);gain.gain.exponentialRampToValueAtTime(.001,at+.22);osc.connect(gain);gain.connect(context.destination);rememberComboGain(gain);osc.start(at);osc.stop(at+.24);
}

// Ascending combo tones: gold, platinum chime, then a brighter rainbow chord.
export async function playComboSound(count){
 prepare();try{
  const buffer=await flipBufferPromise;if(!context||context.state!=='running')return;
  const semitones=Math.min(19,(count-1)*3),rate=2**(semitones/12);
  playShogi(rate,.7);
  if(buffer){const sound=context.createBufferSource(),gain=context.createGain();sound.buffer=buffer;sound.playbackRate.value=rate;gain.gain.value=.7;sound.connect(gain);gain.connect(context.destination);rememberComboGain(gain);sound.start();}
  if(count<2)return;
  const base=440*rate,tones=count>=4?[1,1.25,1.5]:count===3?[1,2]:[1];
  for(const [index,multiple] of tones.entries()){const osc=context.createOscillator(),gain=context.createGain(),at=context.currentTime+index*.025;osc.type=count===2?'triangle':'sine';osc.frequency.value=base*multiple;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(.18/tones.length,at+.008);gain.gain.exponentialRampToValueAtTime(.001,at+.23);osc.connect(gain);gain.connect(context.destination);rememberComboGain(gain);osc.start(at);osc.stop(at+.25);}
 }catch{}
}

export function playHelperDeparture(){
 prepare();if(!context||context.state!=='running')return;
 const at=context.currentTime,osc=context.createOscillator(),gain=context.createGain();osc.type='triangle';osc.frequency.setValueAtTime(280,at);osc.frequency.exponentialRampToValueAtTime(1500,at+.12);osc.frequency.exponentialRampToValueAtTime(100,at+.45);gain.gain.setValueAtTime(.001,at);gain.gain.linearRampToValueAtTime(.16,at+.04);gain.gain.exponentialRampToValueAtTime(.001,at+.46);osc.connect(gain);gain.connect(context.destination);osc.start(at);osc.stop(at+.48);osc.onended=()=>{osc.disconnect();gain.disconnect();};
}
