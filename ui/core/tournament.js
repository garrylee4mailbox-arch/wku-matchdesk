import {uid,now,clone,assert,shuffle,terminal,today} from './util.js';
import {DEFAULT_RULE,validateRule,evaluateGames} from './rules.js';
import {standings,advancementOrder,inferResults} from './ranking.js';
export const DEFAULT_CONFIG={type:'singles',mixed:true,gender:'male',format:'placement',groups:2,qualify:2,rule:{...DEFAULT_RULE},stageRule:null,sort:['wins','points'],displayTop:4,bronze:true};
export function createEvent(title,units,config={}){
  const c={...clone(DEFAULT_CONFIG),...clone(config)};validateRule(c.rule);if(c.stageRule)validateRule(c.stageRule);
  assert(title.trim(),'赛事名称不能为空');assert(units.length>=2,'至少两个参赛单位');
  assert(['singles','doubles'].includes(c.type)&&['roundrobin','placement','knockout'].includes(c.format),'项目或赛制无效');
  assert(c.sort.length&&new Set(c.sort).size===c.sort.length&&c.sort.every(k=>['wins','points','gameDiff','pointDiff','headToHead'].includes(k)),'排序规则无效');
  assert(c.mixed || units.every(u=>u.members.every(p=>p.gender===c.gender)),'关闭男女共赛时，所有队员必须符合本届所选性别；未知性别需先填写');
  assert(Number.isInteger(c.groups)&&c.groups>=1&&c.groups<=units.length,'分组数量无效');
  assert(Number.isInteger(c.qualify)&&c.qualify>=1,'每组晋级人数无效');
  return {id:uid('event'),title:title.trim(),date:config.date||today(),createdAt:now(),updatedAt:now(),status:'setup',version:1,config:c,units:clone(units),stages:[],matches:[],advancement:{},impacts:[],finals:null,audit:[],revisions:[]};
}
export function makeGroups(event, assignments=null,random=Math.random){
  const count=event.config.format==='roundrobin'?1:event.config.groups,ids=event.units.map(u=>u.id);
  const buckets=assignments||Array.from({length:count},()=>[]);
  if(!assignments)shuffle(ids,random).forEach((id,i)=>buckets[i%count].push(id));
  assert(buckets.length===count && buckets.every(g=>g.length), '每组至少一名 / 一对选手');
  assert(buckets.flat().length===ids.length&&new Set(buckets.flat()).size===ids.length&&buckets.flat().every(id=>ids.includes(id)),'分组必须包含每个参赛单位且不得重复');
  return buckets.map((units,i)=>({id:uid('g'),name:String.fromCharCode(65+i)+'组',units:[...units]}));
}
export function match(stage,pool,a,b,rule,label='',extra={}){return {id:uid('m'),stage,pool,a,b,rules:clone(rule),label,status:b?'pending':'bye',winner:b?null:a,games:[],note:'',...extra};}
export function randomizeWithLocks(event,assignments,lockedIds,random=Math.random){
  const count=assignments.length,ids=event.units.map(u=>u.id),buckets=assignments.map(g=>g.filter(id=>lockedIds.includes(id))),capacities=Array.from({length:count},(_,i)=>Math.floor(ids.length/count)+(i<ids.length%count?1:0));
  assert(buckets.every((g,i)=>g.length<=capacities[i]),'锁定人数超出均衡分组容量，请先调整或解锁');
  const slots=shuffle(capacities.flatMap((n,i)=>Array(n-buckets[i].length).fill(i)),random);
  shuffle(ids.filter(id=>!lockedIds.includes(id)),random).forEach((id,i)=>buckets[slots[i]].push(id));return buckets;
}
export function roundRobin(stage,groups,rule){
  const out=[];for(const g of groups)for(let i=0;i<g.units.length;i++)for(let j=i+1;j<g.units.length;j++)out.push(match(stage,g.id,g.units[i],g.units[j],rule,g.name));return out;
}
export function schedulePreview(event,groups){
  const first=groups.reduce((sum,g)=>sum+g.units.length*(g.units.length-1)/2,0);
  let second=0,details=[];
  if(event.config.format==='placement')for(let i=0;i<Math.max(...groups.map(g=>g.units.length));i++){const n=groups.filter(g=>g.units.length>i).length; second+=n*(n-1)/2;details.push(`各组第${i+1}名：${n}个单位，${n*(n-1)/2}场${n===1?'，仅一人，不虚构对阵':''}`);}
  if(event.config.format==='knockout'){const n=groups.reduce((s,g)=>s+Math.min(g.units.length,event.config.qualify),0);second=Math.max(0,n-1)+(event.config.bronze&&n>=4?1:0);details.push(`${n}个晋级单位，签位不足二次幂时轮空；非晋级选手不自动加排位赛`);}
  return {first,second,total:first+second,details,perUnit:groups.flatMap(g=>g.units.map(id=>({id,first:g.units.length-1,second:event.config.format==='placement'?groups.filter(x=>x.units.length>g.units.indexOf(id)).length-1:null}))),uneven:new Set(groups.map(g=>g.units.length)).size>1};
}
export function startEvent(event,groups){
  assert(!event.stages.length,'赛程已存在，请用管理员调整入口');
  const stage={id:uid('stage'),name:event.config.format==='roundrobin'?'全员循环':'第一阶段 · 小组循环',type:'groups',groups:clone(groups)};
  event.stages.push(stage);event.matches.push(...roundRobin(stage.id,groups,event.config.rule));event.status='active';return event;
}
export function confirmAdvancement(event,group,order,reason,operator){
  assert(order.length===group.units.length&&new Set(order).size===order.length&&order.every(id=>group.units.includes(id)),'晋级顺序须完整且不重复');
  assert(reason.trim(),'人工调整须填写原因');
  const suggested=standings(event,group).rows.map(r=>r.id);
  const before=clone(event.advancement[group.id]||null);
  event.advancement[group.id]={suggested,confirmed:[...order],reason,operator,at:now()};
  event.audit.push({at:now(),operator,action:'确认晋级顺序',reason,before,after:clone(event.advancement[group.id])});event.finals=null;
}
export function nextStageSuggestion(event){
  const first=event.stages[0];assert(first,'请先生成小组赛');
  if(event.config.format==='roundrobin')throw Error('全员循环无需下一阶段');
  if(event.config.format==='placement'){
    assert(!event.stages.some(s=>s.type==='placement'),'同名次阶段已生成，请用管理员调整对阵');
    const orders=first.groups.map(g=>advancementOrder(event,g));let start=1;const groups=[];
    for(let i=0;i<Math.max(...orders.map(g=>g.length));i++){const units=orders.map(g=>g[i]).filter(Boolean);groups.push({id:uid('g'),name:`第${i+1}名组 · 争第${start}—${start+units.length-1}名`,units,start});start+=units.length;}
    const id=uid('stage');return {stage:{id,name:'第二阶段 · 同名次赛',type:'placement',groups},matches:roundRobin(id,groups,event.config.stageRule||event.config.rule)};
  }
  const rounds=event.stages.filter(s=>s.type==='knockout');let entrants,losers=[],size;
  if(!rounds.length){
    const orders=first.groups.map(g=>advancementOrder(event,g).slice(0,event.config.qualify));
    if(orders.length===2&&orders.every(g=>g.length===2))entrants=[orders[0][0],orders[1][1],orders[0][1],orders[1][0]];
    else {entrants=[];for(let i=0;i<Math.max(...orders.map(g=>g.length));i++)for(const g of orders)if(g[i])entrants.push(g[i]);}
    assert(entrants.length>=2,'至少需要两个晋级单位');size=2**Math.ceil(Math.log2(entrants.length));
  }else{
    const previous=rounds.at(-1);assert(previous.roundSize>2,'决赛阶段已存在');
    const ms=event.matches.filter(m=>m.stage===previous.id&&m.label!=='季军赛'&&!m.exhibition&&!m.tiebreak&&!m.classification&&m.status!=='cancelled');
    assert(ms.length===previous.roundSize/2,'主淘汰场次数与本轮签位不符，请明确哪些是排位赛、作废场次或重赛，不能自动丢弃多出的晋级者');
    assert(ms.every(m=>terminal(m)&&m.winner),'请完成本轮，或明确指定每场胜方');
    entrants=ms.map(m=>m.winner);losers=ms.filter(m=>m.b).map(m=>m.winner===m.a?m.b:m.a);size=previous.roundSize/2;
  }
  const id=uid('stage'),isFinal=size===2,stage={id,type:'knockout',roundSize:size,name:isFinal?'决赛 / 季军赛':size===4?'半决赛':`${size}强淘汰赛`,groups:[]},ms=[],rule=event.config.stageRule||event.config.rule;
  // Give each missing slot to a different real entrant, rather than producing empty/empty matches.
  const byeCount=size-entrants.length;let cursor=0;
  for(let i=0;i<size/2;i++){
    const a=entrants[cursor++],b=i<byeCount?null:entrants[cursor++];
    if(a)ms.push(match(id,null,a,b,rule,isFinal?'决赛':stage.name));
  }
  if(isFinal&&event.config.bronze&&losers.length===2)ms.push(match(id,null,...losers,rule,'季军赛'));
  return {stage,matches:ms};
}
export function applyNextStage(event,suggestion,operator,reason='确认下一阶段安排'){
  const ids=event.units.map(u=>u.id),seen=[];
  for(const m of suggestion.matches){assert(ids.includes(m.a)&&(!m.b||ids.includes(m.b))&&m.a!==m.b,'对阵参赛单位无效');seen.push(m.a);if(m.b)seen.push(m.b);}
  if(suggestion.stage.type==='knockout')assert(new Set(seen).size===seen.length,'同一轮不能重复出场');
  event.stages.push(clone(suggestion.stage));const added=clone(suggestion.matches);for(const m of added)for(const id of [m.a,m.b].filter(Boolean)){const u=event.units.find(u=>u.id===id);if(u?.currentMembers){m.lineups=m.lineups||{};m.lineups[id]={name:u.currentName,members:clone(u.currentMembers)};}}event.matches.push(...added);
  event.audit.push({at:now(),operator,action:'确认下一阶段',reason,before:null,after:clone(suggestion)});event.finals=null;
}
export function setScore(event,id,games,complete,operator,reason='现场录分 / 更正'){
  assert(event.status!=='archived','归档赛事请先进入修订流程');const m=event.matches.find(m=>m.id===id);assert(m,'比赛不存在');
  assert(m.b,'轮空不能填写虚构比分');const result=evaluateGames(games,m.rules,complete);
  const before=clone(m),oldRanks=JSON.stringify(event.stages.flatMap(s=>s.groups).map(g=>standings(event,g).rows.map(r=>[r.id,r.rank,r.points,r.wins])));
  m.games=clone(games);m.status=complete?'completed':'draft';m.winner=complete?(result.winner==='a'?m.a:m.b):null;m.operator=operator;m.updatedAt=now();
  const newRanks=JSON.stringify(event.stages.flatMap(s=>s.groups).map(g=>standings(event,g).rows.map(r=>[r.id,r.rank,r.points,r.wins])));
  const stageIndex=event.stages.findIndex(s=>s.id===m.stage),later=event.matches.filter(x=>event.stages.findIndex(s=>s.id===x.stage)>stageIndex);
  if(!m.exhibition&&!m.tiebreak&&later.length&&(oldRanks!==newRanks||before.winner!==m.winner))event.impacts.push({id:uid('impact'),at:now(),source:id,matchIds:later.map(x=>x.id),before,after:clone(m),status:'open',reason:'前轮结果变化，需检查后续晋级和对阵；现有赛程及比分已原样保留'});
  if(!m.exhibition&&(complete||before.status==='completed'))event.finals=null;
  event.audit.push({at:now(),operator,action:complete?'确认比分':'保存比分草稿',reason,before,after:clone(m)});return m;
}
export function setSpecialStatus(event,id,status,winner,policy,reason,operator){
  assert(['pending','draft','walkover','withdrawn','bye','cancelled'].includes(status),'状态无效');
  const m=event.matches.find(m=>m.id===id);assert(m,'比赛不存在');assert(reason.trim(),'请说明处理原因');
  assert(!winner||[m.a,m.b].includes(winner),'胜方无效');if(status==='bye')assert(!m.b,'有对手的比赛不能直接设为轮空，请明确调整对阵');
  assert(!policy.countWin||!!winner,'选择计胜时必须明确指定胜方');
  const before=clone(m);Object.assign(m,{status,winner:status==='cancelled'?null:status==='bye'?m.a:(winner||null),policy:clone(policy),note:reason});
  event.audit.push({at:now(),operator,action:'调整比赛状态',reason,before,after:clone(m)});
  const si=event.stages.findIndex(s=>s.id===m.stage),later=event.matches.filter(x=>event.stages.findIndex(s=>s.id===x.stage)>si);
  if(later.length)event.impacts.push({id:uid('impact'),at:now(),source:id,matchIds:later.map(x=>x.id),status:'open',reason:'前轮状态改变，请检查后续；已保留所有比分'});
  event.finals=null;
}
export function resolveImpact(event,id,decision,reason,operator){
  assert(['keep','cancel','replay'].includes(decision)&&reason.trim(),'请选择处理方式并填写原因');
  const impact=event.impacts.find(i=>i.id===id);assert(impact,'影响记录不存在');
  if(decision!=='keep')for(const mid of impact.matchIds){const m=event.matches.find(x=>x.id===mid);if(!m)continue;if(decision==='replay')event.matches.push({...clone(m),id:uid('m'),status:'pending',games:[],winner:null,note:'重赛，原场次 '+m.id});m.status='cancelled';m.note+='；'+reason;}
  Object.assign(impact,{status:'resolved',decision,reason,operator,resolvedAt:now()});event.audit.push({at:now(),operator,action:'处理前轮变更影响',reason,before:null,after:clone(impact)});if(decision!=='keep')event.finals=null;
}
export function addExtraMatch(event,a,b,{tiebreak=false,exhibition=false,rule={target:3,cap:3,bestOf:1,winByTwo:false},note='',pool=null}={}){
  assert(a!==b&&event.units.some(u=>u.id===a)&&event.units.some(u=>u.id===b),'请选择不同参赛单位');validateRule(rule);
  const stage=event.stages.at(-1)?.id||'extra',m=match(stage,pool,a,b,rule,tiebreak?'同分加赛':exhibition?'趣味赛':'管理员加赛',{tiebreak,exhibition,note});event.matches.push(m);return m;
}
export function addAuxiliaryActivity(event,membersA,membersB,rule,note=''){
  validateRule(rule);assert([1,2].includes(membersA.length)&&membersA.length===membersB.length,'辅助活动支持单打或固定两人对两人');
  const ids=[...membersA,...membersB].map(p=>p.id);assert(new Set(ids).size===ids.length,'同一辅助场次不能重复使用队员');
  event.activityUnits=event.activityUnits||[];
  const units=[membersA,membersB].map(members=>({id:uid('activity'),members:clone(members),name:members.map(p=>p.name).join(' / ')}));event.activityUnits.push(...units);
  const m=match(event.stages.at(-1)?.id||'extra',null,units[0].id,units[1].id,rule,'独立趣味赛',{exhibition:true,note});event.matches.push(m);return m;
}
export function addLateEntrant(event,unit,groupId,reason,operator){
  assert(reason.trim(),'调整名单须填写原因');const existing=event.units.flatMap(u=>[...u.members,...(u.currentMembers||[])]).map(p=>p.id);
  assert(unit.members.length===(event.config.type==='doubles'?2:1),'参赛单位与项目不一致');assert(unit.members.every(p=>!existing.includes(p.id)),'队员已在本届名单中');
  assert(event.config.mixed||unit.members.every(p=>p.gender===event.config.gender),'性别不符合本届设置');
  event.units.push(clone(unit));const g=event.stages.flatMap(s=>s.groups).find(g=>g.id===groupId);if(g){g.units.push(unit.id);delete event.advancement[g.id];}
  event.impacts.push({id:uid('impact'),at:now(),source:'roster',matchIds:event.matches.map(m=>m.id),status:'open',reason:'新增参赛单位；既有赛程不自动重排，请核查并补排实际对阵'});event.finals=null;
  event.audit.push({at:now(),operator,action:'补充本届参赛名单',reason,before:null,after:{unit:clone(unit),group:groupId}});
}
export function substituteDoubles(event,unitId,slot,player,reason,operator){
  assert(event.config.type==='doubles'&&[0,1].includes(slot),'双打替补配置无效');assert(player&&reason.trim(),'请选择替补并说明原因');
  const unit=event.units.find(u=>u.id===unitId);assert(unit,'组合不存在');
  assert(!event.units.some(u=>(u.currentMembers||u.members).some((p,i)=>p.id===player.id&&(u.id!==unitId||i!==slot))),'替补已在本届其他位置参赛');
  assert(event.config.mixed||player.gender===event.config.gender,'替补性别不符合本届设置');
  const before=clone(unit),members=clone(unit.currentMembers||unit.members);members[slot]=clone(player);unit.currentMembers=members;unit.currentName=members.map(p=>p.name).join(' / ');
  event.substitutions=event.substitutions||[];event.substitutions.push({unit:unitId,members:clone(members),at:now(),operator,reason});
  for(const m of event.matches.filter(m=>m.status==='pending'&&!m.games.length&&[m.a,m.b].includes(unitId))){m.lineups=m.lineups||{};m.lineups[unitId]={name:unit.currentName,members:clone(members)};}
  event.finals=null;event.audit.push({at:now(),operator,action:'双打替补',reason,before,after:clone(unit)});return unit;
}
export function confirmFinals(event,rows,operator,reason){
  assert(reason.trim(),'请填写确认依据');assert(rows.length===event.units.length&&new Set(rows.map(r=>r.unit)).size===event.units.length,'名次必须覆盖全部参赛单位');
  for(const r of rows){assert(event.units.some(u=>u.id===r.unit),'名次参赛单位无效');assert(['ranked','unresolved','withdrawn','approximate'].includes(r.status),'名次状态无效');assert(Number.isInteger(r.from)&&Number.isInteger(r.to)&&r.from>=1&&r.to>=r.from&&r.to<=event.units.length,'名次范围无效');}
  event.finals={rows:clone(rows),confirmedAt:now(),operator,reason};event.audit.push({at:now(),operator,action:'确认最终成绩',reason,before:null,after:clone(event.finals)});
}
export function archiveEvent(event,operator){assert(event.finals,'请先确认实际成绩，允许明确标记未决');assert(!event.impacts.some(i=>i.status==='open'),'请先处理前轮变更的影响清单');event.status='archived';event.archivedAt=now();event.audit.push({at:now(),operator,action:'归档',before:'active',after:'archived',reason:'以已确认实际成绩归档'});}
export function reviseEvent(event,operator,reason){assert(event.status==='archived'&&reason.trim(),'修订须针对归档赛事并填写原因');event.revisions.push({version:event.version,at:now(),operator,reason,snapshot:clone({...event,revisions:[]})});event.version++;event.status='active';event.finals=null;event.audit.push({at:now(),operator,action:'开始归档修订',reason,before:event.version-1,after:event.version});}
export {inferResults};
