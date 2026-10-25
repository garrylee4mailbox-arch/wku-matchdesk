import {uid,now,assert,clone} from './util.js';
export function makePlayer(name,gender='unknown',temporary=false,note=''){
  assert(name?.trim(),'请填写姓名'); assert(['male','female','unknown'].includes(gender),'性别无效');
  return {id:uid('p'),name:name.trim(),gender,temporary,active:true,note,createdAt:now()};
}
export function makeUnits(players,type,pairs=[]){
  assert(players.length>=(type==='doubles'?2:1),'所选队员不足以组成参赛单位');
  assert(new Set(players.map(p=>p.id)).size===players.length,'参赛者重复');
  if(type==='singles')return players.map(p=>({id:uid('u'),members:[clone(p)],name:p.name}));
  assert(players.length%2===0,'双打人数为奇数，请调整名单或添加临时队员');
  assert(pairs.length===players.length/2,'请为全部队员指定固定搭档');
  const ids=pairs.flat(); assert(ids.length===new Set(ids).size&&ids.every(id=>players.some(p=>p.id===id)),'搭档重复或不在本届名单中');
  return pairs.map(pair=>{const members=pair.map(id=>clone(players.find(p=>p.id===id)));return {id:uid('u'),members,name:members.map(p=>p.name).join(' / ')};});
}
