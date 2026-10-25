const priority={高:0,中:1,低:2};
export function sortedImprovements(items,filter='all'){
  return items.filter(item=>filter==='all'||item.status===filter).sort((a,b)=>
    Number(a.status==='done')-Number(b.status==='done')||
    (priority[a.priority]??3)-(priority[b.priority]??3));
}
