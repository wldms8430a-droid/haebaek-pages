"use strict";
(() => {
  let csrfToken, selectedVersion, processing = false, offset = 0, total = 0;
  const status = document.getElementById("status");
  const labels = {PROCESSING:"처리 중", REVIEW_REQUIRED:"검수 필요", PUBLISHED:"현재 게시본", ARCHIVED:"이전 버전", FAILED:"처리 실패"};
  const show = message => { status.textContent = message; };
  const node = (tag, text, className) => { const element = document.createElement(tag); if (text) element.textContent = text; if(className)element.className=className; return element; };
  async function request(path, method = "GET", data, signal) {
    if(document.body.dataset.page === "home") return HaebaekPagesAPI.request(path,method,data,signal);
    const headers = {};
    if (method !== "GET") headers["X-CSRF-Token"] = csrfToken;
    if (data && !(data instanceof FormData)) headers["Content-Type"] = "application/json";
    let response;
    try { response = await fetch(path, {method, headers, signal, credentials:"same-origin", body:data instanceof FormData ? data : data ? JSON.stringify(data) : undefined}); }
    catch { throw new Error("인터넷 연결이 필요합니다."); }
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "요청을 처리할 수 없습니다.");
    return result;
  }
  function action(container, label, callback) {
    const button = node("button", label); button.type = "button";
    button.addEventListener("click", async () => { button.disabled = true; try { await callback(); } catch(error) { show(error.message); } finally { button.disabled = false; } });
    container.append(button);
  }
  async function list(append = false) {
    const container = document.getElementById("ppt-documents");
    const select = document.getElementById("ppt-document");
    const selection = select.value;
    if (!append) { offset = 0; container.replaceChildren(); select.replaceChildren(new Option("새 문서", "")); }
    const result = await request(`/api/admin/documents?offset=${offset}&limit=50`);
    for (const doc of result.items) {
      select.add(new Option(doc.title, doc.id));
      const section = node("section"); section.append(node("h3", doc.title));
      for (const version of doc.versions) {
        const row = node("div"); row.className = "version-row";
        row.append(node("span", `v${version.version_number} · ${labels[version.status]} · ${version.original_filename}`));
        action(row, "상태 · 검수 · 이전 버전 보기", () => review(version.id));
        section.append(row);
      }
      container.append(section);
    }
    select.value = selection;
    offset += result.items.length; total = result.total;
    document.getElementById("more-ppt").hidden = offset >= total;
  }
  async function review(id) {
    selectedVersion = id;
    const result = await request(`/api/admin/versions/${id}`);
    const version = result.version;
    const wasProcessing = processing;
    processing = version.status === "PROCESSING";
    if (wasProcessing && !processing) await list();
    document.getElementById("ppt-review").hidden = false;
    document.getElementById("review-title").textContent = `v${version.version_number} · ${labels[version.status]}`;
    const summary = result.comparison.summary;
    document.getElementById("comparison").textContent = `이전 게시본 대비: 변경 ${summary.changed}장 · 추가 ${summary.added}장 · 삭제 ${summary.deleted}장 · 변경 없음 ${summary.unchanged}장 (슬라이드 번호 기준)`;
    document.getElementById("processing-error").textContent = version.processing_error || "";
    const actions = document.getElementById("review-actions"); actions.replaceChildren();
    if (["REVIEW_REQUIRED", "ARCHIVED"].includes(version.status)) {
      const label = node("label", "슬라이드와 경고를 확인했습니다. 현재 게시본을 이 버전으로 전환합니다.");
      const checked = document.createElement("input"); checked.type = "checkbox"; label.className = "check"; label.prepend(checked); actions.append(label);
      action(actions, version.status === "ARCHIVED" ? "이전 버전으로 롤백 · 게시" : "이 버전 게시", async () => {
        if (!checked.checked) throw new Error("검수 확인란을 선택해주세요.");
        await request(`/api/admin/versions/${id}/publish`, "POST"); show("게시본이 전환되었습니다."); await list(); await review(id);
      });
    }
    if (version.status === "FAILED") action(actions, "재처리", async () => { await request(`/api/admin/versions/${id}/retry`, "POST"); await list(); await review(id); });
    if (["REVIEW_REQUIRED", "PUBLISHED", "ARCHIVED"].includes(version.status)) {
      action(actions, "텍스트 다시 추출 · 재색인 미리보기", async () => {
        const preview = await request(`/api/admin/versions/${id}/reindex-preview`, "POST");
        const area = node("section"); area.append(node("h3", `재색인 미리보기 · ${preview.slide_count}장`));
        area.append(node("p", `이미지·게시 상태·검색 제외는 유지됩니다. 관리자 수정 원문 ${preview.preserved_manual_edits}장은 유지하고 자동 추출 원문만 별도로 갱신합니다.`));
        for (const slide of preview.slides) {
          const details = node("details"); details.append(node("summary", `${slide.slide_number}. ${slide.title}${slide.changed ? " · 추출 변경" : " · 변경 없음"}${slide.manual_edit_preserved ? " · 수정 원문 유지" : ""}`), node("pre", slide.raw_extracted_text, "source-text")); area.append(details);
        }
        action(area, "확인 후 재색인 적용", async () => {
          await request(`/api/admin/versions/${id}/reindex`, "POST", {preview_token:preview.preview_token});
          show("텍스트 재색인이 적용되었습니다. 게시본은 검색에 즉시 반영됩니다."); await review(id);
        });
        actions.append(area);
      });
    }
    const original = node("a", "원본 PPT 다운로드 (관리자 전용)"); original.href = `/api/admin/versions/${id}/original`; original.className = "action-link"; actions.append(original);
    const container = document.getElementById("review-slides"); container.replaceChildren();
    for (const slide of result.slides) {
      const section = node("section"); section.append(node("h3", `${slide.slide_number}. ${slide.title}`));
      const warnings = [...slide.extraction_warning];
      if (result.comparison.details.changed.includes(slide.slide_number)) warnings.push("이전 버전 대비 변경");
      if (result.comparison.details.added.includes(slide.slide_number)) warnings.push("추가 슬라이드");
      if (warnings.length) section.append(node("p", "확인 필요: " + warnings.join(" · ")));
      const row = node("div"); row.className = "slide-review";
      const image = document.createElement("img"); image.src = slide.image_url; image.alt = `${slide.slide_number}번 슬라이드`; image.loading = "lazy"; row.append(image);
      const form = document.createElement("form");
      const label = node("label", "검색에 사용할 추출 원문"); const text = document.createElement("textarea"); text.value = slide.extracted_text; text.maxLength = 100000; label.append(text); form.append(label);
      if (slide.manually_edited && slide.raw_extracted_text !== null) {
        const raw = node("details"); raw.append(node("summary", "자동 추출 원문 보기 (관리자 수정 전)"), node("pre", slide.raw_extracted_text, "source-text")); form.append(raw);
      }
      form.append(node("p", `추출 방식 v${slide.extraction_version || 1} · 슬라이드 제목은 본문과 별도로 검색에 사용됩니다.`));
      const exclusion = node("label", "검색 제외"); exclusion.className = "check";
      const check = document.createElement("input"); check.type = "checkbox"; check.checked = slide.search_excluded; exclusion.prepend(check); form.append(exclusion);
      text.disabled = check.disabled = version.status !== "REVIEW_REQUIRED";
      if (slide.manually_edited) form.append(node("p", "관리자가 텍스트를 수정한 슬라이드입니다."));
      if (version.status === "REVIEW_REQUIRED") {
        const save = node("button", "텍스트 · 검색 제외 저장"); save.type = "submit"; form.append(save);
        form.addEventListener("submit", async event => { event.preventDefault(); save.disabled = true;
          try { await request(`/api/admin/slides/${slide.id}`, "PATCH", {extracted_text:text.value, search_excluded:check.checked}); show(`${slide.slide_number}번 수정사항을 저장했습니다.`); }
          catch(error) { show(error.message); } finally { save.disabled = false; }
        });
      }
      row.append(form); section.append(row); container.append(section);
    }
  }
  function startChat() {
    const form=document.getElementById("search-form"), input=document.getElementById("question");
    const container=document.getElementById("search-results"), panel=document.getElementById("evidence-panel");
    const recent=[]; let currentResults=[],selected=0,busy=false,currentAnswer=null,conversationToken=null,lastResponse=null;
    const avatar=()=>{const element=node("span");element.className="haebaek-avatar";element.setAttribute("aria-hidden","true");return element;};
    const heading=(number,title)=>{const element=node("h2");const badge=node("span",String(number));badge.className="number-badge";element.append(badge,document.createTextNode(title));return element;};
    const sourceImage=(item)=>{const image=document.createElement("img");image.src=item.image_url;image.alt=item.title || "참고자료";image.loading="lazy";return image;};
    function verifiedOriginalLink(item) {
      // Reserved for server-verified protected DB links. Current department
      // API exposes no original URL, so no button is rendered.
      if (!item.original_url || item.original_url_verified!==true) return null;
      try {const url=new URL(item.original_url,location.origin);return url.protocol==="https:" || url.origin===location.origin ? url.href : null;} catch{return null;}
    }
    function enlarge(item) {document.getElementById("dialog-slide-image").src=item.image_url;document.getElementById("dialog-slide-caption").textContent=item.title || `슬라이드 ${item.slide_number}`;document.getElementById("slide-dialog").showModal();document.getElementById("viewer-reset")?.click();}
    function choose(index) {selected=index;renderResults();}
    function renderPanel(item) {
      panel.replaceChildren();panel.hidden=false;panel.append(heading(3,"참고자료"),node("p",`${item.filename} · 슬라이드 ${item.slide_number}`));
      const image=sourceImage(item);image.className="panel-slide";panel.append(image);action(panel,"슬라이드 크게 보기",()=>enlarge(item));
      const controls=node("div");controls.className="slide-controls";action(controls,"← 이전",()=>choose((selected-1+currentResults.length)%currentResults.length));controls.append(node("span",`${selected+1} / ${currentResults.length}`));action(controls,"다음 →",()=>choose((selected+1)%currentResults.length));panel.append(controls);
      const thumbs=node("div");thumbs.className="slide-thumbnails";
      currentResults.forEach((result,index)=>{const button=node("button");button.type="button";button.setAttribute("aria-label",`${result.slide_number}번 슬라이드 보기`);button.setAttribute("aria-pressed",String(selected===index));const thumb=sourceImage(result);thumb.src=result.thumbnail_url;button.append(thumb);button.addEventListener("click",()=>choose(index));thumbs.append(button);});panel.append(thumbs);
      const original=verifiedOriginalLink(item);if(original){const link=node("a","원본 자료 열기");link.className="primary-button";link.href=original;link.target="_blank";link.rel="noopener noreferrer";panel.append(link);}
    }
    function renderResults() {
      container.replaceChildren();panel.replaceChildren();panel.hidden=true;
      const core=node("section",null,"staff-answer");core.append(node("h2","답변","sr-only"));
      const row=node("div",null,"answer-bubble-row");row.append(avatar());
      const quote=node("div",null,"answer-bubble");quote.append(node("p",currentAnswer?.intent==="forms"?"등록된 자료의 양식·작성 예시를 찾았어요.":"등록된 자료에서 확인한 내용을 안내드릴게요.","answer-greeting"),node("p","등록된 간호국 자료를 바탕으로 답변했어요.","answer-subtitle"));
      const facts=(currentAnswer?.facts || []).filter(fact=>typeof fact.quote==="string" && fact.quote.trim());
      if(currentAnswer?.needs_review || (currentAnswer?.warnings || []).some(w=>/서로 다|확정.*어렵|확정 기준이 아니/.test(w)))quote.append(node("p","등록된 자료에 불명확하거나 서로 다른 내용이 확인되어 담당 부서 확인이 필요합니다. 아래 항목은 자료에 적힌 내용이며 확정된 안내가 아닙니다.","answer-review-notice"));
      if(facts.length){
        // Presentation only: retain source words, business numbers and qualifiers.
        // Do not infer missing fields, renumber steps or join approval arrows.
        const groups=new Map();
        const groupFor=label=>/결재|전결|합의/.test(label)?"결재방법":/기안|절차/.test(label)?"신청방법":/기한|시기/.test(label)?"신청시기":/서류|첨부/.test(label)?"제출서류":/기간|기준|유형|시간/.test(label)?"사용기간":/대상/.test(label)?"대상":/참고|주의/.test(label)?"유의사항":label || "확인된 내용";
        for(const fact of facts){const title=groupFor(fact.label || "");if(!groups.has(title))groups.set(title,[]);groups.get(title).push(fact);}
        const priority={approval:"결재방법",procedure:"신청방법",deadline:"신청시기",documents:"제출서류",period:"사용기간"}[currentAnswer.intent];
        const ordered=[...groups].sort((a,b)=>(b[0]===priority)-(a[0]===priority));
        for(const [title,items] of ordered){
          const section=node("section",null,"answer-fact-section");section.append(node("h3",title));
          let lastSubject=null;
          for(const fact of items){
            if(fact.subject && fact.subject!==lastSubject)section.append(node("p",fact.subject,"answer-fact-subject"));lastSubject=fact.subject;
            const sourceLines=/기준|대상/.test(fact.label || "")?[fact.quote.replace(/\r?\n/g," ")]:fact.quote.split(/\r?\n/);
            const lines=sourceLines.flatMap(line=>fact.label==="기안순서"?line.split(/(?=\d+\)\s)/):[line]);const seenMarkers=new Set();
            for(const raw of lines){let line=raw.trim();if(!line)continue;
              // Drop only standalone annotation markers; retain numbered source
              // sentences verbatim so repeated source steps cannot be reordered.
              if(/^[①②③④⑤⑥⑦⑧⑨⑩➊➋➌➍➎➏➐➑➒➓❶❷❸❹❺❻❼❽❾❿]+$/.test(line)){if(seenMarkers.has(line))continue;seenMarkers.add(line);continue;}
              if(fact.label==="기안순서"){line=line.replace(/\s*→\s*$/,'').replace(/^→\s*/,'');if(!line)continue;}
              const markerSets=["①②③④⑤⑥⑦⑧⑨⑩","➊➋➌➍➎➏➐➑➒➓","❶❷❸❹❺❻❼❽❾❿"];
              line=line.replace(/[①②③④⑤⑥⑦⑧⑨⑩➊➋➌➍➎➏➐➑➒➓❶❷❸❹❺❻❼❽❾❿]/g,marker=>`[${markerSets.find(set=>set.includes(marker)).indexOf(marker)+1}]`).replace(/\s+,\s*/g,", ");
              const paragraph=node("p",null,"answer-fact-line");
              if(title==="사용기간"){
                let cursor=0;for(const match of line.matchAll(/\((\d+\s*일)\)/g)){paragraph.append(document.createTextNode(line.slice(cursor,match.index)),node("span",match[1],"duration-badge"));cursor=match.index+match[0].length;}paragraph.append(document.createTextNode(line.slice(cursor)));
              }else paragraph.textContent=line;
              section.append(paragraph);
            }
          }quote.append(section);
        }
      }else quote.append(node("p",currentAnswer?.intent==="approval"?"등록된 자료에서 결재라인은 명확하게 확인되지 않습니다.":"등록된 간호국 자료에서 해당 내용을 확인하지 못했습니다.","source-answer"));
      // Keep compatibility with non-fact responses without hiding their content.
      if(!facts.length && !(currentAnswer?.facts?.length===0) && currentAnswer?.text)quote.replaceChildren(node("p",currentAnswer.text,"source-answer"));
      for(const warning of currentAnswer?.warnings || [])quote.append(node("p",warning,"source-warning"));
      row.append(quote);core.append(row);container.append(core);
      const evidence=node("section",null,"staff-references");evidence.append(node("h2","참고자료"));
      const cards=node("div",null,"reference-cards");
      // API results are the answer sources; top_candidates are never displayed.
      const cited=new Set((currentAnswer?.facts || []).map(fact=>fact.slide_id));
      const sources=cited.size?currentResults.filter(result=>cited.has(result.slide_id)):currentResults;
      sources.forEach(result=>{
        const card=node("article",null,"reference-card");
        card.append(node("p",result.title || `슬라이드 ${result.slide_number}`,"reference-caption"),sourceImage(result));
        const controls=node("div",null,"reference-actions");action(controls,"크게 보기",()=>enlarge(result));
        card.append(controls);cards.append(card);
      });evidence.append(cards);container.append(evidence);
    }
    function reset() {if(busy)return;conversationToken=null;currentResults=[];container.replaceChildren();panel.hidden=true;document.getElementById("question-bubble").hidden=true;document.getElementById("home-intro").hidden=false;document.getElementById("new-question").hidden=true;input.value="";input.placeholder="궁금한 내용을 입력해 주세요.";show("");document.body.classList.remove("sidebar-open");document.querySelector('.mobile-menu')?.setAttribute("aria-expanded","false");input.focus();document.getElementById("hero-question").value="";document.getElementById("work-questions").hidden=true;document.querySelectorAll("[data-work]").forEach(item=>item.setAttribute("aria-expanded","false"));window.scrollTo(0,0);}
    document.getElementById("new-question").addEventListener("click",reset);document.querySelector('.side-nav a[href="/"]')?.addEventListener("click",event=>{event.preventDefault();reset();});document.getElementById("close-slide-dialog").addEventListener("click",()=>document.getElementById("slide-dialog").close());
    function renderChoices(result,question){
      container.replaceChildren();const card=node("section");card.className="clarification-card";card.append(node("h2",result.message));const grid=node("div");grid.className="chat-choices";let shown=0;
      function more(){for(const choice of result.choices.slice(shown,shown+6)){const button=node("button");button.type="button";button.title=`${choice.label} · ${choice.filename}`;button.append(node("span",choice.label));button.addEventListener("click",()=>submitQuestion(question,result.detail_choices?{selected_detail:choice.id,conversation_token:result.conversation_token}:{selected_topic_id:choice.id,selection_token:result.selection_token,question:result.selection_question||question,requested_intent:result.understanding?.intent}));grid.append(button);}shown+=6;moreButton.hidden=shown>=result.choices.length;}
      const moreButton=node("button","다른 항목 보기");moreButton.type="button";moreButton.addEventListener("click",more);card.append(grid,moreButton,node("p","원하는 항목이 없다면 아래에 직접 질문해주세요."));container.append(card);more();
    }
    async function submitQuestion(question,selection=null){
      if(busy)return;const started=Date.now();document.querySelector(".home-menu")?.removeAttribute("open");window.scrollTo(0,0);busy=true;const button=form.querySelector("button"),heroButton=document.querySelector("#hero-search-form button");button.disabled=true;if(heroButton)heroButton.disabled=true;input.disabled=true;
      document.getElementById("home-intro").hidden=true;const bubble=document.getElementById("question-bubble");bubble.textContent=question;bubble.hidden=false;panel.hidden=true;container.replaceChildren();const loading=node("div");loading.className="search-loading";loading.setAttribute("role","status");const loadingCopy=node("div",null,"loading-bubble");loadingCopy.append(node("p","해백이가 관련 자료를 찾고 있어요..."),node("p","등록된 간호국 자료를 확인하고 있습니다", "loading-helper"),node("span","● ● ●","loading-dots"));loading.append(avatar(),loadingCopy);container.append(loading);show("");
      const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),60000);
      try {const result=await request("/api/chat","POST",{question,assist:true,conversation_token:conversationToken,...(selection || {})},controller.signal);await new Promise(resolve=>setTimeout(resolve,Math.max(0,650-(Date.now()-started))));lastResponse=result;conversationToken=result.conversation_token || null;currentResults=result.results || [];currentAnswer=result.answer;selected=0;
        if(result.action==="clarification_choices"){
          if(!result.choices?.length || (selection?.selected_topic_id && !result.detail_choices && result.choices.some(choice=>choice.id===selection.selected_topic_id)))throw new Error("선택한 자료의 답변을 연결하지 못했습니다. 다시 시도하거나 새 질문을 입력해주세요.");
          renderChoices(result,question);
        }
        else if(currentResults.length)renderResults();
        else{container.replaceChildren(node("p","등록된 간호국 자료에서 관련 내용을 찾지 못했습니다."));container.firstChild.className="no-result-card";}
        input.value="";input.placeholder="이어서 궁금한 점을 입력해 주세요.";document.getElementById("new-question").hidden=false;recent.unshift(question);recent.splice(3);const list=document.getElementById("recent-questions");if(list){list.replaceChildren();for(const value of recent){const item=node("button",value);item.type="button";item.addEventListener("click",()=>{input.value=value;input.focus();document.getElementById("hero-question").value="";document.getElementById("work-questions").hidden=true;document.querySelectorAll("[data-work]").forEach(item=>item.setAttribute("aria-expanded","false"));window.scrollTo(0,0);});list.append(item);}}
      }catch(error){container.replaceChildren(node("p",error.name==="AbortError"?"응답 시간이 초과되었습니다. 다시 시도해주세요.":"답변을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요. "+(error.message||""),"no-result-card"));const retry=node("button","다시 시도");retry.type="button";retry.addEventListener("click",()=>submitQuestion(question,selection));container.append(retry);show(error.message === "인터넷 연결이 필요합니다." ? error.message : "");document.getElementById("new-question").hidden=false;}finally{clearTimeout(timeout);busy=false;button.disabled=false;if(heroButton)heroButton.disabled=false;input.disabled=false;}
    }
    form.addEventListener("submit",event=>{event.preventDefault();submitQuestion(input.value);});
    const heroForm=document.getElementById("hero-search-form"),heroInput=document.getElementById("hero-question");
    heroForm?.addEventListener("submit",event=>{event.preventDefault();submitQuestion(heroInput.value);});
    document.querySelectorAll('[data-question]').forEach(button=>button.addEventListener("click",()=>submitQuestion(button.dataset.question)));
    const presets={
      leave:["결혼 휴가 며칠이야?","사망휴가 며칠이야?","결혼 휴가신청방법","결혼휴가 서류 뭐 내야 해?","결혼휴가 결재선 알려줘"],
      maternity:["출산휴가 신청방법","출산휴가 서류 뭐 필요해?","배우자 출산휴가","유산휴가 신청방법","난임치료휴가"],
      absence:["휴직 종류 알려줘","육아휴직 신청방법","상병휴직 신청방법","난임휴직","가족간호휴직","가족돌봄휴직"],
      return:["복직원 작성방법"],resign:["사직서 작성방법","사직서 언제까지 제출해야 해?","사직 절차 알려줘"],
      reduction:["근무시간 줄이고 싶어","임신부 근로시간 단축","육아기 근로시간 단축"],
      flex:["시차출퇴근제","전환형 시간선택제"],refresh:["리프레쉬 휴가 신청방법","리프레쉬 언제까지 신청해야 해?"]
    };
    const workPanel=document.getElementById("work-questions");
    document.querySelectorAll('[data-work]').forEach(button=>button.addEventListener("click",()=>{
      document.querySelectorAll('[data-work]').forEach(item=>item.setAttribute("aria-expanded",String(item===button)));
      document.getElementById("work-question-title").textContent=button.querySelector("strong").textContent+"에 대해 무엇이 궁금하세요?";
      const list=document.getElementById("work-question-buttons");list.replaceChildren();
      for(const question of presets[button.dataset.work]){const item=node("button",question);item.type="button";item.addEventListener("click",()=>submitQuestion(question));list.append(item);}
      workPanel.hidden=false;workPanel.focus();workPanel.scrollIntoView({block:"nearest"});
    }));
    document.getElementById("close-work-questions")?.addEventListener("click",()=>{const opener=document.querySelector('[data-work][aria-expanded=true]');workPanel.hidden=true;opener?.setAttribute("aria-expanded","false");opener?.focus();});
  }
  async function start() {
    if(document.body.dataset.page === "home") {await HaebaekPagesAPI.ready;document.getElementById("boot-loading").hidden=true;startChat();return;}
    const me = await request("/api/auth/me"); csrfToken = me.csrf_token;
    if (document.body.dataset.page === "home") {
      document.getElementById("ppt-admin-link").hidden = me.account.role !== "ADMIN";
      document.getElementById("search-admin-link").hidden = me.account.role !== "ADMIN";
      const feedbackLink=document.getElementById("feedback-admin-link");if(feedbackLink)feedbackLink.hidden=me.account.role!=="ADMIN";
      startChat();
      return;
    }
    await list();
    document.getElementById("ppt-document").addEventListener("change", event => { document.getElementById("ppt-title").disabled = !!event.target.value; });
    document.getElementById("ppt-upload").addEventListener("submit", async event => {
      event.preventDefault(); const form = event.currentTarget; const button = form.querySelector("button"); button.disabled = true;
      try {
        const data = new FormData(form); if (!data.get("document_id")) data.delete("document_id");
        const version = await request("/api/admin/documents/upload", "POST", data);
        form.querySelector('[type="file"]').value = ""; show("업로드되었습니다. 처리 상태를 확인해주세요.");
        await list(); await review(version.id);
      } catch(error) { show(error.message); } finally { button.disabled = false; }
    });
    document.getElementById("refresh-ppt").addEventListener("click", async () => { try { await list(); if (selectedVersion) await review(selectedVersion); } catch(error) { show(error.message); } });
    document.getElementById("ppt-bundle-upload")?.addEventListener("submit",async event=>{
      event.preventDefault();const form=event.currentTarget,button=form.querySelector("button");button.disabled=true;
      try{const data=new FormData(form),documentId=document.getElementById("ppt-document").value,title=document.getElementById("ppt-title").value;
        if(documentId)data.set("document_id",documentId);else if(title)data.set("title",title);
        const version=await request("/api/admin/documents/import-bundle","POST",data);form.querySelector('[type="file"]').value="";
        show("사전 변환 자료를 가져왔습니다. 검수 후 게시해주세요.");await list();await review(version.id);
      }catch(error){show(error.message);}finally{button.disabled=false;}
    });
    document.getElementById("more-ppt").addEventListener("click", () => list(true).catch(error => show(error.message)));
    const timer = setInterval(() => {
      if (!document.hidden && selectedVersion && processing) review(selectedVersion).catch(error => show(error.message));
    }, 5000);
    window.addEventListener("pagehide", () => clearInterval(timer), {once:true});
  }
  start().catch(error => show(error.message));
})();
