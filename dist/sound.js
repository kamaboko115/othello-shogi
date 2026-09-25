// GitHub edition: synthesized effects, no third-party audio samples.
let context;
function tone(freq,duration,delay=0){try{context ||= new (window.AudioContext||window.webkitAudioContext)();context.resume();const at=context.currentTime+delay,o=context.createOscillator(),g=context.createGain();o.type='triangle';o.frequency.setValueAtTime(freq,at);o.frequency.exponentialRampToValueAtTime(freq*.45,at+duration);g.gain.setValueAtTime(.12,at);g.gain.exponentialRampToValueAtTime(.001,at+duration);o.connect(g);g.connect(context.destination);o.start(at);o.stop(at+duration);}catch{}}
export function playMoveSound(){tone(700,.06);}
export function playMultiFlipSound(){tone(1000,.25);}
export function playVictorySound(){[523,659,784,1047].forEach((f,i)=>tone(f,.22,i*.16));}
