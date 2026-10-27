import test from 'node:test';
import assert from 'node:assert/strict';
import {fresh} from '../ui/core/initial.js';
import {clone,terminal} from '../ui/core/util.js';
import {makePlayer,makeUnits} from '../ui/core/players.js';
import {DEFAULT_RULE,evaluateGames,gameWinner,validateRule} from '../ui/core/rules.js';
import {createEvent,makeGroups,startEvent,schedulePreview,setScore,confirmAdvancement,nextStageSuggestion,applyNextStage,inferResults,confirmFinals,archiveEvent,reviseEvent,resolveImpact,addExtraMatch,setSpecialStatus,randomizeWithLocks,addAuxiliaryActivity,addLateEntrant} from '../ui/core/tournament.js';
import {standings} from '../ui/core/ranking.js';
import {validateData,validateEvent,makePackage,inspectPackage,applyPackage} from '../ui/core/backup.js';
import {regressionDemo} from '../ui/core/demo.js';
import {csv,bracketSvg,reportHtml} from '../ui/core/exports.js';
function fixture(n,config={}){const p=Array.from({length:n},(_,i)=>makePlayer('队员'+i)),u=makeUnits(p,'singles'),e=createEvent('测试赛事',u,config);startEvent(e,makeGroups(e));return e;}
function fill(e,stage=e.stages.at(-1)){for(const m of e.matches.filter(m=>m.stage===stage.id&&m.b&&!terminal(m)))setScore(e,m.id,[[m.rules.target,0]],true,'测试');}
function confirmGroups(e){for(const g of e.stages[0].groups)confirmAdvancement(e,g,g.units,'测试人工排序','测试');}

