import test from 'node:test';
import assert from 'node:assert/strict';
import {Repository} from '../ui/storage.js';
import {clone,terminal} from '../ui/core/util.js';
import {fresh} from '../ui/core/initial.js';
import {makePlayer,makeUnits} from '../ui/core/players.js';
import {createEvent,makeGroups,startEvent,setScore} from '../ui/core/tournament.js';
import {cancelEvent} from '../ui/core/event-records.js';
import {sortedImprovements} from '../ui/core/improvement-order.js';
import {eventFlow} from '../ui/core/event-flow.js';
import {eventPage} from '../ui/views/event.js';
import {improvementPage} from '../ui/views/dashboard.js';
import {validateData} from '../ui/core/backup.js';
function fixture(){const data=fresh();data.players=Array.from({length:6},(_,i)=>makePlayer('测试队员'+(i+1)));const event=createEvent('中途取消测试',makeUnits(data.players,'singles'),{groups:2,format:'knockout'});startEvent(event,makeGroups(event));data.events.push(event);return data;}
class MemoryRepository extends Repository{
  constructor(data){super();this.data=clone(data);this.disk=clone(data);this.revision=1;this.failNext=false;}
  async request(path,options){assert.equal(path,'state');assert.equal(options.method,'PUT');assert.equal(options.headers['If-Match'],String(this.revision));if(this.failNext){this.failNext=false;throw Error('simulated save failure');}this.disk=JSON.parse(options.body);return {revision:this.revision+1};}
}
test('取消进行中的整届赛事移除全部记录，不改变固定队员和其他赛事，也不产生归档',()=>{
  const data=fixture(),other=clone(data.events[0]);other.id='unrelated-event';data.events.push(other);setScore(data.events[0],data.events[0].matches[0].id,[[11,4]],true,'测试');const before=clone(data);
  cancelEvent(data,data.events[0].id);validateData(data);assert.deepEqual(data.players,before.players);assert.deepEqual(data.events,[other]);assert.equal(data.events.some(e=>e.status==='archived'),false);assert.deepEqual(data.improvements,before.improvements);
});
test('取消后回到上一步恢复同一届赛事、原比赛ID和全部比分，并返回原页面上下文',async()=>{
  const data=fixture();setScore(data.events[0],data.events[0].matches[0].id,[[11,3]],true,'测试');const repo=new MemoryRepository(data),next=clone(data),view={state:{route:'event',eventId:data.events[0].id,eventTab:'schedule'},scroll:{x:0,y:850},title:data.events[0].title};cancelEvent(next,data.events[0].id);
  await repo.commit(next,'取消整届赛事','',{view});view.scroll.y=0;assert.equal(repo.data.events.length,0);const step=await repo.undo();
  assert.deepEqual(repo.data.events,data.events);assert.deepEqual(repo.disk.events,data.events);assert.equal(step.view.scroll.y,850);assert.equal(repo.history.length,0);assert.equal(repo.previousStep,null);assert.equal(repo.data.audit.at(-1).action,'回到上一步');
});
test('回到录分前放弃最近比分，不删除其他记录或既往场次，连续回退按实际保存顺序进行',async()=>{
  const data=fixture(),repo=new MemoryRepository(data),first=clone(data),match=first.events[0].matches[0];setScore(first.events[0],match.id,[[11,5]],true,'测试');await repo.commit(first,'录入比分','',{view:{state:{route:'event'},scroll:{x:0,y:500}}});
  const second=clone(repo.data);second.improvements[0].status='doing';await repo.commit(second,'编辑改进项');await repo.undo();assert.equal(repo.data.improvements[0].status,'todo');assert.deepEqual(repo.data.events[0].matches,first.events[0].matches);
  await repo.undo();assert.deepEqual(repo.data.events,data.events);assert.deepEqual(repo.disk.events,data.events);
});
test('保存失败时不消耗回退历史或替换当前记录',async()=>{
  const data=fixture(),repo=new MemoryRepository(data),next=clone(data);cancelEvent(next,data.events[0].id);await repo.commit(next,'取消整届赛事');const before=clone(repo.data),history=clone(repo.history);repo.failNext=true;
  await assert.rejects(repo.undo(),/simulated/);assert.deepEqual(repo.data,before);assert.deepEqual(repo.history,history);assert.equal(repo.previousStep.action,'取消整届赛事');
});
test('回退历史上限与操作说明保持对应，未保存的操作不混入回退步骤',async()=>{
  const repo=new MemoryRepository(fixture());for(let i=0;i<22;i++){const next=clone(repo.data);next.settings.operator='测试'+i;await repo.commit(next,'修改记录员'+i);}
  assert.equal(repo.history.length,20);assert.equal(repo.historyMeta.length,20);for(let i=21;i>=2;i--){assert.equal(repo.previousStep.action,'修改记录员'+i);await repo.undo();}assert.equal(repo.history.length,0);await assert.rejects(repo.undo(),/没有可回到/);
});
test('已归档或不存在的赛事不能被取消，取消入口只出现在可编辑赛事',()=>{
  const data=fixture(),event=data.events[0];assert.match(eventPage(event),/取消整届赛事/);event.status='archived';const before=clone(data);assert.throws(()=>cancelEvent(data,event.id),/归档赛事/);assert.throws(()=>cancelEvent(data,'missing'),/已不存在/);assert.deepEqual(data,before);assert.doesNotMatch(eventPage(event),/取消整届赛事/);
});
test('新建高优先级问题排在中低之前，所有已解决项放到最后，原数组不被修改',()=>{
  const items=[{id:'low',priority:'低',status:'todo'},{id:'done-high',priority:'高',status:'done'},{id:'mid',priority:'中',status:'doing'},{id:'old-high',priority:'高',status:'todo'},{id:'new-high',priority:'高',status:'todo'},{id:'done-low',priority:'低',status:'done'}],before=clone(items);
  assert.deepEqual(sortedImprovements(items).map(i=>i.id),['old-high','new-high','mid','low','done-high','done-low']);assert.deepEqual(items,before);
});
test('问题完成、重新打开、调整优先级及筛选后立即按同一规则排序',()=>{
  const items=[{id:'a',priority:'中',status:'todo'},{id:'b',priority:'高',status:'done'},{id:'c',priority:'低',status:'doing'}];items[1].status='todo';assert.deepEqual(sortedImprovements(items).map(i=>i.id),['b','a','c']);items[0].status='done';items[2].priority='高';assert.deepEqual(sortedImprovements(items).map(i=>i.id),['b','c','a']);assert.deepEqual(sortedImprovements(items,'doing').map(i=>i.id),['c']);assert.deepEqual(sortedImprovements(items,'done').map(i=>i.id),['a']);
});
test('问题页面使用实际优先级排序，新增问题不会被排到已解决条目之后',()=>{
  const data=fresh();data.improvements.push({id:'new',title:'新增高优先级',description:'排序验收',module:'界面',priority:'高',status:'todo',createdAt:new Date().toISOString(),version:'1.0.0'});const html=improvementPage(data);
  assert.ok(html.indexOf('新增高优先级')<html.indexOf('Windows离线便携程序'));assert.ok(html.indexOf('新增高优先级')<html.indexOf('长期积分规则'));assert.match(html,/未解决问题按高/);
});
test('小组尚未结束时不提示可晋级，只有全部正式场次处理后才准备下一轮',()=>{
  const e=fixture().events[0];assert.equal(eventFlow(e).ready,false);setScore(e,e.matches[0].id,[[11,3]],true,'测试');assert.equal(eventFlow(e).ready,false);for(const m of e.matches.filter(m=>!terminal(m)))setScore(e,m.id,[[11,4]],true,'测试');assert.equal(eventFlow(e).ready,true);
});
