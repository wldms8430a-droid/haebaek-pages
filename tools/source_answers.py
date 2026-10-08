"""Use the original extractive answer compiler for published PPT metadata."""
import json,re
from pathlib import Path
from types import SimpleNamespace
from original_answers import answer,facts
from original_lexical import AliasRule

QUERIES={'general':'','period':' 며칠','procedure':' 신청방법','deadline':' 언제까지','documents':' 첨부서류','approval':' 결재선'}

def compile_record(record):
    rules_data=json.loads((Path(__file__).resolve().parents[1]/'site/assets/search-rules.json').read_text(encoding='utf8'))
    rules=[AliasRule(a,b,rules_data.get('modes',{}).get(a,'substring')) for a,b in rules_data['aliases']]
    slide=SimpleNamespace(id=record['id'],title=record['title'],extracted_text=record['text'],slide_number=record['number'])
    version=SimpleNamespace(id=record['filename'],original_filename=record['filename'])
    def compiled(subject):
        values={mode:answer(subject+' '+slide.title+question,slide,version,rules) for mode,question in QUERIES.items()}
        match=re.search(r'^.*(?:신청서|휴직원|복직원|사직서|양식|서식).*$',slide.extracted_text,re.M)
        if match:
            quote=match[0].rstrip();values['forms']={'intent':'forms','scope':'broad','text':'등록된 자료의 양식·작성 예시를 찾았어요.','facts':[{'subject':'','label':'양식','quote':quote,'start':match.start(),'end':match.start()+len(quote),'slide_id':slide.id,'version_id':version.id,'slide_number':slide.slide_number,'filename':version.original_filename,'numbers':[]}],'warnings':['참고자료에 등록된 양식·작성 예시를 확인해주세요.'],'needs_review':False}
        return values
    subjects=list(dict.fromkeys(f.subject for f in facts(slide.extracted_text,slide.title) if f.subject))
    record['answers']=compiled('');record['subject_answers']={subject:compiled(subject) for subject in subjects}
    return record
