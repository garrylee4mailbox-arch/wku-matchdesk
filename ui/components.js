import {esc} from './core/util.js';
export function button(action,text,cls='',attrs=''){return `<button data-action="${action}" class="${cls}" ${attrs}>${text}</button>`;}
export function empty(title,description,action=''){return `<div class="empty"><div class="empty-mark">⌁</div><h2>${esc(title)}</h2><p>${esc(description)}</p>${action}</div>`;}
export const badge=(text,cls='')=>`<span class="badge ${cls}">${esc(text)}</span>`;
export function toast(message,error=false){const el=document.querySelector('#toast');el.className='toast'+(error?' error':'');el.textContent=message;clearTimeout(toast.timer);toast.timer=setTimeout(()=>{el.className='';el.textContent='';},error?10000:4500);}
export function modal(title,body,{confirm='保存',onSubmit,secondary=null}={}){
  return new Promise(resolve=>{
    const d=document.createElement('dialog');d.innerHTML=`<form><div class="dialog-head"><h2>${esc(title)}</h2></div><div class="dialog-body">${body}<div class="dialog-error" role="alert"></div></div><div class="dialog-actions"><button type="button" data-close>取消</button>${secondary?`<button type="submit" name="intent" value="secondary">${esc(secondary)}</button>`:''}<button class="primary" type="submit" name="intent" value="confirm">${esc(confirm)}</button></div></form>`;document.body.append(d);
    const finish=value=>{d.close();d.remove();resolve(value);};d.querySelector('[data-close]').onclick=()=>finish(null);d.oncancel=e=>{e.preventDefault();finish(null);};
    d.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.target,buttons=[...d.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{const value=onSubmit?await onSubmit(new FormData(form),form,e.submitter?.value||'confirm'):true;if(value!==false)finish(value??true);}catch(error){d.querySelector('.dialog-error').textContent=error.message;}finally{buttons.forEach(b=>b.disabled=false);}};
    d.showModal();
  });
}
export const confirm=(title,message)=>modal(title,`<p>${esc(message).replace(/\n/g,'<br>')}</p>`,{confirm:'确认继续'});
export const input=(name,label,value='',type='text',extra='')=>`<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
export const select=(name,label,items,value,extra='')=>`<label>${esc(label)}<select name="${name}" ${extra}>${items.map(([v,t])=>`<option value="${esc(v)}" ${v===String(value)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
export const genderName = g=>({male:'男',female:'女',unknown:'性别未知'}[g]||'性别未知');
export function download(content,name,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
export async function chooseFile(){return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.accept='.json';input.onchange=()=>resolve(input.files[0]);input.oncancel=()=>resolve(null);input.click();});}
export const unitOptions=(e,includeActivities=false)=>[...e.units,...(includeActivities?e.activityUnits||[]:[])].map(u=>[u.id,u.name]);
