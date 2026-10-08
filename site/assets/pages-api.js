/* Static search/data bridge only. Original home renderer and interactions are unchanged. */
(()=>{
 'use strict';
 let slides=[],rules,sequence=0;const contexts=new Map();
 const ready=(async()=>{const [r,d]=await Promise.all([fetch('./assets/search-rules.json',{cache:'no-store'}),fetch('./data/slides.json',{cache:'no-store'})]);if(!r.ok||!d.ok)throw Error('등록 자료를 불러오지 못했습니다.');rules=await r.json();HaebaekSearch.configure(rules);slides=(await d.json()).filter(s=>!s.hidden);})();
 const compact=q=>HaebaekSearch.norm(q).replace(/ /g,'');
 function mode(q){const value=compact(q);if(/양식|서식|신청서보여|신청서어디|작성할서류|쓸서류|뭐작성/.test(value))return 'forms';if(/결재|전결|합의/.test(value))return 'approval';return {duration:'period',procedure:'procedure',deadline:'deadline',documents:'documents'}[HaebaekSearch.intent(q)]||'general';}
 const names={period:'사용기간',procedure:'신청방법',approval:'결재방법',deadline:'신청기한',documents:'제출서류',forms:'신청서·양식'};
 function source(s){return {slide_id:s.id,version_id:s.filename,slide_number:s.number,title:s.title,filename:s.filename,image_url:'./'+s.image,thumbnail_url:'./'+s.image,score:s.score||0};}
 const empty=()=>({action:'no_answer',results:[],answer:null,feedback_token:'static-unavailable'});
 async function request(path,method,data,signal){
  await ready;if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  if(path==='/api/feedback')throw Error('기존 피드백 저장 서버가 이 정적 배포에 연결되어 있지 않습니다.');
  if(path!=='/api/chat')throw Error('이 요청은 기존 서버 기능이 필요합니다.');
  const prior=contexts.get(data.conversation_token);let selected,subject='',intent=mode(data.question),matches;
  if(data.selected_detail){
   const choice=prior?.choices?.get(data.selected_detail);if(!choice)throw Error('제공된 선택지만 선택해주세요.');selected=slides.find(s=>s.id===prior.slide);
   if(choice.intent)intent=choice.intent;else{intent=prior.intent;subject=choice.subject;}
  }else{
   matches=HaebaekSearch.search(slides,data.question,prior?.slide);
   if(data.selected_topic_id){selected=matches.find(s=>s.id===data.selected_topic_id);if(!selected)throw Error('선택한 자료가 변경되었습니다. 다시 질문해주세요.');}
   else if(matches.length){
    const best=matches[0];const tied=matches.filter(s=>s.score===best.score&&s.titleMatches===best.titleMatches);
    if(new Set(tied.map(s=>s.title)).size>1){return {action:'clarification_choices',message:'찾으시는 업무를 선택해주세요.',choices:tied.map(s=>({id:s.id,label:s.title,filename:s.filename})),results:[],selection_token:'static-source-selection',understanding:{intent}};}
    selected=best;
   }
  }
  if(!selected)return empty();
  const id='conversation:'+ ++sequence;const state={slide:selected.id,intent,subject:'',choices:new Map()};
  let query=compact(data.question);for(const [alias,canonical] of rules.aliases||[])if(alias.length>=2)query=query.split(compact(alias)).join(compact(canonical));
  if(!subject){const subjects=Object.keys(selected.subject_answers||{}).filter(s=>compact(s).length>=3&&query.includes(compact(s))).sort((a,b)=>compact(b).length-compact(a).length);subject=subjects[0]||(prior?.slide===selected.id?prior.subject:'')||'';}
  state.subject=subject;let answer=(subject?selected.subject_answers?.[subject]?.[intent]:null)||selected.answers?.[intent];
  if(!answer)throw Error('게시 자료의 원본 답변 데이터가 없습니다. 관리자가 자료를 다시 게시해야 합니다.');
  if(intent==='general'){
   for(const key of ['period','procedure','approval','documents','forms'])if(selected.answers?.[key]?.facts?.length)state.choices.set('intent:'+key,{intent:key,label:names[key]});
  }else if(intent==='period'&&!subject){
   const facts=answer.facts||[],subjects=[...new Set(facts.map(f=>f.subject).filter(Boolean))],numbers=new Set(facts.map(f=>JSON.stringify(f.numbers||[])));
   if(subjects.length>1&&numbers.size>1)subjects.forEach((value,i)=>state.choices.set('subject:'+i,{subject:value,label:value}));
  }
  contexts.set(id,state);if(contexts.size>40)contexts.delete(contexts.keys().next().value);
  if(state.choices.size>1)return {action:'clarification_choices',message:intent==='general'?'어떤 내용이 궁금하신가요?':'어떤 대상에 대해 궁금하신가요?',detail_choices:true,choices:[...state.choices].map(([key,value])=>({id:key,label:value.label,filename:selected.filename})),conversation_token:id,results:[],understanding:{intent}};
  return {action:'direct_answer',answer,results:[source(selected)],conversation_token:id,feedback_token:'static-unavailable',understanding:{intent}};
 }
 window.HaebaekPagesAPI={ready,request};
})();
