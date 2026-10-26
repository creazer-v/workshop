export const sampleMarkdown = `---
name: "A Sharma"
title: "Software Engineer"
location: "Bengaluru, India"
phone: "+91xxxxxxxxxx"
email: "a.sharma@example.com"
website: "https://example.com"
linkedin: "https://www.linkedin.com/in/your-profile"
fontSize:
  name: 29
  body: 10
  contact: 8
---

## Professional Summary

Software engineer with 5+ years of experience building reliable web applications and improving developer workflows. Strong background in TypeScript, React, and cloud platforms, with a focus on maintainable systems and measurable outcomes.

## Professional Experience

### Software Engineer
#### Northstar Technologies
*January 2022 – Present · Bengaluru, India*

- Built reusable React components that reduced development time for new product features by 30%.
- Improved API response times by 25% through query optimisation and targeted caching.
- Partnered with product and design teams to deliver accessible, customer-facing workflows.

### Associate Software Engineer
#### Meridian Systems
*July 2020 – December 2021 · Pune, India*

- Developed and maintained internal tools using TypeScript, Node.js, and PostgreSQL.
- Added automated tests to critical services and improved release reliability.

## Education

### Bachelor of Technology in Computer Science
#### Example Institute of Technology
*2016 – 2020 · Pune, India*

## Projects

### Resume Workshop
*2024*

**Technologies:** TypeScript, React, Vite

- Built a browser-based Markdown-to-resume tool with live A4 preview and PDF export.
- Designed for ATS compatibility with 100% text retention across multiple extraction modes.

## Certifications

- AWS Certified Developer – Associate · Amazon Web Services · 2023
- Professional Scrum Master I (PSM I) · Scrum.org · 2022

## Core Skills

**Languages:** TypeScript, JavaScript, Python, SQL

**Frameworks & Tools:** React, Node.js, PostgreSQL, Docker, Git

**Practices:** API design, automated testing, CI/CD, Agile delivery
`

// Legacy aliases kept so stored drafts don't get rejected
export const monochromeSampleMarkdown = sampleMarkdown
export const previousSampleMarkdown = sampleMarkdown
export const legacySampleMarkdown = sampleMarkdown
export const previousPositionLayoutSampleMarkdown = sampleMarkdown
  .replace('### Software Engineer\n#### Northstar Technologies', '### Software Engineer | Northstar Technologies')
  .replace('### Associate Software Engineer\n#### Meridian Systems', '### Associate Software Engineer | Meridian Systems')
export const previousEntryLayoutSampleMarkdown = previousPositionLayoutSampleMarkdown
  .replace('### Bachelor of Technology in Computer Science\n#### Example Institute of Technology',
    '### Bachelor of Technology in Computer Science | Example Institute of Technology')
  .replace('### Resume Workshop\n*2024*\n\n**Technologies:** TypeScript, React, Vite',
    '### Resume Workshop\n*TypeScript, React, Vite · 2024*')
export const previousNameSizeSampleMarkdown = previousEntryLayoutSampleMarkdown.replace('  name: 29\n', '  name: 27\n')