test('默认单局、草稿、未达目标及超分校验',()=>{
  assert.equal(evaluateGames([[11,10]],DEFAULT_RULE,true).winner,'a');
  assert.equal(evaluateGames([[10,8]],DEFAULT_RULE).complete,false);
  assert.throws(()=>evaluateGames([[10,8]],DEFAULT_RULE,true));
  assert.throws(()=>evaluateGames([[12,10]],DEFAULT_RULE,true));
  assert.throws(()=>evaluateGames([[-1,11]],DEFAULT_RULE));
  assert.throws(()=>evaluateGames([[11,0],[0,11]],DEFAULT_RULE));
  assert.throws(()=>evaluateGames([[11,11]],DEFAULT_RULE));
});
test('三局两胜及提前结束不能多记一局',()=>{
  const rule={...DEFAULT_RULE,bestOf:3,target:15,cap:15};
  assert.equal(evaluateGames([[15,13],[10,15],[15,14]],rule,true).winner,'a');
  assert.throws(()=>evaluateGames([[15,3],[15,8],[0,15]],rule,true));
  assert.equal(evaluateGames([[15,13],[10,12]],rule).complete,false);
});
test('领先两分、封顶、不可能的终局及无限加分',()=>{
  const r={target:21,bestOf:1,winByTwo:true,cap:30};
  assert.equal(gameWinner([21,19],r),'a');assert.equal(gameWinner([21,20],r),null);
  assert.equal(gameWinner([30,29],r),'a');assert.equal(gameWinner([29,30],r),'b');
  assert.throws(()=>gameWinner([30,20],r));assert.throws(()=>gameWinner([25,20],r));assert.throws(()=>gameWinner([31,30],r));
  assert.equal(gameWinner([33,31],{...r,cap:null}),'a');assert.throws(()=>validateRule({...r,cap:20}));
  assert.throws(()=>gameWinner([30,30],r));
});
test('分组随机保留锁定者，超出均衡容量明确拒绝',()=>{
  const e=fixture(7,{groups:3}),g=e.stages[0].groups.map(g=>g.units),locked=g[1][0];for(let i=0;i<10;i++){const result=randomizeWithLocks(e,g,[locked]);assert.ok(result[1].includes(locked));assert.deepEqual(result.map(g=>g.length),[3,2,2]);assert.equal(new Set(result.flat()).size,7);}assert.throws(()=>randomizeWithLocks(e,[e.units.slice(0,4).map(u=>u.id),e.units.slice(4,6).map(u=>u.id),[e.units[6].id]],e.units.slice(0,4).map(u=>u.id)),/容量/);
});
test('只有小组赛时不能把各组第一误当最终第一',()=>{
  const e=fixture(6,{groups:2,format:'placement'});fill(e);for(const r of inferResults(e)){assert.equal(r.from,1);assert.equal(r.to,6);assert.equal(r.status,'unresolved');}
});
test('单打赛事可独立记录趣味双打，不改变正式单位或统计',()=>{
  const e=fixture(4,{format:'roundrobin'});fill(e);const g=e.stages[0].groups[0],before=clone(standings(e,g)),members=e.units.map(u=>u.members[0]),m=addAuxiliaryActivity(e,members.slice(0,2),members.slice(2),DEFAULT_RULE,'辅助活动');setScore(e,m.id,[[11,8]],true,'测试');assert.equal(e.units.length,4);assert.equal(e.activityUnits.length,2);assert.deepEqual(standings(e,g),before);assert.ok(csv(e).includes(e.activityUnits[0].name));validateEvent(e);
});
test('迟到补充参赛名单保留旧比分，清除过期晋级顺序并提示补排',()=>{
  const e=fixture(4,{groups:2});fill(e);confirmGroups(e);const before=clone(e.matches),unit=makeUnits([makePlayer('补充参赛者')],'singles')[0];addLateEntrant(e,unit,e.stages[0].groups[0].id,'迟到后管理员明确准入','管理员');assert.equal(e.units.length,5);assert.deepEqual(e.matches,before);assert.equal(e.advancement[e.stages[0].groups[0].id],undefined);assert.equal(e.impacts.at(-1).status,'open');validateEvent(e);
});
test('固定双打成员唯一、奇数提示及历史姓名快照',()=>{
  const ps=Array.from({length:4},(_,i)=>makePlayer('同名'));
  const u=makeUnits(ps,'doubles',[[ps[0].id,ps[1].id],[ps[2].id,ps[3].id]]);
  assert.equal(u.length,2);ps[0].name='改名';assert.equal(u[0].members[0].name,'同名');
  assert.throws(()=>makeUnits(ps.slice(0,3),'doubles',[]),/奇数/);
  assert.throws(()=>makeUnits(ps,'doubles',[[ps[0].id,ps[1].id],[ps[1].id,ps[3].id]]),/重复/);
  const e=createEvent('固定双打',u,{type:'doubles',format:'roundrobin'});startEvent(e,makeGroups(e));fill(e);validateEvent(e);assert.equal(e.matches.length,1);
});
test('关闭男女共赛校验未知性别，未知不得猜测',()=>{
  const p=[makePlayer('甲','male'),makePlayer('乙','unknown')],u=makeUnits(p,'singles');
  assert.throws(()=>createEvent('男单',u,{mixed:false,gender:'male'}),/性别/);
  assert.equal(createEvent('共赛',u).config.mixed,true);
});
test('任意人数全员循环场数、每人场数、无重复和自我比赛',()=>{
  for(const n of [2,3,5,8,13]){const e=fixture(n,{format:'roundrobin'});assert.equal(e.matches.length,n*(n-1)/2);assert.equal(new Set(e.matches.map(m=>[m.a,m.b].sort().join('|'))).size,e.matches.length);for(const u of e.units)assert.equal(e.matches.filter(m=>[m.a,m.b].includes(u.id)).length,n-1);validateEvent(e);}
});
test('不等人数小组后同名次赛，不虚构缺失选手',()=>{
  const e=fixture(7,{groups:3,format:'placement'}),groups=e.stages[0].groups,p=schedulePreview(e,groups);assert.equal(p.uneven,true);assert.equal(p.first,5);assert.equal(p.second,6);fill(e);confirmGroups(e);const next=nextStageSuggestion(e);assert.deepEqual(next.stage.groups.map(g=>g.units.length),[3,3,1]);assert.equal(next.matches.length,6);applyNextStage(e,next,'测试');assert.equal(e.matches.length,11);validateEvent(e);
});
test('小组后同名次赛允许管理员调整，与真实胜负独立',()=>{
  const e=fixture(4,{groups:2});fill(e);const g=e.stages[0].groups[0],before=clone(standings(e,g));confirmGroups(e);confirmAdvancement(e,g,[...g.units].reverse(),'主动顺延','管理员');assert.deepEqual(standings(e,g),before);const n=nextStageSuggestion(e);assert.equal(n.stage.groups[0].units[0],e.advancement[g.id].confirmed[0]);
});
test('两组出线交叉半决赛，决赛和季军未进行均保留区间',()=>{
  const e=fixture(8,{format:'knockout',groups:2,qualify:2});fill(e);confirmGroups(e);const n=nextStageSuggestion(e),[a,b]=e.stages[0].groups;
  assert.deepEqual([n.matches[0].a,n.matches[0].b],[a.units[0],b.units[1]]);assert.deepEqual([n.matches[1].a,n.matches[1].b],[a.units[1],b.units[0]]);applyNextStage(e,n,'测试');fill(e);const final=nextStageSuggestion(e);assert.equal(final.matches.length,2);applyNextStage(e,final,'测试');const results=inferResults(e);assert.equal(results.filter(r=>r.from===1&&r.to===2).length,2);assert.equal(results.filter(r=>r.from===3&&r.to===4).length,2);validateEvent(e);
});
test('非二次幂淘汰签位轮空，无空对空或虚构比分',()=>{
  for(const n of [3,5,6,7,9]){const e=fixture(n,{format:'knockout',groups:1,qualify:n});fill(e);confirmGroups(e);let next=nextStageSuggestion(e);applyNextStage(e,next,'测试');const first=e.stages.at(-1);assert.equal(first.roundSize,2**Math.ceil(Math.log2(n)));for(const m of next.matches){assert.ok(m.a);if(!m.b){assert.equal(m.status,'bye');assert.deepEqual(m.games,[]);}}while(e.stages.at(-1).roundSize>2){fill(e);next=nextStageSuggestion(e);applyNextStage(e,next,'测试');}fill(e);validateEvent(e);const rs=inferResults(e);assert.equal(rs.find(r=>r.from===1&&r.to===1)?.status,'ranked');}
});
test('八人案例：A组原战绩和累计得分，顺延不改变战绩',()=>{
  const {event:e}=regressionDemo(),r=standings(e,e.stages[0].groups[0]);
  assert.deepEqual(r.rows.map(r=>[e.units.find(u=>u.id===r.id).name,r.wins,r.losses,r.points]),[['虚构选手01',3,0,33],['虚构选手02',2,1,28],['虚构选手03',1,2,30],['虚构选手04',0,3,19]]);
  assert.deepEqual(e.advancement[e.stages[0].groups[0].id].confirmed.map(id=>e.units.find(u=>u.id===id).name),['虚构选手02','虚构选手03','虚构选手04','虚构选手01']);
});
test('八人案例：B组胜场后累计得分优先于相互胜负',()=>{
  const {event:e}=regressionDemo(),r=standings(e,e.stages[0].groups[1]);
  assert.deepEqual(r.rows.map(r=>[e.units.find(u=>u.id===r.id).name,r.wins,r.points]),[['虚构选手05',2,32],['虚构选手06',2,31],['虚构选手07',2,30],['虚构选手08',0,26]]);
});
test('真实第二阶段：低位省略场保留未进行，前四不强分冠亚季殿',()=>{
  const {event:e,id}=regressionDemo();applyNextStage(e,nextStageSuggestion(e),'测试');const r=inferResults(e);
  for(const name of ['虚构选手02','虚构选手05'])assert.deepEqual([r.find(x=>x.unit===id(name)).from,r.find(x=>x.unit===id(name)).to],[1,2]);
  for(const name of ['虚构选手06','虚构选手03'])assert.deepEqual([r.find(x=>x.unit===id(name)).from,r.find(x=>x.unit===id(name)).to],[3,4]);
  const missing=e.matches.find(m=>m.a===id('虚构选手01')&&m.b===id('虚构选手08'));assert.equal(missing.status,'pending');assert.deepEqual(missing.games,[]);
});
test('前轮误录修正仅提示影响，后续已录结果逐字段保持',()=>{
  const {event:e,id}=regressionDemo(),source=e.matches.find(m=>[m.a,m.b].includes(id('虚构选手07'))&&[m.a,m.b].includes(id('虚构选手06'))),later=clone(e.matches.filter(m=>m.stage!==e.stages[0].id));
  setScore(e,source.id,[source.a===id('虚构选手07')?[9,11]:[11,9]],true,'误录');assert.deepEqual(e.matches.filter(m=>m.stage!==e.stages[0].id),later);
  setScore(e,source.id,[source.a===id('虚构选手07')?[11,9]:[9,11]],true,'修正');assert.deepEqual(e.matches.filter(m=>m.stage!==e.stages[0].id),later);assert.ok(e.impacts.length>=1);
  const last=e.impacts.at(-1);resolveImpact(e,last.id,'keep','按现场已确认对阵继续','管理员');assert.deepEqual(e.matches.filter(m=>m.stage!==e.stages[0].id),later);assert.equal(last.status,'resolved');validateEvent(e);
});
test('多人完全同分等待裁定，加赛单独记录不递归影响累计分',()=>{
  const e=fixture(3,{groups:1,format:'placement'}),g=e.stages[0].groups[0],[a,b,c]=g.units;
  for(const [x,y] of [[a,b],[b,c],[c,a]]){const m=e.matches.find(m=>[m.a,m.b].includes(x)&&[m.a,m.b].includes(y));setScore(e,m.id,[m.a===x?[11,9]:[9,11]],true,'测试');}
  const before=standings(e,g);assert.equal(before.ready,false);assert.equal(before.ties[0].length,3);assert.throws(()=>nextStageSuggestion(e),/同分/);
  const m=addExtraMatch(e,a,b,{tiebreak:true,pool:g.id});setScore(e,m.id,[[3,2]],true,'测试');assert.deepEqual(standings(e,g),before);confirmAdvancement(e,g,[a,b,c],'抢三结果与多人裁定','管理员');assert.ok(nextStageSuggestion(e));
});
test('弃权退赛显式策略、无虚构比分、保留以前结果',()=>{
  const e=fixture(3,{format:'roundrobin'}),m=e.matches[0];setSpecialStatus(e,m.id,'walkover',m.a,{countWin:true,countPoints:false},'乙方弃权，计胜不造分','管理员');assert.deepEqual(m.games,[]);const r=standings(e,e.stages[0].groups[0]);assert.equal(r.rows.find(r=>r.id===m.a).wins,1);assert.equal(r.rows.find(r=>r.id===m.a).points,0);validateEvent(e);
});
test('归档允许未决成绩；修改需修订且上一版本完整保留',()=>{
  const e=fixture(2,{format:'roundrobin'});confirmFinals(e,inferResults(e),'管理员','比赛未打，保留未决');archiveEvent(e,'管理员');assert.throws(()=>setScore(e,e.matches[0].id,[[11,0]],true,'测试'),/修订/);reviseEvent(e,'管理员','补录已核实比分');assert.equal(e.version,2);assert.equal(e.revisions[0].snapshot.status,'archived');assert.equal(e.finals,null);validateEvent(e);
});
test('单届包导入去重、较旧冲突预览、全量恢复含改进清单',()=>{
  const d=fresh(),e=fixture(4);d.events.push(e);const one=makePackage(d,e.id),empty=fresh();let target=applyPackage(empty,inspectPackage(one,empty));assert.equal(target.events.length,1);target=applyPackage(target,inspectPackage(one,target));assert.equal(target.events.length,1);
  one.data.updatedAt='2000-01-01T00:00:00.000Z';const preview=inspectPackage(one,target);assert.equal(preview.conflict,true);assert.equal(preview.older,true);
  d.improvements[0].status='doing';const restored=applyPackage(empty,inspectPackage(makePackage(d),empty));assert.deepEqual(restored,d);validateData(restored);
});
test('拒绝未知格式、重复ID、非法比分及断裂比赛引用',()=>{
  const d=fresh();d.events.push(fixture(4));const broken=clone(d);broken.events[0].matches[0].a='missing';assert.throws(()=>validateData(broken));assert.throws(()=>validateData({...d,schema:'future'}));assert.throws(()=>inspectPackage({schema:'wku-night-cup/v1'},d));
  const duplicate=clone(d);duplicate.events.push(clone(duplicate.events[0]));assert.throws(()=>validateData(duplicate));
});
test('全部导出保留前期、低位和未进行比赛；姓名防CSV公式注入',()=>{
  const {event:e,id}=regressionDemo();applyNextStage(e,nextStageSuggestion(e),'测试');const c=csv(e),s=bracketSvg(e),r=reportHtml(e);for(const name of ['虚构选手01','虚构选手08','虚构选手04']){assert.ok(c.includes(name));assert.ok(s.includes(name));assert.ok(r.includes(name));}assert.ok(r.includes('1—2'));assert.ok(c.includes('未开始'));e.title='=HYPERLINK("x")';assert.ok(csv(e).includes("'=HYPERLINK"));assert.ok(s.startsWith('<svg'));
});
