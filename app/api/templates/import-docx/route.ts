import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { getCurrentUser } from '@/lib/auth';
import { getTemplateById } from '@/lib/models/Template';
import { uploadImageToQiniu } from '@/lib/qiniu';

export const runtime = 'nodejs';

// 注意：此函数已不再使用，改为在调用时直接创建简化的 TurndownService
// 保留此函数仅用于向后兼容，但实际不会调用
const createTurndown = () => {
  // 使用最简单的配置，避免任何可能导致递归的自定义规则
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    emDelimiter: '*',
    codeBlockStyle: 'fenced',
    fence: '```',
  });

  // 表格规则：直接返回 HTML，完全避免递归
  turndown.addRule('table', {
    filter: 'table',
    replacement: (content, node) => {
      const table = node as HTMLTableElement;
      // 直接返回 HTML 格式，不进行任何处理，避免递归
      return '\n' + table.outerHTML + '\n';
    },
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
    const htmlLength = html?.length || 0;
    console.log('[Word导入] mammoth 转换完成，HTML 长度:', htmlLength);
    
    if (messages && messages.length > 0) {
      const warnings = messages.filter(m => m.type === 'warning');
      if (warnings.length > 0) {
        console.log('[Word导入] mammoth 警告数量:', warnings.length);
      }
    }

    // 必须处理所有图片，确保都上传到七牛云
    // 使用安全的方法查找图片标签（避免对大字符串使用正则导致堆栈溢出）
    let processedHtml = html || '';
    
    // 使用更安全的方法查找图片标签（分批处理，避免一次性处理整个大字符串）
    const findImageTags = (htmlStr: string): Array<{ full: string; src: string; index: number }> => {
      const results: Array<{ full: string; src: string; index: number }> = [];
      let searchIndex = 0;
      const imgTagStart = '<img';
      
      while (true) {
        const imgStart = htmlStr.indexOf(imgTagStart, searchIndex);
        if (imgStart === -1) break;
        
        // 找到 img 标签的结束位置（> 或 />
        let imgEnd = htmlStr.indexOf('>', imgStart);
        if (imgEnd === -1) break;
        imgEnd += 1;
        
        const imgTag = htmlStr.substring(imgStart, imgEnd);
        
        // 提取 src 属性（使用简单的字符串查找，避免正则）
        const srcMatch = imgTag.match(/src\s*=\s*["']([^"']+)["']/i);
        if (srcMatch && srcMatch[1]) {
          results.push({
            full: imgTag,
            src: srcMatch[1],
            index: imgStart,
          });
        }
        
        searchIndex = imgEnd;
      }
      
      return results;
    };
    
    const imageTags = findImageTags(html);
    const base64Images = imageTags.filter(tag => tag.src.startsWith('data:image'));
    const urlImages = imageTags.filter(tag => !tag.src.startsWith('data:image'));
    
    console.log(`[Word导入] HTML 中发现 ${imageTags.length} 个图片标签`);
    console.log(`[Word导入] - Base64 图片: ${base64Images.length} 个`);
    console.log(`[Word导入] - URL 图片: ${urlImages.length} 个`);
    
    // 处理所有 Base64 图片，必须上传到七牛云
    if (base64Images.length > 0) {
      console.log('[Word导入] 开始上传 Base64 图片到七牛云...');
      
      // 从后往前替换，避免索引偏移
      for (let i = base64Images.length - 1; i >= 0; i--) {
        const tag = base64Images[i];
        const base64Data = tag.src;
        
        try {
          // 解析 base64 数据
          const [header, base64Content] = base64Data.split(',');
          const contentTypeMatch = header.match(/data:image\/([^;]+)/);
          const contentType = contentTypeMatch ? `image/${contentTypeMatch[1]}` : 'image/png';
          
          const imageBuffer = Buffer.from(base64Content, 'base64');
          const fileSizeKB = (imageBuffer.length / 1024).toFixed(2);
          
          console.log(`[Word导入] 上传图片 ${base64Images.length - i}/${base64Images.length}: ${contentType}, ${fileSizeKB} KB`);
          
          // 上传到七牛云
          const imageUrl = await uploadImageToQiniu(
            imageBuffer,
            user.userId,
            contentType
          );
          
          // 替换 HTML 中的 base64 为七牛云 URL
          const newTag = tag.full.replace(base64Data, imageUrl);
          processedHtml = processedHtml.substring(0, tag.index) + 
                        newTag + 
                        processedHtml.substring(tag.index + tag.full.length);
          
          console.log(`[Word导入] 图片 ${base64Images.length - i} 上传成功: ${imageUrl}`);
        } catch (error: any) {
          console.error(`[Word导入] 图片 ${base64Images.length - i} 上传失败: ${error.message}`);
          // 如果上传失败，保留原 base64，但记录错误
          // 可以考虑使用占位符或错误图片
        }
      }
    }
    
    // 检查 URL 图片，确保都是七牛云 URL
    // 如果图片 URL 不是七牛云的，可能需要重新上传（这里先记录日志）
    const nonQiniuImages = urlImages.filter(tag => !tag.src.includes('oss.yunlot.com'));
    if (nonQiniuImages.length > 0) {
      console.log(`[Word导入] 发现 ${nonQiniuImages.length} 个非七牛云图片 URL，这些图片可能已经在 mammoth.convertImage 中处理`);
      // 如果图片已经是外部 URL（非七牛云），可以选择：
      // 1. 保持原 URL（如果已经是有效的图片链接）
      // 2. 下载并重新上传到七牛云（如果需要统一管理）
      // 这里先保持原 URL，因为 mammoth 的 convertImage 可能已经上传了
    }
    
    console.log(`[Word导入] 图片处理完成，共处理 ${imageTags.length} 个图片标签`);

    // 在调用 TurndownService 之前，先预处理 HTML，移除可能导致递归的结构
    console.log('[Word导入] 开始预处理 HTML，移除可能导致递归的结构...');
    let safeHtml = processedHtml;
    const htmlSize = safeHtml.length;
    
    // 如果 HTML 过大，先进行简化处理
    if (htmlSize > 50 * 1024 * 1024) { // 50MB
      console.warn(`[Word导入] HTML 过大 (${(htmlSize / 1024 / 1024).toFixed(2)}MB)，进行大幅简化...`);
      // 移除所有表格和复杂结构，只保留基本文本
      safeHtml = safeHtml
        .replace(/<table[\s\S]*?<\/table>/gi, '\n[表格]\n')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '');
    } else if (htmlSize > 10 * 1024 * 1024) { // 10MB
      console.warn(`[Word导入] HTML 较大 (${(htmlSize / 1024 / 1024).toFixed(2)}MB)，简化嵌套表格...`);
      // 只移除嵌套表格
      const removeNestedTables = (html: string, maxIterations: number = 10): string => {
        let result = html;
        let iterations = 0;
        
        // 使用迭代方式移除嵌套表格，避免递归
        while (iterations < maxIterations) {
          const before = result;
          // 使用更简单的正则，避免回溯
          result = result.replace(/<table[^>]*>([\s\S]{0,10000}?)<\/table>/gi, (match, content) => {
            // 如果内容中包含表格标签，说明是嵌套表格，移除它
            if (/<table/i.test(content)) {
              // 提取纯文本
              const textContent = content
                .replace(/<table[\s\S]*?<\/table>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              return textContent ? `\n[表格: ${textContent.substring(0, 100)}]\n` : '\n[表格]\n';
            }
            return match;
          });
          
          if (before === result) break;
          iterations++;
        }
        
        return result;
      };
      
      safeHtml = removeNestedTables(safeHtml);
    }
    
    // 2. 限制 HTML 大小，防止处理过大的内容
    if (safeHtml.length > 5 * 1024 * 1024) { // 5MB
      console.warn('[Word导入] HTML 内容过大，进行简化处理...');
      // 移除所有样式和脚本
      safeHtml = safeHtml
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/style\s*=\s*["'][^"']*["']/gi, '');
    }
    
    console.log('[Word导入] HTML 预处理完成，开始转换为 Markdown...');
    
    let markdown: string;
    
    // 使用 Promise 包装，设置超时来检测可能的堆栈溢出
    const convertWithTimeout = async (html: string, timeout: number = 30000): Promise<string> => {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error('转换超时，可能发生了堆栈溢出'));
        }, timeout);
        
        try {
          // 使用最简单的 TurndownService 配置
          const turndown = new TurndownService({
            headingStyle: 'atx',
            bulletListMarker: '-',
            emDelimiter: '*',
            codeBlockStyle: 'fenced',
            fence: '```',
          });
          
          // 图片规则：确保图片 URL 正确转换为 Markdown 格式
          turndown.addRule('image', {
            filter: 'img',
            replacement: (content, node) => {
              const img = node as HTMLImageElement;
              const alt = img.alt || '';
              const src = img.src || img.getAttribute('src') || '';
              const title = img.title || img.getAttribute('title') || '';
              
              // 确保图片 URL 被正确保留
              if (src) {
                return title 
                  ? `![${alt}](${src} "${title}")` 
                  : `![${alt}](${src})`;
              }
              return '';
            },
          });
          
          // 表格规则：正确处理表格内容，包括嵌套表格
          turndown.addRule('table', {
            filter: 'table',
            replacement: (content, node) => {
              try {
                const table = node as any; // 使用 any 类型，因为可能是 jsdom 节点
                
                // 检查是否有嵌套表格（通过检查 content 中是否包含 table 标签）
                const contentStr = String(content || '');
                const hasNestedTable = /<table[\s\S]*?<\/table>/i.test(contentStr);
                
                if (hasNestedTable) {
                  // 如果有嵌套表格，保留为 HTML 格式
                  // 但先处理嵌套表格，将其内容提取为文本
                  let tableHtml = '';
                  try {
                    // 尝试获取 outerHTML，如果不可用则使用 innerHTML
                    tableHtml = table.outerHTML || table.innerHTML || '';
                  } catch {
                    // 如果无法获取 HTML，使用字符串处理
                    tableHtml = contentStr;
                  }
                  
                  // 递归处理嵌套表格：将嵌套表格替换为占位符
                  let processedHtml = tableHtml;
                  let iterations = 0;
                  while (iterations < 10) { // 限制递归深度
                    const before = processedHtml;
                    // 找到最内层的表格（不包含其他表格的表格）
                    processedHtml = processedHtml.replace(/<table[^>]*>((?:(?!<table)[\s\S])*?)<\/table>/gi, (match, innerContent) => {
                      // 提取表格中的文本内容
                      const textContent = innerContent
                        .replace(/<[^>]+>/g, ' ') // 移除所有标签
                        .replace(/\s+/g, ' ') // 合并空格
                        .trim();
                      return textContent ? `[表格: ${textContent.substring(0, 50)}]` : '[表格]';
                    });
                    
                    if (before === processedHtml) break;
                    iterations++;
                  }
                  
                  // 如果还有嵌套表格，直接返回 HTML
                  if (processedHtml.includes('<table')) {
                    return '\n' + processedHtml + '\n';
                  }
                  
                  // 否则，外层表格已经被处理，返回处理后的内容
                  return '\n' + processedHtml + '\n';
                }
                
                // 没有嵌套表格，转换为 Markdown 表格格式
                const rows: string[] = [];
                
                // 提取表格行的辅助函数
                const extractCellText = (cell: any): string => {
                  try {
                    const text = cell.textContent || cell.innerText || '';
                    return text.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ');
                  } catch {
                    return '';
                  }
                };
                
                // 处理表头
                let thead: any = null;
                try {
                  thead = table.querySelector('thead');
                } catch {}
                
                let headerCells: string[] = [];
                
                if (thead) {
                  try {
                    const headerRow = thead.querySelector('tr');
                    if (headerRow) {
                      const cells = headerRow.querySelectorAll('th, td');
                      headerCells = Array.from(cells).map(extractCellText);
                      if (headerCells.length > 0) {
                        rows.push('| ' + headerCells.join(' | ') + ' |');
                        rows.push('| ' + headerCells.map(() => '---').join(' | ') + ' |');
                      }
                    }
                  } catch {}
                }
                
                // 处理表体
                let tbody: any = null;
                let bodyRows: any[] = [];
                try {
                  tbody = table.querySelector('tbody') || table;
                  bodyRows = Array.from(tbody.querySelectorAll('tr'));
                } catch {}
                
                // 如果没有表头，使用第一行作为表头
                if (headerCells.length === 0 && bodyRows.length > 0) {
                  try {
                    const firstRow = bodyRows[0];
                    const cells = firstRow.querySelectorAll('td, th');
                    headerCells = Array.from(cells).map(extractCellText);
                    if (headerCells.length > 0) {
                      rows.push('| ' + headerCells.join(' | ') + ' |');
                      rows.push('| ' + headerCells.map(() => '---').join(' | ') + ' |');
                      bodyRows = bodyRows.slice(1);
                    }
                  } catch {}
                }
                
                // 处理数据行
                bodyRows.forEach((row: any) => {
                  try {
                    const cells = row.querySelectorAll('td, th');
                    const cellTexts = Array.from(cells).map(extractCellText);
                    if (cellTexts.length > 0) {
                      rows.push('| ' + cellTexts.join(' | ') + ' |');
                    }
                  } catch {}
                });
                
                return rows.length > 0 ? '\n' + rows.join('\n') + '\n' : '';
              } catch (error: any) {
                console.warn('[Word导入] 表格转换失败，保留为 HTML:', error.message);
                // 如果转换失败，尝试返回 HTML
                try {
                  const table = node as any;
                  return '\n' + (table.outerHTML || table.innerHTML || '[表格]') + '\n';
                } catch {
                  return '\n[表格]\n';
                }
              }
            },
          });
          
          const result = turndown.turndown(html);
          clearTimeout(timer);
          resolve(result);
        } catch (error: any) {
          clearTimeout(timer);
          reject(error);
        }
      });
    };
    
    try {
      // 尝试转换，设置 30 秒超时
      markdown = await convertWithTimeout(safeHtml, 30000);
      console.log('[Word导入] Markdown 转换成功');
    } catch (error: any) {
      // 检查是否是堆栈溢出错误
      const isStackOverflow = error.message?.includes('Maximum call stack size exceeded') || 
                              error.message?.includes('堆栈溢出') ||
                              error.message?.includes('转换超时');
      
      console.error('[Word导入] Turndown 转换失败:', error.message);
      if (error.stack && isStackOverflow) {
        console.error('[Word导入] 检测到堆栈溢出，使用后备方案');
      }
      
      // 使用更简单的方法：直接使用 TurndownService 的默认规则，但添加图片和表格规则
      try {
        console.log('[Word导入] 尝试使用默认 TurndownService（添加图片和表格规则）...');
        const defaultTurndown = new TurndownService();
        
        // 添加图片规则，确保图片 URL 正确转换
        defaultTurndown.addRule('image', {
          filter: 'img',
          replacement: (content, node) => {
            const img = node as HTMLImageElement;
            const alt = img.alt || '';
            const src = img.src || img.getAttribute('src') || '';
            const title = img.title || img.getAttribute('title') || '';
            
            if (src) {
              return title 
                ? `![${alt}](${src} "${title}")` 
                : `![${alt}](${src})`;
            }
            return '';
          },
        });
        
        // 添加表格规则（与主方案相同的逻辑）
        defaultTurndown.addRule('table', {
          filter: 'table',
          replacement: (content, node) => {
            try {
              const table = node as any;
              const contentStr = String(content || '');
              const hasNestedTable = /<table[\s\S]*?<\/table>/i.test(contentStr);
              
              if (hasNestedTable) {
                // 有嵌套表格，处理嵌套表格
                let tableHtml = '';
                try {
                  tableHtml = table.outerHTML || table.innerHTML || '';
                } catch {
                  tableHtml = contentStr;
                }
                
                let processedHtml = tableHtml;
                let iterations = 0;
                while (iterations < 10) {
                  const before = processedHtml;
                  processedHtml = processedHtml.replace(/<table[^>]*>((?:(?!<table)[\s\S])*?)<\/table>/gi, (match, innerContent) => {
                    const textContent = innerContent
                      .replace(/<[^>]+>/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim();
                    return textContent ? `[表格: ${textContent.substring(0, 50)}]` : '[表格]';
                  });
                  
                  if (before === processedHtml) break;
                  iterations++;
                }
                
                if (processedHtml.includes('<table')) {
                  return '\n' + processedHtml + '\n';
                }
                
                return '\n' + processedHtml + '\n';
              }
              
              // 没有嵌套表格，转换为 Markdown
              const rows: string[] = [];
              const extractCellText = (cell: any): string => {
                try {
                  const text = cell.textContent || cell.innerText || '';
                  return text.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ');
                } catch {
                  return '';
                }
              };
              
              let thead: any = null;
              try {
                thead = table.querySelector('thead');
              } catch {}
              
              let headerCells: string[] = [];
              
              if (thead) {
                try {
                  const headerRow = thead.querySelector('tr');
                  if (headerRow) {
                    const cells = headerRow.querySelectorAll('th, td');
                    headerCells = Array.from(cells).map(extractCellText);
                    if (headerCells.length > 0) {
                      rows.push('| ' + headerCells.join(' | ') + ' |');
                      rows.push('| ' + headerCells.map(() => '---').join(' | ') + ' |');
                    }
                  }
                } catch {}
              }
              
              let tbody: any = null;
              let bodyRows: any[] = [];
              try {
                tbody = table.querySelector('tbody') || table;
                bodyRows = Array.from(tbody.querySelectorAll('tr'));
              } catch {}
              
              if (headerCells.length === 0 && bodyRows.length > 0) {
                try {
                  const firstRow = bodyRows[0];
                  const cells = firstRow.querySelectorAll('td, th');
                  headerCells = Array.from(cells).map(extractCellText);
                  if (headerCells.length > 0) {
                    rows.push('| ' + headerCells.join(' | ') + ' |');
                    rows.push('| ' + headerCells.map(() => '---').join(' | ') + ' |');
                    bodyRows = bodyRows.slice(1);
                  }
                } catch {}
              }
              
              bodyRows.forEach((row: any) => {
                try {
                  const cells = row.querySelectorAll('td, th');
                  const cellTexts = Array.from(cells).map(extractCellText);
                  if (cellTexts.length > 0) {
                    rows.push('| ' + cellTexts.join(' | ') + ' |');
                  }
                } catch {}
              });
              
              return rows.length > 0 ? '\n' + rows.join('\n') + '\n' : '';
            } catch (error: any) {
              console.warn('[Word导入] 表格转换失败:', error.message);
              try {
                const table = node as any;
                return '\n' + (table.outerHTML || table.innerHTML || '[表格]') + '\n';
              } catch {
                return '\n[表格]\n';
              }
            }
          },
        });
        
        markdown = defaultTurndown.turndown(safeHtml);
        console.log('[Word导入] 默认 TurndownService 转换成功');
      } catch (defaultError: any) {
        console.error('[Word导入] 默认 TurndownService 也失败:', defaultError.message);
        
        // 最后的后备方案：使用简单的文本提取（不使用正则，避免堆栈溢出）
        console.log('[Word导入] 使用纯文本提取后备方案...');
        let textOnly = safeHtml;
        
        // 使用简单的字符串操作，避免正则表达式
        if (textOnly.length < 10 * 1024 * 1024) {
          // 小文件可以使用正则
          // 先处理图片，确保图片 URL 被保留
          textOnly = textOnly
            .replace(/<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi, (match, src) => {
              // 提取 alt 和 title 属性
              const altMatch = match.match(/alt\s*=\s*["']([^"']*)["']/i);
              const titleMatch = match.match(/title\s*=\s*["']([^"']*)["']/i);
              const alt = altMatch ? altMatch[1] : '';
              const title = titleMatch ? titleMatch[1] : '';
              return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
            })
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<table[\s\S]*?<\/table>/gi, '\n[表格]\n')
            .replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, '\n## $2\n')
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        } else {
          // 大文件只做最基本的处理，但需要保留图片
          // 先处理图片标签，转换为 Markdown 格式
          let processedHtml = textOnly;
          let searchIndex = 0;
          
          // 查找并替换所有图片标签
          while (true) {
            const imgStart = processedHtml.indexOf('<img', searchIndex);
            if (imgStart === -1) break;
            
            const imgEnd = processedHtml.indexOf('>', imgStart);
            if (imgEnd === -1) break;
            
            const imgTag = processedHtml.substring(imgStart, imgEnd + 1);
            
            // 提取 src 属性
            const srcMatch = imgTag.match(/src\s*=\s*["']([^"']+)["']/i);
            if (srcMatch && srcMatch[1]) {
              const src = srcMatch[1];
              const altMatch = imgTag.match(/alt\s*=\s*["']([^"']*)["']/i);
              const titleMatch = imgTag.match(/title\s*=\s*["']([^"']*)["']/i);
              const alt = altMatch ? altMatch[1] : '';
              const title = titleMatch ? titleMatch[1] : '';
              
              const markdownImg = title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
              processedHtml = processedHtml.substring(0, imgStart) + 
                            markdownImg + 
                            processedHtml.substring(imgEnd + 1);
              searchIndex = imgStart + markdownImg.length;
            } else {
              searchIndex = imgEnd + 1;
            }
          }
          
          // 移除脚本和样式
          processedHtml = processedHtml
            .replace(/<script/gi, '<!--script')
            .replace(/<\/script>/gi, '-->')
            .replace(/<style/gi, '<!--style')
            .replace(/<\/style>/gi, '-->');
          
          // 移除其他标签（使用简单的字符串查找）
          let result = '';
          let inTag = false;
          for (let i = 0; i < processedHtml.length; i++) {
            const char = processedHtml[i];
            if (char === '<') {
              inTag = true;
            } else if (char === '>') {
              inTag = false;
              if (processedHtml.substring(Math.max(0, i - 5), i).toLowerCase() === '<br') {
                result += '\n';
              }
            } else if (!inTag) {
              result += char;
            }
          }
          textOnly = result.replace(/\n{3,}/g, '\n\n').trim();
        }
        
        markdown = textOnly || safeHtml;
        console.warn('[Word导入] 使用文本提取后备方案，格式可能丢失');
      }
    }
    
    // 统计图片数量（使用安全的方法，避免大字符串正则）
    if (markdown.length < 10 * 1024 * 1024) {
      // 小文件可以使用正则
    const imgMatches = markdown.match(/!\[.*?\]\(.*?\)/g);
    if (imgMatches) {
      console.log(`[Word导入] 完成，共处理 ${imgMatches.length} 张图片`);
      const qiniuUrls = imgMatches.filter(img => img.includes('oss.yunlot.com'));
      const base64Urls = imgMatches.filter(img => img.includes('data:image'));
      console.log(`[Word导入] 七牛云图片: ${qiniuUrls.length} 张，Base64 图片: ${base64Urls.length} 张`);
      }
    } else {
      // 大文件使用简单的字符串查找
      let imgCount = 0;
      let searchIndex = 0;
      while (true) {
        const imgStart = markdown.indexOf('![', searchIndex);
        if (imgStart === -1) break;
        const imgEnd = markdown.indexOf(')', imgStart);
        if (imgEnd === -1) break;
        imgCount++;
        searchIndex = imgEnd + 1;
      }
      console.log(`[Word导入] 完成，共处理 ${imgCount} 张图片（大文件，使用简化统计）`);
    }
    
    // 清理多余的空白行（使用安全的方法）
    if (markdown.length < 10 * 1024 * 1024) {
      // 小文件可以使用正则
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    } else {
      // 大文件使用简单的字符串替换
      let result = '';
      let newlineCount = 0;
      for (let i = 0; i < markdown.length; i++) {
        if (markdown[i] === '\n') {
          newlineCount++;
          if (newlineCount <= 2) {
            result += '\n';
          }
        } else {
          newlineCount = 0;
          result += markdown[i];
        }
      }
      markdown = result;
    }

    return NextResponse.json({ markdown });
  } catch (error: any) {
    console.error('DOCX 导入失败:', error);
    return NextResponse.json(
      { error: error.message || '导入失败，请稍后重试' },
      { status: 500 }
    );
  }
}


