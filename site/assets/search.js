/* Public fictional corpus only. No API, model download, credentials or logging. */
(function(root){
  'use strict';
  const stop=new Set(['가상','안내','예시','알려줘','알려주세요','신청방법','신청','신청해','신청해야','제출','제출해','방법','어떻게','해','돼','하면','며칠','며칠이야','얼마나','사용할','수','있어','언제','언제까지','제출해야','서류','필요해','뭐','기간','신청기간','첨부서류','작성','순서','누구한테','확인받아','양식','보여줘','어디','기한']);
  function norm(s){return s.normalize('NFKC').toLowerCase().replace(/몇일/g,'며칠').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();}
  function intent(q){if(/언제|기한|까지/.test(q))return 'deadline';if(/며칠|몇일|기간|얼마나|쉬어/.test(q))return 'duration';if(/서류|첨부|필요/.test(q))return 'documents';if(/방법|신청|작성|절차|결재/.test(q))return 'procedure';return 'general';}
  function search(slides,q,context){
    const cleaned=norm(q);const terms=cleaned.split(' ').map(t=>t.replace(/(?:인가요|이야|은|는|을|를)$/,'')).filter(t=>t.length>1&&!stop.has(t));
    if(!terms.length)return context?slides.filter(s=>s.id===context).map(s=>({...s,score:0})):[];
    return slides.map(s=>{const title=norm(s.title),text=norm(s.text),compact=(title+' '+text).replace(/ /g,'');let score=0;
      for(const term of terms){if(!compact.includes(term.replace(/ /g,'')))return null;score+=title.includes(term)?12:3;}
      if(cleaned.includes(title.replace(/가상 | 안내/g,'')))score+=5;
      return {...s,score};}).filter(Boolean).sort((a,b)=>b.score-a.score||a.number-b.number).slice(0,3);
  }
  function conditions(slide){const lines=slide.text.split('\n');const out=[];let block=null;
    for(const line of lines){if(/^\s*[•●]\s*/.test(line)){if(block)out.push(block);block={label:line.replace(/^\s*[•●]\s*/,''),lines:[]};}
      else if(/^\s*</.test(line)){if(block){out.push(block);block=null;}}
      else if(block)block.lines.push(line);}
    if(block)out.push(block);return out;
  }
  const api={norm,intent,search,conditions};root.HaebaekSearch=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
