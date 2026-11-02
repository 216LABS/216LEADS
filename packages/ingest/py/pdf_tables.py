"""Records-request PDF -> CSV on stdout (spec 5.12). Usage: python -E -P pdf_tables.py file.pdf

Every table on every page is written in order. The first row of the first table is the header;
later pages that repeat the same header row have it dropped. Needs: pip install pdfplumber
"""
import csv
import sys

import pdfplumber


def main(path):
    out = csv.writer(sys.stdout, lineterminator="\n")
    header = None
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables() or []
            if not tables:
                tables = [page.extract_table({"vertical_strategy": "text", "horizontal_strategy": "text"}) or []]
            for table in tables:
                for row in table:
                    cells = [(c or "").replace("\n", " ").strip() for c in row]
                    if not any(cells):
                        continue
                    if header is None:
                        header = cells
                    elif cells == header:
                        continue
                    out.writerow(cells)


if __name__ == "__main__":
    main(sys.argv[1])
