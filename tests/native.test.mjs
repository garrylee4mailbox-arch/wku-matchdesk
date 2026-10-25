import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fresh} from '../ui/core/initial.js';
import {regressionDemo} from '../ui/core/demo.js';
import {validateData,makePackage,inspectPackage,applyPackage} from '../ui/core/backup.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('Windows本机EXE：访问控制、持久化、版本冲突、快照和重启恢复',{skip:process.platform!=='win32',timeout:30000},async()=>{
  const dataDir=path.join(root,'test-output','native-'+Date.now());await mkdir(dataDir,{recursive:true});let child;
  async function start(){
    child=spawn(path.join(root,'build','WKU-MatchDesk','WKU-MatchDesk.exe'),[],{windowsHide:true,env:{...process.env,WKU_DATA_DIR:dataDir,WKU_NO_BROWSER:'1'},stdio:'ignore'});
    let session;for(let i=0;i<150;i++){try{session=JSON.parse(await readFile(path.join(dataDir,'session.json'),'utf8'));if(session.pid===child.pid)break;}catch{}await new Promise(r=>setTimeout(r,60));}
    assert.equal(session?.pid,child.pid,'EXE did not publish a session');return session;
  }
  async function stop(){if(child&&!child.killed){child.kill();await new Promise(resolve=>child.once('exit',resolve));}}
  // Consume every body, including status-only checks. Leaving larger static
  // responses unread can pause Node's HTTP parser while the server closes.
  async function request(...args){
    const response=await fetch(...args),body=await response.text();
    return {status:response.status,headers:response.headers,json:async()=>JSON.parse(body)};
  }
  try{
    let s=await start(),cookie='wku_session='+s.token;
    assert.equal((await request(s.url+'/api/state')).status,401);
    const boot=await request(s.url+'/?boot='+s.token,{redirect:'manual'});assert.equal(boot.status,303);assert.ok(boot.headers.get('set-cookie').includes('SameSite=Strict'));
    const get=()=>request(s.url+'/api/state',{headers:{Cookie:cookie}}).then(r=>r.json());
    const put=(data,rev,origin=s.url)=>request(s.url+'/api/state',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json','If-Match':String(rev),Origin:origin},body:JSON.stringify(data)});
    const initial=await get();assert.equal(initial.data,null);assert.equal(initial.revision,0);
    const d=fresh();d.events.push(regressionDemo().event);assert.equal((await put(d,0)).status,200);
    assert.equal((await put(d,0)).status,409);assert.equal((await put(d,1,'https://untrusted.example')).status,403);
    assert.equal((await request(s.url+'/app.js',{headers:{Cookie:cookie}})).status,200);
    assert.equal((await request(s.url+'/core/tournament.js',{headers:{Cookie:cookie}})).status,200);
    d.settings.operator='重启后仍保留';d.improvements[0].status='doing';assert.equal((await put(d,1)).status,200);
    const files=await request(s.url+'/api/backups',{headers:{Cookie:cookie}}).then(r=>r.json());assert.equal(files.length,1);
    const previous=await request(s.url+'/api/backups/'+files[0].name,{headers:{Cookie:cookie}}).then(r=>r.json());validateData(previous.data);assert.equal(previous.revision,1);
    const exported=JSON.parse(JSON.stringify(makePackage(d))),restored=applyPackage(fresh(),inspectPackage(exported,fresh()));assert.deepEqual(restored,d);
    await stop();s=await start();cookie='wku_session='+s.token;const rebooted=await get();assert.equal(rebooted.revision,2);assert.deepEqual(rebooted.data,d);validateData(rebooted.data);
    assert.equal((await request(s.url+'/api/state',{headers:{Cookie:'wku_session=wrong'}})).status,401);
    const disk=JSON.parse(await readFile(path.join(dataDir,'state.json'),'utf8'));assert.deepEqual(disk.data,d);assert.ok((await readdir(path.join(dataDir,'backups'))).length>=1);
  }finally{await stop();}
});
