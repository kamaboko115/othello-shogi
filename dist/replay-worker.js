import {validateReplay,unpackReplayState} from './replay-code.js';
import {evaluateOsesho} from './osesho-ai.js';
self.onmessage=({data})=>{validateReplay(data);self.postMessage(data.frames.map(frame=>evaluateOsesho({...unpackReplayState(frame),...data.rules},0)));};
