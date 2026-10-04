export const collapseSteps=[0,30,50,75,100,150,180,200,250,300,false];
export function normalizeCollapseAt(value=150){
 if(value===false||Number.isInteger(value)&&value>=0&&value<=1000)return value;
 throw Object.assign(new Error('崩壊開始は0〜1000手で指定してください。'),{status:400});
}
export const collapseLabel=value=>value===false?'無制限':value===0?'0手（最初の1手から）':value+'手';
export function initCollapseSlider(input,output){
 const update=()=>{const label=collapseLabel(collapseSteps[Number(input.value)]);output.textContent=label;input.setAttribute('aria-valuetext',label);};
 input.addEventListener('input',update);update();return update;
}
