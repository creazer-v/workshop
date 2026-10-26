import 'regenerator-runtime/runtime'
import fontkit from '@pdf-lib/fontkit'
import type { Font as FontkitFont } from '@pdf-lib/fontkit'
import { PDFDocument, PDFString, rgb } from 'pdf-lib'
import type { Color, PDFFont, PDFPage } from 'pdf-lib'

const A4_WIDTH = 595.276
const A4_HEIGHT = 841.89
const fonts = [
  ['Inter', 'inter'],
  ['DM Sans', 'dm-sans'],
  ['Plus Jakarta Sans', 'plus-jakarta'],
  ['Outfit', 'outfit'],
] as const

function color(value: string): Color {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0]
  return rgb(channels[0] / 255, channels[1] / 255, channels[2] / 255)
}

function fontKey(style: CSSStyleDeclaration): string {
  const family = fonts.find(([name]) => style.fontFamily.includes(name))?.[1] ?? 'inter'
  const weight = Number(style.fontWeight)
  return `${family}-${weight >= 600 ? 700 : weight <= 300 ? 300 : 400}`
}

type PdfFontMap = Map<string, { pdf: PDFFont; source: FontkitFont }>

async function loadFonts(doc: PDFDocument, sheets: HTMLElement[]): Promise<PdfFontMap> {
  const needed = new Set<string>()
  for (const sheet of sheets) {
    const text = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT)
    while (text.nextNode()) {
      const parent = text.currentNode.parentElement
      if (parent && text.currentNode.textContent?.trim()) needed.add(fontKey(getComputedStyle(parent)))
    }
  }
  const loaded: PdfFontMap = new Map()
  const load = async (key: string) => {
    const response = await fetch(`${import.meta.env.BASE_URL}fonts/${key}.ttf`)
    if (!response.ok) throw new Error(`Could not load the ${key} font for PDF export.`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    loaded.set(key, { pdf: await doc.embedFont(bytes, { subset: !key.startsWith('noto-sans-devanagari') }), source: fontkit.create(bytes) })
  }
  await Promise.all([...needed].map(load))
  const fallbackWeights = new Set<number>()
  for (const sheet of sheets) {
    const text = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT)
    while (text.nextNode()) {
      const parent = text.currentNode.parentElement
      if (!parent) continue
      const key = fontKey(getComputedStyle(parent))
      const asset = loaded.get(key)
      if (asset && [...(text.currentNode.textContent ?? '')].some(char => !asset.source.hasGlyphForCodePoint(char.codePointAt(0)!))) {
        fallbackWeights.add(key.endsWith('700') ? 700 : 400)
      }
    }
  }
  await Promise.all([...fallbackWeights].map(weight => load(`noto-sans-devanagari-${weight}`)))
  return loaded
}

function drawRules(page: PDFPage, sheet: HTMLElement, xScale: number, yScale: number): void {
  for (const element of sheet.querySelectorAll<HTMLElement>('.resume-header, .resume-content h1, .resume-content h2')) {
    const style = getComputedStyle(element)
    const box = element.getBoundingClientRect()
    const origin = sheet.getBoundingClientRect()
    const bottomBorder = parseFloat(style.borderBottomWidth)
    if (bottomBorder > 0) {
      const y = A4_HEIGHT - (box.bottom - origin.top) * yScale
      page.drawLine({
        start: { x: (box.left - origin.left) * xScale, y },
        end: { x: (box.right - origin.left) * xScale, y },
        thickness: Math.max(0.4, bottomBorder * yScale),
        color: color(style.borderBottomColor),
      })
    }
    const leftBorder = parseFloat(style.borderLeftWidth)
    if (leftBorder > 0) {
      const x = (box.left - origin.left + leftBorder / 2) * xScale
      page.drawLine({
        start: { x, y: A4_HEIGHT - (box.top - origin.top) * yScale },
        end: { x, y: A4_HEIGHT - (box.bottom - origin.top) * yScale },
        thickness: leftBorder * xScale,
        color: color(style.borderLeftColor),
      })
    }
  }
}

