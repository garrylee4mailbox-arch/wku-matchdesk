import {movePlan,previewRound} from './core/advancement.js';
import {advancementWorkspace} from './views/advancement.js';

export function bindAdvancement(dialog,event,plan){
  const host=dialog.querySelector('[data-advancement-workspace]');let pointer=null;
  function render(message=''){
    const opened=[...host.querySelectorAll('[data-manual-lane][open]')].map(el=>el.dataset.manualLane);
    let suggestion=null,error='';
    if(plan.kind!=='group')try{suggestion=previewRound(event,plan);}catch(e){error=e.message;}
    host.innerHTML=advancementWorkspace(event,plan,suggestion,error);
    for(const el of host.querySelectorAll('[data-manual-lane]'))el.open=opened.includes(el.dataset.manualLane);
    host.querySelector('[data-drag-status]').textContent=message;
    dialog.querySelector('button[value=confirm]').disabled=!!error;
  }
  function move(key,from,to){
    movePlan(plan,key,from,to);render('顺序已调整，对阵预览已更新。');
    const list=[...host.querySelectorAll('[data-order-list]')].find(el=>el.dataset.orderList===key);
    list?.querySelector(`[data-order-index="${to}"]`)?.focus({preventScroll:true});
  }
  host.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button||button.disabled)return;
    if(button.hasAttribute('data-order-move')){
      e.preventDefault();const row=button.closest('[data-order-index]'),list=row.closest('[data-order-list]');move(list.dataset.orderList,Number(row.dataset.orderIndex),Number(row.dataset.orderIndex)+Number(button.dataset.orderMove));
    }else if(button.hasAttribute('data-order-reset')){
      e.preventDefault();const group=plan.groups.find(group=>group.id===button.dataset.orderReset);group.order=[...group.suggested];plan.draw=null;render('已恢复自动统计顺序。');
    }else if(button.hasAttribute('data-reset-draw')){e.preventDefault();plan.draw=null;render('已恢复建议对阵。');}
  });
  host.addEventListener('change',e=>{
    const field=e.target;if(!field.hasAttribute('data-slot-lane'))return;
    const lane=plan.draw.find(lane=>lane.key===field.dataset.slotLane);lane.slots[Number(field.dataset.slotIndex)]=field.value||null;render('已更换参赛者，请核对对阵与调整依据。');
  });
  host.addEventListener('keydown',e=>{
    if(!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;
    const row=e.target.closest('[data-order-index]');if(!row)return;
    const list=row.closest('[data-order-list]'),from=Number(row.dataset.orderIndex),to=from+(e.key==='ArrowUp'?-1:1);
    const length=list.querySelectorAll('[data-order-index]').length;
    e.preventDefault();if(to>=0&&to<length)move(list.dataset.orderList,from,to);
  });
  // Pointer events support mouse, pen and a touch handle, with the same
  // ordering rules as the keyboard buttons. No native HTML drag dependency.
  const clearMarks=()=>{for(const el of host.querySelectorAll('.dragging,.drop-target'))el.classList.remove('dragging','drop-target');};
  host.addEventListener('pointerdown',e=>{
    if(e.button!==0||e.target.closest('button,input,select,summary'))return;
    if(e.pointerType==='touch'&&!e.target.closest('.drag-grip'))return;
    const row=e.target.closest('[data-order-index]');if(!row)return;
    pointer={key:row.closest('[data-order-list]').dataset.orderList,index:Number(row.dataset.orderIndex),row,id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
  });
  host.addEventListener('pointermove',e=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    if(!pointer.moved&&Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)<7)return;
    if(!pointer.moved){pointer.moved=true;pointer.row.setPointerCapture(e.pointerId);pointer.row.classList.add('dragging');}
    e.preventDefault();for(const el of host.querySelectorAll('.drop-target'))el.classList.remove('drop-target');
    const row=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-order-index]');
    if(row?.closest('[data-order-list]')?.dataset.orderList===pointer.key)row.classList.add('drop-target');
    const body=dialog.querySelector('.dialog-body'),rect=body.getBoundingClientRect();
    if(e.clientY>rect.bottom-30)body.scrollTop+=12;else if(e.clientY<rect.top+30)body.scrollTop-=12;
  });
  host.addEventListener('pointerup',e=>{
    if(!pointer||pointer.id!==e.pointerId)return;
    const source=pointer;pointer=null;
    if(source.row.hasPointerCapture(e.pointerId))source.row.releasePointerCapture(e.pointerId);
    const row=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-order-index]');clearMarks();
    if(source.moved&&row?.closest('[data-order-list]')?.dataset.orderList===source.key){e.preventDefault();move(source.key,source.index,Number(row.dataset.orderIndex));}
  });
  host.addEventListener('pointercancel',()=>{pointer=null;clearMarks();});
  render();
}
