/* Local files only: no network requests, persistence, telemetry or uploads. */
(()=>{
 'use strict';
 const P='http://schemas.openxmlformats.org/presentationml/2006/main',A='http://schemas.openxmlformats.org/drawingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const documents=new Map();let imageUrls=[];
 function xml(text){if(text.length>8*1024*1024||/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('지원하지 않는 XML입니다.');const d=new DOMParser().parseFromString(text,'application/xml');if(d.querySelector('parsererror'))throw Error('PPT XML을 읽지 못했습니다.');return d;}
 function descendants(e,ns,name){return [...e.getElementsByTagNameNS(ns,name)];}
 async function readXml(zip,path){const file=zip.file(path);if(!file)throw Error('PPT 구조를 확인해주세요.');return xml(await file.async('string'));}
 function resolve(base,target){if(/^(?:https?:|file:|\/)/i.test(target))throw Error('외부 자료 참조는 지원하지 않습니다.');const parts=base.split('/');parts.pop();for(const part of target.split('/')){if(part==='..')parts.pop();else if(part!=='.')parts.push(part);}return parts.join('/');}
 function extract(d){const blocks=[],seen=new Set();let ordinal=0;const root=descendants(d,P,'spTree')[0];
  function visit(e,tr){if(e.localName==='grpSp'){
    const pr=[...e.children].find(x=>x.localName==='grpSpPr'),x=pr&&descendants(pr,A,'xfrm')[0];let next=tr;
    if(x){const get=(n,a,f)=>Number([...x.children].find(c=>c.localName===n)?.getAttribute(a)??f);const sx=get('ext','cx',1)/Math.max(1,get('chExt','cx',1)),sy=get('ext','cy',1)/Math.max(1,get('chExt','cy',1));next={sx:tr.sx*sx,sy:tr.sy*sy,x:tr.x+tr.sx*(get('off','x',0)-sx*get('chOff','x',0)),y:tr.y+tr.sy*(get('off','y',0)-sy*get('chOff','y',0))};}
    for(const child of e.children)if(child.namespaceURI===P&&!child.localName.endsWith('Pr'))visit(child,next);return;}
   const paragraphs=descendants(e,A,'p');const lines=paragraphs.map(p=>{seen.add(p);return descendants(p,A,'t').map(t=>t.textContent).join('');}).filter(t=>t.trim());if(!lines.length)return;
   const x=descendants(e,A,'xfrm')[0],off=x&&[...x.children].find(c=>c.localName==='off');const ph=descendants(e,P,'ph')[0];
   blocks.push({x:tr.x+tr.sx*Number(off?.getAttribute('x')||0),y:tr.y+tr.sy*Number(off?.getAttribute('y')||0),order:ordinal++,lines,title:['title','ctrTitle'].includes(ph?.getAttribute('type'))});
  }
  if(root)for(const shape of root.children)if(shape.namespaceURI===P&&!shape.localName.endsWith('Pr'))visit(shape,{sx:1,sy:1,x:0,y:0});
  for(const p of descendants(d,A,'p'))if(!seen.has(p)){const text=descendants(p,A,'t').map(t=>t.textContent).join('');if(text.trim())blocks.push({x:0,y:Infinity,order:ordinal++,lines:[text],title:false});}
  blocks.sort((a,b)=>a.y-b.y||a.x-b.x||a.order-b.order);const lines=blocks.flatMap(b=>b.lines);const title=blocks.find(b=>b.title)?.lines.join(' ')||lines.find(s=>s.trim().length>3&&!/^[①-⑳➊-➓\d\s]+$/.test(s))||'제목 없음';return {title,text:lines.join('\n')};
 }
 async function parsePpt(file){if(file.size>50*1024*1024)throw Error('PPT는 파일당 50MB 이하로 선택해주세요.');let zip=await JSZip.loadAsync(file);let original=file.name,images=null;
  if(file.name.toLowerCase().endsWith('.zip')){const ppt=zip.file('original.pptx');if(!ppt)throw Error('묶음 ZIP에는 original.pptx가 필요합니다.');images=zip;const manifest=zip.file('manifest.json');if(manifest){try{original=JSON.parse(await manifest.async('string')).original_filename||original;}catch{throw Error('자료 묶음 설명을 읽지 못했습니다.');}}zip=await JSZip.loadAsync(await ppt.async('uint8array'));}
  else if(!file.name.toLowerCase().endsWith('.pptx'))throw Error('PPTX 또는 사전 변환 ZIP을 선택해주세요.');
  if(Object.keys(zip.files).length>10000)throw Error('PPT 내부 파일이 너무 많습니다.');
  const presentation=await readXml(zip,'ppt/presentation.xml'),rels=await readXml(zip,'ppt/_rels/presentation.xml.rels');const targets=new Map([...rels.documentElement.children].filter(x=>x.getAttribute('TargetMode')!=='External').map(x=>[x.getAttribute('Id'),resolve('ppt/presentation.xml',x.getAttribute('Target'))]));
  const ids=descendants(presentation,P,'sldId');if(!ids.length||ids.length>300)throw Error('PPT는 1~300장으로 선택해주세요.');const slides=[];
  for(let n=0;n<ids.length;n++){const path=targets.get(ids[n].getAttributeNS(R,'id'));if(!path)throw Error('슬라이드 연결 정보가 없습니다.');const doc=await readXml(zip,path);const data=extract(doc);const hidden=['0','false'].includes(doc.documentElement.getAttribute('show'));
   const slide={...data,id:original+'::'+(n+1),number:n+1,filename:original,hidden,image:null};
   if(images){const image=images.file(`slides/slide-${n+1}.png`);if(image){const blob=await image.async('blob');if(blob.size>16*1024*1024)throw Error('슬라이드 이미지가 너무 큽니다.');slide.image=URL.createObjectURL(new Blob([blob],{type:'image/png'}));imageUrls.push(slide.image);}}
   slides.push(slide);await new Promise(r=>setTimeout(r,0));}
  return {name:original,slides};
 }
 function active(){return [...documents.values()].flatMap(d=>d.slides).filter(s=>!s.hidden);}
 function update(){const selection=document.getElementById('image-document');const previous=selection.value;selection.replaceChildren();for(const doc of documents.values()){const option=document.createElement('option');option.value=doc.name;option.textContent=doc.name;selection.append(option);}if(documents.has(previous))selection.value=previous;
  const slides=active();document.getElementById('local-summary').textContent=`이 탭의 자료 ${documents.size}개 · 검색 가능한 슬라이드 ${slides.length}장 · 이미지 ${slides.filter(s=>s.image).length}장`;
  const inspection=document.getElementById('local-inspection');inspection.replaceChildren();for(const slide of slides){const item=document.createElement('details'),heading=document.createElement('summary'),text=document.createElement('pre');heading.textContent=slide.filename+' · '+slide.number+'번 · '+slide.title;text.textContent=slide.text;item.append(heading,text);if(/(?:[\w.+-]+@[\w.-]+\.[a-z]{2,}|0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}|\d{6}[- ]?[1-4]\d{6})/i.test(slide.text)){const warning=document.createElement('p');warning.textContent='확인 필요: 이메일·전화번호·개인 식별번호 형태가 발견됐습니다.';item.append(warning);}inspection.append(item);}document.dispatchEvent(new CustomEvent('local-corpus',{detail:slides}));}
 document.getElementById('local-ppt').addEventListener('change',async e=>{const status=document.getElementById('local-status');try{for(const file of e.target.files){status.textContent=`${file.name}을 이 기기에서 읽고 있습니다…`;const doc=await parsePpt(file);const old=documents.get(doc.name);old?.slides.forEach(s=>{if(s.image)URL.revokeObjectURL(s.image);});documents.set(doc.name,doc);update();}status.textContent='자료가 연결됐습니다. 질문을 입력해주세요. 파일은 외부로 전송되지 않았습니다.';}catch(error){status.textContent=error.message||'PPT를 읽지 못했습니다.';}finally{e.target.value='';}});
 document.getElementById('local-images').addEventListener('change',e=>{const doc=documents.get(document.getElementById('image-document').value),status=document.getElementById('local-status');if(!doc){status.textContent='PPT를 먼저 선택해주세요.';return;}let count=0;for(const file of e.target.files){const match=file.name.match(/(?:slide|슬라이드)[\s_-]*(\d+)\.(png|jpe?g)$/i)||file.name.match(/^(\d+)\.(png|jpe?g)$/i);if(!match||file.size>16*1024*1024||!/^image\/(?:png|jpeg)$/.test(file.type))continue;const slide=doc.slides.find(s=>s.number===Number(match[1]));if(!slide)continue;if(slide.image)URL.revokeObjectURL(slide.image);slide.image=URL.createObjectURL(file);imageUrls.push(slide.image);count++;}update();status.textContent=count?`${count}장 이미지가 해당 PPT에 연결됐습니다.`:'이미지는 Slide1.png 또는 슬라이드1.png 형식으로 선택해주세요.';e.target.value='';});
 document.getElementById('clear-local').addEventListener('click',()=>{imageUrls.forEach(u=>URL.revokeObjectURL(u));imageUrls=[];documents.clear();update();document.getElementById('local-status').textContent='이 탭에서 읽은 자료를 모두 해제했습니다.';});
 window.HaebaekLocal={extract,parsePpt,active};
})();
