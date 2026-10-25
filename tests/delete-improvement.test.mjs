import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../ui/core/initial.js';
import {clone} from '../ui/core/util.js';
import {saveImprovement,deleteImprovement} from '../ui/core/improvement-records.js';
import {validateData,makePackage,inspectPackage,applyPackage} from '../ui/core/backup.js';
import {Repository} from '../ui/storage.js';
const fields={title:'误加的同名问题',description:'删除验收',module:'界面',priority:'高',status:'todo',completionNote:''};
test('按稳定ID仅删除选中问题，同名问题、原有顺序与其他数据库内容保留',()=>{
  const data=fresh(),first=saveImprovement(data,fields),second=saveImprovement(data,fields),before=clone(data);deleteImprovement(data,first.id);validateData(data);
  assert.deepEqual(data.improvements,before.improvements.filter(item=>item.id!==first.id));assert.ok(data.improvements.some(item=>item.id===second.id));assert.deepEqual({...data,improvements:[]},{...before,improvements:[]});
});
test('待处理、进行中、已完成及内置问题均可删除，备份往返不会自行加回',()=>{
  for(const status of ['todo','doing','done']){const data=fresh();data.improvements[0].status=status;const id=data.improvements[0].id;deleteImprovement(data,id);validateData(data);const restored=applyPackage(fresh(),inspectPackage(makePackage(data),fresh()));assert.ok(!restored.improvements.some(item=>item.id===id));assert.deepEqual(restored.improvements,data.improvements);}
});
test('重复删除或无效ID被拒绝，现有问题不被误删',()=>{
  const data=fresh(),id=data.improvements[0].id;deleteImprovement(data,id);const before=clone(data);assert.throws(()=>deleteImprovement(data,id),/已不存在/);assert.throws(()=>deleteImprovement(data,'missing'),/已不存在/);assert.deepEqual(data,before);
});
test('删除保存后可回到上一步完整恢复原问题、版本、完成说明与页面上下文',async()=>{
  const data=fresh(),item=saveImprovement(data,{...fields,status:'done',completionNote:'完整完成说明'});item.version='legacy-version';const repo=new Repository();repo.data=clone(data);repo.revision=1;let disk=clone(data);repo.request=async(path,options)=>{assert.equal(path,'state');disk=JSON.parse(options.body);return {revision:repo.revision+1};};
  const next=clone(data);deleteImprovement(next,item.id);const view={state:{route:'improvements',todoFilter:'done'},scroll:{x:0,y:500}};await repo.commit(next,'删除改进项','',{view});assert.ok(!disk.improvements.some(row=>row.id===item.id));const step=await repo.undo();assert.deepEqual(repo.data.improvements,data.improvements);assert.deepEqual(disk.improvements,data.improvements);assert.deepEqual(step.view,view);
});
