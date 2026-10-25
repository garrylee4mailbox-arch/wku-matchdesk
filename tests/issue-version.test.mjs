import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fresh,VERSION} from '../ui/core/initial.js';
import {clone} from '../ui/core/util.js';
import {saveImprovement} from '../ui/core/improvement-records.js';
import {improvementPage} from '../ui/views/dashboard.js';
import {validateData,makePackage,inspectPackage,applyPackage,inspectImprovements,applyImprovements} from '../ui/core/backup.js';
const fields={title:'无需版本号的问题',description:'只填写问题内容',module:'界面',priority:'高',status:'todo',completionNote:''};
test('新问题不要求提供版本号，内部自动采用当前程序版本',()=>{
  const data=fresh(),item=saveImprovement(data,fields);assert.equal(item.version,VERSION);assert.equal(item.title,fields.title);validateData(data);
});
test('编辑、完成、重新打开保留旧版本元数据和稳定ID，不要求用户递增',()=>{
  const data=fresh(),item=saveImprovement(data,fields);item.version='legacy-build-2024';const id=item.id,createdAt=item.createdAt;
  const completed=saveImprovement(data,{...fields,status:'done',completionNote:'已完成'},id);assert.equal(completed.version,'legacy-build-2024');assert.ok(completed.completedAt);
  const reopened=saveImprovement(data,{...fields,title:'重新打开'},id);assert.equal(reopened.version,'legacy-build-2024');assert.equal(reopened.id,id);assert.equal(reopened.createdAt,createdAt);assert.equal(reopened.completedAt,null);
});
test('不存在的手填字段不会覆盖旧记录版本或替代新增记录的系统版本',()=>{
  const data=fresh(),item=saveImprovement(data,{...fields,version:'user-supplied'});assert.equal(item.version,VERSION);
  saveImprovement(data,{...fields,version:'changed-by-form'},item.id);assert.equal(data.improvements.at(-1).version,VERSION);
});
test('全量备份和单独问题清单继续兼容保留旧版本的记录',()=>{
  const data=fresh(),item=saveImprovement(data,fields);item.version='legacy-version';const restored=applyPackage(fresh(),inspectPackage(makePackage(data),fresh()));assert.deepEqual(restored,data);
  const imported=applyImprovements(fresh(),inspectImprovements({schema:'wku-improvements/v1',items:[clone(item)]},fresh()));assert.equal(imported.improvements.find(i=>i.id===item.id).version,'legacy-version');
});
test('问题列表不再显示版本标签，保留日期、状态和完成说明',()=>{
  const data=fresh(),item=saveImprovement(data,{...fields,status:'done',completionNote:'明确完成说明'});item.version='HIDDEN-LEGACY-VERSION';const html=improvementPage(data);assert.ok(!html.includes(item.version));assert.match(html,/完成于/);assert.match(html,/明确完成说明/);assert.match(html,/已完成/);
});
test('新增和编辑表单移除版本输入框，同时保留原有问题控件',async()=>{
  const source=await readFile(new URL('../ui/actions/team.js',import.meta.url),'utf8');assert.ok(!source.includes("input('version'"));assert.ok(!source.includes('对应版本'));assert.ok(source.includes("select('priority'"));assert.ok(source.includes("select('status'"));
});
