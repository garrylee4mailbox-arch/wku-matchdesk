export const clone = x => JSON.parse(JSON.stringify(x));
export const uid = (prefix = 'id') => prefix + '-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2));
export const now = () => new Date().toISOString();
export const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai'}).format(new Date());
export const time = x => x ? new Intl.DateTimeFormat('zh-CN', {timeZone:'Asia/Shanghai', dateStyle:'medium', timeStyle:'short'}).format(new Date(x)) : '—';
export function assert(ok, message) { if (!ok) throw Error(message); }
export function shuffle(items, random = Math.random) { const a = [...items]; for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }
export const terminal = m => ['completed','walkover','withdrawn','bye','cancelled'].includes(m.status);
export const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
export const statusName = s => ({pending:'未开始',draft:'进行中',completed:'已完成',walkover:'弃权',withdrawn:'退赛',bye:'轮空',cancelled:'取消 / 作废',active:'进行中',archived:'已归档',setup:'准备中'}[s] || s);
