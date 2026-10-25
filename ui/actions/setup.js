import {clone,today,shuffle,assert} from '../core/util.js';
import {DEFAULT_CONFIG,createEvent,makeGroups,startEvent,schedulePreview,randomizeWithLocks} from '../core/tournament.js';
import {makeUnits} from '../core/players.js';
import {confirm,toast} from '../components.js';
import {readRule} from '../views/setup.js';

export function newDraft(){return {step:1,title:'WKU 羽毛球队内赛',date:today(),config:clone(DEFAULT_CONFIG),selected:[],pairs:[],template:'',preview:null};}
export function syncPairs(d){
  if(d.config.type!=='doubles'){d.pairs=[];return;}
  const ids=d.pairs.flat();
  if(ids.length===d.selected.length&&new Set(ids).size===ids.length&&ids.every(id=>d.selected.includes(id)))return;
  d.pairs=Array.from({length:Math.floor(d.selected.length/2)},(_,i)=>d.selected.slice(i*2,i*2+2));
}
// Each page captures only its own controls; hidden pages keep their draft values.
export function captureSetupData(d,f){
  const c=d.config;
  if(d.step===1){
    const rosterBefore=JSON.stringify(d.selected),typeBefore=c.type;
    d.title=String(f.get('title')||'');d.date=String(f.get('date')||'');
    c.type=f.get('type');const scope=f.get('scope');c.mixed=scope==='all';if(!c.mixed)c.gender=scope;
    d.selected=f.getAll('player');const ids=f.getAll('pair');
    d.pairs=Array.from({length:Math.floor(ids.length/2)},(_,i)=>ids.slice(i*2,i*2+2));
    if(rosterBefore!==JSON.stringify(d.selected)||typeBefore!==c.type)syncPairs(d);
  }else if(d.step===2){
    d.template=String(f.get('template')||'');c.format=f.get('format');
    if(f.has('groups'))c.groups=Number(f.get('groups'));
    if(f.has('qualify'))c.qualify=Number(f.get('qualify'));
    c.rule=readRule(f);if(f.has('stageMode'))c.stageRule=f.get('stageMode')==='custom'?(f.has('stage-target')?readRule(f,'stage'):clone(c.rule)):null;
    c.sort=Array.from({length:5},(_,i)=>f.get('sort-'+i)).filter(Boolean);
    c.displayTop=Number(f.get('displayTop'));if(f.has('bronze'))c.bronze=f.get('bronze')==='yes';
  }else if(d.step===3&&d.preview){
    const {event,groups}=d.preview;
    for(const g of groups)g.units=[];
    for(const u of event.units){const index=Number(f.get('unit-'+u.id));assert(Number.isInteger(index)&&groups[index],'请选择有效的组别');groups[index].units.push(u.id);}
    const locks=f.getAll('lock');for(const g of groups)g.locked=g.units.filter(id=>locks.includes(id));
  }
  return d;
}
export function captureSetup(ctx,form){return captureSetupData(ctx.state.draft,new FormData(form));}
export function validateParticipants(data,d){
  assert(d.title.trim(),'请填写赛事名称');assert(/^\d{4}-\d{2}-\d{2}$/.test(d.date),'请填写比赛日期');
  const players=d.selected.map(id=>data.players.find(p=>p.id===id&&p.active));
  assert(players.every(Boolean),'部分队员已停用或不存在，请重新选择名单');assert(new Set(d.selected).size===players.length,'参赛名单不能重复');
  assert(['singles','doubles'].includes(d.config.type),'请选择单打或双打');
  assert(players.length>=(d.config.type==='doubles'?4:2),d.config.type==='doubles'?'双打至少需要四人 / 两对':'单打至少需要两人');
  if(!d.config.mixed){
    const invalid=players.filter(p=>p.gender!==d.config.gender);
    assert(!invalid.length,`本届仅限${d.config.gender==='male'?'男子':'女子'}参赛，请调整名单或队员性别：${invalid.map(p=>p.name).join('、')}`);
  }
  if(d.config.type==='doubles'){
    assert(players.length%2===0,'双打人数为奇数，请调整名单，系统不会自动删除队员');
    makeUnits(players,'doubles',d.pairs);
  }
  return players;
}
export function effectiveConfig(d){
  const c=clone(d.config);
  if(c.format==='roundrobin'){c.groups=1;c.qualify=1;c.stageRule=null;c.bronze=false;}
  if(c.format==='placement'){c.qualify=1;c.bronze=false;}
  return {...c,date:d.date};
}
export function preparePreview(data,d){
  const players=validateParticipants(data,d),config=effectiveConfig(d);
  const signature=JSON.stringify({title:d.title,date:d.date,players,pairs:d.pairs,config});
  if(d.preview?.signature===signature)return d.preview;
  const event=createEvent(d.title,makeUnits(players,config.type,d.pairs),config);
  assert(Number.isInteger(config.displayTop)&&config.displayTop>=1&&config.displayTop<=999,'展示名次须为1到999之间的整数');
  const groups=makeGroups(event);
  if(config.format==='knockout')assert(groups.reduce((sum,g)=>sum+Math.min(g.units.length,config.qualify),0)>=2,'至少需要两名 / 两对晋级，才能进行淘汰赛');
  d.preview={signature,event,groups};return d.preview;
}
export function validatePreview(d){
  const {event,groups}=d.preview;
  const checked=makeGroups(event,groups.map(g=>g.units));
  checked.forEach((g,i)=>{g.locked=groups[i].locked||[];});
  if(event.config.format==='knockout')assert(checked.reduce((sum,g)=>sum+Math.min(g.units.length,event.config.qualify),0)>=2,'当前分组至少需要两名 / 两对晋级');
  return {groups:checked,summary:schedulePreview(event,checked)};
}
export async function createFromDraft(ctx){
  const d=ctx.state.draft;
  if(d.step===1){validateParticipants(ctx.repo.data,d);d.step=2;ctx.render();return;}
  if(d.step===2){preparePreview(ctx.repo.data,d);d.step=3;ctx.render();return;}
  preparePreview(ctx.repo.data,d);const {groups}=validatePreview(d),event=clone(d.preview.event);
  if(ctx.state.past){
    if(!await confirm('创建过去赛事补录档案','仅创建补录档案，不会生成赛程或完成任何比赛。缺失比分和名次可在管理员中如实补录。'))return;
    event.status='active';event.importedPast=true;
  }else startEvent(event,groups);
  const next=ctx.copy();next.events.push(event);
  await ctx.save(next,ctx.state.past?'创建历史补录赛事':'创建并确认赛事','已核对参赛名单、赛制、分组与场数');
  ctx.state.route='event';ctx.state.eventId=event.id;ctx.state.eventTab=ctx.state.past?'admin':'schedule';ctx.render();
  toast(ctx.state.past?'补录档案已建立':'赛程已生成，可以开始记分');
}
export function setupActions(ctx){return {
  'setup-back':()=>{const d=ctx.state.draft;d.step=Math.max(1,d.step-1);ctx.render();window.scrollTo(0,0);},
  'setup-random-pairs':()=>{const d=ctx.state.draft;assert(d.selected.length>=4&&d.selected.length%2===0,'请先选择偶数名队员，且至少四人');const ids=shuffle(d.selected);d.pairs=Array.from({length:ids.length/2},(_,i)=>ids.slice(i*2,i*2+2));ctx.render();},
  'setup-random-groups':()=>{const {event,groups}=ctx.state.draft.preview;const locks=groups.flatMap(g=>g.locked||[]);const assignments=randomizeWithLocks(event,groups.map(g=>g.units),locks);groups.forEach((g,i)=>{g.units=assignments[i];g.locked=g.units.filter(id=>locks.includes(id));});ctx.render();},
  'select-all':()=>{const form=document.querySelector('#create-form'),boxes=[...form.querySelectorAll('[name=player][data-eligible=true]')],all=boxes.length&&boxes.every(b=>b.checked);boxes.forEach(b=>b.checked=!all);captureSetup(ctx,form);ctx.render();}
};}
