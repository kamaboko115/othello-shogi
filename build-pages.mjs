import {readFile,mkdir,writeFile,cp} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {textAssets,binaryAssets} from './worker/static-assets.js';
import {securityHeaders} from './worker/security.js';

const root=dirname(fileURLToPath(import.meta.url));
// Pages checks that the output stays within its configured project root.
const out=join(root,'pages/.sites-runtime/pages');
await mkdir(out,{recursive:true});
for(const name of [...textAssets,...binaryAssets]){
 await mkdir(dirname(join(out,name)),{recursive:true});
 await cp(join(root,'dist',name),join(out,name));
}
const gateway=(await readFile(join(root,'worker/pages-gateway.js'),'utf8')).replace(/^import .*;\r?\n/gm,'');
await writeFile(join(out,'_worker.js'),'const securityHeaders='+JSON.stringify(securityHeaders)+';\n'+gateway);
// Static files do not invoke a Function or the backend Worker.
await writeFile(join(out,'_routes.json'),JSON.stringify({version:1,include:['/api/*'],exclude:[]},null,2)+'\n');
await writeFile(join(out,'_headers'),'/*\n'+Object.entries({...securityHeaders,'Cache-Control':'no-cache'}).map(([key,value])=>'  '+key+': '+value).join('\n')+'\n');
await writeFile(join(out,'404.html'),'<!doctype html><html lang="ja"><meta charset="utf-8"><title>ページがありません</title><p>ページが見つかりません。<a href="/">オセロ将棋に戻る</a></p></html>\n');
console.log('Pages assets and API gateway built: '+out);
