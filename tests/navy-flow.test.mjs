import test from 'node:test';
import assert from 'node:assert/strict';
import {clone,terminal} from '../ui/core/util.js';
import {makePlayer,makeUnits} from '../ui/core/players.js';
import {createEvent,makeGroups,startEvent,setScore,confirmFinals,inferResults,addExtraMatch} from '../ui/core/tournament.js';
import {nextRoundPlan,applyRoundPlan,confirmedRoundPlan,reconfirmRoundPlan,acknowledgeRound,roundEditable,movePlan,previewRound} from '../ui/core/advancement.js';
import {eventFlow} from '../ui/core/event-flow.js';
import {eventPage} from '../ui/views/event.js';
import {validateEvent} from '../ui/core/backup.js';
function fixture(format='knockout',n=8,groups=2){const players=Array.from({length:n},(_,i)=>makePlayer('测试选手'+(i+1)));const e=createEvent('蓝色赛事',makeUnits(players,'singles'),{format,groups});startEvent(e,makeGroups(e));return e;}
function complete(e){for(const m of e.matches.filter(m=>m.stage===e.stages.at(-1).id&&m.b&&!terminal(m)))setScore(e,m.id,[[11,4]],true,'测试');}
function advance(e){applyRoundPlan(e,nextRoundPlan(e),'','测试');}
function finals(){const e=fixture();complete(e);advance(e);complete(e);advance(e);return e;}

test('决赛和季军赛都结束才提示结果，成绩页链接出现在原有已完赛赛事',()=>{
  const e=finals(),final=e.matches.find(m=>m.label==='决赛');setScore(e,final.id,[[11,5]],true,'测试');
  assert.equal(eventFlow(e).kind,'score');complete(e);assert.equal(eventFlow(e).kind,'results');
  const page=eventPage(e);assert.match(page,/查看比赛结果 →/);assert.ok(page.indexOf('决赛 / 季军赛</h2>')<page.indexOf('第一阶段 · 小组循环 ·'));
});
test('全员循环、同名次赛和淘汰赛分别判断完成，草稿与独立趣味赛不误导',()=>{
  const e=fixture('roundrobin',3,1);setScore(e,e.matches[0].id,[[5,3]],false,'测试');assert.equal(eventFlow(e).kind,'score');
  complete(e);addExtraMatch(e,e.units[0].id,e.units[1].id,{exhibition:true});assert.equal(eventFlow(e).kind,'results');
  const p=fixture('placement',6,2);complete(p);assert.equal(eventFlow(p).kind,'advance');advance(p);assert.equal(eventFlow(p).kind,'score');complete(p);assert.equal(eventFlow(p).kind,'results');
});
test('作废或未指定胜方的终局提示核对，不声称名次已确认',()=>{
  const e=finals();complete(e);const m=e.matches.find(m=>m.label==='决赛');m.status='cancelled';m.winner=null;
  assert.equal(eventFlow(e).kind,'results');assert.match(eventFlow(e).title,/核对成绩/);assert.equal(e.finals,null);
});
test('晋级说明可留空，确认信息与完整名单会保存到原始赛程',()=>{
  const e=fixture();complete(e);advance(e);validateEvent(e);
  assert.equal(e.stages.at(-1).confirmation.count,1);assert.ok(e.audit.at(-1).reason);assert.match(eventPage(e,'progression'),/已确认名单/);
});
test('未开始轮次可重新调整对阵，不追加阶段、不复制比赛、不损坏原比分',()=>{
  const e=fixture();complete(e);advance(e);const before=clone(e),stage=e.stages.at(-1),plan=confirmedRoundPlan(e,stage.id);
  const old=plan.draw[0].slots[0];movePlan(plan,'main',0,2);reconfirmRoundPlan(e,plan,'','测试');validateEvent(e);
  assert.equal(e.stages.length,before.stages.length);assert.deepEqual(e.matches.map(m=>m.id),before.matches.map(m=>m.id));
  assert.notEqual(e.matches.find(m=>m.stage===stage.id).a,old);assert.deepEqual(e.matches.filter(m=>m.stage!==stage.id),before.matches.filter(m=>m.stage!==stage.id));
  assert.equal(stage.confirmation.count,2);
});
test('重新核对已完成轮次保留全部比分、既有后轮和已确认最终成绩',()=>{
  const e=finals();complete(e);confirmFinals(e,inferResults(e),'测试','按实际比分');const before=clone(e),stage=e.stages.at(-1);
  assert.equal(roundEditable(e,stage.id),false);assert.throws(()=>confirmedRoundPlan(e,stage.id),/已有比赛记录/);
  acknowledgeRound(e,stage.id,'测试');assert.deepEqual(e.matches,before.matches);assert.deepEqual(e.finals,before.finals);assert.equal(e.stages.length,before.stages.length);validateEvent(e);
});
test('核对过程中新增草稿后拒绝提交过期名单，既有记录完整保留',()=>{
  const e=fixture();complete(e);advance(e);const plan=confirmedRoundPlan(e,e.stages.at(-1).id),m=e.matches.find(m=>m.stage===e.stages.at(-1).id);
  setScore(e,m.id,[[3,2]],false,'测试');const before=clone(e);assert.throws(()=>reconfirmRoundPlan(e,plan,'','测试'),/赛程已变化/);assert.deepEqual(e,before);
});
test('重复选手的重新确认被拒绝，不覆盖原始赛程',()=>{
  const e=finals(),plan=confirmedRoundPlan(e,e.stages.at(-1).id),before=clone(e);plan.draw[1].slots[0]=plan.draw[0].slots[0];
  assert.throws(()=>previewRound(e,plan),/不能重复/);assert.deepEqual(e,before);
});
test('晋级与赛程可以切换全部轮次，默认最新阶段，小组统计和后续对阵均可访问',()=>{
  const e=finals(),latest=eventPage(e,'progression');assert.match(latest,/选择比赛阶段/);assert.match(latest,/决赛 \/ 季军赛 · 已确认名单/);assert.doesNotMatch(latest,/统计与晋级|赛程示意/);
  const groups=eventPage(e,'progression','all',e.stages[0].id);assert.match(groups,/累计得分/);assert.match(groups,/小组循环 · 实际对阵/);assert.equal(eventPage(e,'rankings'),latest);
});
test('历史有后续轮次和归档赛事不允许重排，重复确认不会清除最终名次',()=>{
  const e=finals();assert.equal(roundEditable(e,e.stages[1].id),false);e.status='archived';const before=clone(e);assert.equal(roundEditable(e,e.stages.at(-1).id),false);
  assert.throws(()=>acknowledgeRound(e,e.stages.at(-1).id,'测试'),/归档赛事/);assert.deepEqual(e,before);assert.equal(eventFlow(e).kind,'results');
});

test('新名单确认记录随备份验证，旧赛事不需要迁移，非法确认元数据被拒绝',()=>{
  const legacy=fixture();validateEvent(legacy);complete(legacy);advance(legacy);validateEvent(legacy);
  legacy.stages.at(-1).confirmation.at='invalid';assert.throws(()=>validateEvent(legacy),/名单确认记录/);
});
