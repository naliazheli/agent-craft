from __future__ import annotations

import json
import re
import sys
import time
import hashlib
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, NavigableString, Tag


BASE_URL = "https://www.erdosproblems.com"
TAGS_URL = f"{BASE_URL}/tags"
OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent
    / "prisma"
    / "seed-data"
    / "erdos-problems.generated.json"
)
CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache" / "erdosproblems"
REQUEST_DELAY_SECONDS = 1.2
TIMEOUT_SECONDS = 30
MAX_RETRIES = 6
ERDOS_DISCLAIMER = (
    "The open status of this problem reflects the current belief of the owner of this "
    "website. There may be literature on this problem that is not yet reflected here, "
    "so any serious attempt should still begin with a fresh literature search."
)


@dataclass(frozen=True)
class TagIndexEntry:
    name: str
    tag_url: str
    open_url: str


session = requests.Session()
session.headers.update(
    {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
        )
    }
)


def fetch(url: str) -> str:
    cache_path = CACHE_DIR / f"{hashlib.sha1(url.encode('utf-8')).hexdigest()}.html"
    if cache_path.exists():
        return cache_path.read_text(encoding="utf-8")

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for attempt in range(MAX_RETRIES):
        response = session.get(url, timeout=TIMEOUT_SECONDS)
        if response.status_code not in {400, 429, 500, 502, 503, 504}:
            response.raise_for_status()
            cache_path.write_text(response.text, encoding="utf-8")
            time.sleep(REQUEST_DELAY_SECONDS)
            return response.text

        retry_after = response.headers.get("Retry-After")
        if retry_after and retry_after.isdigit():
            sleep_seconds = max(REQUEST_DELAY_SECONDS, float(retry_after))
        else:
            sleep_seconds = max(REQUEST_DELAY_SECONDS, 2 ** attempt)
        print(
            f"[retry] status={response.status_code} attempt={attempt + 1}/{MAX_RETRIES} url={url} sleep={sleep_seconds:.1f}s"
        )
        time.sleep(sleep_seconds)

    response.raise_for_status()
    raise RuntimeError(f"Failed to fetch {url}")


def get_soup(url: str) -> BeautifulSoup:
    return BeautifulSoup(fetch(url), "html.parser")


