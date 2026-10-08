"""Deterministic lexical retrieval. No stemming, semantic inference or answers.

Aliases are explicit administrator-approved lexical equivalences. Original
questions/source are retained. Common words alone never establish relevance.
"""
from dataclasses import dataclass
import re
import unicodedata


TYPO_MAP = {"결제":"결재", "리프레시":"리프레쉬"}
DEFAULT_ALIASES = (
    ("육휴", "육아휴직"), ("출휴", "출산휴가"), ("복귀", "복직"),
    ("사직", "퇴직"), ("퇴사", "퇴직"),
    ("리프레시휴가", "리프레쉬 휴가"), ("장기근속휴가", "리프레쉬 휴가"),
    ("난임휴가", "난임치료휴가"), ("유산휴가", "유산·사산휴가"),
    ("사산휴가", "유산·사산휴가"), ("유사산휴가", "유산·사산휴가"),
    ("남편 출산휴가", "배우자 출산휴가"), ("아빠 출산휴가", "배우자 출산휴가"),
    ("결혼휴가", "청원휴가 결혼"),
)
# These broad expressions are not strong synonyms, even through admin APIs.
RISKY_ALIASES = {"청첩장", "진단서", "증빙", "장례", "서류", "신청", "휴가", "휴직"}
COMMON_WORDS = {"서류", "제출서류", "첨부서류", "신청기한", "신청", "휴가", "휴직", "제출", "첨부", "기한", "기간", "절차", "기안", "결재", "진단서", "증빙", "청첩장", "장례", "작성"}
QUESTION_WORDS = {"알려줘", "알려주세요", "주세요", "언제까지", "언제", "어떻게", "뭐", "무엇", "뭐야", "해야", "해야돼", "해야돼요", "돼", "돼요", "내야돼", "내야", "며칠이야", "며칠", "얼마", "할", "할때", "때", "랑", "이랑", "은", "는", "이", "가", "을", "를", "의", "원", "있나요", "되나요", "인가요", "대한", "대해", "관련", "방법", "합니다", "하나요", "해줘", "설명", "요", "좀", "어디", "신청해야", "끝나고", "돌아올"}
REQUEST_WORDS = QUESTION_WORDS | COMMON_WORDS | {"서", "하면", "쉬어", "있어", "필요해", "필요", "지", "까지", "해야", "해", "작성", "신청", "제출"}


def request_only(value):
    """Recognize concatenated request words by segmentation, not topic aliases.

    Unknown nouns remain mandatory. No keyword-specific question overrides.
    """
    reachable = {0}
    for start in range(len(value)):
        if start in reachable:
            reachable.update(start + len(word) for word in REQUEST_WORDS if value.startswith(word, start))
    return len(value) in reachable


@dataclass(frozen=True)
class Forms:
    original: str
    normalized: str
    compact: str


def forms(text):
    # NFKC also unifies full-width ASCII. Separator variants become spaces.
    value = unicodedata.normalize("NFKC", text).casefold().strip()
    value = re.sub(r"[·ㆍ•/\\‐‑–—−_\-]+", " ", value)
    value = re.sub(r"[^\w\s]", " ", value)
    normalized = " ".join(value.split())
    return Forms(text, normalized, "".join(normalized.split()))


def correct_typos(text):
    value = forms(text).normalized
    # Explicit curated corrections, not verbs-to-meaning conversions.
    for typo, corrected in TYPO_MAP.items():
        value = value.replace(typo, corrected)
    return value


@dataclass(frozen=True)
class AliasRule:
    alias: str
    canonical_term: str
    match_mode: str = 'substring'


@dataclass
class Expansion:
    original: Forms
    variants: list[Forms]
    canonical_terms: list[str]


def vocabulary(rules):
    pairs = {}
    for rule in rules:
        canonical = forms(correct_typos(rule.canonical_term)).compact
        for value in (rule.alias, rule.canonical_term):
            key = forms(correct_typos(value)).compact
            pairs[key] = canonical
    return sorted(pairs.items(), key=lambda pair: (-len(pair[0]), pair[0]))


