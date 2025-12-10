import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getTemplateById } from '@/lib/models/Template';
import { marked } from 'marked';
import { JSDOM } from 'jsdom';
import htmlToDocx from 'html-to-docx';

export const runtime = 'nodejs';

const BASE_STYLES = `
  body {
    font-family: "Microsoft YaHei", "微软雅黑", "PingFang SC", "Helvetica Neue", Arial, sans-serif;
    font-size: 12pt;
    color: #1f2937;
    line-height: 1.65;
    margin: 0;
    padding: 0;
  }

  h1, h2, h3, h4, h5, h6 {
    font-weight: 600;
    color: #111827;
    margin: 14pt 0 8pt;
  }

  h1 { font-size: 22pt; border-bottom: 2px solid #e5e7eb; padding-bottom: 6pt; }
  h2 { font-size: 18pt; border-left: 4px solid #3b82f6; padding-left: 8pt; }
  h3 { font-size: 16pt; color: #2563eb; }
  h4 { font-size: 14pt; color: #1d4ed8; }

  p {
    margin: 8pt 0;
  }

  ul, ol {
    margin: 8pt 0 8pt 24pt;
    padding-left: 12pt;
  }

  ul ul, ol ol, ul ol, ol ul {
    margin: 4pt 0 4pt 18pt;
  }

  li {
    margin: 4pt 0;
  }

  blockquote {
    border-left: 4px solid #d1d5db;
    padding-left: 12pt;
    color: #6b7280;
    margin: 12pt 0;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12pt 0;
    font-size: 10.5pt;
  }

  table th,
  table td {
    border: 1px solid #d1d5db;
    padding: 6pt 8pt;
    text-align: left;
    vertical-align: top;
  }

  table th {
    background: #f3f4f6;
    font-weight: 600;
  }

  code {
    font-family: 'Consolas', 'Courier New', monospace;
    background: #f3f4f6;
    padding: 0 4pt;
    border-radius: 4px;
  }

  pre {
    font-family: 'Consolas', 'Courier New', monospace;
    background: #111827;
    color: #f3f4f6;
    padding: 12pt;
    border-radius: 6px;
    overflow: auto;
  }

  img {
    max-width: 100%;
    height: auto;
    margin: 8pt 0;
    border-radius: 4px;
  }
`;

// 将 rgb/rgba 颜色转为 hex（WPS 对十六进制更友好）
function toHexColor(input: string): string {
  const hex = input.trim();
  if (hex.startsWith('#')) return hex;
  const rgbMatch = hex.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\)/i);
  if (!rgbMatch) return hex;
  const r = Math.max(0, Math.min(255, parseInt(rgbMatch[1], 10)));
  const g = Math.max(0, Math.min(255, parseInt(rgbMatch[2], 10)));
  const b = Math.max(0, Math.min(255, parseInt(rgbMatch[3], 10)));
  const to2 = (n: number) => n.toString(16).padStart(2, '0');
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function processHtml(html: string) {
  const dom = new JSDOM(`<body>${html}</body>`);
  const { document } = dom.window;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

  document.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (src.startsWith('//')) {
      img.setAttribute('src', `https:${src}`);
    } else if (src.startsWith('/')) {
      img.setAttribute('src', `${baseUrl}${src}`);
    }

    const existingStyle = img.getAttribute('style') || '';
    img.setAttribute('style', `max-width:100%;height:auto;${existingStyle}`);
  });

  document.querySelectorAll('table').forEach((table) => {
    const existingTableStyle = table.getAttribute('style') || '';
    // 为了兼容 WPS，将关键表格布局样式内联写入（某些渲染器不会读取 <style> 中的表格样式）
    table.setAttribute('style', `width:100%;border-collapse:collapse;table-layout:fixed;${existingTableStyle}`);
  });

  document.querySelectorAll('th, td').forEach((cell) => {
    const existingStyle = cell.getAttribute('style') || '';
    let baseStyle = 'border:1px solid #d1d5db;padding:6pt 8pt;text-align:left;vertical-align:top;';

    // 解析已有背景色
    const bgMatch = existingStyle.match(/background(?:-color)?:\s*([^;]+)/i);
    const bgColor = bgMatch ? toHexColor(bgMatch[1]) : null;

    if (cell.tagName.toLowerCase() === 'th' && !bgColor) {
      // WPS 对 <style> 中的背景色支持不稳定，这里强制给表头写入内联底色
      baseStyle += 'background-color:#f3f4f6;';
    }

    if (cell.tagName.toLowerCase() === 'th') {
      baseStyle += 'font-weight:600;';
    }

    // 将已有样式拼在后面，确保用户自定义样式可以覆盖默认值
    cell.setAttribute('style', `${baseStyle}${existingStyle}`);

    // 额外：为了提升 WPS 呈现效果，把单元格背景色同步到内部段落/块级元素
    if (bgColor) {
      const innerBlocks = cell.querySelectorAll('p, div');
      innerBlocks.forEach((el) => {
        const s = el.getAttribute('style') || '';
        if (!/background(-color)?:/i.test(s)) {
          el.setAttribute('style', `background-color:${bgColor};${s}`);
        }
      });
    }
  });

  return document.body.innerHTML;
}

function buildHtmlFromMarkdown(markdown: string) {
  const rawHtml = marked.parse(markdown, {
    breaks: true,
    gfm: true,
  }) as string;

  return processHtml(rawHtml);
}

async function convertMarkdownToDocx(markdown: string, templateName: string, rawHtml?: string) {
  const safeMarkdown = markdown?.trim();
  const safeHtml = rawHtml?.trim();

  if (!safeMarkdown && !safeHtml) {
    const emptyHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <style>${BASE_STYLES}</style>
        </head>
        <body>
          <h1>${templateName || '未命名文档'}</h1>
          <p>（内容为空）</p>
        </body>
      </html>
    `;

    return htmlToDocx(emptyHtml, null, {
      table: { row: { cantSplit: true } },
      font: 'Microsoft YaHei',
      margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
    });
  }

  const contentHtml = safeHtml ? processHtml(safeHtml) : buildHtmlFromMarkdown(safeMarkdown!);

  const htmlDocument = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>${BASE_STYLES}</style>
      </head>
      <body>
        ${contentHtml}
      </body>
    </html>
  `;

  return htmlToDocx(htmlDocument, null, {
    table: { row: { cantSplit: true } },
    font: 'Microsoft YaHei',
    enableImageFetch: true,
    imageFetchTimeout: 15000,
    pageNumber: true,
    margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
  });
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const body = await request.json();
    const { templateId, content, html } = body;

    if (!templateId) {
      return NextResponse.json({ error: '模板ID不能为空' }, { status: 400 });
    }

    if (content === undefined || content === null) {
      return NextResponse.json({ error: '内容不能为空' }, { status: 400 });
    }

    const template = await getTemplateById(templateId, user.userId);
    if (!template) {
      return NextResponse.json({ error: '模板不存在或无权限' }, { status: 404 });
    }

    const docxBuffer = await convertMarkdownToDocx(content, template.name, html);

    return new NextResponse(Buffer.from(docxBuffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(template.name)}.docx"`,
      },
    });
  } catch (error: any) {
    console.error('DOCX 导出失败:', error);
    return NextResponse.json(
      { error: error.message || '导出失败，请稍后重试' },
      { status: 500 }
    );
  }
}
