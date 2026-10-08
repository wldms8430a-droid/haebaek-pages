"use strict";
(() => {
  const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const notice = document.createElement("p");
  notice.className = "network-notice"; notice.setAttribute("role", "status"); notice.hidden = true;
  document.querySelector("main")?.prepend(notice);
  function updateNetwork() { notice.textContent = "인터넷 연결이 필요합니다."; notice.hidden = navigator.onLine; }
  window.addEventListener("online", updateNetwork); window.addEventListener("offline", updateNetwork); updateNetwork();
  const banner = document.createElement("aside");
  banner.className = "install-banner"; banner.hidden = true;
  const sentence = document.createElement("span"); sentence.textContent = "간호국 챗봇을 홈 화면에 추가하면 더 빠르게 이용할 수 있습니다.";
  const link = document.createElement("a"); link.href = "./install.html"; link.textContent = "설치 방법 보기";
  banner.append(sentence, link);
  if (document.body.dataset.page !== "install" && document.body.dataset.page !== "offline") document.querySelector("main")?.append(banner);
  window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); banner.hidden = standalone(); });
  window.addEventListener("appinstalled", () => { banner.hidden = true; });
  const agent = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(agent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(agent) && !/CriOS|FxiOS|Edg|Chrome/.test(agent);
  if (ios && safari && window.isSecureContext && !standalone()) banner.hidden = false;
  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js", {scope:"./", updateViaCache:"none"}).catch(() => {}));
  }
  if (document.body.dataset.page !== "install") return;
  const names = ["pc", "android", "iphone"];
  const tabs = names.map(name => document.getElementById(`tab-${name}`));
  function select(name, focus = false) {
    for (let index = 0; index < tabs.length; index++) {
      const active = names[index] === name;
      tabs[index].setAttribute("aria-selected", String(active)); tabs[index].tabIndex = active ? 0 : -1;
      document.getElementById(`panel-${names[index]}`).hidden = !active;
      if (active && focus) tabs[index].focus();
    }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => select(names[index]));
    tab.addEventListener("keydown", event => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % 3;
      if (event.key === "ArrowLeft") next = (index + 2) % 3;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = 2;
      if (next !== undefined) { event.preventDefault(); select(names[next], true); }
    });
  });
  const hash = location.hash.slice(1);
  select(names.includes(hash) ? hash : ios ? "iphone" : /Android/.test(agent) ? "android" : "pc");
})();
