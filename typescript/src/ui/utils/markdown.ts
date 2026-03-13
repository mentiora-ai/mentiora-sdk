/**
 * Markdown — Safe, minimal markdown-to-HTML renderer.
 *
 * Restricted allowlist: p, a, ul, ol, li, em, strong, code, pre, br, h1-h3, blockquote.
 * No raw HTML passthrough. Safe href validation (http, https, mailto only).
 */

const SAFE_HREF_RE = /^(https?:\/\/|mailto:)/i;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(text: string): string {
  let result = escapeHtml(text);

  // Code spans (backticks) — process first to protect content inside
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
  result = result.replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>');

  // Links: [text](url)
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match: string, linkText: string, url: string) => {
      if (!SAFE_HREF_RE.test(url)) return linkText;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
    },
  );

  // Line breaks
  result = result.replace(/  \n/g, '<br>');

  return result;
}

/**
 * Parse markdown string into safe HTML.
 *
 * Only supports the restricted allowlist — no images, tables, or raw HTML.
 */
export function renderMarkdown(markdown: string): string {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let inList: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (inList) {
      output.push(`</${inList}>`);
      inList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks (fenced)
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        output.push(`<pre><code>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        closeList();
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      closeList();
      continue;
    }

    // Headers
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      closeList();
      const level = headerMatch[1].length;
      output.push(`<h${level}>${renderInline(headerMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquotes
    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      closeList();
      output.push(`<blockquote>${renderInline(quoteMatch[1])}</blockquote>`);
      continue;
    }

    // Unordered list items
    const ulMatch = line.match(/^[-*+]\s+(.+)$/);
    if (ulMatch) {
      if (inList !== 'ul') {
        closeList();
        inList = 'ul';
        output.push('<ul>');
      }
      output.push(`<li>${renderInline(ulMatch[1])}</li>`);
      continue;
    }

    // Ordered list items
    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inList !== 'ol') {
        closeList();
        inList = 'ol';
        output.push('<ol>');
      }
      output.push(`<li>${renderInline(olMatch[1])}</li>`);
      continue;
    }

    // Regular paragraph
    closeList();
    output.push(`<p>${renderInline(line)}</p>`);
  }

  // Close any open blocks
  closeList();
  if (inCodeBlock) {
    output.push(`<pre><code>${escapeHtml(codeBlockContent.join('\n'))}</code></pre>`);
  }

  return output.join('\n');
}
