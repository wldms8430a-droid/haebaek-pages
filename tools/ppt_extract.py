"""Bounded OOXML reading. Slide content is untrusted data, never instructions.

No notes, network retrieval, embedded objects, macros or OCR are executed.
"""
from dataclasses import dataclass
import hashlib
import posixpath
from pathlib import PurePosixPath
from zipfile import ZipFile, BadZipFile, ZIP_DEFLATED

from defusedxml import ElementTree as ET
from defusedxml.common import DefusedXmlException

EXTRACTION_VERSION = 2
DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main"


def visible_children(element):
    """Select one AlternateContent representation, never duplicate its fallback."""
    for child in element:
        if local(child.tag) == "AlternateContent":
            choices = [node for node in child if local(node.tag) == "Choice"]
            branch = next(iter(choices), next((node for node in child if local(node.tag) == "Fallback"), None))
            if branch is not None:
                yield from visible_children(branch)
        else:
            yield child


def paragraph_text(element):
    lines = []
    for paragraph in element.iter():
        if paragraph.tag != f"{{{DRAWING}}}p":
            continue
        value = "".join("\n" if local(node.tag) == "br" else (node.text or "")
                        if local(node.tag) == "t" else "" for node in paragraph.iter()).strip()
        if value:
            lines.append(value)
    return lines


def slide_blocks(root, xml, part, row_tolerance=0):
    """Recursively collect shape text, all table cells and linked diagram/chart text.

    Group child coordinates are mapped through chOff/chExt and off/ext. Missing
    coordinates use stable XML order. Notes/master decoration are not indexed.
    """
    blocks, titles = [], []
    relationships = {r.get("Id"): r for r in xml.get(rel_path(part), [])}
    tree = next((node for node in root.iter() if local(node.tag) == "spTree"), None)
    if tree is None:
        return [], []

    def position(shape, transform):
        props = next((n for n in shape if local(n.tag) in {"spPr", "grpSpPr", "xfrm"}), None)
        xf = props if props is not None and local(props.tag) == "xfrm" else next(
            (n for n in props if local(n.tag) == "xfrm"), None) if props is not None else None
        values = {local(n.tag): n for n in xf} if xf is not None else {}
        off, ext = values.get("off"), values.get("ext")
        sx, sy, ox, oy = transform
        x = int(off.get("x", "0")) if off is not None else 0
        y = int(off.get("y", "0")) if off is not None else 0
        child_transform = transform
        if local(shape.tag) == "grpSp":
            ch_off, ch_ext = values.get("chOff"), values.get("chExt")
            if ext is not None and ch_ext is not None:
                ax = int(ext.get("cx", "0")) / max(1, int(ch_ext.get("cx", "1")))
                ay = int(ext.get("cy", "0")) / max(1, int(ch_ext.get("cy", "1")))
                child_transform = (sx * ax, sy * ay,
                    ox + sx * (x - ax * int(ch_off.get("x", "0") if ch_off is not None else 0)),
                    oy + sy * (y - ay * int(ch_off.get("y", "0") if ch_off is not None else 0)))
        return (oy + sy * y, ox + sx * x), child_transform

    def walk(container, transform=(1, 1, 0, 0)):
        for shape in visible_children(container):
            kind = local(shape.tag)
            if kind == "grpSp":
                _, child_transform = position(shape, transform)
                walk(shape, child_transform)
                continue
            if kind not in {"sp", "pic", "graphicFrame", "cxnSp", "contentPart"}:
                continue
            coord, _ = position(shape, transform)
            lines = paragraph_text(shape)
            # Diagram/chart relationships contain text outside the slide XML.
            seen = set()
            for node in shape.iter():
                for key, rid in node.attrib.items():
                    if "relationships}" not in key or rid in seen:
                        continue
                    rel = relationships.get(rid)
                    if rel is None or rel.get("Type", "").rsplit("/", 1)[-1] not in {"diagramData", "diagramDrawing", "chart"}:
                        continue
                    seen.add(rid)
                    linked = xml.get(target_path(part, rel.get("Target", "")))
                    if linked is not None:
                        lines.extend(paragraph_text(linked))
                        if rel.get("Type", "").endswith("/chart"):
                            for cache in linked.iter():
                                if local(cache.tag) == "strCache":
                                    lines.extend(n.text.strip() for n in cache.iter() if local(n.tag) == "v" and n.text and n.text.strip())
            if lines and any(local(n.tag) == "ph" and n.get("type") in {"title", "ctrTitle"} for n in shape.iter()):
                titles.append((coord, " ".join(lines)))
            # Retain accessibility descriptions without assigning them title weight.
            for node in shape.iter():
                if local(node.tag) == "cNvPr":
                    lines.extend(node.get(key).strip() for key in ("descr", "title") if node.get(key, "").strip())
            if lines:
                blocks.append((coord, len(blocks), lines))
    walk(tree)
    # Text boxes visually aligned on one row may differ by a fraction of a
    # pixel. Group near-equal tops before sorting left-to-right.
    ordered, row, row_top = [], [], None
    for block in sorted(blocks, key=lambda item: (item[0], item[1])):
        if row_top is not None and block[0][0] - row_top > row_tolerance:
            ordered.extend(sorted(row,key=lambda item:(item[0][1],item[1])))
            row, row_top = [], None
        if row_top is None:
            row_top = block[0][0]
        row.append(block)
    ordered.extend(sorted(row,key=lambda item:(item[0][1],item[1])))
    return [line for _, _, lines in ordered for line in lines], [title for _, title in sorted(titles)]


