import { parseDocument } from 'yaml'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'

export type Resume = {
  name: string
  title: string
  location: string
  phone: string
  email: string
  website: string
  linkedin: string
  colors: {
    primary: string
    accent: string
  }
  fontSize: {
    name: number
    body: number
    contact: number
  }
  body: string
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a YAML object.`)
  }
  return value as Record<string, unknown>
}

function field(data: Record<string, unknown>, key: string, required = false): string {
  const value = data[key]
  if (value === undefined || value === null) {
    if (required) throw new Error(`Add "${key}" to the Markdown front matter.`)
    return ''
  }
  if (typeof value !== 'string') throw new Error(`"${key}" must be text.`)
  if (required && !value.trim()) throw new Error(`"${key}" cannot be empty.`)
  return value.trim()
}

function color(value: string, label: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`"${label}" must be a six-digit hex color, such as #242424.`)
  }
  const channels = [1, 3, 5].map((index) => {
    const component = parseInt(value.slice(index, index + 2), 16) / 255
    return component <= 0.04045 ? component / 12.92 : ((component + 0.055) / 1.055) ** 2.4
  })
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  if (1.05 / (luminance + 0.05) < 4.5) {
    throw new Error(`"${label}" needs more contrast against white to remain readable.`)
  }
  return value
}

function size(value: unknown, label: string, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`"fontSize.${label}" must be a number between ${min} and ${max} points.`)
  }
  return value
}

function webUrl(value: string, label: string): string {
  if (!value) return ''
  try {
    const url = new URL(value)
    if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname) return url.href
  } catch {}
  throw new Error(`"${label}" must be a full http:// or https:// URL.`)
}

function validateBody(body: string): void {
  if (!body) throw new Error('Add resume content under a ## section heading.')
  type MarkdownNode = { type: string; checked?: boolean | null; children?: MarkdownNode[] }
  const tree = unified().use(remarkParse).use(remarkGfm).parse(body) as MarkdownNode
  function visit(node: MarkdownNode): void {
    if (node.type === 'image' || node.type === 'imageReference') {
      throw new Error('ATS-safe resumes need text instead of images. Replace the image with a heading or bullet.')
    }
    if (node.type === 'html') {
      throw new Error('Raw HTML is not supported in the resume. Write its content as Markdown text.')
    }
    if (node.type === 'table') {
      throw new Error('Tables are not ATS-safe. Use headings and bullet points instead.')
    }
    if (node.type === 'listItem' && node.checked !== null && node.checked !== undefined) {
      throw new Error('Task lists are not ATS-safe. Use regular bullet points instead.')
    }
    node.children?.forEach(visit)
  }
  visit(tree)
}

export function parseResume(markdown: string): Resume {
  const source = markdown.replace(/^\uFEFF/, '')
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)
  if (!match) throw new Error('Start the Markdown with YAML front matter between --- lines.')

  const document = parseDocument(match[1], { uniqueKeys: true })
  if (document.errors.length) throw new Error(`Front matter: ${document.errors[0].message}`)
  const data = record(document.toJS(), 'Front matter')
  // colors is now optional — the UI theme picker overrides it anyway
  const colorsRaw = data.colors !== undefined ? record(data.colors, '"colors"') : null
  const fontSizes = data.fontSize === undefined ? {} : record(data.fontSize, '"fontSize"')
  const email = field(data, 'email', true)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('"email" must be a valid email address.')
  const body = source.slice(match[0].length).trim()
  validateBody(body)

  return {
    name: field(data, 'name', true),
    title: field(data, 'title', true),
    location: field(data, 'location'),
    phone: field(data, 'phone'),
    email,
    website: webUrl(field(data, 'website'), 'website'),
    linkedin: webUrl(field(data, 'linkedin'), 'linkedin'),
    colors: colorsRaw
      ? {
          primary: color(field(colorsRaw, 'primary', true), 'primary'),
          accent: color(field(colorsRaw, 'accent', true), 'accent'),
        }
      : { primary: '#1a1a1a', accent: '#444444' },
    fontSize: {
      name: size(fontSizes.name, 'name', 29, 22, 34),
      body: size(fontSizes.body, 'body', 10, 9, 12),
      contact: size(fontSizes.contact, 'contact', 8, 7.5, 9),
    },
    body,
  }
}

export function downloadMarkdown(markdown: string, name: string): void {
  const filename = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my'}-resume.md`
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