function drawMarkers(page: PDFPage, sheet: HTMLElement, xScale: number, yScale: number, bodyFont: PDFFont): void {
  const origin = sheet.getBoundingClientRect()
  for (const item of sheet.querySelectorAll<HTMLElement>('.resume-content li')) {
    const list = item.parentElement
    if (!list || !list.matches('ul, ol')) continue
    const rect = item.getBoundingClientRect()
    const x = (rect.left - origin.left) * xScale - 7
    const y = A4_HEIGHT - (rect.top - origin.top) * yScale - 7
    const markerColor = color(getComputedStyle(item, '::marker').color)
    if (list.tagName === 'OL') {
      const number = `${(list as HTMLOListElement).start + Array.from(list.children).indexOf(item)}.`
      page.drawText(number, { x: x - bodyFont.widthOfTextAtSize(number, 8), y, font: bodyFont, size: 8, color: markerColor })
    } else {
      page.drawCircle({ x, y: y + 3, size: 1, color: markerColor })
    }
  }
}

function drawIcons(page: PDFPage, sheet: HTMLElement, xScale: number, yScale: number): void {
  const origin = sheet.getBoundingClientRect()
  for (const icon of sheet.querySelectorAll<SVGSVGElement>('.resume-contact-icon')) {
    const rect = icon.getBoundingClientRect()
    const scale = rect.width * xScale / 24
    const x = (rect.left - origin.left) * xScale
    const y = A4_HEIGHT - (rect.top - origin.top) * yScale
    const stroke = color(getComputedStyle(icon).color)
    for (const path of icon.querySelectorAll('path')) {
      const data = path.getAttribute('d')
      if (data) page.drawSvgPath(data, { x, y, scale, borderColor: stroke, borderWidth: 1.8, borderOpacity: 1 })
    }
    for (const circle of icon.querySelectorAll('circle')) {
      page.drawCircle({
        x: x + Number(circle.getAttribute('cx')) * scale,
        y: y - Number(circle.getAttribute('cy')) * scale,
        size: Number(circle.getAttribute('r')) * scale,
        borderWidth: 1.8 * scale, borderColor: stroke,
      })
    }
    for (const box of icon.querySelectorAll('rect')) {
      page.drawRectangle({
        x: x + Number(box.getAttribute('x')) * scale,
        y: y - (Number(box.getAttribute('y')) + Number(box.getAttribute('height'))) * scale,
        width: Number(box.getAttribute('width')) * scale,
        height: Number(box.getAttribute('height')) * scale,
        borderWidth: 1.8 * scale, borderColor: stroke,
      })
    }
  }
}

function drawText(page: PDFPage, sheet: HTMLElement, xScale: number, yScale: number, embedded: PdfFontMap): void {
  const origin = sheet.getBoundingClientRect()
  const walker = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    const parent = node.parentElement
    const value = node.textContent ?? ''
    if (!parent || !value.trim()) continue
    const style = getComputedStyle(parent)
    if (style.visibility === 'hidden' || style.display === 'none') continue
    const key = fontKey(style)
    const primary = embedded.get(key)
    if (!primary) throw new Error('A resume font is missing from the PDF.')
    const size = parseFloat(style.fontSize) * yScale
    const range = document.createRange()
    let line: { top: number; left: number; text: string; width: number; key: string } | null = null
    const flush = () => {
      if (!line) return
      const text = style.textTransform === 'uppercase' ? line.text.toUpperCase() : line.text
      const font = embedded.get(line.key)!.pdf
      font.encodeText(text)
      const fontWidth = font.widthOfTextAtSize(text, size)
      const fittedSize = fontWidth > line.width + 1 ? size * line.width / fontWidth : size
      page.drawText(text, {
        x: (line.left - origin.left) * xScale,
        y: A4_HEIGHT - (line.top - origin.top) * yScale - fittedSize * 0.81,
        size: fittedSize, font, color: color(style.color),
      })
      line = null
    }
    for (const match of value.matchAll(/\S+\s*/gu)) {
      const word = match[0].trimEnd()
      const segments: { start: number; end: number; key: string }[] = []
      for (let offset = 0; offset < word.length;) {
        const char = String.fromCodePoint(word.codePointAt(offset)!)
        const segmentKey = primary.source.hasGlyphForCodePoint(char.codePointAt(0)!)
          ? key : `noto-sans-devanagari-${key.endsWith('700') ? 700 : 400}`
        if (!embedded.get(segmentKey)?.source.hasGlyphForCodePoint(char.codePointAt(0)!)) {
          throw new Error(`The PDF fonts cannot render "${char}". Replace it with supported text.`)
        }
        const previous = segments[segments.length - 1]
        if (previous?.key === segmentKey) previous.end += char.length
        else segments.push({ start: offset, end: offset + char.length, key: segmentKey })
        offset += char.length
      }
      for (const segment of segments) {
        range.setStart(node, match.index + segment.start)
        range.setEnd(node, match.index + segment.end)
        const rect = range.getBoundingClientRect()
        if (!rect.width || !rect.height) continue
        if (line && (Math.abs(line.top - rect.top) > 2 || line.key !== segment.key)) flush()
        if (!line) line = { top: rect.top, left: rect.left, text: '', width: 0, key: segment.key }
        line.text += word.slice(segment.start, segment.end) + (segment === segments[segments.length - 1] ? match[0].slice(word.length) : '')
        line.width = rect.right - line.left
      }
    }
    flush()
  }
}

