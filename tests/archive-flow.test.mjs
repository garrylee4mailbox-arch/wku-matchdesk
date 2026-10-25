import test from 'node:test';
import assert from 'node:assert/strict';
import {regressionDemo} from '../ui/core/demo.js';
import {clone} from '../ui/core/util.js';
import {setScore,confirmFinals,inferResults,resolveImpact,archiveEvent} from '../ui/core/tournament.js';
function changedEvent(){
  const {event:e}=regressionDemo(),m=e.matches[0];
  setScore(e,m.id,[[11,0]],true,'测试','核实前轮比分');
  assert.equal(e.impacts.filter(i=>i.status==='open').length,1);
  confirmFinals(e,inferResults(e),'管理员','已核对实际比赛成绩，未决名次保留区间');
  return e;
}
test('保留后续安排不清空已确认成绩，可以直接完成归档',()=>{
  const e=changedEvent(),finals=clone(e.finals),matches=clone(e.matches);
  resolveImpact(e,e.impacts.at(-1).id,'keep','全部后续安排与比分已核对，确认保留','管理员');
  assert.deepEqual(e.finals,finals);assert.deepEqual(e.matches,matches);
  archiveEvent(e,'管理员');assert.equal(e.status,'archived');
});
test('作废或重赛会影响实际成绩，仍必须重新确认才能归档',()=>{
  for(const decision of ['cancel','replay']){
    const e=changedEvent();resolveImpact(e,e.impacts.at(-1).id,decision,'后续安排需调整','管理员');
    assert.equal(e.finals,null);assert.throws(()=>archiveEvent(e,'管理员'),/确认/);
  }
});
