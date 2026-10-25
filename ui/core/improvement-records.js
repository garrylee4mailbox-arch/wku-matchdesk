import {VERSION} from './initial.js';
import {assert,uid,now} from './util.js';

// Version is compatibility metadata; users only edit the problem itself.
export function saveImprovement(data,fields,id=null){
  const index=id?data.improvements.findIndex(item=>item.id===id):-1;
  assert(!id||index>=0,'这条问题已不存在，请重新打开待改进页面');
  const old=index>=0?data.improvements[index]:null;
  const item=old?{...old}:{id:uid('todo'),createdAt:now(),version:VERSION};
  for(const key of ['title','description','module','priority','status','completionNote'])item[key]=String(fields[key]??'').trim();
  assert(item.title,'标题不能为空');
  item.completedAt=item.status==='done'?(item.completedAt||now()):null;
  if(old)data.improvements[index]=item;else data.improvements.push(item);
  return item;
}
