import { styled } from '@macaron-css/solid';
import CHANGELOG_CONTENT_RAW from '../CHANGELOG.md?raw';
import { vars } from './theme';

export { default as CHANGELOG_CONTENT } from '../CHANGELOG.md?raw';

export interface ChangelogVersion {
  version: number;
  title: string;
  date?: string;
  html: string;
}

export interface ParsedChangelog {
  headerHtml?: string;
  versions: ChangelogVersion[];
}

/** Parses the mini markdown string into structured HTML content per version. */
export function parseChangelog(markdown: string): ParsedChangelog {
  const versions: ChangelogVersion[] = [];
  const lines = markdown.split('\n');
  const introLines: string[] = [];
  let currentSection: { version: number; title: string; date?: string; lines: string[] } | null =
    null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      const title = trimmed.replace(/^#+\s*/, '');
      const versionMatch = title.match(/v?(\d+)/i);
      const version = versionMatch ? parseInt(versionMatch[1], 10) : 0;

      const dateMatch = title.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      const date = dateMatch ? dateMatch[1] : undefined;
      const cleanTitle = title.replace(/\s*-\s*\d{4}-\d{2}-\d{2}\s*$/, '').trim();

      if (currentSection) {
        versions.push(renderSection(currentSection));
      }
      currentSection = {
        version,
        title: cleanTitle,
        date,
        lines: [],
      };
    } else {
      if (currentSection) {
        currentSection.lines.push(line);
      } else {
        introLines.push(line);
      }
    }
  }

  if (currentSection) {
    versions.push(renderSection(currentSection));
  }

  // Sort versions descending (newest first)
  versions.sort((a, b) => b.version - a.version);

  const headerHtml = introLines.some((l) => l.trim()) ? renderLinesToHtml(introLines) : undefined;

  return {
    headerHtml,
    versions,
  };
}

function renderSection(section: {
  version: number;
  title: string;
  date?: string;
  lines: string[];
}): ChangelogVersion {
  return {
    version: section.version,
    title: section.title,
    date: section.date,
    html: renderLinesToHtml(section.lines),
  };
}

function renderLinesToHtml(lines: string[]): string {
  const htmlLines: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      continue;
    }

    // Process lists
    const listMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      if (!inList) {
        htmlLines.push('<ul>');
        inList = true;
      }
      const itemContent = processInline(listMatch[1]);
      htmlLines.push(`<li>${itemContent}</li>`);
    } else {
      if (inList) {
        htmlLines.push('</ul>');
        inList = false;
      }
      const paragraphContent = processInline(trimmed);
      htmlLines.push(`<p>${paragraphContent}</p>`);
    }
  }

  if (inList) {
    htmlLines.push('</ul>');
  }

  return htmlLines.join('\n');
}

function processInline(text: string): string {
  let escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Bold: **text**
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Italics: *text*
  escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Links: [text](url)
  escaped = escaped.replace(
    /\[(.*?)\]\((.*?)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );

  return escaped;
}

// Compute CURRENT_VERSION dynamically as the maximum parsed version from titles
const parsed = parseChangelog(CHANGELOG_CONTENT_RAW);
export const CURRENT_VERSION =
  parsed.versions.length > 0 ? Math.max(...parsed.versions.map((v) => v.version)) : 1;

// Styled container for rendered changelog HTML to enforce clean typography
export const ChangelogHtmlContainer = styled('div', {
  base: {
    color: vars.colors.text,
    fontSize: '14px',
    lineHeight: '1.6',

    '& p': {
      margin: '0 0 12px',
    },

    '& ul': {
      margin: '0 0 16px',
      paddingLeft: '20px',
      listStyleType: 'disc',
    },

    '& li': {
      margin: '0 0 6px',
    },

    '& a': {
      color: vars.colors.primary,
      textDecoration: 'none',
      fontWeight: 500,
      selectors: {
        '&:hover': {
          textDecoration: 'underline',
        },
      },
    },

    '& strong': {
      fontWeight: 600,
    },
  },
});
