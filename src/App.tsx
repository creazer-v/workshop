import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatResumeEntries } from './formatResume'
import { downloadMarkdown, parseResume } from './resume'
import type { Resume } from './resume'
import { legacySampleMarkdown, monochromeSampleMarkdown, previousEntryLayoutSampleMarkdown, previousNameSizeSampleMarkdown, previousPositionLayoutSampleMarkdown, previousSampleMarkdown, sampleMarkdown } from './sample'

const storageKey = 'resume-workshop-markdown'
const fontStorageKey = 'resume-workshop-name-font'
const bodyFontStorageKey = 'resume-workshop-body-font'
const colorThemeStorageKey = 'resume-workshop-color-theme'
const colorThemeMigrationKey = 'resume-workshop-evergreen-theme'
const customColorsStorageKey = 'resume-workshop-custom-colors'
const nameColorStorageKey = 'resume-workshop-name-color'
const titleBarsStorageKey = 'resume-workshop-title-bars'
const CUSTOM_THEME_NAME = 'Custom'

const FONTS: { label: string; family: string }[] = [
  { label: 'Inter',    family: 'Inter' },
  { label: 'DM Sans',  family: 'DM Sans' },
  { label: 'Jakarta',  family: 'Plus Jakarta Sans' },
  { label: 'Outfit',   family: 'Outfit' },
]

// Minimal palettes; Evergreen follows the resume reference.
const COLOR_THEMES: { name: string; primary: string; accent: string }[] = [
  { name: 'Evergreen',     primary: '#222422', accent: '#215541' },
  { name: 'Ink',           primary: '#1a1a1a', accent: '#444444' },
  { name: 'Claude',        primary: '#2E2B26', accent: '#C96442' },
  { name: 'Zen',           primary: '#2c2b28', accent: '#5c5248' },
  { name: 'Tiesen',        primary: '#0a0f1e', accent: '#1E50E6' },
  { name: 'Light Green',   primary: '#1E3A2F', accent: '#2E7D52' },
  { name: 'qrafthive',     primary: '#1a1410', accent: '#8B5E3C' },
  { name: 'VTRON',         primary: '#050a18', accent: '#0044CC' },
  { name: 'autoblog',      primary: '#1a0f0a', accent: '#C84B00' },
]

function initialFont(): string {
  try {
    const saved = localStorage.getItem(fontStorageKey)
    return saved && FONTS.some(f => f.family === saved) ? saved : FONTS[0].family
  } catch { return FONTS[0].family }
}

function initialBodyFont(): string {
  try {
    const saved = localStorage.getItem(bodyFontStorageKey)
    return saved && FONTS.some(f => f.family === saved) ? saved : FONTS[0].family
  } catch { return FONTS[0].family }
}

function initialColorTheme(): string {
  try {
    const saved = localStorage.getItem(colorThemeStorageKey)
    if (saved === 'Ink' && !localStorage.getItem(colorThemeMigrationKey)) return COLOR_THEMES[0].name
    return saved && (saved === CUSTOM_THEME_NAME || COLOR_THEMES.some(theme => theme.name === saved))
      ? saved : COLOR_THEMES[0].name
  } catch { return COLOR_THEMES[0].name }
}

function initialMarkdown(): string {
  try {
    const saved = localStorage.getItem(storageKey)
    return saved === legacySampleMarkdown || saved === previousSampleMarkdown || saved === monochromeSampleMarkdown || saved === previousNameSizeSampleMarkdown || saved === previousEntryLayoutSampleMarkdown || saved === previousPositionLayoutSampleMarkdown ? sampleMarkdown : saved ?? sampleMarkdown
  } catch {
    return sampleMarkdown
  }
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
}

type ContactKind = 'location' | 'phone' | 'email' | 'website' | 'linkedin'

