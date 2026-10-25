import {fresh} from './core/initial.js';
import {validateData} from './core/backup.js';
import {clone,now} from './core/util.js';
export class Repository {
  constructor(){this.data=null;this.revision=0;this.history=[];this.historyMeta=[];this.path='';this.onstatus=()=>{};this.busy=false;this.failed=false;}
  async request(path,options={}){
    const r=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
    if(!r.ok){let message=await r.text();try{message=JSON.parse(message).error||message;}catch{}throw Error(message||'本机服务连接失败');}
    return r.json();
  }
  async load(){const v=await this.request('state');this.revision=v.revision;this.path=v.path;this.data=v.data||fresh();validateData(this.data);if(!v.data)await this.commit(clone(this.data),'初始化数据');return this.data;}
  async commit(next,action,reason='',{undo=true,view=null}={}){
    if(this.busy)throw Error('上次保存仍在进行，请稍后再试');if(this.failed)throw Error('保存曾失败，请先重新载入本机数据，避免覆盖另一窗口');
    validateData(next);this.busy=true;this.onstatus('saving');
    next.audit.push({at:now(),operator:next.settings.operator,action,reason});
    try{
      const v=await this.request('state',{method:'PUT',headers:{'If-Match':String(this.revision)},body:JSON.stringify(next)});
      if(undo&&this.data){this.history.push(clone(this.data));this.historyMeta.push({action,reason,view:view?clone(view):null});}if(this.history.length>20){this.history.shift();this.historyMeta.shift();}
      this.data=next;this.revision=v.revision;this.onstatus('saved');return next;
    }catch(e){this.failed=true;this.onstatus('error');throw e;}finally{this.busy=false;}
  }
  get previousStep(){return this.historyMeta.at(-1)||null;}
  async undo(){
    if(!this.history.length)throw Error('本次打开期间没有可回到的上一步；重新打开后的旧记录可从自动快照恢复');
    const previous=clone(this.history.at(-1)),step=this.previousStep?clone(this.previousStep):null;
    await this.commit(previous,'回到上一步','已放弃最近一次操作：'+(step?.action||'保存内容'),{undo:false});
    this.history.pop();this.historyMeta.pop();return step;
  }
  async backups(){return this.request('backups');}
  async readBackup(name){return this.request('backups/'+encodeURIComponent(name));}
}
