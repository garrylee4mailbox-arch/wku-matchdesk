import {clone,today,shuffle,esc,assert,now} from '../core/util.js';
import {DEFAULT_CONFIG,createEvent,makeGroups,startEvent,schedulePreview,randomizeWithLocks} from '../core/tournament.js';
import {makeUnits} from '../core/players.js';
import {modal,select,confirm,toast} from '../components.js';
import {readRule} from '../views/setup.js';
export function newDraft(){return {title:'WKU 羽毛球队内赛',date:today(),config:clone(DEFAULT_CONFIG),selected:[],template:''};}
export function captureSetup(ctx,form){const f=new FormData(form),d=ctx.state.draft;d.title=String(f.get('title'));d.date=String(f.get('date'));d.template=String(f.get('template'));d.selected=f.getAll('player');Object.assign(d.config,{type:f.get('type'),mixed:f.get('mixed')==='true',gender:f.get('gender'),format:f.get('format'),groups:Number(f.get('groups')),qualify:Number(f.get('qualify')),rule:readRule(f),stageRule:f.has('stageOverride')?readRule(f,'stage'):null,sort:String(f.get('sort')).split(',').map(s=>s.trim()).filter(Boolean),displayTop:Number(f.get('displayTop')),bronze:f.has('bronze')});}
export async function createFromDraft(ctx){
  const d=ctx.state.draft,players=d.selected.map(id=>ctx.repo.data.players.find(p=>p.id===id));let pairs=[];
  if(d.config.type==='doubles'){
    assert(players.length>=4,'双打至少需要四人 / 两对');assert(players.length%2===0,'已选人数为奇数，请调整，系统不会删除选手');
    const initial=shuffle(players).map(p=>p.id);
    const result=await modal('固定双打 · 确认搭档',`<div class="note">每两格组成一对，同一人在本届只出现一次。随机配对后可逐一修改。</div><div class="field-stack">${Array.from({length:players.length/2},(_,i)=>`<div class="fields">${select('pair','第 '+(i+1)+' 对 · 队员 1',players.map(p=>[p.id,p.name]),initial[i*2])}${select('pair','队员 2',players.map(p=>[p.id,p.name]),initial[i*2+1])}</div>`).join('')}</div>`,{confirm:'确认固定搭档',secondary:'重新随机配对',onSubmit:(f,form,intent)=>{if(intent==='secondary'){const ids=shuffle(players.map(p=>p.id));form.querySelectorAll('[name=pair]').forEach((s,i)=>s.value=ids[i]);return false;}const ids=f.getAll('pair');assert(new Set(ids).size===players.length,'队员重复，请重新指定搭档');pairs=Array.from({length:ids.length/2},(_,i)=>ids.slice(i*2,i*2+2));return true;}});
    if(!result)return;
  }
  const units=makeUnits(players,d.config.type,pairs),event=createEvent(d.title,units,{...d.config,date:d.date});
  if(ctx.state.past){
    const done=await confirm('创建过去赛事补录档案','不会自动生成或完成任何比赛。可以手动添加有依据的比分，并把缺失名次标记为未决或近似。');if(!done)return;
    event.status='active';event.importedPast=true;const next=ctx.copy();next.events.push(event);ctx.state.route='event';ctx.state.eventId=event.id;ctx.state.eventTab='admin';await ctx.save(next,'创建历史补录赛事');return;
  }
  const groups=makeGroups(event),choices=groups.map((g,i)=>[String(i),g.name]);
  await modal('预览分组 · 确认前可自由调整',`<div class="note">可随机或手动分组。不分种子档。每组至少一个参赛单位，奇数 / 不等组人数会在下一步展示处理方案。勾选锁定后，重新随机会保留该选手组别。</div><div class="field-stack">${units.map(u=>`<div class="fields">${select('unit-'+u.id,u.name,choices,String(groups.findIndex(g=>g.units.includes(u.id))))}<label class="check"><input type="checkbox" name="lock" value="${u.id}">随机时锁定组别</label></div>`).join('')}</div>`,{confirm:'检查规模并生成',secondary:'重新随机分组',onSubmit:async(f,form,intent)=>{
    if(intent==='secondary'){const current=groups.map(()=>[]);units.forEach(u=>current[Number(f.get('unit-'+u.id))].push(u.id));const randomized=randomizeWithLocks(event,current,f.getAll('lock'));randomized.forEach((ids,i)=>ids.forEach(id=>form.querySelector(`[name="unit-${id}"]`).value=String(i)));return false;}
    const assignments=groups.map(()=>[]);units.forEach(u=>assignments[Number(f.get('unit-'+u.id))].push(u.id));const actual=makeGroups(event,assignments),p=schedulePreview(event,actual);
    const detail=`第一阶段 ${p.first} 场；后续预计 ${p.second} 场；总计约 ${p.total} 场。\n${actual.map(g=>g.name+'：'+g.units.map(id=>units.find(u=>u.id===id).name).join('、')).join('\n')}\n\n${p.perUnit.map(u=>units.find(x=>x.id===u.id).name+'：小组 '+u.first+' 场；后续 '+(u.second===null?'取决于晋级与轮空':u.second+' 场')).join('\n')}\n\n${p.details.join('\n')}${p.uneven?'\n分组人数不整齐，缺少对应名次的组将不提供该名次选手，不补造参赛者。':''}`;
    if(!await confirm('确认赛程规模与名单',detail))return false;
    actual.forEach(g=>g.locked=g.units.filter(id=>f.getAll('lock').includes(id)));startEvent(event,actual);const next=ctx.copy();next.events.push(event);ctx.state.route='event';ctx.state.eventId=event.id;ctx.state.eventTab='schedule';await ctx.save(next,'创建并确认赛事','已预览总场数和分组');toast('赛程已生成，可以开始记分');return true;
  }});
}
