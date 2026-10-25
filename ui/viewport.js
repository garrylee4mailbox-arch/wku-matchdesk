// Preserve the scored card's position even when saving replaces the page DOM.
export function captureViewport(matchId=null){
  const cards=[...document.querySelectorAll('.match-card[data-match-id]')];
  const card=matchId?cards.find(el=>el.dataset.matchId===matchId):cards.find(el=>{const r=el.getBoundingClientRect();return r.bottom>0&&r.top<window.innerHeight;});
  return {x:window.scrollX,y:window.scrollY,matchId:card?.dataset.matchId,top:card?.getBoundingClientRect().top,rounds:[...document.querySelectorAll('details[data-round-id][open]')].map(el=>el.dataset.roundId)};
}
export function restoreViewport(position){
  if(!position)return;
  for(const el of document.querySelectorAll('details[data-round-id]'))if(position.rounds.includes(el.dataset.roundId))el.open=true;
  const card=[...document.querySelectorAll('.match-card[data-match-id]')].find(el=>el.dataset.matchId===position.matchId);
  const top=card?window.scrollY+card.getBoundingClientRect().top-position.top:position.y;
  window.scrollTo({left:position.x,top,behavior:'instant'});
}
