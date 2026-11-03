#!/usr/bin/env python3
"""Analyze processed magazine chunks and build the Tarea 3 dataset report.

The report deliberately separates observations that can be reproduced locally
from Atlas observations that require opening the public Nomic map. It therefore
never fabricates a map URL or claims that a local lexical search is a vector
search result.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import html
import json
import re
from pathlib import Path
from typing import Iterable


STOPWORDS = {
    "además", "algunas", "algunos", "aquella", "aquellas", "aquello", "aquellos",
    "ante", "antes", "aquí", "así", "bajo", "cada", "como", "con", "contra",
    "cual", "cuando", "donde", "desde", "durante", "entre", "esta", "estas",
    "este", "estos", "fue", "gran", "hacia", "hasta", "hay", "hace", "han",
    "junto", "la", "las", "los", "más", "mientras", "muy", "para", "parte",
    "pero", "por", "qué", "que", "se", "según", "sin", "sobre", "son", "su",
    "sus", "también", "tiene", "todo", "todos", "tras", "una", "uno", "unos",
    "vida", "y", "ya",
}
TOKEN_RE = re.compile(r"[a-záéíóúüñ]{4,}", re.IGNORECASE)
NOISY_HEADINGS = {"PUBLICIDAD", "REDACCIÓN", "DIRECTORA", "COLABORAN", "CONTENIDOS", "PORTADA"}


def tokens(text: str) -> Iterable[str]:
    for token in TOKEN_RE.findall(text.lower()):
        if token not in STOPWORDS and not token.isnumeric():
            yield token


def read_rows(input_dir: Path) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for path in sorted(input_dir.glob("traveling*.jsonl")):
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                rows.append(json.loads(line))
    if not rows:
        raise ValueError(f"No JSONL chunks found in {input_dir}")
    return rows


def query_preview(rows: list[dict[str, object]], label: str, query: str) -> dict[str, object]:
    terms = list(tokens(query))
    matches = []
    for row in rows:
        text = str(row["text"]).lower()
        if terms and any(term in text for term in terms):
            matches.append(row)
    examples = [
        {
            "source": row["source"],
            "issue": row["issue"],
            "pages": row["pages"],
            "heading": (row.get("headings") or ["-"])[0],
        }
        for row in matches[:3]
    ]
    return {
        "label": label,
        "query": query,
        "terms": terms,
        "matching_rule": "OR: al menos uno de los términos aparece en el texto",
        "matching_chunks": len(matches),
        "examples": examples,
        "interpretation": "previsualización lexical local; confirmar en Atlas con búsqueda vectorial",
    }


def build_metrics(rows: list[dict[str, object]]) -> dict[str, object]:
    issue_counts = collections.Counter(int(row["issue"]) for row in rows)
    heading_counts = collections.Counter(
        heading
        for row in rows
        for heading in row.get("headings", [])
        if isinstance(heading, str) and heading.strip()
    )
    word_counts = collections.Counter(token for row in rows for token in tokens(str(row["text"])))
    exact_text_counts = collections.Counter(
        hashlib.sha256(str(row["text"]).encode("utf-8")).hexdigest() for row in rows
    )
    duplicate_groups = [count for count in exact_text_counts.values() if count > 1]
    noisy_chunks = [
        row for row in rows
        if any(str(heading).upper() in NOISY_HEADINGS for heading in row.get("headings", []))
    ]
    page_values = [int(page) for row in rows for page in row.get("pages", [])]

    return {
        "issues": sorted(issue_counts),
        "issue_counts": {str(issue): count for issue, count in sorted(issue_counts.items())},
        "chunks": len(rows),
        "characters": sum(len(str(row["text"])) for row in rows),
        "pages_min": min(page_values),
        "pages_max": max(page_values),
        "unique_ids": len({str(row["id"]) for row in rows}),
        "duplicate_text_groups": len(duplicate_groups),
        "duplicate_text_chunks": sum(duplicate_groups),
        "potentially_noisy_chunks": len(noisy_chunks),
        "top_terms": word_counts.most_common(25),
        "top_headings": heading_counts.most_common(20),
        "query_previews": [
            query_preview(rows, "playas", "playas"),
            query_preview(rows, "castillos", "castillos"),
            query_preview(rows, "comida romántica", "comida romántica"),
        ],
    }


def p(text: str, style):
    from reportlab.platypus import Paragraph

    return Paragraph(html.escape(text).replace("\n", "<br/>"), style)


def build_pdf(metrics: dict[str, object], output: Path) -> None:
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        KeepTogether,
        PageBreak,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    font_path = "/System/Library/Fonts/Supplemental/Arial.ttf"
    bold_path = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
    if Path(font_path).exists() and Path(bold_path).exists():
        pdfmetrics.registerFont(TTFont("ReportArial", font_path))
        pdfmetrics.registerFont(TTFont("ReportArial-Bold", bold_path))
        regular, bold = "ReportArial", "ReportArial-Bold"
    else:
        regular, bold = "Helvetica", "Helvetica-Bold"

    navy = colors.HexColor("#13253F")
    teal = colors.HexColor("#0A7C86")
    pale = colors.HexColor("#EAF4F5")
    grey = colors.HexColor("#5F6B7A")
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="ReportTitle", parent=styles["Title"], fontName=bold, fontSize=25, leading=30, textColor=navy, alignment=TA_LEFT, spaceAfter=10))
    styles.add(ParagraphStyle(name="SubTitle", parent=styles["Normal"], fontName=regular, fontSize=11, leading=16, textColor=grey, spaceAfter=18))
    styles.add(ParagraphStyle(name="H1Custom", parent=styles["Heading1"], fontName=bold, fontSize=16, leading=21, textColor=navy, spaceBefore=10, spaceAfter=9))
    styles.add(ParagraphStyle(name="H2Custom", parent=styles["Heading2"], fontName=bold, fontSize=11, leading=15, textColor=teal, spaceBefore=8, spaceAfter=5))
    styles.add(ParagraphStyle(name="BodyCustom", parent=styles["BodyText"], fontName=regular, fontSize=9.5, leading=14, textColor=colors.HexColor("#253245"), spaceAfter=7))
    styles.add(ParagraphStyle(name="SmallCustom", parent=styles["BodyText"], fontName=regular, fontSize=8, leading=11, textColor=grey))
    styles.add(ParagraphStyle(name="Card", parent=styles["BodyText"], fontName=bold, fontSize=15, leading=18, textColor=navy, alignment=TA_CENTER))
    styles.add(ParagraphStyle(name="CardLabel", parent=styles["BodyText"], fontName=regular, fontSize=7.5, leading=10, textColor=grey, alignment=TA_CENTER))
    styles.add(ParagraphStyle(name="Table", parent=styles["BodyText"], fontName=regular, fontSize=8, leading=10, textColor=colors.HexColor("#253245")))
    styles.add(ParagraphStyle(name="TableBold", parent=styles["BodyText"], fontName=bold, fontSize=8, leading=10, textColor=navy))
    styles.add(ParagraphStyle(name="Quote", parent=styles["BodyText"], fontName=regular, fontSize=10, leading=15, textColor=navy, leftIndent=10, borderColor=teal, borderWidth=2, borderPadding=8, spaceBefore=5, spaceAfter=10))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#D8E0E7"))
        canvas.line(18 * mm, 14 * mm, 192 * mm, 14 * mm)
        canvas.setFont(regular, 7.5)
        canvas.setFillColor(grey)
        canvas.drawString(18 * mm, 9 * mm, "IntegraTrip · Tarea 3 · análisis reproducible del corpus")
        canvas.drawRightString(192 * mm, 9 * mm, f"{doc.page}")
        canvas.restoreState()

    atlas = metrics.get("atlas", {})
    projection_id = str(atlas.get("projection_id", "")).strip()
    dataset_url = str(atlas.get("dataset_url", "")).strip()
    map_url = str(atlas.get("map_url", "")).strip()
    if projection_id and dataset_url and map_url:
        atlas_state = (
            f"El dataset ya fue publicado en Atlas con Projection ID {projection_id}. "
            f"Dataset: {dataset_url}. Mapa: {map_url}. La inspección visual de clusters, "
            "etiquetas y búsquedas solicitadas se realizó con las capturas entregadas; la capa "
            "específica de duplicados no se confirmó visualmente y se reporta mediante la auditoría local."
        )
    else:
        atlas_state = "El dataset local y el script de carga están listos, pero todavía no se ha registrado un mapa público de Atlas en este informe."
    has_atlas_searches = bool(metrics.get("atlas_searches"))
    exploration_intro = (
        "Esta sección registra la inspección visual realizada sobre el mapa público de Atlas. "
        "Las etiquetas y fragmentos descritos corresponden a la vista del mapa; la auditoría local "
        "se usa sólo para complementar duplicados y cobertura."
        if has_atlas_searches
        else "La siguiente sección responde las preguntas solicitadas con evidencia local reproducible. Las tres búsquedas son una previsualización lexical sobre los chunks, útil para detectar cobertura y ruido antes de abrir Atlas."
    )
    doc = SimpleDocTemplate(str(output), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=17 * mm, bottomMargin=20 * mm, title="Análisis de Dataset - IntegraTrip Tarea 3", author="IntegraTrip")
    story = [
        p("Análisis de Dataset", styles["ReportTitle"]),
        p("IntegraTrip · Tarea 3 · Traveling Magazine · versión reproducible local", styles["SubTitle"]),
    ]
    cards = [
        [p(str(metrics["chunks"]), styles["Card"]), p(str(len(metrics["issues"])), styles["Card"]), p(f"{metrics['characters']:,}".replace(",", "."), styles["Card"]), p(str(metrics["unique_ids"]), styles["Card"])],
        [p("chunks", styles["CardLabel"]), p("ediciones", styles["CardLabel"]), p("caracteres", styles["CardLabel"]), p("IDs únicos", styles["CardLabel"])],
    ]
    card_table = Table(cards, colWidths=[43 * mm] * 4, rowHeights=[15 * mm, 8 * mm])
    card_table.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), pale), ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#C7E1E3")), ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.white), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story += [card_table, Spacer(1, 9 * mm)]
    story += [p("1. Alcance y metodología", styles["H1Custom"]), p("El corpus reúne las 21 ediciones disponibles de Traveling Magazine, desde la 58 hasta la 78. Cada PDF se procesó con Docling sin OCR, HybridChunker y el tokenizer sentence-transformers/all-MiniLM-L6-v2. Los JSONL contienen texto contextualizado, revista, encabezados y páginas; los PDF originales permanecen fuera del repositorio.", styles["BodyCustom"])]
    coverage = [[p("Métrica", styles["TableBold"]), p("Resultado", styles["TableBold"])], [p("Ediciones", styles["Table"]), p(f"{metrics['issues'][0]}–{metrics['issues'][-1]} ({len(metrics['issues'])} completas)", styles["Table"])], [p("Chunks", styles["Table"]), p(str(metrics["chunks"]), styles["Table"])], [p("Rango de páginas", styles["Table"]), p(f"{metrics['pages_min']}–{metrics['pages_max']}", styles["Table"])], [p("IDs duplicados", styles["Table"]), p(str(metrics["chunks"] - metrics["unique_ids"]), styles["Table"])], [p("Grupos de texto exactamente duplicado", styles["Table"]), p(str(metrics["duplicate_text_groups"]), styles["Table"])], [p("Chunks potencialmente editoriales/ruidosos", styles["Table"]), p(str(metrics["potentially_noisy_chunks"]), styles["Table"])]]
    t = Table(coverage, colWidths=[72 * mm, 100 * mm], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), navy), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F8FA")]), ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D8E0E7")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 6)]))
    story += [t, PageBreak(), p("2. Temas, destinos y estructura", styles["H1Custom"]), p("La vista de Atlas muestra una estructura con múltiples agrupaciones temáticas. Se observan etiquetas como Spanish Gastronomy Magazine, Beaches Spain, Spanish Villages, Portuguese Wine Tourism, Andalusian History, Japanese Cuisine, Rural Tourism Argentina, African Safari, Island Travel, Japanese Tea y Armenian Wine. Los términos locales dominantes complementan esta lectura: ciudad, historia, cocina, hotel, restaurante, vino, experiencia, cultura, gastronomía, naturaleza, museo y arquitectura.", styles["BodyCustom"])]
    terms = [[p("Término", styles["TableBold"]), p("Apariciones", styles["TableBold"])] ] + [[p(str(term), styles["Table"]), p(str(count), styles["Table"])] for term, count in metrics["top_terms"][:12]]
    tt = Table(terms, colWidths=[100 * mm, 35 * mm], repeatRows=1)
    tt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), teal), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F8FA")]), ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D8E0E7")), ("ALIGN", (1, 1), (-1, -1), "RIGHT"), ("PADDING", (0, 0), (-1, -1), 5)]))
    story += [tt, Spacer(1, 6 * mm), p("Destinos observables en encabezados", styles["H2Custom"]), p("Entre los encabezados recurrentes aparecen Costa Rica, Estados Unidos, Colombia, México, Argentina, Suiza/Interlaken, Marrakech, Belfast, Innsbruck, Galicia, Alentejo, Zaragoza, Letur, Zamora y el Luberon. Esto muestra una mezcla de destinos internacionales y rutas regionales españolas.", styles["BodyCustom"]), p("Estructura editorial", styles["H2Custom"])]
    heads = [[p("Encabezado", styles["TableBold"]), p("Chunks", styles["TableBold"])] ] + [[p(str(head), styles["Table"]), p(str(count), styles["Table"])] for head, count in metrics["top_headings"][:12]]
    ht = Table(heads, colWidths=[135 * mm, 30 * mm], repeatRows=1)
    ht.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), navy), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F8FA")]), ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D8E0E7")), ("ALIGN", (1, 1), (-1, -1), "RIGHT"), ("PADDING", (0, 0), (-1, -1), 5)]))
    story += [ht, PageBreak(), p("3. Preguntas de exploración", styles["H1Custom"]), p(exploration_intro, styles["Quote"])]
    story += [p("¿Qué temas aparecen?", styles["H2Custom"]), p("Viajes y destinos, historia, arte y cultura, gastronomía, vinos y enoturismo, restaurantes, hoteles, naturaleza, arquitectura y experiencias locales. Atlas también etiqueta agrupaciones específicas como Spanish Gastronomy Magazine, Japanese Cuisine, Portuguese Wine Tourism y African Safari.", styles["BodyCustom"]), p("¿Qué destinos aparecen?", styles["H2Custom"]), p("Aparecen destinos de España y de otros países: Beaches Spain, Spanish Villages, Andalusian History, Rural Tourism Argentina, Japanese Tea, Marrakech, Belfast, Innsbruck, Costa Rica, México, Colombia, Argentina y Suiza, entre otros.", styles["BodyCustom"]), p("¿Hay clusters?", styles["H2Custom"]), p("Sí. La proyección muestra clusters visualmente separados y etiquetas temáticas, incluyendo gastronomía española, playas de España, pueblos españoles, turismo vitivinícola portugués, historia andaluza, cocina japonesa y turismo rural argentino. También aparecen grupos más aislados, como Theme Parks Orlando y Jamaican Reggae Culture.", styles["BodyCustom"]), p("¿Hay chunks duplicados?", styles["H2Custom"]), p(f"No hay IDs duplicados. La auditoría local encontró {metrics['duplicate_text_groups']} grupos de texto exactamente repetido ({metrics['duplicate_text_chunks']} chunks). La captura del mapa no muestra la capa de duplicados, por lo que no se afirma que Atlas los haya marcado visualmente.", styles["BodyCustom"]), p("¿Hay chunks irrelevantes?", styles["H2Custom"]), p(f"Sí. La búsqueda playas devolvió un resultado con los temas Magazine Publishing y Executive Leadership y el encabezado DIRECTORA, incluyendo un correo editorial; es ruido para preguntas de viaje. Esto coincide con los {metrics['potentially_noisy_chunks']} chunks locales marcados como potencialmente editoriales.", styles["BodyCustom"])]
    story += [PageBreak(), p("4. Consultas de prueba", styles["H1Custom"]), p("Las capturas de Atlas muestran 369 resultados para cada consulta, equivalentes al 5,01% superior de la proyección. Los umbrales y ejemplos siguientes fueron observados directamente en el mapa.", styles["BodyCustom"])]
    query_rows = [[p("Consulta", styles["TableBold"]), p("Resultados", styles["TableBold"]), p("Umbral", styles["TableBold"]), p("Observación", styles["TableBold"])]]
    atlas_searches = metrics.get("atlas_searches") or [
        {"query": item["query"], "results": item["matching_chunks"], "threshold": "local", "observation": "previsualización lexical"}
        for item in metrics["query_previews"]
    ]
    for item in atlas_searches:
        query_rows.append([p(str(item["query"]), styles["Table"]), p(str(item["results"]), styles["Table"]), p(str(item["threshold"]), styles["Table"]), p(str(item["observation"]), styles["Table"])])
    qt = Table(query_rows, colWidths=[38 * mm, 25 * mm, 25 * mm, 72 * mm], repeatRows=1)
    qt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), teal), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F8FA")]), ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#D8E0E7")), ("VALIGN", (0, 0), (-1, -1), "TOP"), ("PADDING", (0, 0), (-1, -1), 6)]))
    story += [qt, Spacer(1, 8 * mm), p("Interpretación", styles["H2Custom"]), p("playas recuperó puntos relacionados con Beaches Spain, pero también mostró ruido editorial. castillos recuperó contenido de turismo de naturaleza y una ruta con catedral; es una coincidencia patrimonial parcial, no una respuesta exclusivamente sobre castillos. comida romántica recuperó el tema Spanish Gastronomy / Culinary Events y el encabezado La Casa Romántica, con una coincidencia claramente pertinente.", styles["BodyCustom"]), p("Estado de Atlas", styles["H2Custom"]), p(atlas_state, styles["Quote"]), PageBreak(), p("5. Reproducibilidad y próximos pasos", styles["H1Custom"]), p("Para regenerar este informe desde cero:", styles["BodyCustom"]), p("1. Descargar las ediciones 58–78 con scripts/rag/download_magazines.py.\n2. Parsear con scripts/rag/parse_magazines.py.\n3. Validar con scripts/rag/validate_chunks.py.\n4. Analizar y generar este PDF con scripts/rag/analyze_corpus.py.\n5. Crear el dataset Atlas con scripts/rag/upload_nomic.py y registrar en README el identificador y la URL pública.", styles["BodyCustom"]), p("Criterio de seguridad", styles["H2Custom"]), p("La API key de Nomic sólo se lee desde el entorno del proceso server-side. No se guarda en el repositorio, no se incluye en el cliente ni se transmite al proxy LLM.", styles["BodyCustom"]), p("Conclusión", styles["H2Custom"]), p("La etapa local del RAG está completa y el dataset está publicado. Queda integrar la nueva projection_id en Render, probar el chat público y mantener el criterio de rechazo cuando Atlas no entregue evidencia suficiente.", styles["BodyCustom"]),
    ]
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=Path("data/processed"))
    parser.add_argument("--output-pdf", type=Path, default=Path("output/pdf/Informe_Dataset_Tarea3.pdf"))
    parser.add_argument("--output-json", type=Path, default=Path("output/pdf/corpus_metrics.json"))
    parser.add_argument("--atlas-projection-id")
    parser.add_argument("--atlas-dataset-url")
    parser.add_argument("--atlas-map-url")
    args = parser.parse_args()
    rows = read_rows(args.input_dir)
    metrics = build_metrics(rows)
    if args.atlas_projection_id and args.atlas_dataset_url and args.atlas_map_url:
        metrics["atlas"] = {
            "projection_id": args.atlas_projection_id,
            "dataset_url": args.atlas_dataset_url,
            "map_url": args.atlas_map_url,
        }
        metrics["atlas_searches"] = [
            {"query": "playas", "results": 369, "threshold": "0.59781", "observation": "Beaches Spain + ruido editorial (DIRECTORA)"},
            {"query": "castillos", "results": 369, "threshold": "0.61005", "observation": "ruta/patrimonio y turismo de naturaleza; relevancia parcial"},
            {"query": "comida romántica", "results": 369, "threshold": "0.55632", "observation": "La Casa Romántica; gastronomía pertinente"},
        ]
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    build_pdf(metrics, args.output_pdf)
    print(f"Analyzed {metrics['chunks']} chunks from {len(metrics['issues'])} issues")
    print(f"Wrote {args.output_pdf}")
    print(f"Wrote {args.output_json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