function addLinks(doc: PDFDocument, page: PDFPage, sheet: HTMLElement, xScale: number, yScale: number): void {
  const origin = sheet.getBoundingClientRect()
  for (const link of sheet.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = link.href
    if (!/^(https?:|mailto:|tel:)/i.test(href)) continue
    for (const rect of link.getClientRects()) {
      const left = (rect.left - origin.left) * xScale
      const bottom = A4_HEIGHT - (rect.bottom - origin.top) * yScale
      const annotation = doc.context.obj({
        Type: 'Annot', Subtype: 'Link',
        Rect: [left, bottom, left + rect.width * xScale, bottom + rect.height * yScale],
        Border: [0, 0, 0],
        A: { S: 'URI', URI: PDFString.of(href) },
      })
      page.node.addAnnot(doc.context.register(annotation))
    }
  }
}

export async function buildResumePdf(sheets: HTMLElement[], title: string): Promise<Uint8Array> {
  if (!sheets.length) throw new Error('Wait for the resume pages to finish rendering.')
  for (const sheet of sheets) {
    const content = sheet.querySelector('.resume-content')
    const last = content?.lastElementChild
    const bottom = sheet.getBoundingClientRect().bottom - parseFloat(getComputedStyle(sheet).paddingBottom)
    if (last && last.getBoundingClientRect().bottom > bottom + 1) {
      throw new Error('A resume paragraph or bullet is too long for one A4 page. Split it into shorter paragraphs or bullets before downloading.')
    }
  }
  if (sheets.some(sheet => /[\u0900-\u097f]/u.test(sheet.innerText))) {
    throw new Error('Devanagari text cannot yet be exported with reliable ATS reading order. Use a Latin transliteration for this PDF.')
  }
  await document.fonts.ready
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  doc.setTitle(`${title} - Resume`)
  const embedded = await loadFonts(doc, sheets)
  for (const sheet of sheets) {
    const page = doc.addPage([A4_WIDTH, A4_HEIGHT])
    const origin = sheet.getBoundingClientRect()
    const xScale = A4_WIDTH / origin.width
    const yScale = A4_HEIGHT / origin.height
    drawRules(page, sheet, xScale, yScale)
    drawMarkers(page, sheet, xScale, yScale, (embedded.get('inter-400') ?? [...embedded.values()][0]).pdf)
    drawIcons(page, sheet, xScale, yScale)
    drawText(page, sheet, xScale, yScale, embedded)
    addLinks(doc, page, sheet, xScale, yScale)
  }
  return doc.save()
}

export function savePdf(pdf: Uint8Array, name: string): void {
  const filename = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my'}-resume.pdf`
  const url = URL.createObjectURL(new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
