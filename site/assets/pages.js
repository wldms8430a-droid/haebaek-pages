'use strict';
(async()=>{
  const engine=HaebaekSearch;
  const byId=id=>document.getElementById(id);
  const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
  const results=byId('search-results'),status=byId('status');let slides=[],context=null,lastQuestion='',busy=false;
  function showHome(){byId('home-intro').hidden=false;results.replaceChildren();byId('question-bubble').hidden=true;byId('new-question').hidden=true;context=null;status.textContent='';window.scrollTo({top:0});}
  function image(slide){const card=make('section',null,'reference-card');card.append(make('h3',`참고자료 · 슬라이드 ${slide.number}`));
    const img=make('img');if(!slide.image){card.append(make('p','원본 이미지가 연결되지 않았습니다. 자료 관리에서 해당 PPT의 PNG 이미지를 선택해주세요.'));return card;}img.src=slide.image.startsWith('blob:')?slide.image:'./'+slide.image;img.alt=slide.title;img.loading='lazy';img.style.cssText='width:100%;height:auto;border-radius:12px';
    const open=make('button','크게 보기','secondary-button');open.type='button';const enlarge=()=>{byId('dialog-slide-image').src=img.src;byId('dialog-slide-caption').textContent=slide.title;byId('viewer-reset').click();byId('slide-dialog').showModal();};open.onclick=enlarge;img.onclick=enlarge;
    card.append(img,open,make('p',`${slide.filename} · ${slide.number}번`));return card;
  }
  function display(slide,condition){
    context=slide.id;results.replaceChildren();const answer=make('section',null,'answer-section');answer.append(make('h2','자료에서 확인한 원문'));
    const core=make('div',null,'core-card');core.append(make('strong',condition?condition.label:slide.title));
    const text=make('p',condition?condition.lines.join('\n'):slide.text);text.style.whiteSpace='pre-wrap';core.append(text);answer.append(core,make('p','선택한 참고자료의 원문입니다.','muted'));
    answer.append(image(slide));results.append(answer);status.textContent='아래 입력창에서 질문을 이어가거나 다시 질문할 수 있습니다.';
  }
  function select(slide,q){const list=engine.conditions(slide);
    if(list.length>1&&engine.intent(q)==='duration'){
      results.replaceChildren();const card=make('section',null,'core-card');card.append(make('h2','어느 조건을 확인할까요?'));
      for(const condition of list){const b=make('button',condition.label,'secondary-button');b.type='button';b.onclick=()=>display(slide,condition);card.append(b);}results.append(card);status.textContent='자료에 실제로 있는 조건을 선택해 주세요.';
    }else display(slide);
  }
  async function ask(q){if(busy||q.trim().length<2)return;busy=true;lastQuestion=q;byId('home-intro').hidden=true;byId('new-question').hidden=false;byId('question-bubble').hidden=false;byId('question-bubble').textContent=q;status.textContent='자료를 찾고 있어요…';results.replaceChildren();
    const buttons=[...document.querySelectorAll('button[type=submit]')];buttons.forEach(b=>b.disabled=true);
    try{const matches=engine.search(slides,q,context);
      if(!matches.length){results.append(make('div',''+(slides.length?'연결된 자료에서 질문에 맞는 내용을 확인하지 못했습니다. 다른 표현으로 질문해주세요.':'자료 관리에서 PPT를 선택해주세요.')+'','core-card'));status.textContent='연결된 PPT의 원문만 검색하며 없는 답변은 만들지 않습니다.';return;}
      const choices=make('section',null,'answer-section');choices.append(make('h2','검색된 PPT 자료를 선택해 주세요'));
      for(const slide of matches){const b=make('button',`${slide.title} · ${slide.filename} · ${slide.number}번`,'secondary-button');b.type='button';b.style.margin='6px';b.onclick=()=>select(slide,q);choices.append(b);}results.append(choices);status.textContent='선택하면 원문과 원본 PPT 슬라이드 이미지가 표시됩니다.';
    }catch{status.textContent='자료를 표시하지 못했습니다. 새로고침 후 다시 시도해 주세요.';}finally{busy=false;buttons.forEach(b=>b.disabled=false);byId('question').value='';}
  }
  for(const id of ['search-form','hero-search-form'])byId(id).addEventListener('submit',e=>{e.preventDefault();ask(byId(id==='search-form'?'question':'hero-question').value);});
  document.querySelectorAll('[data-question]').forEach(b=>b.addEventListener('click',()=>ask(b.dataset.question)));
  const topics={leave:'휴가신청서',maternity:'모성휴가신청서',absence:'휴직원',return:'복직원',resign:'사직서',reduction:'근로시간 단축',flex:'유연근무제',refresh:'리프레쉬 휴가'};document.querySelectorAll('[data-work]').forEach(b=>b.addEventListener('click',()=>ask(topics[b.dataset.work])));byId('new-question').onclick=showHome;byId('close-slide-dialog').onclick=()=>byId('slide-dialog').close();
  document.addEventListener('local-corpus',e=>{slides=e.detail;showHome();status.textContent=slides.length?`${slides.length}장 검색 준비 완료`:'자료 관리에서 PPT를 선택해주세요.';});
  try{const rules=await fetch('./assets/search-rules.json');if(!rules.ok)throw Error();engine.configure(await rules.json());const response=await fetch('./data/slides.json');if(!response.ok)throw Error();const published=await response.json();if(!slides.length)slides=published;byId('boot-loading').hidden=true;if(!slides.length)status.textContent='자료 관리에서 PPT를 선택해주세요.';}
  catch{byId('boot-loading').textContent='자료를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 새로고침해 주세요.';}
})();
