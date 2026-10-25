import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ui=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../ui');
test('全部浏览器模块通过语法检查，静态相对导入均可解析',async()=>{
  const files=[];async function walk(dir){for(const f of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,f.name);if(f.isDirectory())await walk(full);else if(f.name.endsWith('.js'))files.push(full);}}await walk(ui);
  for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,file+': '+result.stderr);const source=await readFile(file,'utf8');for(const m of source.matchAll(/from\s+['"]([^'"]+)['"]/g)){if(m[1].startsWith('.'))assert.ok(files.includes(path.resolve(path.dirname(file),m[1])),file+' imports missing '+m[1]);}}
  assert.ok(files.length>=15);
});
