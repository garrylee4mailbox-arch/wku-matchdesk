import {SCHEMA,VERSION} from './initial.js';
import {assert,clone,now} from './util.js';
import {validateRule,evaluateGames} from './rules.js';
export const BACKUP_SCHEMA='wku-matchdesk-package/v1';
const unique=(items,label)=>{assert(Array.isArray(items),label+'必须是数组');assert(items.every(x=>x&&typeof x.id==='string'&&x.id.length<200),label+'缺少稳定ID');assert(new Set(items.map(x=>x.id)).size===items.length,label+'ID重复');};
export function validateEvent(e){
  assert(e&&typeof e.id==='string'&&typeof e.title==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e.date),'赛事基本信息无效');
  assert(['setup','active','archived'].includes(e.status),'赛事状态无效');
  unique(e.units,'参赛单位');unique(e.stages,'阶段');unique(e.matches,'比赛');
  const units=new Set(e.units.map(u=>u.id)),players=[];
  unique(e.activityUnits||[],'辅助活动参赛单位');const activityUnits=new Set((e.activityUnits||[]).map(u=>u.id));
  for(const u of e.activityUnits||[])assert(typeof u.name==='string'&&[1,2].includes(u.members?.length)&&u.members.every(p=>typeof p.id==='string'&&typeof p.name==='string'),'辅助活动名单无效');
  assert(['singles','doubles'].includes(e.config.type),'赛事项目无效');
  for(const u of e.units){assert(typeof u.name==='string'&&Array.isArray(u.members)&&u.members.length===(e.config.type==='doubles'?2:1),'参赛快照无效');for(const p of u.members){assert(typeof p.id==='string'&&typeof p.name==='string','队员快照无效');players.push(p.id);}}
  assert(new Set(players).size===players.length,'同届队员重复参赛');validateRule(e.config.rule);if(e.config.stageRule)validateRule(e.config.stageRule);
  assert(Array.isArray(e.config.sort)&&e.config.sort.length&&e.config.sort.every(k=>['wins','points','gameDiff','pointDiff','headToHead'].includes(k)),'排名配置无效');
  const groups=new Set();for(const s of e.stages){assert(Array.isArray(s.groups),'阶段分组无效');for(const g of s.groups){assert(typeof g.id==='string'&&!groups.has(g.id),'分组ID重复');groups.add(g.id);assert(Array.isArray(g.units)&&new Set(g.units).size===g.units.length&&g.units.every(id=>units.has(id)),'分组引用无效');}}
  for(const m of e.matches){
    const valid=id=>units.has(id)||(m.exhibition&&activityUnits.has(id));assert(valid(m.a)&&(!m.b||valid(m.b))&&m.a!==m.b,'对阵引用无效');
    assert(e.stages.some(s=>s.id===m.stage)||m.stage==='extra','比赛阶段引用无效');
    assert(!m.pool||groups.has(m.pool),'比赛分组引用无效');validateRule(m.rules);
    assert(['pending','draft','completed','walkover','withdrawn','bye','cancelled'].includes(m.status),'比赛状态无效');
    assert(!m.winner||m.winner===m.a||m.winner===m.b,'胜方无效');
    if(m.status==='completed'){const r=evaluateGames(m.games,m.rules,true);assert(m.winner===(r.winner==='a'?m.a:m.b),'比分与胜方不一致');}
    else if(m.status==='draft')evaluateGames(m.games,m.rules);
    else assert(Array.isArray(m.games),'比分数据无效');
    if(m.status==='bye')assert(!m.b&&!m.games.length,'轮空不可伪造比分或存在对手');
  }
  assert(e.advancement&&Array.isArray(e.impacts)&&Array.isArray(e.audit)&&Array.isArray(e.revisions),'赛事关联数据缺失');
  for(const [id,a] of Object.entries(e.advancement)){const g=e.stages.flatMap(s=>s.groups).find(g=>g.id===id);assert(g&&a.confirmed?.length===g.units.length&&new Set(a.confirmed).size===g.units.length&&a.confirmed.every(x=>g.units.includes(x)),'人工晋级引用无效');}
  if(e.finals){assert(Array.isArray(e.finals.rows)&&e.finals.rows.length===e.units.length&&new Set(e.finals.rows.map(r=>r.unit)).size===e.units.length,'最终成绩数量不符');for(const r of e.finals.rows)assert(units.has(r.unit)&&Number.isInteger(r.from)&&Number.isInteger(r.to)&&r.from>=1&&r.to>=r.from&&r.to<=e.units.length,'最终名次无效');}
  return e;
}
export function validateData(data){
  assert(data&&data.schema===SCHEMA,'不支持的数据版本；不会自动按旧版规则转换');
  for(const key of ['players','events','templates','improvements'])unique(data[key],key);
  for(const p of data.players)assert(typeof p.name==='string'&&p.name.trim()&&['male','female','unknown'].includes(p.gender)&&typeof p.active==='boolean','队员字段无效');
  data.events.forEach(validateEvent);assert(data.settings&&typeof data.settings.operator==='string'&&Array.isArray(data.audit),'设置或日志无效');
  for(const t of data.templates){assert(typeof t.name==='string'&&t.config,'模板无效');validateRule(t.config.rule);}
  for(const i of data.improvements)assert(typeof i.title==='string'&&['todo','doing','done'].includes(i.status),'改进条目无效');
  return data;
}
export function makePackage(data,eventId=null){return {schema:BACKUP_SCHEMA,version:VERSION,kind:eventId?'event':'full',exportedAt:now(),data:eventId?clone(data.events.find(e=>e.id===eventId)):clone(data)};}
export function inspectPackage(value,current){
  assert(value?.schema===BACKUP_SCHEMA&&['event','full'].includes(value.kind),'请选择新版单届赛事包或全量备份；旧版文件请用旧版查看器读取');
  if(value.kind==='full'){validateData(value.data);return {kind:'full',action:'恢复 / 替换全库',description:`将以备份中的 ${value.data.players.length} 名队员、${value.data.events.length} 届赛事、${value.data.improvements.length} 项改进替换本机数据。导入前自动备份。`,value};}
  validateEvent(value.data);const existing=current.events.find(e=>e.id===value.data.id);
  return {kind:'event',action:existing?'替换同ID赛事':'新增赛事',description:`${value.data.title} · ${value.data.date} · ${value.data.matches.length} 场。${existing?`本机保存于 ${existing.updatedAt}，导入包保存于 ${value.data.updatedAt}。不会复制为新赛事，必须明确确认替换。`:'参赛快照随包保存，不自动把队员加入固定库。'}`,conflict:!!existing,older:existing&&value.data.updatedAt<existing.updatedAt,value};
}
export function applyPackage(current,preview){
  if(preview.kind==='full')return clone(preview.value.data);
  const next=clone(current),event=clone(preview.value.data),index=next.events.findIndex(e=>e.id===event.id);
  if(index<0)next.events.push(event);else next.events[index]=event;return next;
}
export function inspectImprovements(value,current){
  assert(value?.schema==='wku-improvements/v1'&&Array.isArray(value.items),'改进清单格式或版本无效');unique(value.items,'改进条目');
  for(const i of value.items){assert(typeof i.title==='string'&&i.title.trim()&&typeof i.description==='string'&&typeof i.module==='string'&&['高','中','低'].includes(i.priority)&&['todo','doing','done'].includes(i.status)&&typeof i.version==='string'&&typeof i.completionNote==='string'&&typeof i.createdAt==='string','改进条目字段不完整');assert(i.status!=='done'||!!i.completedAt,'已完成条目须包含完成时间');}
  const existing=value.items.filter(i=>current.improvements.some(old=>old.id===i.id)).length;return {value,existing,added:value.items.length-existing};
}
export function applyImprovements(current,preview){const next=clone(current);for(const item of preview.value.items){const index=next.improvements.findIndex(i=>i.id===item.id);if(index<0)next.improvements.push(clone(item));else next.improvements[index]=clone(item);}return next;}
