import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ResumePreview } from './App'
import { parseResume } from './resume'
import { previousEntryLayoutSampleMarkdown, sampleMarkdown } from './sample'

describe('resume preview', () => {
  it('renders readable resume text and clickable website and LinkedIn links', () => {
    const html = renderToStaticMarkup(<ResumePreview resume={parseResume(sampleMarkdown)} />)
    expect(html).toContain('<h1>Aarav Sharma</h1>')
    expect(html).toContain('Professional Experience')
    expect(html.indexOf('Professional Experience')).toBeLessThan(html.indexOf('Education'))
    expect(html.indexOf('Education')).toBeLessThan(html.indexOf('Core Skills'))
    expect(html).toContain('href="https://example.com/"')
    expect(html).toContain('href="https://www.linkedin.com/in/your-profile"')
    expect((html.match(/class="resume-contact-icon"/g) ?? [])).toHaveLength(5)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('--resume-name-size:29pt')
    expect(html).toContain('--resume-contact-size:8pt')
    expect(html).not.toContain('resume-contact-location')
    expect(html.indexOf('Bengaluru, India')).toBeGreaterThan(html.indexOf('linkedin.com/in/your-profile'))
    expect(html).not.toContain('resume-header-rule')
    expect(html.indexOf('aarav.sharma@example.com')).toBeLessThan(html.indexOf('Professional Summary'))
    expect(html).toContain('January 2022 - Present | Bengaluru')
    expect(html).toContain('class="resume-entry-date"')
    expect(html).toContain('class="resume-college"')
    expect(html).toContain('<h3>Software Engineer</h3><h4 class="resume-company">Northstar Technologies</h4>')
    expect(html).toContain('class="resume-cert-date"')
    expect(html).not.toContain('<table')
  })

  it('puts legacy education and project dates in entry rows without losing their text', () => {
    const html = renderToStaticMarkup(<ResumePreview resume={parseResume(previousEntryLayoutSampleMarkdown)} />)
    expect(html).toContain('<h3>Bachelor of Technology in Computer Science</h3>')
    expect(html).toContain('<h4 class="resume-college">Example Institute of Technology</h4>')
    expect(html).toContain('<h3>Associate Software Engineer</h3><h4 class="resume-company">Meridian Systems</h4>')
    expect(html).toContain('class="resume-entry-detail">TypeScript, React, Vite</p>')
    expect(html).toContain('2024')
  })

  it('does not embed remote images or HTML from imported Markdown', () => {
    const resume = { ...parseResume(sampleMarkdown), body: '![Project logo](https://example.com/logo.png)\n\n<script>alert(1)</script>' }
    const html = renderToStaticMarkup(<ResumePreview resume={resume} />)
    expect(html).toContain('Project logo')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
  })

  it('applies an independent name color and supports disabling section title bars', () => {
    const resume = parseResume(sampleMarkdown)
    const colored = renderToStaticMarkup(<ResumePreview resume={resume} nameColor="#285843" />)
    expect(colored).toContain('--resume-name-color:#285843')
    expect(colored).toContain('resume--title-bars')

    const plain = renderToStaticMarkup(<ResumePreview resume={resume} titleBars={false} />)
    expect(plain).not.toContain('resume--title-bars')
    expect(plain).toContain(`--resume-name-color:${resume.colors.primary}`)
  })
})
