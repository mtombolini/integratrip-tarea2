# Corpus de Traveling Magazine

El corpus se construye desde las ediciones digitales en español de Traveling
Magazine. Los PDF originales se descargan localmente en `data/raw/`, pero no se
versionan. Los chunks resultantes sí se versionan en `data/processed/`.

## Ediciones objetivo

El enunciado solicita intentar las 21 ediciones disponibles y exige al menos
10 ediciones válidas. El descargador intenta las ediciones 58 a 78 y escribe
un manifiesto local con el resultado de cada descarga.

Fuente de descarga indicada por el curso:

`https://www.tienda-revistatraveling.es/descargas/travelingNN.pdf`

El estado reproducible actual contiene las 21 ediciones, de la 58 a la 78,
con 7.366 chunks validados en 21 archivos JSONL.

## Formato procesado

Cada línea JSON contiene como mínimo:

- `id`: identificador único del chunk;
- `text`: texto contextualizado del chunk;
- `source`: nombre del PDF, por ejemplo `traveling78.pdf`;
- `issue`: número de revista;
- `headings`: encabezados detectados por Docling;
- `pages`: páginas de origen.

El parseo usa Docling sin OCR, `HybridChunker` y el tokenizer
`sentence-transformers/all-MiniLM-L6-v2`.
