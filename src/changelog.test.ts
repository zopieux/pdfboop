import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, parseChangelog } from './changelog';

describe('Changelog Markdown Parser', () => {
  it('correctly parses headers as versions', () => {
    const markdown = `
# v1 - 2026-05-16
Initial release
- **bold** and *italic*
`;
    const parsed = parseChangelog(markdown);
    expect(parsed.versions.length).toBe(1);
    expect(parsed.versions[0].version).toBe(1);
    expect(parsed.versions[0].title).toBe('v1');
    expect(parsed.versions[0].date).toBe('2026-05-16');
    expect(parsed.versions[0].html).toContain('Initial release');
    expect(parsed.versions[0].html).toContain('<strong>bold</strong>');
    expect(parsed.versions[0].html).toContain('<em>italic</em>');
  });

  it('correctly handles headers without dates gracefully', () => {
    const markdown = `
# v1
Initial release without date
`;
    const parsed = parseChangelog(markdown);
    expect(parsed.versions.length).toBe(1);
    expect(parsed.versions[0].version).toBe(1);
    expect(parsed.versions[0].title).toBe('v1');
    expect(parsed.versions[0].date).toBeUndefined();
  });

  it('correctly parses multiple versions and sorts them descending', () => {
    const markdown = `
# v1
Initial release
 
# v2
Second release
`;
    const parsed = parseChangelog(markdown);
    expect(parsed.versions.length).toBe(2);
    expect(parsed.versions[0].version).toBe(2);
    expect(parsed.versions[0].title).toBe('v2');
    expect(parsed.versions[1].version).toBe(1);
    expect(parsed.versions[1].title).toBe('v1');
  });

  it('correctly converts links to target="_blank" links', () => {
    const markdown = `
# v1
Check [Google](https://google.com) out!
`;
    const parsed = parseChangelog(markdown);
    expect(parsed.versions[0].html).toContain(
      '<a href="https://google.com" target="_blank" rel="noopener noreferrer">Google</a>',
    );
  });

  it('correctly groups list items under a single <ul> element', () => {
    const markdown = `
# v1
- Item 1
- Item 2
`;
    const parsed = parseChangelog(markdown);
    const html = parsed.versions[0].html;
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>Item 1</li>');
    expect(html).toContain('<li>Item 2</li>');
    expect(html).toContain('</ul>');
    // It should contain exactly one <ul> and one </ul>
    expect(html.split('<ul>').length - 1).toBe(1);
    expect(html.split('</ul>').length - 1).toBe(1);
  });

  it('correctly parses pre-header intro text verbatim as HTML', () => {
    const markdown = `
About: [GitHub repository](https://github.com/zopieux/pdfboop)

# v1 - 2026-05-01
Initial release
`;
    const parsed = parseChangelog(markdown);
    expect(parsed.headerHtml).toContain(
      '<p>About: <a href="https://github.com/zopieux/pdfboop" target="_blank" rel="noopener noreferrer">GitHub repository</a></p>',
    );
    expect(parsed.versions.length).toBe(1);
  });

  it('correctly calculates CURRENT_VERSION from root CHANGELOG.md', () => {
    expect(CURRENT_VERSION).toBeGreaterThanOrEqual(1);
  });
});
