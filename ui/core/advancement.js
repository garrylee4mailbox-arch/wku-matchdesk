import {clone,assert,uid,now} from './util.js';
import {standings} from './ranking.js';
import {confirmAdvancement,nextStageSuggestion,applyNextStage} from './tournament.js';

export function orderGroup(event,group){
  const stats=standings(event,group),suggested=stats.rows.map(row=>row.id);
  return {id:group.id,name:group.name,order:[...(event.advancement[group.id]?.confirmed||suggested)],suggested,stats,cutoff:event.config.format==='knockout'?Math.min(group.units.length,event.config.qualify):null};
}
export function groupPlan(event,id){
  const group=event.stages.flatMap(stage=>stage.groups).find(g=>g.id===id);assert(group,'找不到这个小组');
  return {kind:'group',groups:[orderGroup(event,group)],draw:null};
}
export function nextRoundPlan(event){
  assert(event.status!=='archived','归档赛事请先进入修订');
  assert(event.config.format!=='roundrobin','全员循环赛结束后请确认最终成绩，无需安排下一轮');
  const first=event.stages[0];assert(first,'请先生成并进行小组赛');
  const rounds=event.stages.filter(stage=>stage.type==='knockout');
  if(!rounds.length){
    assert(!event.stages.some(stage=>stage.type==='placement'),'同名次赛已经生成，请在管理员中调整已有比赛');
    const plan={kind:'groups',groups:first.groups.map(g=>orderGroup(event,g)),draw:null};
    previewRound(event,plan);return plan;
  }
  const base=nextStageSuggestion(event),plan={kind:'knockout',groups:[],base,draw:null};
  previewRound(event,plan);return plan;
}
function suggestedRound(event,plan){
  if(plan.kind==='knockout')return clone(plan.base);
  const copy=clone(event);
  for(const item of plan.groups){const group=copy.stages[0].groups.find(g=>g.id===item.id);assert(group,'小组不属于本届第一阶段');confirmAdvancement(copy,group,item.order,'预览晋级顺序','预览');}
  return nextStageSuggestion(copy);
}
function makeDraw(suggestion){
  return ['main','bronze'].map(key=>{
    const matches=suggestion.matches.filter(m=>(m.label==='季军赛')===(key==='bronze'));
    return {key,title:key==='bronze'?'季军赛选手':suggestion.stage.roundSize===2?'决赛选手':suggestion.stage.name+'对阵位置',matches:matches.map(m=>({id:m.id,label:m.label})),slots:matches.flatMap(m=>[m.a,m.b])};
  }).filter(lane=>lane.matches.length);
}
export function previewRound(event,plan){
  const suggestion=suggestedRound(event,plan);
  if(suggestion.stage.type==='knockout'){
    if(!plan.draw)plan.draw=makeDraw(suggestion);
    // IDs are refreshed by nextStageSuggestion during group previews. Match by
    // lane and position so moving a card does not replace the source results.
    for(const lane of plan.draw){
      const matches=suggestion.matches.filter(m=>(m.label==='季军赛')===(lane.key==='bronze'));
      assert(lane.slots.length===matches.length*2,'对阵位置数量不符，请恢复建议对阵');
      matches.forEach((m,i)=>{
        let [a,b]=lane.slots.slice(i*2,i*2+2);assert(a||b,'同一场不能两边都是轮空，请交换其他位置');
        if(!a)[a,b]=[b,null];m.a=a;m.b=b||null;m.games=[];m.status=m.b?'pending':'bye';m.winner=m.b?null:m.a;
      });
    }
    const ids=suggestion.matches.flatMap(m=>[m.a,m.b]).filter(Boolean);
    assert(new Set(ids).size===ids.length,'同一轮的选手不能重复，决赛和季军赛也不能重复使用同一人');
    assert(ids.every(id=>event.units.some(u=>u.id===id)),'对阵包含不在本届名单中的选手');
  }
  return suggestion;
}
export function movePlan(plan,key,from,to){
  const group=plan.groups.find(g=>g.id===key),lane=plan.draw?.find(lane=>lane.key===key),items=group?.order||lane?.slots;
  assert(items&&Number.isInteger(from)&&Number.isInteger(to)&&from>=0&&to>=0&&from<items.length&&to<items.length,'移动位置无效');
  if(from===to)return;
  if(group){const [item]=items.splice(from,1);items.splice(to,0,item);plan.draw=null;}
  else [items[from],items[to]]=[items[to],items[from]];
}
export function sourceLabel(event,plan,id){
  if(!id)return '这个位置没有对手，不录入虚构比分';
  for(const group of plan.groups){const index=group.order.indexOf(id);if(index>=0)return `${group.name} · 晋级顺序第 ${index+1} 位`;}
  const previous=event.stages.filter(s=>s.type==='knockout').at(-1);
  const matches=event.matches.filter(m=>m.stage===previous?.id&&m.label!=='季军赛'&&!m.exhibition&&!m.tiebreak&&!m.classification&&m.status!=='cancelled');
  for(const [index,m] of matches.entries()){
    if(m.winner===id)return m.status==='bye'?`上一轮第 ${index+1} 场 · 轮空晋级`:`上一轮第 ${index+1} 场 · 胜者`;
    if([m.a,m.b].includes(id))return `上一轮第 ${index+1} 场 · 负者`;
  }
  return '管理员指定的参赛者';
}
export function planWarnings(event,plan){
  const warnings=plan.groups.flatMap(group=>[
    ...(!group.stats.complete?[`${group.name}尚未全部完赛；确认将采用人工裁定的晋级顺序。`]:[]),
    ...(group.stats.ties.length?[`${group.name}存在同分，请核对加赛或人工裁定依据。`]:[]),
    ...(JSON.stringify(group.order)!==JSON.stringify(group.suggested)?[`${group.name}的晋级顺序与自动统计不同，比分及原始战绩保持原样。`]:[])
  ]);
  if(plan.draw){
    const base=suggestedRound(event,plan),original=base.matches.flatMap(m=>[m.a,m.b]).filter(Boolean),current=plan.draw.flatMap(lane=>lane.slots).filter(Boolean);
    const excluded=original.filter(id=>!current.includes(id)),added=current.filter(id=>!original.includes(id));
    const name=id=>event.units.find(u=>u.id===id)?.name||id;
    if(excluded.length||added.length)warnings.push(`管理员更换了晋级名单：${excluded.length?'移出 '+excluded.map(name).join('、')+'；':''}${added.length?'加入 '+added.map(name).join('、')+'。':''}请填写调整依据。`);
  }
  return warnings;
}
export function saveGroupPlan(event,plan,reason,operator){
  assert(reason.trim(),'请填写确认或调整依据');
  for(const item of plan.groups){
    const sourceIndex=event.stages.findIndex(stage=>stage.groups.some(g=>g.id===item.id));
    const group=event.stages[sourceIndex]?.groups.find(g=>g.id===item.id);assert(group,'小组已发生变化，请重新打开');
    const before=event.advancement[item.id]?.confirmed||standings(event,group).rows.map(row=>row.id);
    confirmAdvancement(event,group,item.order,reason,operator);
    const later=event.matches.filter(m=>event.stages.findIndex(s=>s.id===m.stage)>sourceIndex);
    if(later.length&&JSON.stringify(before)!==JSON.stringify(item.order))event.impacts.push({id:uid('impact'),at:now(),source:item.id,matchIds:later.map(m=>m.id),status:'open',reason:'人工晋级顺序改变，请检查后续；已有对阵和比分已保留'});
  }
}
export function applyRoundPlan(event,plan,reason,operator){
  assert(reason.trim(),'请填写确认或调整依据');
  const suggestion=previewRound(event,plan);
  if(plan.kind==='groups')saveGroupPlan(event,plan,reason,operator);
  applyNextStage(event,suggestion,operator,reason);
}
