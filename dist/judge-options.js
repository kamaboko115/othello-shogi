export const judgeSteps=[60,80,100,130,150,200,300,false];
// Boolean settings from existing rooms retain their original 60-move meaning.
export function normalizeMoveLimit(value,fallback=false){
 if(value===undefined)return fallback;
 if(value===true)return 60;
 if(judgeSteps.includes(value))return value;
 throw Object.assign(new Error('オセロジャッジの手数が不正です。'),{status:400});
}
export const adjudicationLimit=state=>normalizeMoveLimit(state.moveLimit,60);
export const judgeLabel=value=>value===false?'無制限':value+'手';
export function initJudgeSlider(input,output){
 const update=()=>{const value=judgeSteps[Number(input.value)];output.textContent=judgeLabel(value);input.setAttribute('aria-valuetext',judgeLabel(value));};
 input.addEventListener('input',update);update();
}
