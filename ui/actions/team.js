import {modal,input,select,confirm,button,badge,chooseFile,download,toast} from '../components.js';
import {inspectImprovements,applyImprovements} from '../core/backup.js';
import {esc,now,uid,time} from '../core/util.js';
import {makePlayer} from '../core/players.js';
import {inferResults} from '../core/ranking.js';
export async function editPlayer(ctx,id=null,temporary=false){
  const old=ctx.repo.data.players.find(p=>p.id===id);
  return modal(old?'编辑队员':temporary?'新增临时队员':'新增固定队员',`<div class="field-stack">${input('name','姓名',old?.name||'','text','required maxlength="60"')}${select('gender','性别',[['unknown','未知（不根据姓名猜测）'],['male','男'],['female','女']],old?.gender||'unknown')}${input('note','备注（重名时用于区分）',old?.note||'')}<label class="check"><input name="temporary" type="checkbox" ${(old?.temporary??temporary)?'checked':''}>临时队员（取消勾选即可转固定）</label>${old?`<label class="check"><input name="active" type="checkbox" ${old.active?'checked':''}>启用（停用仍保留所有历史关联）</label><small>编号：${esc(old.id)}。编辑姓名不会修改过去赛事快照。</small>`:''}</div>`,{onSubmit:async f=>{
    const name=String(f.get('name')).trim(),duplicates=ctx.repo.data.players.filter(p=>p.name===name&&p.id!==id);
    if(duplicates.length&&!await confirm('发现同名队员',`已存在 ${duplicates.length} 个“${name}”档案。如为同一人，请取消并使用原档案。确为不同人时可确认建立，并填写区别备注。`))return false;
    const next=ctx.copy();if(old){Object.assign(next.players.find(p=>p.id===id),{name,gender:f.get('gender'),note:String(f.get('note')),temporary:f.has('temporary'),active:f.has('active')});if(!name)throw Error('姓名不能为空');}else next.players.push(makePlayer(name,f.get('gender'),f.has('temporary'),String(f.get('note'))));
    await ctx.save(next,old?'编辑队员':'新增队员');return true;
  }});
}
export async function playerProfile(ctx,id){const player=ctx.repo.data.players.find(p=>p.id===id),entries=[];for(const e of ctx.repo.data.events){for(const u of e.units.filter(u=>u.members.some(p=>p.id===id)||u.currentMembers?.some(p=>p.id===id)||e.substitutions?.some(s=>s.unit===u.id&&s.members.some(p=>p.id===id)))){const result=(e.finals?.rows||inferResults(e)).find(r=>r.unit===u.id);entries.push({e,u,result});}}
  await modal(player.name+' · 个人历届成绩',entries.length?entries.map(({e,u,result})=>`<section class="panel" style="margin-bottom:10px"><h3>${esc(e.title)}</h3><small>${esc(e.date)} · ${e.config.type==='doubles'?'固定双打 · 搭档 '+esc(u.members.filter(p=>p.id!==id).map(p=>p.name).join('/')):'单打'}</small><p>${result?`${result.from===result.to?result.from:result.from+'—'+result.to} 名 · ${esc(result.status)}`:'名次未决'} ${badge(e.finals?'已确认':'未确认')}</p>${button('open-event','查看完整过程','small',`data-id="${e.id}" data-close-dialog="true"`)}</section>`).join(''):'<p class="muted">尚无参赛记录。每届快照使用稳定编号关联，改名或停用不会丢失历史。</p>',{confirm:'关闭'});
}
export async function editTodo(ctx,id=null,targetStatus=null){
  const saved=ctx.repo.data.improvements.find(i=>i.id===id),old=saved?{...saved,status:targetStatus||saved.status}:null;
  return modal(old?'编辑改进项':'记录待改进',`<div class="field-stack">${input('title','标题',old?.title||'','text','required maxlength="150"')}<label>描述<textarea name="description">${esc(old?.description||'')}</textarea></label><div class="fields">${input('module','所属模块',old?.module||'其他')}${select('priority','优先级',[['高','高'],['中','中'],['低','低']],old?.priority||'中')}${select('status','状态',[['todo','待处理'],['doing','进行中'],['done','已完成']],old?.status||'todo')}${input('version','对应版本',old?.version||'1.0.0')}</div><label>完成说明 / 剩余内容<textarea name="completionNote">${esc(old?.completionNote||'')}</textarea></label></div>`,{onSubmit:async f=>{
    const next=ctx.copy(),item=old?next.improvements.find(i=>i.id===id):{id:uid('todo'),createdAt:now()};for(const k of ['title','description','module','priority','status','version','completionNote'])item[k]=String(f.get(k)).trim();if(!item.title)throw Error('标题不能为空');item.completedAt=item.status==='done'?(item.completedAt||now()):null;if(!old)next.improvements.push(item);await ctx.save(next,old?'编辑改进项':'新增改进项');return true;
  }});
}
export function teamActions(ctx){return {
  'player-add':()=>editPlayer(ctx), 'player-temp':()=>editPlayer(ctx,null,true), 'player-edit':el=>editPlayer(ctx,el.dataset.id),'player-profile':el=>playerProfile(ctx,el.dataset.id),
  'seed-roster':async()=>{const names=['富泽宇','邹子慕','胡恩泽','何歆彤','朱政德','夏熠然','朱序元','杨清雅','司逸湘','李冠霖'],missing=names.filter(name=>!ctx.repo.data.players.some(p=>p.name===name));if(!missing.length)throw Error('这些姓名已在队员库中');if(!await confirm('从旧资料整理可编辑名单',`将新增：${missing.join('、')}。这些姓名来自旧程序与回归案例，只是可编辑的初始资料，并非完整校队名单；性别全部保留未知，记录员不自动参赛。`))return;const next=ctx.copy();missing.forEach(name=>next.players.push(makePlayer(name)));await ctx.save(next,'从旧资料初始化名单');},
  'todo-add':()=>editTodo(ctx),'todo-edit':el=>editTodo(ctx,el.dataset.id),
  'todo-export':()=>download(JSON.stringify({schema:'wku-improvements/v1',version:ctx.repo.data.version,exportedAt:now(),items:ctx.repo.data.improvements},null,2),'WKU-improvements.json'),
  'todo-import':async()=>{const file=await chooseFile();if(!file)return;if(file.size>2*1024*1024)throw Error('改进清单超过2MB');const preview=inspectImprovements(JSON.parse(await file.text()),ctx.repo.data);if(!await confirm('导入改进清单',`将新增 ${preview.added} 项、更新相同ID的 ${preview.existing} 项。其他本地条目保留；更新前自动备份。每项对应版本与完成说明随清单保存。`))return;await ctx.save(applyImprovements(ctx.repo.data,preview),'导入版本改进清单');toast('改进清单与版本状态已更新');}
};}
