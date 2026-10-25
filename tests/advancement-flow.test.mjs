import test from 'node:test';
import assert from 'node:assert/strict';
import {clone,terminal} from '../ui/core/util.js';
import {makePlayer,makeUnits} from '../ui/core/players.js';
import {createEvent,makeGroups,startEvent,setScore} from '../ui/core/tournament.js';
import {standings} from '../ui/core/ranking.js';
import {validateEvent} from '../ui/core/backup.js';
import {groupPlan,nextRoundPlan,previewRound,movePlan,applyRoundPlan,saveGroupPlan,sourceLabel,planWarnings} from '../ui/core/advancement.js';
import {advancementWorkspace} from '../ui/views/advancement.js';
function fixture(n=8,config={}){const players=Array.from({length:n},(_,i)=>makePlayer('选手'+(i+1)));const e=createEvent('晋级测试',makeUnits(players,'singles'),{format:'knockout',groups:2,...config});startEvent(e,makeGroups(e));return e;}
function complete(e){for(const m of e.matches.filter(m=>m.stage===e.stages.at(-1).id&&m.b&&!terminal(m)))setScore(e,m.id,[[11,3]],true,'测试');}
function advance(e){const p=nextRoundPlan(e);applyRoundPlan(e,p,'核对本轮实际结果','测试');return p;}

