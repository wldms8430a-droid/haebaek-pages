/* Local corpus retrieval. No API, AI model, credentials or question logging. */
(function(root){
  'use strict';
  const stop=new Set(['가상','안내','예시','알려줘','알려주세요','신청방법','신청','신청해','신청해야','제출','제출해','방법','어떻게','해','돼','하면','며칠','며칠이야','얼마나','사용할','수','있어','언제','언제까지','제출해야','서류','필요해','뭐','기간','신청기간','첨부서류','작성','순서','누구한테','확인받아','양식','보여줘','어디','기한']);
  let rules={aliases:[],common:[],request:[...stop],typos:{},modes:{}};
  function configure(value){rules=value;}
  function norm(s){let value=s.normalize('NFKC').toLowerCase().replace(/몇일/g,'며칠');for(const [a,b] of Object.entries(rules.typos||{}))value=value.split(a).join(b);return value.replace(/[·ㆍ•/\\‐‑–—−_\-]/g,' ').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();}
  const compact=s=>norm(s).replace(/ /g,'');
  function requestOnly(word){const reachable=new Set([0]);for(let i=0;i<word.length;i++)if(reachable.has(i))for(const term of [...(rules.request||[]),...stop])if(term&&word.startsWith(term,i))reachable.add(i+term.length);return reachable.has(word.length);}
  function vocabulary(){const map=new Map();for(const [alias,target] of rules.aliases||[])for(const value of [alias,target])map.set(compact(value),compact(target));return [...map].sort((a,b)=>b[0].length-a[0].length||a[0].localeCompare(b[0]));}
  function occurrences(value){const raw=compact(value),occupied=new Set(),matches=[];
    for(const [term,target] of vocabulary()){if(!term)continue;let start=raw.indexOf(term);while(start>=0){const end=start+term.length;const mode=rules.modes?.[term];
      const positions=[];let pos=0;for(const char of norm(value)){if(char!==' ')positions.push(pos);pos++;}const normalized=norm(value),tail=normalized.slice((positions[end-1]??-1)+1).split(' ')[0];
      const validMode=!mode||((!start||normalized[(positions[start]||0)-1]===' ')&&(mode==='word'?!tail:!tail||/^(?:(?:이|가|은|는|을|를|의|도|요|서|면|고|다|께서|부터|까지))+$/.test(tail)));
      const ascii=/^[a-z0-9]+$/i.test(term);const validAscii=!ascii||(!/[a-z0-9]/i.test(raw[start-1]||' ' )&&!/[a-z0-9]/i.test(raw[end]||' '));
      if(validMode&&validAscii&&!(term.length===1&&!mode&&(start!==0||end<raw.length&&!/^(이|가|은|는|도|의|께|결혼|사망)/.test(raw.slice(end))))&&![...Array(term.length)].some((_,i)=>occupied.has(start+i))){for(let i=start;i<end;i++)occupied.add(i);matches.push({start,end,target});}start=raw.indexOf(term,start+1);}}
    return matches.sort((a,b)=>a.start-b.start);
  }
  function titleTerms(title){return norm(title).split(' ').filter(w=>w.length>=2&&!new Set([...(rules.common||[]),...stop,'신청서','휴직원','휴가신청서','모성휴가신청서','작성사항','결재정보수정']).has(w));}
  function intent(q){if(/언제|기한|까지/.test(q))return 'deadline';if(/며칠|몇일|기간|얼마나|쉬어/.test(q))return 'duration';if(/서류|첨부|필요/.test(q))return 'documents';if(/방법|신청|작성|절차|결재/.test(q))return 'procedure';return 'general';}
  function search(slides,q,context){
    const cleaned=norm(q),raw=compact(q),found=occurrences(q),canonical=new Set(found.map(m=>m.target));let expanded=raw;
    for(const m of [...found].reverse())expanded=expanded.slice(0,m.start)+m.target+expanded.slice(m.end);
    const removed=new Set();for(const m of found)for(let i=m.start;i<m.end;i++)removed.add(i);
    let count=0;const residue=[...cleaned].map(c=>c===' '?c:removed.has(count++)?' ':c).join('');
    const sourceTerms=[...new Set(slides.flatMap(s=>titleTerms(s.title)))];const common=(rules.common||[]).filter(w=>raw.includes(compact(w)));
    let specific=[];for(const word of residue.split(' ').filter(w=>w.length>=2)){
      if(requestOnly(word)||common.some(c=>['','은','는','을','를','의','해야','해야돼','해','이야'].some(s=>word===c+s)))continue;
      let rest=word;const chosen=[];for(const term of [...sourceTerms].sort((a,b)=>b.length-a.length))if(rest.includes(term)){chosen.push(term);rest=rest.split(term).join('');}
      if(chosen.length&&(!rest||requestOnly(rest)||/^(?:은|는|이|가|을|를|의|님)+$/.test(rest)))specific.push(...chosen);else specific.push(word);
    }specific=[...new Set(specific)];
    if(!canonical.size&&!specific.length)return context?slides.filter(s=>s.id===context).map(s=>({...s,score:0,matched:[]})):[];
    const prepared=slides.filter(s=>!s.hidden).map(s=>({slide:s,title:compact(s.title),body:compact(s.title+'\n'+s.text),canon:new Set(occurrences(s.title+'\n'+s.text).map(m=>m.target)),heading:new Set(occurrences(s.title).map(m=>m.target)),literal:titleTerms(s.title).filter(t=>raw.includes(t))}));
    const phrases=[raw,expanded].filter(p=>p.length>=4);const eligible=prepared.filter(s=>[...canonical].every(c=>s.canon.has(c))&&(!specific.length||specific.filter(t=>s.body.includes(t)).length/specific.length>=.75));const headingMatch=s=>[...canonical].some(c=>[...s.heading].some(h=>h===c||h.startsWith(c)));const headingAnchor=canonical.size&&eligible.some(headingMatch),exact=eligible.some(s=>phrases.some(p=>s.title.includes(p)));
    const results=[];for(const s of eligible){
      if([...canonical].some(c=>!s.canon.has(c))||exact&&!phrases.some(p=>s.title.includes(p)))continue;
      const hits=specific.filter(t=>s.body.includes(t));if(specific.length&&hits.length/specific.length<.75)continue;
      if(!(canonical.size||s.literal.length||hits.length>=2||hits.some(t=>t.length>=4)))continue;
      let score=(headingMatch(s)||s.literal.length||hits.some(t=>s.title.includes(t)))?8:0;
      score+=7*canonical.size+(phrases.some(p=>s.body.includes(p))?6:0)+2*hits.length+.25*common.filter(t=>s.body.includes(compact(t))).length+(hits.length+canonical.size>=2?2:0);
      if(score>=8)results.push({...s.slide,score,titleMatches:hits.filter(t=>s.title.includes(t)).length,matched:[...new Set([...canonical,...hits,...s.literal])]});
    }return results.sort((a,b)=>b.score-a.score||b.titleMatches-a.titleMatches||a.filename.localeCompare(b.filename)||a.number-b.number).slice(0,10);
  }
  function conditions(slide){const lines=slide.text.split('\n');const out=[];let block=null;
    for(const line of lines){if(/^\s*[•●]\s*/.test(line)){if(block)out.push(block);block={label:line.replace(/^\s*[•●]\s*/,''),lines:[]};}
      else if(/^\s*</.test(line)){if(block){out.push(block);block=null;}}
      else if(block)block.lines.push(line);}
    if(block)out.push(block);return out;
  }
  const api={configure,norm,intent,search,conditions};root.HaebaekSearch=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