class PPTInputError(ValueError):
    pass


@dataclass
class ExtractedSlide:
    number: int
    title: str
    text: str
    hidden: bool
    warnings: list[str]
    content_hash: str


def local(tag):
    return tag.rsplit("}", 1)[-1]


def target_path(source, target):
    value = posixpath.normpath(posixpath.join(posixpath.dirname(source), target))
    if target.startswith("/"):
        value = target.lstrip("/")
    if value.startswith("../") or "\\" in value:
        raise PPTInputError("잘못된 PPT 내부 경로입니다.")
    return value


def rel_path(source):
    return posixpath.join(posixpath.dirname(source), "_rels", posixpath.basename(source) + ".rels")


def extract_ppt(path, max_slides=300):
    try:
        with ZipFile(path) as archive:
            infos = archive.infolist()
            if len(infos) > 10000 or sum(i.file_size for i in infos) > 200 * 1024 * 1024:
                raise PPTInputError("PPT 압축 해제 용량 또는 항목 수가 제한을 초과합니다.")
            names = set()
            xml = {}
            for info in infos:
                name = info.filename
                if name in names or ".." in PurePosixPath(name).parts or name.startswith("/") or "\\" in name:
                    raise PPTInputError("중복 또는 잘못된 PPT 내부 경로입니다.")
                names.add(name)
                if info.flag_bits & 1 or info.file_size > 32 * 1024 * 1024:
                    raise PPTInputError("암호화되었거나 내부 파일이 너무 큰 PPT입니다.")
                if info.file_size > max(1, info.compress_size) * 500:
                    raise PPTInputError("PPT 압축률이 제한을 초과합니다.")
                if "vbaproject" in name.lower() or name.startswith(("ppt/embeddings/", "ppt/activeX/")):
                    raise PPTInputError("매크로/내장 실행 객체는 지원하지 않습니다.")
                if name.endswith((".xml", ".rels")):
                    xml[name] = ET.fromstring(archive.read(name), forbid_dtd=True, forbid_entities=True, forbid_external=True)
                    if name.endswith(".rels"):
                        for rel in xml[name]:
                            if rel.get("TargetMode", "").lower() == "external" and not rel.get("Type", "").endswith("/hyperlink"):
                                raise PPTInputError("외부 연결이 포함된 PPT입니다. 연결을 제거한 파일을 업로드해주세요.")
            if not {"[Content_Types].xml", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels"} <= names:
                raise PPTInputError("올바른 pptx 파일이 아닙니다.")
            types = xml["[Content_Types].xml"]
            if not any(e.get("ContentType") == "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml" for e in types):
                raise PPTInputError("일반 pptx 프레젠테이션만 지원합니다.")
            presentation = xml["ppt/presentation.xml"]
            relations = {r.get("Id"): r.get("Target") for r in xml["ppt/_rels/presentation.xml.rels"]}
            slide_ids = [e for e in presentation.iter() if local(e.tag) == "sldId"]
            if not slide_ids or len(slide_ids) > max_slides:
                raise PPTInputError("슬라이드 수가 허용 범위를 벗어났습니다.")
            size = next((e for e in presentation if local(e.tag) == "sldSz"), None)
            width, height = (int(size.get("cx", "1")), int(size.get("cy", "1"))) if size is not None else (1, 1)
            if min(width, height) <= 0 or not .25 <= width / height <= 4:
                raise PPTInputError("지원하는 슬라이드 가로세로 비율은 1:4부터 4:1까지입니다.")
            area = width * height
            digest_cache = {}

            def digest(part, visited=frozenset()):
                if part in visited:
                    return b""
                if part in digest_cache:
                    return digest_cache[part]
                if part not in names:
                    raise PPTInputError("PPT 내부 참조 파일이 없습니다.")
                result = hashlib.sha256(archive.read(part))
                for r in xml.get(rel_path(part), []):
                    kind = r.get("Type", "").rsplit("/", 1)[-1]
                    if kind in {"notesSlide", "notesMaster", "hyperlink"}:
                        continue
                    result.update(digest(target_path(part, r.get("Target", "")), visited | {part}))
                value = result.digest()
                digest_cache[part] = value
                return value

            slides = []
            for number, sid in enumerate(slide_ids, 1):
                rid = next((v for k, v in sid.attrib.items() if local(k) == "id" and k.startswith("{")), None)
                part = target_path("ppt/presentation.xml", relations[rid])
                root = xml[part]
                hidden = root.get("show", "1") in {"0", "false"}
                title, blocks, warnings = "", [], []
                image_area, images = 0, 0
                blocks, titles = slide_blocks(root, xml, part, height * .01)
                title = titles[0] if titles else ""
                for e in root.iter():
                    if local(e.tag) == "pic":
                        images += 1
                        ext = next((n for n in e.iter() if local(n.tag) == "ext" and n.get("cx")), None)
                        if ext is not None:
                            image_area += int(ext.get("cx")) * int(ext.get("cy"))
                text = "\n".join(blocks)
                if len(text) > 100000:
                    text = text[:100000]
                    warnings.append("텍스트 추출 길이 제한 초과: 관리자 확인 필요")
                if len(text.replace(" ", "").replace("\n", "")) < 20:
                    warnings.append("텍스트 거의 없음")
                if images and (image_area / max(1, area) >= .4 or len(text) < 80):
                    warnings.append("이미지 기반 내용 가능성")
                if hidden:
                    warnings.append("숨김 슬라이드")
                heading = next((line.lstrip("※ ").strip() for line in blocks if line.strip().startswith("※")), "")
                if not title or title.strip("<> ") == "결재정보수정":
                    title = heading or next((line[:200] for line in blocks if len(line.strip()) >= 4), f"슬라이드 {number}")
                slides.append(ExtractedSlide(number, title,
                                             text, hidden, warnings, digest(part).hex()))
            return slides
    except PPTInputError:
        raise
    except (BadZipFile, KeyError, ValueError, TypeError, RecursionError, ET.ParseError, DefusedXmlException) as exc:
        raise PPTInputError("PPT 내부 구조 또는 텍스트를 읽을 수 없습니다.") from exc


def create_render_copy(source, destination):
    """Remove hyperlink actions/relationships only from the render input.

    Source file/text remains unchanged. All other external references have
    already been rejected by extract_ppt. Never fetch any URL from a deck.
    """
    with ZipFile(source) as original, ZipFile(destination, "w", compression=ZIP_DEFLATED) as output:
        for info in original.infolist():
            data = original.read(info.filename)
            if info.filename.endswith((".xml", ".rels")):
                root = ET.fromstring(data, forbid_dtd=True, forbid_entities=True, forbid_external=True)
                changed = False
                for parent in root.iter():
                    for child in list(parent):
                        if local(child.tag) in {"hlinkClick", "hlinkMouseOver"} or (
                                local(child.tag) == "Relationship" and child.get("Type", "").endswith("/hyperlink")):
                            parent.remove(child)
                            changed = True
                if changed:
                    data = ET.tostring(root, encoding="utf-8", xml_declaration=True)
            output.writestr(info.filename, data)
