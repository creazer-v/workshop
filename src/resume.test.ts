import { describe, expect, it } from 'vitest'
import { parseResume } from './resume'
import { legacySampleMarkdown, monochromeSampleMarkdown, previousEntryLayoutSampleMarkdown, previousNameSizeSampleMarkdown, previousPositionLayoutSampleMarkdown, previousSampleMarkdown, sampleMarkdown } from './sample'

describe('parseResume', () => {
  it('reads the fixed resume metadata and keeps the Markdown body', () => {
    const resume = parseResume(sampleMarkdown)
    expect(resume.name).toBe('Something')
    expect(resume.website).toBe('https://example.com/')
    expect(resume.linkedin).toContain('linkedin.com')
    // colors are now optional in front matter; sample has no colors block so falls back to defaults
    expect(resume.colors.primary).toBe('#1a1a1a')
    expect(resume.fontSize).toEqual({ name: 29, body: 10, contact: 8 })
    expect(resume.body).toContain('## Professional Experience')
    expect(resume.body).toContain('## Projects')
    expect(resume.body).toContain('## Certifications')
    expect(resume.body).toContain('#### Example Institute of Technology')
    expect(resume.body).toContain('### Software Engineer\n#### Northstar Technologies')
    expect(parseResume(previousPositionLayoutSampleMarkdown).body).toContain(
      '### Software Engineer | Northstar Technologies'
    )
    expect(parseResume(previousEntryLayoutSampleMarkdown).body).toContain(
      'Bachelor of Technology in Computer Science | Example Institute of Technology'
    )
  })

  it('keeps future sections when they are added', () => {
    const resume = parseResume(`${sampleMarkdown}\n## Awards\n\n- Best Engineer 2024\n`)
    expect(resume.body).toContain('## Awards')
  })

  it('puts skills after experience and education in the default resume', () => {
    const body = parseResume(sampleMarkdown).body
    expect(body.indexOf('## Professional Experience')).toBeLessThan(body.indexOf('## Education'))
    expect(body.indexOf('## Education')).toBeLessThan(body.indexOf('## Core Skills'))
    expect(parseResume(monochromeSampleMarkdown).fontSize.contact).toBe(8)
    expect(parseResume(previousNameSizeSampleMarkdown).fontSize.name).toBe(27)
  })

  it('rejects unreadable front matter and duplicate keys', () => {
    expect(() => parseResume('## Summary')).toThrow(/front matter/i)
    expect(() => parseResume(sampleMarkdown.replace('name: "Something"', 'name: "Something"\nname: "Other"'))).toThrow(/Front matter:/)
  })

  it('rejects unsafe or invalid color and URL settings', () => {
    // colors block is validated when present
    const withBadColor = sampleMarkdown.replace(
      'linkedin: "https://www.linkedin.com/in/your-profile"',
      'linkedin: "https://www.linkedin.com/in/your-profile"\ncolors:\n  primary: "#ffffff"\n  accent: "#444444"'
    )
    expect(() => parseResume(withBadColor)).toThrow(/contrast/)
    const withBadFormat = sampleMarkdown.replace(
      'linkedin: "https://www.linkedin.com/in/your-profile"',
      'linkedin: "https://www.linkedin.com/in/your-profile"\ncolors:\n  primary: "red"\n  accent: "#444444"'
    )
    expect(() => parseResume(withBadFormat)).toThrow(/hex color/)
    expect(() => parseResume(sampleMarkdown.replace('https://example.com', 'javascript:alert(1)'))).toThrow(/website/)
  })

  it('rejects unreadable font sizes', () => {
    expect(() => parseResume(sampleMarkdown.replace('contact: 8', 'contact: 5'))).toThrow(/fontSize.contact/)
    expect(() => parseResume(sampleMarkdown.replace('body: 10', 'body: "large"'))).toThrow(/fontSize.body/)
  })

  it.each([
    ['images', '![Certificate scan](https://example.com/scan.png)', /image/i],
    ['raw HTML', '<div>Important experience</div>', /HTML/i],
    ['tables', '| Role | Company |\n| --- | --- |\n| Engineer | Example |', /table/i],
    ['task checkboxes', '- [x] Delivered feature', /task list/i],
  ])('rejects ATS-unsafe %s instead of silently omitting content', (_format, content, message) => {
    expect(() => parseResume(`${sampleMarkdown}\n${content}`)).toThrow(message)
  })

  it('keeps ordinary Markdown links and optional sections', () => {
    const resume = parseResume(`${sampleMarkdown}\n## Certifications\n\n[Certification](https://example.com/certificate)\n`)
    expect(resume.body).toContain('Certification')
  })

  it('accepts Windows line endings and a byte order mark', () => {
    expect(parseResume(`\uFEFF${sampleMarkdown.replace(/\n/g, '\r\n')}`).name).toBe('Something')
  })
})
