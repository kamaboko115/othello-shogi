import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const git=args=>{try{return execFileSync('git',['-c',`safe.directory=${root.replace(/[\\/]+$/,'')}`,...args],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}catch{return null;}};
export function collectBuildInfo(){
 const revision=git(['rev-parse','HEAD'])||process.env.CF_PAGES_COMMIT_SHA||process.env.GITHUB_SHA||null;
 const changes=git(['status','--porcelain','--untracked-files=no']);
 return {builtAt:new Date().toISOString(),revision,dirty:changes===null?null:changes.length>0};
}
export function injectBuildInfo(html,info){
 const escaped=JSON.stringify(info).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
 return html.replace('<meta name="app-build" content="">',`<meta name="app-build" content="${escaped}">`);
}
export async function writeBuildInfo(){
 const info=collectBuildInfo(),directory=new URL('../.sites-runtime/',import.meta.url),target=new URL('build-info.json',directory),temporary=new URL(`build-info.${process.pid}.tmp`,directory);
 await mkdir(directory,{recursive:true});await writeFile(temporary,JSON.stringify(info));await rename(temporary,target);return info;
}