function ContactIcon({ kind }: { kind: ContactKind }) {
  return (
    <svg className="resume-contact-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {kind === 'location' && <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>}
      {kind === 'phone' && <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.5 3a2 2 0 0 1-.6 1.7L7.1 10a16 16 0 0 0 6 6l1.6-1.9a2 2 0 0 1 1.7-.6l3 .5a2 2 0 0 1 1.6 1.9Z" />}
      {kind === 'email' && <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 6 10 7 10-7" /></>}
      {kind === 'website' && <><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a16 16 0 0 1 0 20M12 2a16 16 0 0 0 0 20" /></>}
      {kind === 'linkedin' && <><rect x="2" y="2" width="20" height="20" rx="2" /><path d="M7 10v7M7 7v.01M11 17v-7m0 3a3 3 0 0 1 6 0v4" /></>}
    </svg>
  )
}

export function ResumePreview({ resume, nameFont, bodyFont, nameColor, titleBars = true, onContactOverflow }: { resume: Resume; nameFont?: string; bodyFont?: string; nameColor?: string | null; titleBars?: boolean; onContactOverflow?: (overflow: boolean) => void }) {
  const resumeRef = useRef<HTMLElement>(null)
  const [pages, setPages] = useState<string[]>([])
  const [contactSize, setContactSize] = useState<string>()

  const contactRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (!contactRef.current) return
    const contact = contactRef.current
    const MIN_PT = 6.5
    const check = () => {
      const resumeEl = contact.closest('.resume') as HTMLElement | null
      if (!resumeEl) return
      const maxWidth = resumeEl.clientWidth
        - parseFloat(getComputedStyle(resumeEl).paddingLeft)
        - parseFloat(getComputedStyle(resumeEl).paddingRight)
      // reset to CSS-specified size first
      contact.style.fontSize = ''
      if (contact.scrollWidth <= maxWidth + 1) {
        setContactSize(undefined)
        onContactOverflow?.(false)
        return
      }
      // shrink step by step until it fits or hits the floor
      const basePx = parseFloat(getComputedStyle(contact).fontSize)
      const minPx = MIN_PT * (96 / 72)
      let size = basePx
      while (size > minPx && contact.scrollWidth > maxWidth + 1) {
        size -= 0.25
        contact.style.fontSize = `${size}px`
      }
      setContactSize(`${size}px`)
      onContactOverflow?.(contact.scrollWidth > maxWidth + 1)
    }
    const observer = new ResizeObserver(check)
    observer.observe(contact)
    check()
    return () => observer.disconnect()
  }, [resume, onContactOverflow])

  const theme = {
    '--resume-primary': resume.colors.primary,
    '--resume-accent': resume.colors.accent,
    '--resume-name-color': nameColor ?? resume.colors.primary,
    '--resume-name-size': `${resume.fontSize.name}pt`,
    '--resume-body-size': `${resume.fontSize.body}pt`,
    '--resume-contact-size': `${resume.fontSize.contact}pt`,
    ...(nameFont ? { '--resume-name-font': `'${nameFont}'` } : {}),
    ...(bodyFont ? { '--resume-body-font': `'${bodyFont}'` } : {}),
  } as CSSProperties
  const contacts: { kind: ContactKind; label: string; href?: string }[] = []
  if (resume.phone) contacts.push({ kind: 'phone', label: resume.phone, href: `tel:${resume.phone.replace(/[^\d+]/g, '')}` })
  contacts.push({ kind: 'email', label: resume.email, href: `mailto:${resume.email}` })
  if (resume.website) contacts.push({ kind: 'website', label: displayUrl(resume.website), href: resume.website })
  if (resume.linkedin) contacts.push({ kind: 'linkedin', label: displayUrl(resume.linkedin), href: resume.linkedin })
  if (resume.location) contacts.push({ kind: 'location', label: resume.location })

  useLayoutEffect(() => {
    const source = resumeRef.current
    if (!source) return
    let cancelled = false
    const paginate = () => {
      const header = source.querySelector('.resume-header')
      const body = source.querySelector('.resume-content')
      if (!header || !body) return
      const host = document.createElement('div')
      host.className = 'resume-measure'
      host.style.cssText = source.getAttribute('style') ?? ''
      document.body.appendChild(host)
      const sheets: HTMLElement[] = []
      let sheet!: HTMLElement
      let content!: HTMLElement
      const newSheet = () => {
        sheet = document.createElement('article')
        sheet.className = `resume resume-sheet${titleBars ? ' resume--title-bars' : ''}`
        content = document.createElement('div')
        content.className = 'resume-content'
        if (sheets.length === 0) sheet.appendChild(header.cloneNode(true))
        sheet.appendChild(content)
        host.appendChild(sheet)
        sheets.push(sheet)
      }
      newSheet()
      const fits = () => {
        const bottom = sheet.getBoundingClientRect().bottom - parseFloat(getComputedStyle(sheet).paddingBottom)
        return content.lastElementChild!.getBoundingClientRect().bottom <= bottom + 1
      }
      const add = (node: Element) => {
        content.appendChild(node)
        if (!fits() && content.children.length > 1) {
          node.remove()
          newSheet()
          content.appendChild(node)
        }
      }
      const blocks = Array.from(body.children)
      for (const [index, block] of blocks.entries()) {
        if (block.matches('h1, h2, h3, h4, h5, h6') && blocks[index + 1] && content.children.length) {
          const heading = block.cloneNode(true) as Element
          const next = blocks[index + 1].cloneNode(true) as Element
          if (next.matches('ul, ol')) {
            next.replaceChildren(next.firstElementChild?.cloneNode(true) ?? '')
          }
          content.append(heading, next)
          const keepTogether = fits()
          heading.remove()
          next.remove()
          if (!keepTogether) newSheet()
        }
        if (block.matches('ul, ol') && block.children.length > 1) {
          let list: Element | null = null
          for (const [itemIndex, item] of Array.from(block.children).entries()) {
            if (!list) {
              list = block.cloneNode(false) as Element
              add(list)
            }
            const child = item.cloneNode(true) as Element
            list.appendChild(child)
            if (!fits() && list.children.length > 1) {
              child.remove()
              list = block.cloneNode(false) as Element
              if (list instanceof HTMLOListElement) list.start = (block as HTMLOListElement).start + itemIndex
              newSheet()
              content.appendChild(list)
              list.appendChild(child)
            } else if (!fits() && list.children.length === 1 && content.children.length > 1) {
              list.remove()
              newSheet()
              list = block.cloneNode(false) as Element
              content.appendChild(list)
              list.appendChild(child)
            }
          }
        } else {
          add(block.cloneNode(true) as Element)
        }
      }
      const html = sheets.map(s => s.querySelector('.resume-content')!.innerHTML)
      host.remove()
      if (!cancelled) setPages(old => old.length === html.length && old.every((page, index) => page === html[index]) ? old : html)
    }
    paginate()
    document.fonts.ready.then(() => { if (!cancelled) paginate() })
    return () => { cancelled = true }
  }, [resume, nameFont, bodyFont, titleBars])

  return (
    <>
    <div className="resume-pages">
      {pages.map((html, index) => (
        <article className={`resume resume-sheet${titleBars ? ' resume--title-bars' : ''}`} aria-label={`Resume page ${index + 1}`} style={theme} key={index}>
          {index === 0 && <header className="resume-header">
            <h1>{resume.name}</h1>
            <p className="resume-title">{resume.title}</p>
            <p className="resume-contact" style={contactSize ? { fontSize: contactSize } : undefined}>
              {contacts.map(({ kind, label, href }, i) => (
                <span key={kind}>{i > 0 && <span className="resume-contact-sep" aria-hidden="true">|</span>}<ContactIcon kind={kind} />{href ? <a href={href}>{label}</a> : label}</span>
              ))}
            </p>
          </header>}
          <div className="resume-content" dangerouslySetInnerHTML={{ __html: html }} />
          {index === pages.length - 1 && <footer className="resume-footer" aria-hidden="true"><span className="resume-footer-hash">#</span></footer>}
        </article>
      ))}
    </div>
    <article className={`resume resume-source${titleBars ? ' resume--title-bars' : ''}`} aria-label="Resume print source" style={theme} ref={resumeRef}>
      <header className="resume-header">
        <h1>{resume.name}</h1>
        <p className="resume-title">{resume.title}</p>
        <p className="resume-contact" ref={contactRef}>
          {contacts.map(({ kind, label, href }, index) => (
            <span key={kind}>{index > 0 && <span className="resume-contact-sep" aria-hidden="true">|</span>}<ContactIcon kind={kind} />{href ? <a href={href}>{label}</a> : label}</span>
          ))}
        </p>
      </header>
      <div className="resume-content">
        <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} rehypePlugins={[formatResumeEntries]} components={{ img: ({ alt }) => alt ? <span>{alt}</span> : null }}>
          {resume.body.replace(/[‐‑‒–—−]/g, '-').replace(/·/g, '|')}
        </ReactMarkdown>
      </div>
      <footer className="resume-footer" aria-hidden="true">
        <span className="resume-footer-hash">#</span>
      </footer>
    </article>
    </>
  )
}

export default function App() {
  const [markdown, setMarkdown] = useState(initialMarkdown)
  const [nameFont, setNameFont] = useState(initialFont)
  const [bodyFont, setBodyFont] = useState(initialBodyFont)
  const [colorTheme, setColorTheme] = useState(initialColorTheme)
  const [customColors, setCustomColors] = useState<{ primary: string; accent: string }>(() => {
    try {
      const saved = localStorage.getItem(customColorsStorageKey)
      if (saved) return JSON.parse(saved)
    } catch { /* ignore */ }
    return { primary: '#1a1a1a', accent: '#444444' }
  })
  const [nameColor, setNameColor] = useState<string | null>(() => {
    try {
      const saved = localStorage.getItem(nameColorStorageKey)
      return saved && /^#[0-9a-f]{6}$/i.test(saved) ? saved : null
    } catch { return null }
  })
  const [titleBars, setTitleBars] = useState(() => {
    try { return localStorage.getItem(titleBarsStorageKey) !== 'false' } catch { return true }
  })
  const [colorPanelOpen, setColorPanelOpen] = useState(false)
  const [fileError, setFileError] = useState('')
  const [pdfError, setPdfError] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [storageError, setStorageError] = useState(false)
  const [contactOverflow, setContactOverflow] = useState(false)
  const [mobileView, setMobileView] = useState<'editor' | 'preview'>('editor')
  const fileInput = useRef<HTMLInputElement>(null)
  const lastValid = useRef(parseResume(sampleMarkdown))
  const result = useMemo(() => {
    try {
      return { resume: parseResume(markdown), error: '' }
    } catch (error) {
      return { resume: null, error: error instanceof Error ? error.message : 'Could not read this Markdown.' }
    }
  }, [markdown])
  if (result.resume) lastValid.current = result.resume

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, markdown)
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [markdown])

  useEffect(() => {
    try { localStorage.setItem(fontStorageKey, nameFont) } catch { /* ignore */ }
  }, [nameFont])

  useEffect(() => {
    try { localStorage.setItem(bodyFontStorageKey, bodyFont) } catch { /* ignore */ }
  }, [bodyFont])

  useEffect(() => {
    try {
      localStorage.setItem(colorThemeStorageKey, colorTheme)
      localStorage.setItem(colorThemeMigrationKey, '1')
    } catch { /* ignore */ }
  }, [colorTheme])

  useEffect(() => {
    try { localStorage.setItem(customColorsStorageKey, JSON.stringify(customColors)) } catch { /* ignore */ }
  }, [customColors])

  useEffect(() => {
    try {
      if (nameColor) localStorage.setItem(nameColorStorageKey, nameColor)
      else localStorage.removeItem(nameColorStorageKey)
    } catch { /* ignore */ }
  }, [nameColor])

  useEffect(() => {
    try { localStorage.setItem(titleBarsStorageKey, String(titleBars)) } catch { /* ignore */ }
  }, [titleBars])

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    if (!/\.(md|markdown)$/i.test(file.name)) {
      setFileError('Choose a .md or .markdown file.')
      return
    }
    if (file.size > 1024 * 1024) {
      setFileError('Markdown files must be smaller than 1 MB.')
      return
    }
    try {
      setMarkdown(await file.text())
      setFileError('')
      setMobileView('preview')
    } catch {
      setFileError('Could not read that file. Please try again.')
    }
  }

  function restoreSample() {
    if (window.confirm('Replace your current draft with the sample resume? Export your Markdown first if you want to keep it.')) {
      setMarkdown(sampleMarkdown)
      setFileError('')
    }
  }

  async function exportPdf() {
    if (!result.resume || contactOverflow || pdfBusy) return
    setPdfBusy(true)
    setPdfError('')
    try {
      const { buildResumePdf, savePdf } = await import('./pdf')
      const sheets = Array.from(document.querySelectorAll<HTMLElement>('.resume-pages .resume-sheet'))
      savePdf(await buildResumePdf(sheets, resume.name), resume.name)
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'Could not download the PDF.')
    } finally {
      setPdfBusy(false)
    }
  }

  const baseResume = result.resume ?? lastValid.current
  const activeTheme = colorTheme === CUSTOM_THEME_NAME
    ? customColors
    : COLOR_THEMES.find(t => t.name === colorTheme)
  const resume = activeTheme
    ? { ...baseResume, colors: { primary: activeTheme.primary, accent: activeTheme.accent } }
    : baseResume
  const wordCount = resume.body.match(/\b[\w’-]+\b/g)?.length ?? 0

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">R<span>.</span></div>
          <div className="brand-copy">
            <span className="brand-name">RESUME WORKSHOP</span>
            <span className="brand-subtitle">Markdown to resume</span>
          </div>
        </div>
        <div className="topbar-right">
          <span className="local-badge"><span className="badge-dot" /> Stored locally</span>
        </div>
      </header>

      <div className="mobile-tabs" role="group" aria-label="Workspace view">
        <button type="button" className={mobileView === 'editor' ? 'mobile-tab active' : 'mobile-tab'} onClick={() => setMobileView('editor')}>Edit Markdown</button>
        <button type="button" className={mobileView === 'preview' ? 'mobile-tab active' : 'mobile-tab'} onClick={() => setMobileView('preview')}>View resume</button>
      </div>

      <main className="workspace">
        <section className={`editor-pane ${mobileView === 'preview' ? 'mobile-hidden' : ''}`} aria-label="Markdown editor">
          <div className="editor-intro">
            <div className="eyebrow">YOUR WORKSPACE</div>
            <h2>A clearer resume.</h2>
            <p>Import Markdown, refine your content, and export a clean A4 document.</p>
          </div>

          <div className="design-panel">
            <div className="design-panel-section">
              <span className="design-panel-label">PRIMARY FONT — name &amp; title</span>
              <div className="font-picker-options" role="group" aria-label="Primary font">
                {FONTS.map(({ label, family }) => (
                  <button key={family} type="button" className={`font-option${nameFont === family ? ' active' : ''}`} onClick={() => setNameFont(family)} aria-pressed={nameFont === family}>
                    <span className="font-option-preview" style={{ fontFamily: `'${family}', sans-serif` }}>Aa</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="design-panel-section">
              <span className="design-panel-label">SECONDARY FONT — body text</span>
              <div className="font-picker-options" role="group" aria-label="Secondary font">
                {FONTS.map(({ label, family }) => (
                  <button key={family} type="button" className={`font-option${bodyFont === family ? ' active' : ''}`} onClick={() => setBodyFont(family)} aria-pressed={bodyFont === family}>
                    <span className="font-option-preview" style={{ fontFamily: `'${family}', sans-serif` }}>Aa</span>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="color-panel-toggle" onClick={() => setColorPanelOpen(o => !o)} aria-expanded={colorPanelOpen}>
              <span>COLOR THEME</span>
              <span className={`color-panel-toggle-arrow${colorPanelOpen ? ' open' : ''}`}>&#9660;</span>
            </button>
            {colorPanelOpen && (
              <div className="color-panel-body">
                <div className="color-themes" role="group" aria-label="Color theme">
                  {COLOR_THEMES.map(({ name, primary, accent }) => (
                    <button key={name} type="button" className={`color-theme-btn${colorTheme === name ? ' active' : ''}`} onClick={() => setColorTheme(name)} aria-pressed={colorTheme === name} title={name}>
                      <div className="color-theme-swatch">
                        <span style={{ background: primary }} />
                        <span style={{ background: accent }} />
                        <span style={{ background: '#e8e8e8' }} />
                      </div>
                      <span className="color-theme-name">{name}</span>
                    </button>
                  ))}
                  <button type="button" className={`color-theme-btn${colorTheme === CUSTOM_THEME_NAME ? ' active' : ''}`} onClick={() => setColorTheme(CUSTOM_THEME_NAME)} aria-pressed={colorTheme === CUSTOM_THEME_NAME} title="Custom">
                    <div className="color-theme-swatch color-theme-swatch--custom">
                      <span style={{ background: customColors.primary }} />
                      <span style={{ background: customColors.accent }} />
                      <span style={{ background: '#e8e8e8' }} />
                    </div>
                    <span className="color-theme-name">Custom</span>
                  </button>
                </div>
                {colorTheme === CUSTOM_THEME_NAME && (
                  <div className="custom-color-pickers">
                    <label className="custom-color-row">
                      <span>Primary</span>
                      <span className="custom-color-right">
                        <input type="color" value={customColors.primary} onChange={e => setCustomColors(c => ({ ...c, primary: e.target.value }))} aria-label="Custom primary color" />
                        <span className="custom-color-hex">{customColors.primary}</span>
                      </span>
                    </label>
                    <label className="custom-color-row">
                      <span>Accent</span>
                      <span className="custom-color-right">
                        <input type="color" value={customColors.accent} onChange={e => setCustomColors(c => ({ ...c, accent: e.target.value }))} aria-label="Custom accent color" />
                        <span className="custom-color-hex">{customColors.accent}</span>
                      </span>
                    </label>
                  </div>
                )}
                <div className="name-color-control">
                  <label className="custom-color-row">
                    <span>Name color</span>
                    <span className="custom-color-right">
                      <input type="color" value={nameColor ?? activeTheme?.primary ?? baseResume.colors.primary} onChange={e => setNameColor(e.target.value)} aria-label="Name color" />
                      <span className="custom-color-hex">{nameColor ?? activeTheme?.primary ?? baseResume.colors.primary}</span>
                    </span>
                  </label>
                  {nameColor && <button type="button" className="name-color-reset" onClick={() => setNameColor(null)}>Use theme color</button>}
                </div>
                <button type="button" className="title-bar-toggle" aria-pressed={titleBars} onClick={() => setTitleBars(value => !value)}>
                  <span className="title-bar-icon" aria-hidden="true" />
                  Section title bars <span className="title-bar-state">{titleBars ? 'On' : 'Off'}</span>
                </button>
              </div>
            )}
          </div>

          <div className="editor-card">
            <div className="card-heading">
              <div>
                <div className="section-label">CONTENT</div>
                <h3>Markdown editor</h3>
              </div>
              <span className="format-pill">.MD</span>
            </div>
            <p className="card-description">Edit the source below. Your preview updates as you write.</p>
            <div className="editor-actions">
              <input ref={fileInput} id="markdown-file" className="visually-hidden" type="file" accept=".md,.markdown,text/markdown" onChange={importFile} />
              <button type="button" className="action-button import-button" onClick={() => fileInput.current?.click()}>
                <span className="action-symbol" aria-hidden="true">↥</span> Import Markdown
              </button>
              <button type="button" className="text-button" onClick={restoreSample}>Restore sample</button>
            </div>
            <div className="editor-field">
              <div className="editor-field-bar"><span><span className="file-indicator" /> resume.md</span><span>MARKDOWN</span></div>
              <textarea
                aria-label="Resume Markdown"
                aria-invalid={Boolean(result.error)}
                aria-describedby={result.error || fileError ? 'editor-error' : 'editor-help'}
                value={markdown}
                onChange={(event) => {
                  setMarkdown(event.target.value)
                  setFileError('')
                }}
                spellCheck={false}
              />
            </div>
            {(result.error || fileError) && <p className="editor-error" id="editor-error" role="alert">{fileError || result.error}</p>}
            <p className="editor-hint" id="editor-help">
              Choose colors above; font sizes live in the front matter. Put an italic date line below each <code>###</code> entry to align it right. Add <code>## Projects</code> or <code>## Certifications</code> as needed. Use headings and bullets, not tables or images.
            </p>
          </div>

          <p className="local-note">{storageError ? 'Browser storage is unavailable. Export Markdown to keep your changes.' : 'Your draft stays in this browser. Nothing is uploaded.'}</p>
        </section>

        <section className={`preview-pane ${mobileView === 'editor' ? 'mobile-hidden' : ''}`} aria-label="Resume workspace">
          <div className="preview-toolbar">
            <div className="preview-toolbar-title">
              <div className="section-label">DOCUMENT</div>
              <h2>Resume preview <span className="live-dot" /></h2>
              <p>A4 <span className="toolbar-separator">/</span> Single column <span className="toolbar-separator">/</span> Selectable text</p>
            </div>
            <div className="export-actions">
              <button className="export-md" type="button" onClick={() => downloadMarkdown(markdown, resume.name)}>Download .md</button>
              <button className="export-pdf" type="button" disabled={!result.resume || contactOverflow || pdfBusy} onClick={exportPdf}>{pdfBusy ? 'Building PDF...' : 'Download PDF'} <span aria-hidden="true">↗</span></button>
            </div>
          </div>
          <div className="preview-scroll">
            <div className="paper-meta"><span><span className="paper-meta-dot" /> LIVE PREVIEW</span><span>A4 · PORTRAIT</span></div>
            {!result.resume && <div className="preview-warning" role="status">Showing your last valid version. Fix the Markdown error to export the PDF.</div>}
            {contactOverflow && <div className="preview-warning" role="status">Contact details are too long for one A4 line. Shorten a link or reduce fontSize.contact before exporting the PDF.</div>}
            {pdfError && <div className="preview-warning" role="alert">{pdfError}</div>}
            <div className="resume-stage"><ResumePreview resume={resume} nameFont={nameFont} bodyFont={bodyFont} nameColor={nameColor} titleBars={titleBars} onContactOverflow={setContactOverflow} /></div>
            <div className="preview-footnote">
              <span>{wordCount} words</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
