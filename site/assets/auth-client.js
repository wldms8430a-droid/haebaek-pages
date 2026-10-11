"use strict";
(()=>{
  if(location.hostname.endsWith(".github.io"))return;
  let csrfToken="";
  const status=document.getElementById("status");
  const show=(message,error=false)=>{if(status){status.textContent=message;status.style.color=error?"#a62a2a":"#286f51";}};
  async function request(path,options={}){
    const headers={"Content-Type":"application/json",...(options.headers||{})};
    if(csrfToken)headers["X-CSRF-Token"]=csrfToken;
    const response=await fetch(path,{...options,headers,credentials:"same-origin"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"요청을 처리하지 못했습니다.");
    return data;
  }
  async function me(){
    const data=await request("/api/auth/me",{method:"GET",headers:{}});csrfToken=data.csrf_token;
    const summary=document.getElementById("account-summary");if(summary)summary.textContent=`${data.account.name} · ${data.account.role==="ADMIN"?"관리자":"직원"}`;
    const accountName=document.getElementById("account-name");if(accountName)accountName.textContent=data.account.name;
    if(data.account.role==="ADMIN"&&document.body.dataset.page==="home"){
      const link=document.createElement("a");link.href="/admin";link.textContent="관리자";document.querySelector(".account-controls nav")?.prepend(link);
    }
    return data;
  }
  document.getElementById("login-form")?.addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector("button");button.disabled=true;show("로그인하고 있습니다.");
    try{const data=await request("/api/auth/login",{method:"POST",body:JSON.stringify({account:form.account.value,password:form.password.value,remember:form.remember.checked})});const next=new URLSearchParams(location.search).get("next");location.replace(next&&next.startsWith("/")&&!next.startsWith("//")?next:data.redirect);}
    catch(error){show(error.message,true);button.disabled=false;form.password.focus();}
  });
  document.getElementById("password-form")?.addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector("button");if(form.new_password.value!==form.confirm_password.value)return show("새 비밀번호가 서로 일치하지 않습니다.",true);button.disabled=true;
    try{const target=form.target_account?.value;const data=await request("/api/auth/change-password",{method:"POST",body:JSON.stringify({current_password:form.current_password.value,new_password:form.new_password.value,...(target?{target_account:target}:{})})});show(data.message);form.reset();if(!target||target==="admin")setTimeout(()=>location.replace("/login"),1200);else button.disabled=false;}
    catch(error){show(error.message,true);button.disabled=false;}
  });
  document.querySelectorAll("[data-logout]").forEach(button=>button.addEventListener("click",async()=>{button.disabled=true;try{await request("/api/auth/logout",{method:"POST",body:"{}"});location.replace("/login");}catch(error){show(error.message,true);button.disabled=false;}}));
  if(document.body.dataset.page!=="login")me().then(()=>{
    const nav=document.querySelector(".account-controls nav");if(nav&&!nav.querySelector("[data-logout]")){const account=document.createElement("a");account.href="/account";account.textContent="내 정보";const logout=document.createElement("button");logout.type="button";logout.dataset.logout="";logout.textContent="로그아웃";logout.addEventListener("click",async()=>{logout.disabled=true;try{await request("/api/auth/logout",{method:"POST",body:"{}"});location.replace("/login");}catch(error){show(error.message,true);logout.disabled=false;}});nav.append(account,logout);}
    document.dispatchEvent(new Event("auth-ready"));
  }).catch(()=>location.replace(`/login?next=${encodeURIComponent(location.pathname)}`));
})();
