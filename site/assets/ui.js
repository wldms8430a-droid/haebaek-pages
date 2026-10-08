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
  } else if (!["login","start",undefined].includes(page)) {
    document.body.classList.add("app-shell");
    const main=document.querySelector("main");main.classList.add("workspace");
    const sidebar=node("aside",null,"sidebar");sidebar.id="app-sidebar";
    const logo=node("a",null,"brand-logo");logo.href="./";logo.setAttribute("aria-label","인제대학교 해운대백병원 간호국");sidebar.append(logo,node("h2","간호국 챗봇"));
    const admin=["admin","ppt","search-admin","feedback-admin"].includes(page);
    const navigation=node("nav",null,"side-nav");navigation.setAttribute("aria-label",admin?"관리자 메뉴":"주요 메뉴");
    const links=admin?[["사용자 피드백","/admin/feedback"],["PPT 자료 관리","/admin/ppt"],["검색 개선","/admin/search"],["동의어·약어 관리","/admin/search#aliases-title"],["못 찾은 질문","/admin/search#failure-title"],["계정 관리","/admin"],["설치 방법","/install"],["챗봇 화면으로","/"]]:[["새 질문","/"],["내 정보","/account"],["설치 방법","/install"]];
    for(const [text,path] of links){const link=node("a",text);link.href=path;if(path===location.pathname)link.classList.add("active");navigation.append(link);}
    if(!admin && page==="home") {
      navigation.append(node("h3","카테고리"));
      for(const title of ["신규·발령","휴직·복직","교육","근무·스케줄","서류·신청","급여·복지","기타"]){const button=node("button",title);button.type="button";button.disabled=true;button.title="기능 준비 중";navigation.append(button);}
      navigation.append(node("p","카테고리 기능은 준비 중입니다.","muted"));
      const recent=node("div");recent.id="recent-questions";navigation.append(node("h3","최근 질문"),recent);
    }
    sidebar.append(navigation);
    const closeMenu=node("button","메뉴 닫기","sidebar-close");closeMenu.type="button";closeMenu.addEventListener("click",()=>{document.body.classList.remove("sidebar-open");document.querySelector('.mobile-menu')?.setAttribute("aria-expanded","false");});sidebar.prepend(closeMenu);
    const identity=node("div",null,"sidebar-account");identity.append(avatar(),node("span","공용 계정", "sidebar-identity"));sidebar.append(identity);document.body.prepend(sidebar);
    const header=node("header",null,"app-header");
    const menu=node("button","☰","mobile-menu");menu.type="button";menu.setAttribute("aria-label","메뉴 열기");menu.setAttribute("aria-controls","app-sidebar");menu.setAttribute("aria-expanded","false");
    menu.addEventListener("click",()=>{const opened=document.body.classList.toggle("sidebar-open");menu.setAttribute("aria-expanded",String(opened));});
    document.addEventListener("keydown",event=>{if(event.key==="Escape"){document.body.classList.remove("sidebar-open");menu.setAttribute("aria-expanded","false");}});
    header.append(menu,avatar());const text=node("div");text.append(node("strong",admin?"간호국 관리자":"간호국 챗봇 해백이"));
    const online=node("span","● 온라인","online-status");online.id="online-state";text.append(online);header.append(text);
    const badge=node("a","간호국 직원 전용","staff-badge");badge.href="/account";header.append(badge);
    document.body.insertBefore(header,main);
    const updateOnline=()=>{online.textContent=navigator.onLine?"● 온라인":"● 연결 필요";online.classList.toggle("offline",!navigator.onLine);};updateOnline();window.addEventListener("online",updateOnline);window.addEventListener("offline",updateOnline);
  }
  const ready=()=>{
    document.getElementById("boot-loading")?.setAttribute("hidden","");
    const identity=document.querySelector(".sidebar-identity");const name=document.getElementById("account-name");if(identity&&name)identity.textContent=name.textContent;
    document.querySelector(".welcome-action")?.setAttribute("aria-disabled","false");
  };
  document.querySelector(".welcome-action")?.addEventListener("click",event=>{if(event.currentTarget.getAttribute("aria-disabled")==="true")event.preventDefault();});
  document.addEventListener("auth-ready",ready);
  if(page==="login") ready();
})();
