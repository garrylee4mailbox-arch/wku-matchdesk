import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../ui/core/initial.js';
import {clone} from '../ui/core/util.js';
import {makePlayer,makeUnits} from '../ui/core/players.js';
import {createEvent,makeGroups,startEvent,setScore,substituteDoubles,confirmAdvancement,nextStageSuggestion,applyNextStage,addExtraMatch,setSpecialStatus} from '../ui/core/tournament.js';
import {validateEvent,inspectImprovements,applyImprovements} from '../ui/core/backup.js';
import {csv} from '../ui/core/exports.js';
test('双打替补只更新未开始比赛，保留旧搭档和已进行的全部比分',()=>{
  const ps=Array.from({length:6},(_,i)=>makePlayer('成员'+i)),units=makeUnits(ps,'doubles',[[ps[0].id,ps[1].id],[ps[2].id,ps[3].id],[ps[4].id,ps[5].id]]),e=createEvent('双打',units,{type:'doubles',format:'roundrobin'});startEvent(e,makeGroups(e));const unit=e.units[0],done=e.matches.find(m=>m.a===unit.id);setScore(e,done.id,[[11,9]],true,'测试');const before=clone(done),original=clone(unit.members),replacement=makePlayer('替补甲');substituteDoubles(e,unit.id,0,replacement,'受伤替补','管理员');assert.deepEqual(done,before);assert.deepEqual(unit.members,original);assert.equal(unit.currentMembers[0].id,replacement.id);const pending=e.matches.find(m=>m.id!==done.id&&[m.a,m.b].includes(unit.id));assert.ok(pending.lineups[unit.id].name.includes('替补甲'));assert.ok(csv(e).includes('替补甲'));assert.throws(()=>substituteDoubles(e,unit.id,0,ps[2],'重复参赛','管理员'));validateEvent(e);
});
test('版本改进清单按ID新增和更新，保留人工条目和完成说明',()=>{
  const d=fresh(),custom={...clone(d.improvements[0]),id:'my-own-item',title:'现场反馈'};d.improvements.push(custom);const item={...clone(d.improvements[0]),status:'doing',version:'1.0.1',completionNote:'剩余手机真机验证'},incoming={schema:'wku-improvements/v1',items:[item]};const preview=inspectImprovements(incoming,d);assert.equal(preview.existing,1);const next=applyImprovements(d,preview);assert.equal(next.improvements.length,d.improvements.length);assert.equal(next.improvements[0].status,'doing');assert.equal(next.improvements[0].version,'1.0.1');assert.ok(next.improvements.some(i=>i.id==='my-own-item'));assert.throws(()=>inspectImprovements({...incoming,items:[item,item]},d));assert.throws(()=>inspectImprovements({...incoming,items:[{...item,status:'done',completedAt:null}]},d));
});
test('手动增加主淘汰比赛不能静默丢弃多出的晋级者，作废不计胜方',()=>{
  const p=Array.from({length:4},(_,i)=>makePlayer('选手'+i)),e=createEvent('淘汰',makeUnits(p,'singles'),{format:'knockout',groups:2,qualify:2});startEvent(e,makeGroups(e));for(const g of e.stages[0].groups)confirmAdvancement(e,g,g.units,'测试','管理员');applyNextStage(e,nextStageSuggestion(e),'管理员');const s=e.stages.at(-1);for(const m of e.matches.filter(m=>m.stage===s.id))setScore(e,m.id,[[11,0]],true,'测试');const extra=addExtraMatch(e,e.units[0].id,e.units[1].id,{rule:e.config.rule});setScore(e,extra.id,[[11,0]],true,'测试');assert.throws(()=>nextStageSuggestion(e),/场次数/);setSpecialStatus(e,extra.id,'cancelled',extra.a,{countWin:false,countPoints:false},'额外场次作废','管理员');assert.equal(extra.winner,null);assert.equal(nextStageSuggestion(e).matches.length,2);
});