test('拖动小组晋级顺序改变晋级者与对阵，预览不改统计和任何原始记录',()=>{
  const e=fixture();complete(e);const before=clone(e),plan=nextRoundPlan(e),g=plan.groups[0],last=g.order.at(-1);
  movePlan(plan,g.id,3,0);const suggestion=previewRound(e,plan);
  assert.equal(g.order[0],last);assert.ok(suggestion.matches.some(m=>[m.a,m.b].includes(last)));assert.deepEqual(e,before);
  assert.ok(planWarnings(e,plan).some(w=>w.includes('自动统计不同')));
  applyRoundPlan(e,plan,'依据加赛结果调整晋级顺序','测试');validateEvent(e);
  assert.deepEqual(e.matches.slice(0,before.matches.length),before.matches);assert.deepEqual(standings(e,e.stages[0].groups[0]),standings(before,before.stages[0].groups[0]));
});
test('淘汰赛后拖动交换下一轮位置，保留上一轮胜负与轮空来源',()=>{
  const e=fixture(10,{groups:3,qualify:2});complete(e);advance(e);complete(e);
  const before=clone(e),plan=nextRoundPlan(e),lane=plan.draw.find(l=>l.key==='main'),old=[...lane.slots];
  assert.equal(old.length,4);assert.ok(old.some(id=>sourceLabel(e,plan,id).includes('轮空晋级')));
  movePlan(plan,'main',0,2);const suggestion=previewRound(e,plan);
  assert.equal(suggestion.matches[0].a,old[2]);assert.equal(suggestion.matches[1].a,old[0]);assert.deepEqual(e,before);
  applyRoundPlan(e,plan,'已核对上一轮胜者，调整半决赛对阵','测试');validateEvent(e);assert.deepEqual(e.matches.slice(0,before.matches.length),before.matches);
});
test('决赛和季军赛分别显示胜者和负者，不能重复使用选手',()=>{
  const e=fixture();complete(e);advance(e);complete(e);const plan=nextRoundPlan(e);
  const main=plan.draw.find(l=>l.key==='main'),bronze=plan.draw.find(l=>l.key==='bronze');
  assert.equal(main.slots.length,2);assert.equal(bronze.slots.length,2);
  assert.ok(main.slots.every(id=>sourceLabel(e,plan,id).includes('胜者')));assert.ok(bronze.slots.every(id=>sourceLabel(e,plan,id).includes('负者')));
  bronze.slots[0]=main.slots[0];assert.throws(()=>previewRound(e,plan),/不能重复/);
});
test('轮空位置可交换但不可制造空对空，重新预览不填虚构比分',()=>{
  const e=fixture(10,{groups:3,qualify:2});complete(e);const plan=nextRoundPlan(e),lane=plan.draw[0];
  const nulls=lane.slots.map((id,i)=>id?null:i).filter(i=>i!==null);assert.equal(nulls.length,2);
  movePlan(plan,'main',nulls[0]-1,nulls[1]);assert.throws(()=>previewRound(e,plan),/两边都是轮空/);
  movePlan(plan,'main',nulls[0]-1,nulls[1]);const suggestion=previewRound(e,plan);
  assert.equal(suggestion.matches.filter(m=>m.status==='bye').length,2);assert.ok(suggestion.matches.every(m=>m.games.length===0));
});
test('同名次赛通过各组顺序自动组成完整对阵，每个选手仅属于一个名次组',()=>{
  const e=fixture(9,{groups:3,format:'placement'});complete(e);const plan=nextRoundPlan(e),group=plan.groups[0];movePlan(plan,group.id,2,0);
  const suggestion=previewRound(e,plan);assert.equal(suggestion.stage.groups[0].units[0],group.order[0]);assert.equal(suggestion.matches.length,9);
  const ids=suggestion.stage.groups.flatMap(g=>g.units);assert.equal(new Set(ids).size,9);
  applyRoundPlan(e,plan,'确认各组同名次对阵','测试');validateEvent(e);
});
test('已有后续赛程时修改单组顺序只记录核查影响，不更改旧赛程比分',()=>{
  const e=fixture();complete(e);advance(e);complete(e);const before=clone(e.matches),plan=groupPlan(e,e.stages[0].groups[0].id);
  movePlan(plan,plan.groups[0].id,0,2);saveGroupPlan(e,plan,'管理员核对并调整晋级位置','测试');
  assert.deepEqual(e.matches,before);assert.equal(e.impacts.at(-1).status,'open');validateEvent(e);
});
test('小组未完赛或同分显示人工确认提示，未完成淘汰轮仍拒绝晋级',()=>{
  const e=fixture(),plan=nextRoundPlan(e);assert.ok(planWarnings(e,plan).some(w=>w.includes('未全部完赛')));
  assert.throws(()=>applyRoundPlan(e,plan,'','测试'),/依据/);complete(e);advance(e);assert.throws(()=>nextRoundPlan(e),/完成本轮/);
});
test('晋级界面使用名单、来源与对阵预览，不再出现甲乙方，支持上下移动',()=>{
  const e=fixture();complete(e);const plan=nextRoundPlan(e),s=previewRound(e,plan),html=advancementWorkspace(e,plan,s);
  assert.ok(!html.includes('甲方')&&!html.includes('乙方'));assert.ok(html.includes('可拖动排序项'));assert.ok(html.includes('以上晋级'));
  assert.ok(html.includes('上移'));assert.ok(html.includes('下一轮实际对阵'));assert.ok(html.includes('统计第'));
});

test('双打晋级按固定组合排序，拖动不改变搭档快照',()=>{
  const players=Array.from({length:12},(_,i)=>makePlayer('成员'+(i+1))),pairs=Array.from({length:6},(_,i)=>players.slice(i*2,i*2+2).map(p=>p.id));
  const units=makeUnits(players,'doubles',pairs),e=createEvent('双打晋级',units,{type:'doubles',format:'knockout',groups:2});startEvent(e,makeGroups(e));complete(e);
  const before=clone(e.units),plan=nextRoundPlan(e);movePlan(plan,plan.groups[0].id,2,0);const suggestion=previewRound(e,plan);
  assert.equal(suggestion.matches.length,2);assert.ok(advancementWorkspace(e,plan,suggestion).includes('4 对'));
  applyRoundPlan(e,plan,'核对固定搭档及晋级顺序','测试');assert.deepEqual(e.units,before);validateEvent(e);
});