def occurrences(text, rules, normalized=None):
    """Longest explicit phrase first, so spouse leave is not general leave.

    This matches known expressions inside Korean suffixes without deleting any
    particles from the entire string. English expressions require boundaries.
    """
    occupied, found = set(), []
    modes={forms(correct_typos(rule.alias)).compact:rule.match_mode for rule in rules}
    positions=[i for i,c in enumerate(normalized or text) if not c.isspace()]
    for term, canonical in vocabulary(rules):
        if not term:
            continue
        for match in re.finditer(re.escape(term), text):
            mode=modes.get(term,'substring')
            if mode in {'word','stem'}:
                source=normalized or text;start=positions[match.start()];end=positions[match.end()-1]+1
                if start and not source[start-1].isspace():continue
                tail=source[end:].split(' ',1)[0]
                if mode=='word' and tail:continue
                if mode=='stem' and tail:
                    reachable={0};suffixes={'이','가','은','는','을','를','의','도','요','서','면','고','다','고서','께서','부터','까지'}
                    for index in range(len(tail)):
                        if index in reachable:reachable.update(index+len(suffix) for suffix in suffixes if tail.startswith(suffix,index))
                    if len(tail) not in reachable:continue
            if len(term)==1 and mode=='substring':
                # Single-syllable relationship aliases must not match inside
                # words such as 딸기/전환형/형식. Compact text loses boundaries,
                # so require start and a grammatical suffix or topic noun.
                tail=text[match.end():]
                if match.start()!=0 or (tail and not tail.startswith(('이','가','은','는','도','의','께','결혼','사망'))):
                    continue
            span = set(range(match.start(), match.end()))
            if span & occupied:
                continue
            if term.isascii() and ((match.start() and text[match.start()-1].isascii() and text[match.start()-1].isalnum()) or
                    (match.end() < len(text) and text[match.end()].isascii() and text[match.end()].isalnum())):
                continue
            occupied |= span
            found.append((match.start(), match.end(), canonical))
    return sorted(found)


def expand_query(question, rules):
    original = forms(question)
    corrected = forms(correct_typos(question))
    found = occurrences(corrected.compact, rules,corrected.normalized)
    expanded = corrected.compact
    for start, end, canonical in reversed(found):
        expanded = expanded[:start] + canonical + expanded[end:]
    canonicals = list(dict.fromkeys(canonical for _, _, canonical in found))
    variants = [original, corrected, forms(expanded)] + [forms(term) for term in canonicals]
    # Keep original even when normalized/compact text happens to equal expansion.
    unique = []
    for variant in variants:
        if variant not in unique:
            unique.append(variant)
    return Expansion(original, unique, canonicals)


def matched_canonicals(text, rules):
    value=forms(correct_typos(text))
    return {canonical for _, _, canonical in occurrences(value.compact, rules,value.normalized)}


def title_terms(title):
    return [word for word in forms(correct_typos(title)).normalized.split()
            if len(word) >= 2 and word not in COMMON_WORDS | QUESTION_WORDS | {"예시", "신청서", "휴직원", "모성휴가신청서", "휴가신청서", "작성사항", "결재정보수정"}]


def keywords(question, rules, source_terms=()):
    value = forms(correct_typos(question)).normalized
    # Remove only recognized alias spans from the keyword residue. No stemming.
    compact = forms(value).compact
    positions = [index for index, char in enumerate(value) if not char.isspace()]
    removed = {positions[index] for start,end,_ in occurrences(compact,rules,value) for index in range(start,end)}
    residue = "".join(" " if index in removed else char for index,char in enumerate(value))
    common = {word for word in COMMON_WORDS if word in value.replace(" ", "")}
    words = [word for word in residue.split() if len(word) >= 2 and word not in QUESTION_WORDS]
    # Tokens containing a recognized alias are represented by canonical terms.
    common_suffixes = ("", "랑", "이랑", "은", "는", "을", "를", "의", "해야", "해야돼", "해야돼요", "할", "해", "이야")
    specific = []
    for word in words:
        if request_only(word) or any(word == common_word + suffix for common_word in common for suffix in common_suffixes):
            continue
        # Extract literal vocabulary from current source titles. This supports
        # future uploaded topics without a curated hospital keyword list.
        matches = [term for term in source_terms if term in word]
        residue = word
        selected = []
        for term in sorted(matches, key=lambda value: (-len(value), value)):
            if term in residue:
                selected.append(term)
                residue = residue.replace(term, " ")
        rest = "".join(residue.split())
        if selected and (not rest or request_only(rest)):
            specific.extend(selected)
        else:
            specific.append(word)
    return list(dict.fromkeys(specific)), common


