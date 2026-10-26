# Resume Workshop

- Run `npm run dev` for the website, `npm test` for tests, and `npm run build` for type-checking and a production build.
- Run `npm run test:ats` for the PDF text-retention gate (requires Python packages from `requirements-ats.txt` and Chrome or `CHROME_PATH`). Set `ATS_MD_PATH` to check a real Markdown file instead of the sample fixtures. The gate targets at least 90% recoverable visible words, not a vendor ATS field-classification score.
- Run `npm audit --audit-level=moderate` when changing dependencies. Check a downloaded PDF with a text extractor to confirm name, contact details, and sections appear in order.
- Markdown uses YAML front matter for identity, contact details, and optional `fontSize.name` / `fontSize.body` / `fontSize.contact` in points. Colors are chosen in the UI (older Markdown color fields remain optional). The sample format is in `src/sample.ts`.
- Resume fonts are bundled locally as WOFF2 for preview and TTF for direct PDF export; keep both formats in sync when changing fonts. Keep the contact row on one A4 line and block PDF export when it overflows.
- Reject ATS-unreliable Markdown such as images, raw HTML, tables, and task checkboxes rather than silently losing their content.
- Keep the exported A4 resume single-column with embedded fonts and selectable text. The Download PDF button generates a PDF in the browser without opening the print dialog; the Markdown remains the editable source of truth.
- Do not add backend uploads or remote processing of personal resume data without an explicit requirement.
