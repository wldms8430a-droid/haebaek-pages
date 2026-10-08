"use strict";
(() => {
  const viewport=document.getElementById("viewer-viewport"),image=document.getElementById("dialog-slide-image");if(!viewport||!image)return;
  let zoom=1,last=null;const pointers=new Map();let distance=null;
  function set(value){zoom=Math.min(4,Math.max(1,value));image.style.width=`${zoom*100}%`;document.getElementById("viewer-scale").textContent=`${Math.round(zoom*100)}%`;}
  document.getElementById("viewer-in").addEventListener("click",()=>set(zoom+.5));document.getElementById("viewer-out").addEventListener("click",()=>set(zoom-.5));
  document.getElementById("viewer-reset").addEventListener("click",()=>{set(1);viewport.scrollTop=viewport.scrollLeft=0;});
  viewport.addEventListener("pointerdown",event=>{pointers.set(event.pointerId,[event.clientX,event.clientY]);last=[event.clientX,event.clientY];viewport.setPointerCapture(event.pointerId);});
  viewport.addEventListener("pointermove",event=>{if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,[event.clientX,event.clientY]);
    if(pointers.size===2){const [a,b]=[...pointers.values()];const next=Math.hypot(a[0]-b[0],a[1]-b[1]);if(distance&&next) set(zoom*next/distance);distance=next;}
    else if(last&&zoom>1){viewport.scrollLeft-=event.clientX-last[0];viewport.scrollTop-=event.clientY-last[1];}last=[event.clientX,event.clientY];});
  for(const type of ["pointerup","pointercancel","lostpointercapture"])viewport.addEventListener(type,event=>{pointers.delete(event.pointerId);distance=null;last=null;});
})();
