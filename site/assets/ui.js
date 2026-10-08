"use strict";
(() => {
  const page=document.body.dataset.page;
  const avatar=()=>{const element=document.createElement("span");element.className="haebaek-avatar";element.setAttribute("aria-hidden","true");return element;};
  const node=(tag,text,className)=>{const element=document.createElement(tag);if(text)element.textContent=text;if(className)element.className=className;return element;};
  if(page==="home") {
    document.body.classList.add("app-shell","home-shell");
    document.querySelector("main").classList.add("workspace");
    const header=node("header",null,"home-header");
    const logo=node("a",null,"nursing-logo");logo.href="./";logo.setAttribute("aria-label","인제대학교해운대백병원 간호국");header.append(logo);
    const identity=node("div",null,"home-brand");identity.append(avatar());const copy=node("div");copy.append(node("strong","간호국 챗봇 해백이"));const online=node("span","● 온라인","online-status");copy.append(online);identity.append(copy);header.append(identity);
    const menu=node("details",null,"home-menu");menu.append(node("summary","내 정보 · 메뉴"));menu.append(document.querySelector(".account-controls"));header.append(menu);document.body.prepend(header);
    const update=()=>{online.textContent=navigator.onLine?"● 온라인":"● 연결 필요";online.classList.toggle("offline",!navigator.onLine);};update();window.addEventListener("online",update);window.addEventListener("offline",update);
    const viewport=window.visualViewport;
    const positionDock=()=>document.documentElement.style.setProperty("--keyboard-offset",Math.max(0,window.innerHeight-(viewport?.height || window.innerHeight)-(viewport?.offsetTop || 0))+"px");
    viewport?.addEventListener("resize",positionDock);viewport?.addEventListener("scroll",positionDock);positionDock();
  }
})();
