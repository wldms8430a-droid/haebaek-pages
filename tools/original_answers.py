"""Extractive answers: business facts are exact spans in the selected source.
No LLM, invented numbers, legal knowledge or topic-specific answer templates.
"""
from dataclasses import dataclass
import re
from original_lexical import forms, expand_query

UNCONFIRMED='현재 등록된 간호국 자료에서는 해당 내용을 확인하기 어렵습니다.'
RELATIONS={'본인','자녀','부모','배우자','형제자매','조부모','외조부모'}
INTENTS={
 'documents':('서류','첨부','뭐내','무슨서류'),
 'approval':('결재','전결','합의'),
 'deadline':('언제','기한','언제까지'),
 'procedure':('신청방법','신청해','어떻게','절차','기안','작성방법','사직하려','뭐해야'),
 'period':('며칠','몇일','쉬어','얼마나','기간','시간','휴가있어'),
}


@dataclass
class Fact:
    subject:str
    label:str
    quote:str
    start:int
    end:int


def render_fact(fact):
    # Shorten an explicit form-field value only; preserve the original span
    # and qualifiers for every other kind of statement.
    period=re.fullmatch(r'신청기간\s*[:：]\s*해당기간\s*작성\s*\((\d+일)\)',fact['quote'])
    if period and fact['subject']:return fact['subject']+': '+period[1]
    return (fact['subject']+' — ' if fact['subject'] else '')+fact['quote']


def facts(text,title):
    lines=text.splitlines(keepends=True);offsets=[];offset=0
    for line in lines:offsets.append(offset);offset+=len(line)
    found=[];subject=title;in_details=False;i=0
    while i<len(lines):
        line=lines[i].strip()
        if line.startswith('•'):
            subject=line.lstrip('• ').strip();in_details=True;i+=1;continue
        section=line.strip('<> ')
        if section=='신청내역':in_details=True
        if line.startswith('<') and section in {'기안순서','결재정보수정'}:
            j=i+1
            while j<len(lines) and not lines[j].strip().startswith('<'):j+=1
            chunk=''.join(lines[i+1:j])
            if section=='결재정보수정':
                # Only explicit approval lines, not screenshot overlay names.
                for k in range(i+1,j):
                    if '→' in lines[k]:
                        found.append(Fact('', '결재선',lines[k].strip(),offsets[k],offsets[k]+len(lines[k].rstrip())))
                    elif re.match(r'^(?:\d+[).]\s*)?[가-힣A-Za-z][^:：–—-]{0,24}\s*[:：–—-]\s*\S', lines[k].strip()):
                        # Explicit instructions (recipient/classification etc.)
                        # belong to approval too; plain screenshot names do not.
                        quote = lines[k].strip()
                        start = offsets[k] + len(lines[k]) - len(lines[k].lstrip())
                        found.append(Fact('', '결재정보수정', quote, start, start + len(quote)))
            elif chunk.strip():
                end=offsets[j] if j<len(lines) else len(text)
                found.append(Fact('','기안순서',text[offsets[i+1]:end].rstrip(),offsets[i+1],end-len(text[offsets[i+1]:end])+len(text[offsets[i+1]:end].rstrip())))
            i=j;continue
        match=re.match(r'^([^:：]{1,25})[:：]\s*(.*)',line)
        # Explicit field headings after a task record. Never collect employee
        # form IDs/phone examples or screenshot artifacts as answer facts.
        if match and not re.search(r'사원|사번|성명|이름|연락처|발령|주소|청원사유|^Ex$',match[1],re.I):
            label=match[1].strip();j=i+1
            while j<len(lines):
                following=lines[j].strip()
                if following.startswith(('<','•','◀','▲')) or re.match(r'^[^:：]{1,25}[:：]',following) or re.fullmatch(r'[➊➋➌①②③V√XxoO\d ]+',following):break
                j+=1
            end=offsets[j] if j<len(lines) else len(text)
            chunk=text[offsets[i]:end].rstrip();end=offsets[i]+len(chunk)
            duration_rows=[k for k in range(i,j) if re.match(r'^(?:신청기간\s*[:：]\s*)?\(\d+일\)',lines[k].strip())]
            if len(duration_rows)>1:
                for k in duration_rows:
                    quote=lines[k].strip();sub=re.sub(r'^.*?\(\d+일\)\s*','',quote)
                    start=offsets[k]+len(lines[k])-len(lines[k].lstrip())
                    found.append(Fact(sub,label,quote,start,start+len(quote)))
            else:
                field_subject=label if any(rel in forms(label).compact for rel in RELATIONS) else subject
                found.append(Fact(field_subject,label,chunk,offsets[i],end))
            i=j;continue
        # Unlabelled document sections are still explicit source spans.
        inline_section=re.match(r'^<(첨부서류|참고사항)>\s*(.*)',line)
        if inline_section and in_details:
            section=inline_section[1]
            j=i+1
            while j<len(lines) and not lines[j].strip().startswith(('<','•','➊','➋','➌')):j+=1
            end=offsets[j] if j<len(lines) else len(text)
            value_start=lines[i].find('>')+1
            value_start+=len(lines[i][value_start:])-len(lines[i][value_start:].lstrip())
            start=offsets[i]+value_start if inline_section[2] else offsets[i+1] if i+1<len(lines) else len(text)
            chunk=text[start:end].rstrip()
            if chunk:found.append(Fact(subject,section,chunk,start,start+len(chunk)))
            i=j;continue
        i+=1
    return found