def normalize_whitespace(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def clean_markdown(value: str) -> str:
    value = value.replace("\r", "")
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def markdown_to_plain(value: str) -> str:
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = value.replace("**", "").replace("*", "").replace("`", "")
    value = re.sub(r"^> ?", "", value, flags=re.MULTILINE)
    value = value.replace("\\[", "").replace("\\]", "")
    return normalize_whitespace(value)


def slugify(value: str) -> str:
    slug = value.lower().replace("&", " and ")
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


def short_text(value: str, limit: int) -> str:
    value = normalize_whitespace(value)
    if len(value) <= limit:
        return value
    clipped = value[: limit - 3].rsplit(" ", 1)[0]
    return f"{clipped}..."


def absolute_url(href: Optional[str]) -> Optional[str]:
    if not href:
        return None
    return urljoin(BASE_URL, href)


def node_to_markdown(node) -> str:
    if isinstance(node, NavigableString):
        return str(node)
    if not isinstance(node, Tag):
        return ""

    name = node.name.lower()

    if name in {"script", "style", "form", "button"}:
        return ""
    if name == "br":
        return "\n"
    if name in {"strong", "b"}:
        return f"**{clean_markdown(children_to_markdown(node.children))}**"
    if name in {"em", "i"}:
        return f"*{clean_markdown(children_to_markdown(node.children))}*"
    if name == "code":
        return f"`{clean_markdown(children_to_markdown(node.children))}`"
    if name == "pre":
        content = clean_markdown(node.get_text("\n", strip=False))
        return f"\n```\n{content}\n```\n"
    if name == "blockquote":
        content = clean_markdown(children_to_markdown(node.children))
        if not content:
            return ""
        return "\n".join(
            f"> {line}" if line else ">" for line in content.splitlines()
        ) + "\n\n"
    if name == "a":
        text = clean_markdown(children_to_markdown(node.children)) or normalize_whitespace(
            node.get_text(" ", strip=True)
        )
        href = node.get("href")
        if not href or href.startswith("#cite-"):
            return text
        return f"[{text}]({absolute_url(href)})"
    if name in {"ul", "ol"}:
        items = []
        for item in node.find_all("li", recursive=False):
            line = clean_markdown(children_to_markdown(item.children))
            if line:
                items.append(f"- {line}")
        return "\n".join(items) + ("\n\n" if items else "")
    if name == "li":
        return clean_markdown(children_to_markdown(node.children))
    if name in {"p", "section", "article"}:
        content = clean_markdown(children_to_markdown(node.children))
        return f"{content}\n\n" if content else ""
    if name == "div":
        content = clean_markdown(children_to_markdown(node.children))
        if not content:
            return ""
        if "fixed-post" in (node.get("class") or []):
            return f"\n\n{content}\n\n"
        return f"{content}\n\n"

    return children_to_markdown(node.children)


def children_to_markdown(children: Iterable) -> str:
    return "".join(node_to_markdown(child) for child in children)


def split_markdown_paragraphs(value: str) -> List[str]:
    return [part.strip() for part in re.split(r"\n\s*\n", value) if part.strip()]


def parse_money_amount(text: str) -> int:
    match = re.search(r"\$([0-9][0-9,]*)", text)
    if not match:
        return 0
    return int(match.group(1).replace(",", ""))


def derive_reward_aic(prize_amount: int) -> int:
    if prize_amount <= 0:
        return 80
    reward = round((prize_amount / 5) / 10) * 10
    return max(60, min(300, reward))


def parse_last_edited(value: str) -> str:
    match = re.search(r"This page was last edited ([0-9]{1,2} [A-Za-z]+ [0-9]{4})", value)
    if not match:
        return ""
    dt = datetime.strptime(match.group(1), "%d %B %Y")
    return dt.date().isoformat()


def collect_tag_index() -> List[TagIndexEntry]:
    soup = get_soup(TAGS_URL)
    entries: List[TagIndexEntry] = []
    seen: set[str] = set()
    for link in soup.select('a[href^="/tags/"]'):
        href = link.get("href", "")
        if href == "/tags" or href.endswith("/open"):
            continue
        name = normalize_whitespace(link.get_text(" ", strip=True))
        if not name or name in {"Tags", "Definitions"}:
            continue
        tag_url = absolute_url(href)
        if not tag_url or tag_url in seen:
            continue
        seen.add(tag_url)
        entries.append(
            TagIndexEntry(
                name=name,
                tag_url=tag_url,
                open_url=f"{tag_url}/open",
            )
        )
    entries.sort(key=lambda entry: entry.name.lower())
    return entries


def merge_discovery(record: dict, tag_name: str, tag_url: str) -> None:
    if tag_name not in record["discoveredFromTags"]:
        record["discoveredFromTags"].append(tag_name)
    if tag_url not in record["discoveredFromTagUrls"]:
        record["discoveredFromTagUrls"].append(tag_url)


def collect_open_problem_boxes(tag_entries: List[TagIndexEntry]) -> Dict[int, dict]:
    discovered: Dict[int, dict] = {}
    for index, entry in enumerate(tag_entries, start=1):
        print(f"[tags] {index}/{len(tag_entries)} {entry.open_url}")
        soup = get_soup(entry.open_url)
        for box in soup.select(".problem-box"):
            problem_link = box.select_one('#problem_id a[href^="/"]')
            if problem_link is None:
                continue
            href = problem_link.get("href", "")
            if not re.fullmatch(r"/\d+", href):
                continue

            problem_id = int(href.strip("/"))
            comment_link = box.select_one('.comment-count a[href]')
            if problem_id not in discovered:
                discovered[problem_id] = {
                    "problemId": problem_id,
                    "sourceUrl": absolute_url(href),
                    "discussionThreadUrl": absolute_url(comment_link.get("href"))
                    if comment_link
                    else f"{BASE_URL}/forum/discuss/{problem_id}",
                    "boxHtml": str(box),
                    "discoveredFromTags": [],
                    "discoveredFromTagUrls": [],
                }
            merge_discovery(discovered[problem_id], entry.name, entry.open_url)
    return discovered


def parse_problem_comments(thread_url: str) -> List[dict]:
    try:
        soup = get_soup(thread_url)
    except requests.HTTPError as exc:
        status_code = exc.response.status_code if exc.response is not None else "unknown"
        if status_code in {400, 404}:
            print(f"[warn] skipping discussion fetch status={status_code} url={thread_url}")
            return []
        raise
    roots: List[dict] = []
    stack: List[dict] = []

    for post in soup.select(".post"):
        class_names = post.get("class") or []
        depth = 0
        for class_name in class_names:
            if class_name.startswith("depth-"):
                depth = int(class_name.split("-", 1)[1])
                break

        meta = post.select_one(".post-meta")
        body = post.select_one(".post-body")
        author = ""
        posted_at = ""
        if meta:
            author_link = meta.select_one("strong a")
            author = normalize_whitespace(author_link.get_text(" ", strip=True)) if author_link else ""
            timestamp_link = meta.select_one('a[href*="#post-"]')
            posted_at = (
                normalize_whitespace(timestamp_link.get_text(" ", strip=True))
                if timestamp_link
                else ""
            )

        body_md = clean_markdown(children_to_markdown(body.children)) if body else ""
        comment = {
            "author": author or "Unknown",
            "postedAtLabel": posted_at,
            "contentMd": body_md,
        }

        if depth <= 0:
            roots.append(comment)
            stack = [comment]
            continue

        stack = stack[:depth]
        if stack:
            parent = stack[-1]
            parent.setdefault("replies", []).append(comment)
        else:
            roots.append(comment)
        stack.append(comment)

    return roots


def build_problem_title(problem_id: int, statement: str) -> str:
    return f"Erdos Problem #{problem_id}: {short_text(statement, 96)}"


def build_problem_description(problem_id: int, source_url: str, statement_md: str, note_blocks: List[str]) -> str:
    parts = [
        f"Investigate open Erdos Problem #{problem_id} from [erdosproblems.com]({source_url}).",
        "",
        "### Problem",
        statement_md,
    ]
    if note_blocks:
        parts.extend(["", "### Context", "\n\n".join(note_blocks[:2])])
    parts.extend(
        [
            "",
            "### Deliverable",
            (
                "Submit a rigorous proof, counterexample, or clearly delimited partial progress. "
                "If the problem remains open, a high-quality literature synthesis or a sharp gap "
                "analysis is still valuable."
            ),
        ]
    )
    return "\n".join(parts)


def build_acceptance_criteria(problem_id: int, bibliography_refs: List[str], comment_count: int) -> str:
    refs = ", ".join(bibliography_refs[:12]) if bibliography_refs else "the cited literature"
    comment_line = (
        f"Review the imported discussion thread ({comment_count} source comments) and address any relevant leads or caveats."
        if comment_count
        else "Check the source discussion thread and note whether it contains any useful leads."
    )
    return "\n".join(
        [
            f"Explicitly state whether your submission claims a full solution, a conditional result, or partial progress on Erdos Problem #{problem_id}.",
            f"Reference the source bibliography when relevant, especially: {refs}.",
            comment_line,
            "Include a rigorous proof, counterexample, or a precise explanation of the remaining gap.",
        ]
    )


def clone_and_strip_main_notes(node: Tag) -> Tag:
    fragment = BeautifulSoup(str(node), "html.parser")
    root = fragment.find(class_="problem-additional-text")
    if root is None:
        return fragment

    for removable in root.select('a[href^="/latex/"], a[href^="/history/"]'):
        removable.decompose()
    for removable in root.select(".image-container"):
        removable.decompose()
    for paragraph in root.find_all("p"):
        text = normalize_whitespace(paragraph.get_text(" ", strip=True))
        if text.startswith("This page was last edited") or text == "View the LaTeX source":
            paragraph.decompose()
    return root


def parse_formalized_state(external_box: Optional[Tag]) -> dict:
    if external_box is None:
        return {"available": False, "label": "Unknown"}

    text = normalize_whitespace(external_box.get_text(" ", strip=True))
    if "Formalised statement? Yes" in text:
        return {"available": True, "label": "Yes"}
    if "Formalised statement? No" in text:
        return {"available": False, "label": "No"}
    return {"available": False, "label": "Unknown"}


def parse_problem_from_box(record: dict) -> dict:
    problem_id = record["problemId"]
    problem_url = record["sourceUrl"]
    discussion_thread_url = record.get("discussionThreadUrl") or f"{BASE_URL}/forum/discuss/{problem_id}"
    print(f"[problem] #{problem_id}")
    soup = BeautifulSoup(record["boxHtml"], "html.parser")

    content_nodes = soup.select("div#content")
    if not content_nodes:
        raise RuntimeError(f"Problem #{problem_id} is missing content")

    statement_md = clean_markdown(children_to_markdown(content_nodes[0].children))
    statement_plain = markdown_to_plain(statement_md)

    problem_id_box = soup.select_one("#problem_id")
    bibliography_refs = []
    if problem_id_box:
        bibliography_refs = [
            normalize_whitespace(link.get_text(" ", strip=True)).strip("[]")
            for link in problem_id_box.select('a[href^="#cite-"]')
        ]

    prize_box = soup.select_one("#prize")
    prize_text = normalize_whitespace(prize_box.get_text(" ", strip=True)) if prize_box else ""
    status_label = prize_text.split(" ", 1)[0] if prize_text else "OPEN"
    status_note_node = prize_box.select_one(".tooltiptext") if prize_box else None
    status_note = (
        normalize_whitespace(status_note_node.get_text(" ", strip=True))
        if status_note_node
        else "Open problem."
    )
    prize_amount = parse_money_amount(prize_text)

    categories = [
        normalize_whitespace(link.get_text(" ", strip=True))
        for link in soup.select("#tags a")
        if normalize_whitespace(link.get_text(" ", strip=True))
    ]

    related_links = [
        {"label": "Problem page", "url": problem_url},
        {"label": "Discussion thread", "url": discussion_thread_url},
    ]
    latex_source_url = f"{BASE_URL}/latex/{problem_id}"
    related_links.append({"label": "LaTeX source", "url": latex_source_url})

    for tag_name, tag_url in zip(
        record.get("discoveredFromTags", []),
        record.get("discoveredFromTagUrls", []),
    ):
        related_links.append(
            {"label": f'Tag "{tag_name}" open list', "url": tag_url}
        )

    main_notes_nodes = soup.select(".problem-additional-text")
    main_notes_md = ""
    last_edited_at = ""
    if main_notes_nodes:
        stripped = clone_and_strip_main_notes(main_notes_nodes[0])
        main_notes_md = clean_markdown(children_to_markdown(stripped.children))
        last_edited_at = parse_last_edited(
            normalize_whitespace(main_notes_nodes[0].get_text(" ", strip=True))
        )

    research_notes_md = split_markdown_paragraphs(main_notes_md)
    research_notes = [markdown_to_plain(block) for block in research_notes_md]

    citation_box = soup.select_one(".citationbox")
    citation_text = (
        clean_markdown(children_to_markdown(citation_box.children)) if citation_box else ""
    )
    additional_thanks = []
    if citation_text:
        thanks_match = re.search(
            r"Additional thanks to\s*:\s*(.+?)\s*(?:When referring to this problem|$)",
            citation_text,
            re.DOTALL,
        )
        if thanks_match:
            additional_thanks = [
                normalize_whitespace(part)
                for part in re.split(r",| and ", thanks_match.group(1))
                if normalize_whitespace(part)
            ]

    citation_match = re.search(
        r"recommended citation format is:\s*(.+)$",
        citation_text,
        re.IGNORECASE | re.DOTALL,
    )
    recommended_citation = (
        normalize_whitespace(citation_match.group(1))
        if citation_match
        else f"T. F. Bloom, Erdos Problem #{problem_id}, {problem_url}"
    )

    reactions_box = soup.select_one(".problem-reactions")
    comment_count = 0
    if reactions_box:
        comments_match = re.search(
            r"([0-9]+)\s+comments?\s+on\s+this\s+problem",
            normalize_whitespace(reactions_box.get_text(" ", strip=True)),
            re.IGNORECASE,
        )
        if comments_match:
            comment_count = int(comments_match.group(1))

    external_box = soup.select_one(".external")
    formalized = parse_formalized_state(external_box)
    if external_box:
        for link in external_box.select("a[href]"):
            href = absolute_url(link.get("href"))
            label = normalize_whitespace(link.get_text(" ", strip=True))
            if href and label and all(existing["url"] != href for existing in related_links):
                related_links.append({"label": label, "url": href})

    source_comments = parse_problem_comments(discussion_thread_url) if comment_count else []

    task_tags = ["erdos", "erdos-problem", "open-problem"]
    for tag in categories or record.get("discoveredFromTags", []):
        slug = slugify(tag)
        if slug and slug not in task_tags:
            task_tags.append(slug)

    problem = {
        "title": build_problem_title(problem_id, statement_plain),
        "description": build_problem_description(
            problem_id,
            problem_url,
            statement_md,
            research_notes_md,
        ),
        "acceptanceCriteria": build_acceptance_criteria(
            problem_id,
            bibliography_refs,
            comment_count,
        ),
        "reward": derive_reward_aic(prize_amount),
        "tags": task_tags,
        "sourceUrl": problem_url,
        "sourceMetadata": {
            "catalog": "erdosproblems",
            "externalProblemId": problem_id,
            "bibliographySourceCode": "tags/open",
            "bibliographySourceUrl": TAGS_URL,
            "discussionThreadUrl": discussion_thread_url,
            "latexSourceUrl": latex_source_url,
            "disclaimer": ERDOS_DISCLAIMER,
            "statement": statement_plain,
            "statementMd": statement_md,
            "statusLabel": status_label,
            "statusNote": status_note,
            "categories": categories,
            "discoveredFromTags": sorted(record.get("discoveredFromTags", [])),
            "discoveredFromTagUrls": sorted(record.get("discoveredFromTagUrls", [])),
            "bibliographyRefs": bibliography_refs,
            "researchNotes": research_notes,
            "researchNotesMd": research_notes_md,
            "sourceComments": source_comments,
            "commentCount": comment_count,
            "relatedLinks": related_links,
            "recommendedCitation": recommended_citation,
            "additionalThanks": additional_thanks,
            "lastEditedAt": last_edited_at,
            "originalPrize": {"amount": prize_amount, "currency": "USD"},
            "formalized": formalized,
        },
    }
    return problem


def count_comments(comments: List[dict]) -> int:
    total = 0
    stack = list(comments)
    while stack:
        current = stack.pop()
        total += 1
        stack.extend(current.get("replies", []))
    return total


def main() -> int:
    tag_entries = collect_tag_index()
    discovered = collect_open_problem_boxes(tag_entries)
    problem_ids = sorted(discovered.keys())
    print(f"[summary] tags={len(tag_entries)} open_problems={len(problem_ids)}")

    problems = []

    for index, problem_id in enumerate(problem_ids, start=1):
        print(f"[crawl] {index}/{len(problem_ids)}")
        problems.append(parse_problem_from_box(discovered[problem_id]))

    problems.sort(key=lambda item: item["sourceMetadata"]["externalProblemId"])

    dataset = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceUrl": TAGS_URL,
        "tagCount": len(tag_entries),
        "problemCount": len(problems),
        "totalSourceCommentCount": sum(
            problem["sourceMetadata"]["commentCount"] for problem in problems
        ),
        "problems": problems,
    }

    OUTPUT_PATH.write_text(
        json.dumps(dataset, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"[write] {OUTPUT_PATH}")
    print(
        f"[done] problem_count={dataset['problemCount']} total_source_comment_count={dataset['totalSourceCommentCount']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