@dataclass
class Ranked:
    slide: object
    version: object
    score: float
    matched_terms: list[str]


def rank_rows(rows, question, rules, settings, limit=5):
    expansion = expand_query(question,rules)
    canonical = set(expansion.canonical_terms)
    source_terms = {term for slide, _ in rows for term in title_terms(slide.title)}
    specific, common = keywords(question,rules,source_terms)
    prepared = []
    query_compact = forms(correct_typos(question)).compact
    for slide, version in rows:
        # Normally title and body are indexed together. Preserve the existing
        # manual-edit contract: removed body words must not reappear via title.
        searchable = slide.extracted_text if getattr(slide, "manually_edited", False) else slide.title + "\n" + slide.extracted_text
        indexed = getattr(slide, "normalized_search_text", "") or searchable
        body = forms(correct_typos(indexed))
        title = forms(correct_typos(slide.title))
        body_canonical = matched_canonicals(searchable,rules)
        heading_canonical = matched_canonicals(slide.title,rules)
        literal_title_terms = [term for term in title_terms(slide.title) if term in query_compact]
        prepared.append((slide,version,body,title,body_canonical,heading_canonical,literal_title_terms))
    has_heading_anchor = bool(canonical) and any(canonical & row[5] for row in prepared)
    title_phrases = [variant.compact for variant in expansion.variants[:3] if len(variant.compact) >= 4]
    has_exact_heading = any(any(phrase in row[3].compact for phrase in title_phrases) for row in prepared)
    ranked = []
    for slide,version,body,title,body_canonical,heading_canonical,literal_titles in prepared:
        if canonical and not canonical <= body_canonical:
            continue  # Composite topics must coexist, not infer a connection.
        if has_heading_anchor and not canonical & heading_canonical:
            continue  # Avoid recurring boilerplate mentions in unrelated topics.
        if has_exact_heading and not any(phrase in title.compact for phrase in title_phrases):
            continue  # Explicit full title phrase wins over body cross-references.
        hits = [term for term in specific if term in body.compact]
        if specific and len(hits) / len(specific) < .75:
            continue
        title_hits = [term for term in hits if term in title.compact]
        # A broad word alone never passes, even if thresholds are lowered.
        if not (canonical or literal_titles or len(hits) >= 2 or any(len(term) >= 4 for term in hits)):
            continue
        title_hit = bool(canonical & heading_canonical or literal_titles or title_hits)
        score = settings.search_title_weight if title_hit else 0
        if canonical:
            score += settings.search_canonical_weight * len(canonical & body_canonical)
        phrase_hit = any(len(variant.compact) >= 4 and variant.compact in body.compact
                         for variant in expansion.variants[:3])
        if phrase_hit:
            score += settings.search_phrase_weight
        score += settings.search_keyword_weight * len(hits)
        score += settings.search_common_weight * sum(word in body.compact for word in common)
        if len(hits) + len(canonical) >= 2:
            score += settings.search_multi_bonus
        if score < settings.search_min_score:
            continue
        terms = list(dict.fromkeys(expansion.canonical_terms + hits + literal_titles))
        ranked.append(Ranked(slide,version,round(score,4),terms))
    # Stable source order avoids UUID-dependent ranking of duplicate slides.
    return sorted(ranked,key=lambda result: (-result.score,result.version.document_id,result.slide.slide_number))[:limit]