def intent(question):
    query=forms(question).compact
    for name,terms in INTENTS.items():
        if any(term in query for term in terms):return name
    return 'general'


def selected_relations(question,rules):
    expansion=expand_query(question,rules)
    query=' '.join(v.normalized for v in expansion.variants)
    matches=[rel for rel in RELATIONS if rel in forms(query).compact]
    if '조부모' in matches or '외조부모' in matches:matches=[v for v in matches if v!='부모']
    return matches


def numerical_phrases(text):
    """Match repeated literal contexts, never compare unrelated day counts."""
    entries=[]
    for line in text.splitlines():
        compact=forms(line).compact
        for match in re.finditer(r'(\d+)(개월|시간|회|일|년|월|주|세)',compact):
            left=compact[max(0,match.start()-5):match.start()]
            right=compact[match.end():match.end()+4]
            if len(left)>=4 and len(right)>=4:entries.append(((left,match[2],right),match[1]))
    return entries


def answer(question,slide,version,rules):
    mode=intent(question);relations=selected_relations(question,rules)
    extracted=facts(slide.extracted_text,slide.title)
    subjects={f.subject for f in extracted if f.subject}
    query=forms(' '.join(v.normalized for v in expand_query(question,rules).variants)).compact
    # Prefer a literal task record matching the question/title, then scope by
    # relationships. No business name or day count is selected in code.
    exact=[s for s in subjects if len(forms(s).compact)>=4 and forms(s).compact in query]
    common_subjects={s for s in subjects if forms(s).compact in forms(slide.title).compact}
    if not exact:
        exact=[s for s in subjects if len(forms(s).compact)>=4 and forms(s).compact in forms(slide.title).compact and s!=slide.title]
    if exact:extracted=[f for f in extracted if not f.subject or f.subject in exact]
    if relations:
        matches=[]
        for subject in {f.subject for f in extracted if f.subject}:
            compact=forms(subject).compact
            if all(rel in compact for rel in relations):
                # Parent is not grandparent. Source conditions are matched,
                # never inferred from the first number on the slide.
                if '부모' in relations and any(t in compact for t in ('조부모','백숙부모','외숙모')):continue
                matches.append(subject)
        if matches:
            shortest=min(len(forms(s).compact) for s in matches)
            matches=[s for s in matches if len(forms(s).compact)==shortest]
            extracted=[f for f in extracted if not f.subject or f.subject in matches or f.subject in common_subjects]
        elif any(all(rel in forms(' '.join(f.quote for f in extracted if f.subject==subject)).compact for rel in relations) for subject in subjects):
            # A single task record can express its target in a criteria field
            # rather than in the heading (e.g. child age criteria).
            matching={subject for subject in subjects if all(rel in forms(' '.join(f.quote for f in extracted if f.subject==subject)).compact for rel in relations)}
            extracted=[f for f in extracted if not f.subject or f.subject in matching]
        elif any(f.subject for f in extracted) and mode not in {'procedure','approval'}:
            return {'scope':'specific','intent':mode,'text':UNCONFIRMED,'facts':[],'reason':'관계에 맞는 원문 기준을 확정할 수 없음','warnings':[]}
    def relevant(f):
        if mode=='documents':return '서류' in f.label or '첨부' in f.label or (f.label=='참고사항' and ('신청서' in f.quote or '서류' in f.quote))
        if mode=='approval':return any(term in f.label for term in ('결재','전결','합의'))
        if mode=='procedure':return f.label=='기안순서' or any(term in f.label for term in ('결재','전결','합의','절차')) or '작성' in f.quote or '신청서' in f.quote
        if mode=='deadline':return '기한' in f.label or bool(re.search(r'(?:일|개월|월).{0,4}(?:전|이전|까지)',f.quote))
        if mode=='period':
            if '시간' in question:return '시간' in f.quote or '시간' in f.label
            return any(term in f.label for term in ('기간','기준','유형','시간'))
        return True
    chosen=[f for f in extracted if relevant(f)]
    if mode=='general':
        # A rare literal condition in the question selects the containing
        # source line, preserving its qualifiers and exact citation offsets.
        tokens=[word for word in forms(question).normalized.split() if len(word)>=3]
        anchors=[word for word in tokens if sum(word in forms(f.quote).compact for f in extracted)==1 and word not in forms(slide.title).compact]
        if anchors:
            focused=[]
            for fact in chosen:
                cursor=fact.start
                for line in fact.quote.splitlines(keepends=True):
                    if all(word in forms(line).compact for word in anchors):
                        start=cursor+len(line)-len(line.lstrip());quote=line.strip()
                        focused.append(Fact(fact.subject,fact.label,quote,start,start+len(quote)))
                    cursor+=len(line)
            if focused:chosen=focused
    warnings=[]
    needs_review=False
    contexts={}
    for key,value in numerical_phrases(slide.extracted_text):contexts.setdefault(key,set()).add(value)
    disputed={key for key,values in contexts.items() if len(values)>1}
    if any(key in disputed for fact in chosen for key,value in numerical_phrases(fact.quote)):
        needs_review=True
        warnings.append('같은 슬라이드의 동일 표현에 서로 다른 수치가 있습니다. 아래 원문은 확정 기준이 아니며 담당 부서 확인이 필요합니다.')
    if '부모' in relations and '배우자' not in relations:
        for fact in chosen:
            if '배우자부모' in forms(fact.subject).compact:
                clauses=re.split(r'[,;/]',fact.subject)
                if not any('부모' in clause and '배우자' not in clause and not any(term in clause for term in ('조부모','백숙부모')) for clause in clauses):
                    needs_review=True
        if needs_review:warnings.append('원문에 “배우자 부모사망”으로 표기되어 있어 본인 부모와의 적용 구분은 확정하기 어렵습니다. 아래 원문을 확인하고 담당 부서에 문의해주세요.')
    if getattr(slide,'manually_edited',False):warnings.append('관리자가 수정한 검색 원문을 기준으로 안내합니다. 원본 슬라이드 이미지와 다를 수 있습니다.')
    # Multiple unrelated records on one source page are exposed to review;
    # do not silently recommend mixed-task documents.
    if exact and len(subjects)>1 and mode in {'documents','general'}:
        warnings.append('원문에 다른 업무 항목이 함께 있어 첨부서류를 확정하기 어렵습니다. 담당 부서 확인이 필요합니다.')
        chosen=[f for f in chosen if '서류' not in f.label and '첨부' not in f.label]
    output=[]
    for fact in chosen[:24]:
        assert slide.extracted_text[fact.start:fact.end]==fact.quote
        output.append({'subject':fact.subject,'label':fact.label,'quote':fact.quote,'start':fact.start,'end':fact.end,
            'slide_id':slide.id,'version_id':version.id,'slide_number':slide.slide_number,'filename':version.original_filename,
            'numbers':re.findall(r'(?:\d+(?:[.~]\d+)?|½)\s*(?:년|개월|월|일|주|세|시간|원)',fact.quote)})
    scope='specific' if relations else 'broad'
    text='\n'.join(render_fact(f) for f in output) if output else UNCONFIRMED
    if scope=='broad' and len({f['subject'] for f in output if f['subject']})>1:
        text='대상·조건에 따라 기준이 다릅니다. 원문 기준을 함께 안내합니다.\n'+text
    if needs_review:text=UNCONFIRMED+'\n자료에는 다음과 같이 표기되어 있습니다:\n'+text
    return {'scope':scope,'intent':mode,'text':text,'facts':output,'reason':'원문 기준이 명확하지 않아 검수 필요' if needs_review else None if output else '질문 범위의 사실이 원문에서 확인되지 않음','warnings':warnings,'needs_review':needs_review}
