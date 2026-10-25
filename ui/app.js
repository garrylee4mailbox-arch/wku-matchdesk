import {Repository} from './storage.js';
import {clone,esc,now,assert} from './core/util.js';
import {dashboard,history,playerPage,improvementPage} from './views/dashboard.js';
import {eventPage} from './views/event.js';
import {createPage} from './views/setup.js';
import {newDraft,captureSetup,createFromDraft} from './actions/setup.js';
import {teamActions,editTodo} from './actions/team.js';
import {tournamentActions} from './actions/tournament.js';
import {dataActions,backupPage} from './actions/data.js';
import {modal,input,toast} from './components.js';

const repo=new Repository(),state={route:'home',eventId:null,eventTab:'schedule',matchFilter:'all',playerQuery:'',historyQuery:'',showInactive:false,todoFilter:'all',draft:newDraft(),past:false};
const ctx={repo,state,copy:()=>clone(repo.data),operator:()=>repo.data.settings.operator,event:()=>repo.data.events.find(e=>e.id===state.eventId),render,
  async save(next,action,reason=''){await repo.commit(next,action,reason);render();},
  async mutateEvent(action,fn,allowArchive=false){const next=clone(repo.data),e=next.events.find(e=>e.id===state.eventId);assert(e,'请选择赛事');assert(allowArchive||e.status!=='archived','此届已归档，请先在成绩页进入修订流程');
    const before={config:clone(e.config),units:clone(e.units),stages:clone(e.stages),matches:clone(e.matches),finals:clone(e.finals)},auditLength=e.audit.length;
    const reason=[...document.querySelectorAll('dialog[open] [name=reason]')].at(-1)?.value?.trim()||'现场明确操作';
    await fn(e);e.updatedAt=now();if(e.audit.length===auditLength||!['录入比分','确认晋级位置','确认下一阶段','确认最终成绩','归档赛事','修订归档赛事'].includes(action))e.audit.push({at:now(),operator:ctx.operator(),action,reason,before,after:{config:clone(e.config),units:clone(e.units),stages:clone(e.stages),matches:clone(e.matches),finals:clone(e.finals)}});await ctx.save(next,action);
  }
};
const nav=[['home','⌂','赛事台'],['players','♧','队员名单'],['history','▤','历届档案'],['improvements','☑','待改进'],['backup','◈','保存与备份']];
function render(){if(!repo.data)return;if(state.route==='event'&&!ctx.event())state.route='home';let content;
  if(state.route==='create')content=createPage(repo.data,state.draft);
  else if(state.route==='players')content=playerPage(repo.data,state.playerQuery,state.showInactive);
  else if(state.route==='history')content=history(repo.data,state.historyQuery);
  else if(state.route==='improvements')content=improvementPage(repo.data,state.todoFilter);
  else if(state.route==='backup')content=backupPage(ctx);
  else if(state.route==='event')content=eventPage(ctx.event(),state.eventTab,state.matchFilter);
  else content=dashboard(repo.data);
  const routeTitle=state.route==='event'?ctx.event().title:nav.find(n=>n[0]===state.route)?.[2]||'创建赛事';
  document.querySelector('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><img src="/mark.svg" alt="羽毛球标志"><div><b>WKU</b><small>BADMINTON CLUB</small></div></div><div class="nav-label">比赛与队伍</div><nav class="nav" aria-label="主导航">${nav.map(([v,icon,t])=>`<button data-action="route-${v}" class="${state.route===v||v==='home'&&['event','create'].includes(state.route)?'active':''}"><span>${icon}</span>${t}</button>`).join('')}</nav><div class="sidebar-foot"><span class="dot"></span>离线模式 · 本机保存<p>每一场认真对待<br>每一步有据可查</p><p>WKU MATCH DESK / v1.0.0</p></div></aside><div class="workspace"><header class="topbar"><div class="crumb">校队工作台 <b>/ ${esc(routeTitle)}</b></div><div class="top-actions"><span id="save-status" class="saved ${repo.failed?'error':''}">${repo.failed?'保存失败 · 请重新载入':'● 已保存到本机文件'}</span><button data-action="reload" class="small quiet" ${repo.failed?'':'hidden'}>重新载入</button><button data-action="operator" class="small quiet">记录员：${esc(ctx.operator())}</button><button data-action="undo" class="small" ${repo.history.length?'':'disabled'}>↶ 撤销</button><button data-action="backup" class="small">导出备份 ↗</button></div></header><main>${content}<footer class="footer">WENZHOU-KEAN UNIVERSITY · BADMINTON MATCH DESK</footer></main></div></div>`;
}
repo.onstatus=status=>{const el=document.querySelector('#save-status');if(el){el.textContent={saving:'正在保存到本机…',saved:'● 已保存到本机文件',error:'保存失败 · 请重新载入'}[status];el.classList.toggle('error',status==='error');}if(status==='error'){const reload=document.querySelector('[data-action=reload]');if(reload)reload.hidden=false;}};
const actions={...teamActions(ctx),...tournamentActions(ctx),...dataActions(ctx),
  create:()=>{state.past=false;state.route='create';state.draft=newDraft();render();},'past-event':()=>{state.past=true;state.route='create';state.draft=newDraft();state.draft.title='历史赛事补录';render();},
  'open-event':el=>{if(el.dataset.closeDialog)el.closest('dialog')?.querySelector('[data-close]')?.click();state.eventId=el.dataset.id;state.eventTab='schedule';state.route='event';state.matchFilter='all';render();},
  'event-tab':el=>{state.eventTab=el.dataset.tab;render();},
  'select-all':()=>{const form=document.querySelector('#create-form'),boxes=[...form.querySelectorAll('[name=player]')],all=boxes.every(b=>b.checked);boxes.forEach(b=>b.checked=!all);captureSetup(ctx,form);document.querySelector('#selected-count').textContent=state.draft.selected.length+' 人已选';},
  operator:async()=>{await modal('选择本地操作者',input('operator','记录员 / 管理员姓名',ctx.operator(),'text','required maxlength="60"'),{onSubmit:async f=>{const next=ctx.copy();next.settings.operator=String(f.get('operator')).trim();assert(next.settings.operator,'姓名不能为空');await ctx.save(next,'切换本地操作者');return true;}});},
  reload:async()=>{await repo.load();repo.failed=false;repo.history=[];render();toast('已重新读取本机数据');}
};
document.addEventListener('click',async event=>{const el=event.target.closest('[data-action]');if(!el||el.disabled)return;event.preventDefault();try{const action=el.dataset.action;if(action.startsWith('route-')){state.route=action.slice(6);render();window.scrollTo(0,0);}else if(actions[action])await actions[action](el);}catch(e){toast(e.message||'操作失败',true);}});
document.addEventListener('submit',async event=>{if(event.target.id!=='create-form')return;event.preventDefault();try{captureSetup(ctx,event.target);await createFromDraft(ctx);}catch(e){toast(e.message,true);}});
document.addEventListener('change',async event=>{const el=event.target;try{
  if(el.closest('#create-form')){captureSetup(ctx,el.closest('form'));if(el.name==='template'){
    const template=el.value==='last'?repo.data.events.at(-1):repo.data.templates.find(t=>t.id===el.value);if(template)state.draft.config=clone(template.config);else if(el.value==='last')toast('还没有上一届赛事');render();
  }else if(el.name==='type')render();else {const count=document.querySelector('#selected-count');if(count)count.textContent=state.draft.selected.length+' 人已选';}}
  if(el.id==='show-inactive'){state.showInactive=el.checked;render();}if(el.id==='match-filter'){state.matchFilter=el.value;render();}if(el.id==='todo-filter'){state.todoFilter=el.value;render();}
  if(el.dataset.todo){const item=repo.data.improvements.find(i=>i.id===el.dataset.todo);await editTodo(ctx,item.id,el.checked?'done':'todo');render();}
}catch(e){toast(e.message,true);}});
for(const [id,key] of [['player-search','playerQuery'],['history-search','historyQuery']])document.addEventListener('input',event=>{if(event.target.id!==id)return;const position=event.target.selectionStart;state[key]=event.target.value;render();const el=document.getElementById(id);el?.focus();el?.setSelectionRange(position,position);});
window.addEventListener('beforeunload',event=>{if(repo.busy){event.preventDefault();event.returnValue='正在保存';}});
try{await repo.load();render();}catch(e){document.querySelector('#app').innerHTML=`<div class="loading"><h1>无法读取本机数据</h1><p>${esc(e.message)}</p><p>请确认程序仍在运行，并从托盘菜单重新打开。现有文件不会自动清空。</p></div>`;}
