import type { Element, Root, RootContent, Text } from 'hast'

function isElement(node: RootContent | Element['children'][number] | undefined): node is Element {
  return node?.type === 'element'
}

function nextElement(nodes: RootContent[], start: number): number {
  for (let index = start; index < nodes.length; index++) {
    const node = nodes[index]
    if (node.type === 'text' && !node.value.trim()) continue
    return isElement(node) ? index : -1
  }
  return -1
}

function content(node: Element): string {
  return node.children.map(child => child.type === 'text' ? child.value : isElement(child) ? content(child) : '').join('')
}

function text(value: string): Text {
  return { type: 'text', value }
}

function element(tagName: string, className: string, children: Element['children']): Element {
  return { type: 'element', tagName, properties: { className: [className] }, children }
}

function dateParagraph(node: RootContent | undefined): node is Element {
  if (!isElement(node) || node.tagName !== 'p') return false
  const children = node.children.filter(child => child.type !== 'text' || child.value.trim())
  return children.length === 1 && isElement(children[0]) && children[0].tagName === 'em'
}

function alignCertificationDates(list: Element): void {
  for (const item of list.children) {
    if (!isElement(item) || item.tagName !== 'li') continue
    const paragraph = item.children.length === 1 && isElement(item.children[0]) && item.children[0].tagName === 'p'
      ? item.children[0] : item
    if (paragraph.children.length !== 1 || paragraph.children[0].type !== 'text') continue
    const match = /^(.*?)\s+\|\s+((?:19|20)\d{2})$/.exec(paragraph.children[0].value.trim())
    if (!match) continue
    paragraph.children = [
      element('span', 'resume-cert-name', [text(match[1])]),
      element('span', 'resume-cert-date', [text(match[2])]),
    ]
    if (paragraph === item) item.children = [element('p', 'resume-cert-row', paragraph.children)]
    else paragraph.properties = { ...paragraph.properties, className: ['resume-cert-row'] }
  }
}

export function formatResumeEntries() {
  return (root: Root) => {
    const nodes = root.children
    let section = ''
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index]
      if (!isElement(node)) continue
      if (node.tagName === 'h2') {
        section = content(node).toLowerCase()
        continue
      }
      if (section === 'certifications' && (node.tagName === 'ul' || node.tagName === 'ol')) {
        alignCertificationDates(node)
      }
      if (node.tagName !== 'h3') continue

      const heading = node
      let secondary: Element | undefined
      let primary: string | undefined
      const secondaryClass = section === 'education' ? 'resume-college' :
        section.includes('experience') ? 'resume-company' : 'resume-entry-subtitle'
      if ((section === 'education' || section.includes('experience')) &&
          heading.children.length === 1 && heading.children[0].type === 'text') {
        const label = heading.children[0].value
        const divider = label.indexOf(' | ')
        if (divider !== -1) {
          primary = label.slice(0, divider)
          secondary = element('h4', secondaryClass, [text(label.slice(divider + 3))])
        }
      }
      let dateIndex = nextElement(nodes, index + 1)
      const next = dateIndex === -1 ? undefined : nodes[dateIndex]
      if (isElement(next) && next.tagName === 'h4') {
        secondary = next
        secondary.properties = { ...secondary.properties, className: [secondaryClass] }
        dateIndex = nextElement(nodes, dateIndex + 1)
      }
      if (dateIndex === -1 || !dateParagraph(nodes[dateIndex])) continue
      if (primary) heading.children = [text(primary)]
      const date = nodes[dateIndex] as Element
      let detail: Element | undefined
      const emphasized = date.children.find(isElement)
      if (section === 'projects' && emphasized?.children.length === 1 && emphasized.children[0].type === 'text') {
        const match = /^(.*?)\s+\|\s+((?:19|20)\d{2})$/.exec(emphasized.children[0].value.trim())
        if (match) {
          detail = element('p', 'resume-entry-detail', [text(match[1])])
          emphasized.children = [text(match[2])]
        }
      }
      date.properties = { ...date.properties, className: ['resume-entry-date'] }
      const info = element('div', 'resume-entry-info', [heading, ...(secondary ? [secondary] : [])])
      const entry = element('div', 'resume-entry', [info, date])
      nodes.splice(index, dateIndex - index + 1, entry, ...(detail ? [detail] : []))
    }
  }
}
