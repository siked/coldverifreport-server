import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { getCurrentUser } from '@/lib/auth';
import { getTemplateById } from '@/lib/models/Template';
import { uploadImageToQiniu } from '@/lib/qiniu';

export const runtime = 'nodejs';

const createTurndown = () => {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    emDelimiter: '*',
    codeBlockStyle: 'fenced',
    fence: '```',
  });

  // 添加表格支持（覆盖默认规则）
  turndown.addRule('table', {
    filter: 'table',
    replacement: (content, node) => {
      const table = node as HTMLTableElement;
      const rows: string[] = [];
      
      // 处理表头
      const thead = table.querySelector('thead');
      let headerCells: string[] = [];
      
      if (thead) {
        const headerRow = thead.querySelector('tr');
        if (headerRow) {
          headerCells = Array.from(headerRow.querySelectorAll('th, td')).map(
            (cell) => (cell.textContent || '').trim().replace(/\|/g, '\\|')
          );
          if (headerCells.length > 0) {
            rows.push('| ' + headerCells.join(' | ') + ' |');
            rows.push('| ' + headerCells.map(() => '---').join(' | ') + ' |');
          }
        }
      }
      
      // 处理表体
      const tbody = table.querySelector('tbody') || table;
      const bodyRows = Array.from(tbody.querySelectorAll('tr'));
      
      // 如果没有表头，使用第一行作为表头
      if (headerCells.length === 0 && bodyRows.length > 0) {
        const firstRow = bodyRows[0];
        headerCells = Array.from(firstRow.querySelectorAll('td, th')).map(
          (cell) => (cell.textContent || '').trim().replace(/\|/g, '\\|')
        );
        if (headerCells.length > 0) {
          rows.push('| ' + headerCells.join(' | ') + ' |');
          rows.push('| ' + headerCells.map(() => '---').join(' | ') + ' |');
          bodyRows.shift(); // 移除第一行，因为已经作为表头
        }
      }
      
      bodyRows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll('td, th')).map(
          (cell) => (cell.textContent || '').trim().replace(/\|/g, '\\|')
        );
        if (cells.length > 0) {
          rows.push('| ' + cells.join(' | ') + ' |');
        }
      });
      
      return rows.length > 0 ? '\n' + rows.join('\n') + '\n' : '';
    },
  });

  // 保留强调格式（粗体、斜体）
  turndown.addRule('strong', {
    filter: ['strong', 'b'],
    replacement: (content) => `**${content}**`,
  });

  turndown.addRule('emphasis', {
    filter: ['em', 'i'],
    replacement: (content) => `*${content}*`,
  });

  // 保留代码格式
  turndown.addRule('code', {
    filter: 'code',
    replacement: (content, node) => {
      const parent = (node as HTMLElement).parentElement;
      return parent?.tagName === 'PRE' ? content : `\`${content}\``;
    },
  });

  // 保留删除线
  turndown.addRule('strikethrough', {
    filter: (node) => {
      return node.nodeName === 'DEL' || node.nodeName === 'S' || 
             (node.nodeName === 'STRIKE' || (node as HTMLElement).tagName?.toLowerCase() === 'strike');
    },
    replacement: (content) => `~~${content}~~`,
  });

  // 保留下划线（转换为强调）
  turndown.addRule('underline', {
    filter: 'u',
    replacement: (content) => `*${content}*`,
  });

  // 保留段落
  turndown.addRule('paragraph', {
    filter: 'p',
    replacement: (content) => {
      return content.trim() ? content + '\n\n' : '\n';
    },
  });

  // 保留换行
  turndown.addRule('lineBreak', {
    filter: 'br',
    replacement: () => '\n',
  });

  // 保留有序列表
  turndown.addRule('orderedList', {
    filter: 'ol',
    replacement: (content) => {
      return content.trim() ? content + '\n' : '';
    },
  });

  // 保留无序列表
  turndown.addRule('unorderedList', {
    filter: 'ul',
    replacement: (content) => {
      return content.trim() ? content + '\n' : '';
    },
  });

  // 保留列表项
  turndown.addRule('listItem', {
    filter: 'li',
    replacement: (content, node) => {
      const parent = node.parentElement;
      const isOrdered = parent?.tagName === 'OL';
      const prefix = isOrdered ? '1. ' : '- ';
      const lines = content.split('\n');
      const firstLine = lines[0] || '';
      const restLines = lines.slice(1);
      const indentedRest = restLines.map((line) => (line ? '  ' + line : ''));
      return prefix + firstLine + (indentedRest.length > 0 ? '\n' + indentedRest.join('\n') : '');
    },
  });

  // 保留引用
  turndown.addRule('blockquote', {
    filter: 'blockquote',
    replacement: (content) => {
      const lines = content.split('\n').filter((line) => line.trim());
      return lines.map((line) => '> ' + line).join('\n') + '\n\n';
    },
  });

  // 保留水平线
  turndown.addRule('horizontalRule', {
    filter: 'hr',
    replacement: () => '\n---\n\n',
  });

  return turndown;
};

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const templateId = formData.get('templateId')?.toString();

    if (!templateId) {
      return NextResponse.json({ error: '模板ID不能为空' }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '请上传有效的DOCX文件' }, { status: 400 });
    }

    const template = await getTemplateById(templateId, user.userId);
    if (!template) {
      return NextResponse.json({ error: '模板不存在或无权限' }, { status: 404 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log('[Word导入] 开始处理 Word 文档，文件大小:', (buffer.length / 1024).toFixed(2), 'KB');
    
    // 配置 mammoth 以保留更多格式并处理图片
    const convertOptions: any = {
      styleMap: [
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "p[style-name='Heading 5'] => h5:fresh",
        "p[style-name='Heading 6'] => h6:fresh",
        "r[style-name='Strong'] => strong",
        "p[style-name='Quote'] => blockquote:fresh",
        "p[style-name='Intense Quote'] => blockquote:fresh",
      ],
      convertImage: mammoth.images.imgElement(async (image) => {
        console.log('[Word导入] convertImage 被调用，contentType:', image.contentType);
        try {
          // 读取图片数据
          const imageBuffer = await image.read();
          const buffer = Buffer.isBuffer(imageBuffer) 
            ? imageBuffer 
            : Buffer.from(imageBuffer);

          const fileSizeKB = (buffer.length / 1024).toFixed(2);
          const contentType = image.contentType || 'image/png';
          console.log(`[Word导入] 图片读取成功: ${contentType}, ${fileSizeKB} KB`);

          // 验证图片大小（限制为 10MB）
          const maxSize = 10 * 1024 * 1024;
          if (buffer.length > maxSize) {
            console.warn(`[Word导入] 图片过大，使用 base64: ${fileSizeKB} KB`);
            const base64 = buffer.toString('base64');
            return {
              src: `data:${contentType};base64,${base64}`,
            };
          }

          // 上传到七牛云（日志在 uploadImageToQiniu 中打印）
          console.log(`[Word导入] 开始上传图片到七牛云: ${contentType}, ${fileSizeKB} KB`);
          const imageUrl = await uploadImageToQiniu(
            buffer,
            user.userId,
            image.contentType
          );
          console.log(`[Word导入] 图片上传完成: ${imageUrl}`);

          return {
            src: imageUrl,
          };
        } catch (error: any) {
          console.error(`[Word导入] 图片处理失败: ${error.message}`);
          if (error.stack) {
            console.error(`[Word导入] 错误堆栈:`, error.stack);
          }
          
          // 如果上传失败，使用 base64 作为后备方案
          try {
            console.log(`[Word导入] 尝试使用 base64 作为后备方案...`);
            const imageBuffer = await image.read();
            const buffer = Buffer.isBuffer(imageBuffer) 
              ? imageBuffer 
              : Buffer.from(imageBuffer);
            const base64 = buffer.toString('base64');
            const contentType = image.contentType || 'image/png';
            console.log(`[Word导入] Base64 后备方案成功`);
            return {
              src: `data:${contentType};base64,${base64}`,
            };
          } catch (fallbackError: any) {
            console.error(`[Word导入] Base64 后备方案失败: ${fallbackError?.message}`);
            return {
              src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            };
          }
        }
      }),
    };
    
    console.log('[Word导入] 开始调用 mammoth.convertToHtml...');
    const { value: html, messages } = await mammoth.convertToHtml({ buffer, ...convertOptions });
    console.log('[Word导入] mammoth 转换完成，HTML 长度:', html?.length);
    
    if (messages && messages.length > 0) {
      const warnings = messages.filter(m => m.type === 'warning');
      if (warnings.length > 0) {
        console.log('[Word导入] mammoth 警告数量:', warnings.length);
      }
    }

    // 检查 HTML 中的图片
    const htmlImgMatches = html?.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
    if (htmlImgMatches) {
      console.log(`[Word导入] HTML 中发现 ${htmlImgMatches.length} 个图片标签`);
      const base64Imgs = htmlImgMatches.filter(img => img.includes('data:image'));
      console.log(`[Word导入] HTML 中 Base64 图片: ${base64Imgs.length} 个`);
    }

    // 如果 HTML 中有 base64 图片，需要提取并上传
    let processedHtml = html || '';
    if (html && html.includes('data:image')) {
      console.log('[Word导入] 检测到 Base64 图片，开始提取并上传...');
      
      // 提取所有 base64 图片
      const base64Regex = /<img[^>]+src=["'](data:image\/[^;]+;base64,[^"']+)["'][^>]*>/gi;
      const base64Matches = [...html.matchAll(base64Regex)];
      
      console.log(`[Word导入] 找到 ${base64Matches.length} 个 Base64 图片，开始上传...`);
      
      for (let i = 0; i < base64Matches.length; i++) {
        const match = base64Matches[i];
        const base64Data = match[1];
        
        try {
          // 解析 base64 数据
          const [header, base64Content] = base64Data.split(',');
          const contentTypeMatch = header.match(/data:image\/([^;]+)/);
          const contentType = contentTypeMatch ? `image/${contentTypeMatch[1]}` : 'image/png';
          
          const imageBuffer = Buffer.from(base64Content, 'base64');
          const fileSizeKB = (imageBuffer.length / 1024).toFixed(2);
          
          console.log(`[Word导入] 上传图片 ${i + 1}/${base64Matches.length}: ${contentType}, ${fileSizeKB} KB`);
          
          // 上传到七牛云
          const imageUrl = await uploadImageToQiniu(
            imageBuffer,
            user.userId,
            contentType
          );
          
          // 替换 HTML 中的 base64 为七牛云 URL
          processedHtml = processedHtml.replace(match[0], match[0].replace(base64Data, imageUrl));
          console.log(`[Word导入] 图片 ${i + 1} 上传成功: ${imageUrl}`);
        } catch (error: any) {
          console.error(`[Word导入] 图片 ${i + 1} 上传失败: ${error.message}`);
          // 保持原 base64，不替换
        }
      }
    }

    const turndown = createTurndown();
    let markdown = turndown.turndown(processedHtml);
    
    // 统计图片数量
    const imgMatches = markdown.match(/!\[.*?\]\(.*?\)/g);
    if (imgMatches) {
      console.log(`[Word导入] 完成，共处理 ${imgMatches.length} 张图片`);
      // 检查图片 URL 类型
      const qiniuUrls = imgMatches.filter(img => img.includes('oss.yunlot.com'));
      const base64Urls = imgMatches.filter(img => img.includes('data:image'));
      console.log(`[Word导入] 七牛云图片: ${qiniuUrls.length} 张，Base64 图片: ${base64Urls.length} 张`);
    }
    
    // 清理多余的空白行
    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    return NextResponse.json({ markdown });
  } catch (error: any) {
    console.error('DOCX 导入失败:', error);
    return NextResponse.json(
      { error: error.message || '导入失败，请稍后重试' },
      { status: 500 }
    );
  }
}


