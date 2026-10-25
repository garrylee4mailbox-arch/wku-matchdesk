import {assert} from './util.js';

export function cancelEvent(data,id){
  const event=data.events.find(e=>e.id===id);assert(event,'本届赛事已不存在，请重新查看赛事台');
  assert(event.status!=='archived','归档赛事请先进入修订，再取消记录');
  data.events=data.events.filter(e=>e.id!==id);
  return {id:event.id,title:event.title,matches:event.matches.length};
}
