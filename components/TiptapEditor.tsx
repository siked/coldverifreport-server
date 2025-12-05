'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { Node, mergeAttributes, Mark, getMarkRange } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import HardBreak from '@tiptap/extension-hard-break';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { createLowlight } from 'lowlight';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import css from 'highlight.js/lib/languages/css';
import html from 'highlight.js/lib/languages/xml';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import java from 'highlight.js/lib/languages/java';
import cpp from 'highlight.js/lib/languages/cpp';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';

const lowlight = createLowlight();
lowlight.register('javascript', javascript);
lowlight.register('typescript', typescript);
lowlight.register('css', css);
lowlight.register('html', html);
lowlight.register('json', json);
lowlight.register('python', python);
lowlight.register('java', java);
lowlight.register('cpp', cpp);
lowlight.register('sql', sql);
lowlight.register('bash', bash);

// 自定义 Image 扩展，支持宽度和高度
const CustomImage = Node.create({
  name: 'image',
  addOptions() {
    return {
      inline: false,
      allowBase64: false,
      HTMLAttributes: {},
    };
  },
  inline() {
    return this.options.inline;
  },
  group() {
    return this.options.inline ? 'inline' : 'block';
  },
  draggable: true,
  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('width'),
        renderHTML: (attributes) => {
          if (!attributes.width) {
            return {};
          }
          return {
            width: attributes.width,
          };
        },
      },
      height: {
        default: null,
        parseHTML: (element) => element.getAttribute('height'),
        renderHTML: (attributes) => {
          if (!attributes.height) {
            return {};
          }
          return {
            height: attributes.height,
          };
        },
      },
      dataSource: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-source'),
        renderHTML: (attributes) =>
          attributes.dataSource ? { 'data-source': attributes.dataSource } : {},
      },
      dataSourceType: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-source-type'),
        renderHTML: (attributes) =>
          attributes.dataSourceType ? { 'data-source-type': attributes.dataSourceType } : {},
      },
      tooltip: {
        default: null,
        parseHTML: (element) => element.getAttribute('title'),
        renderHTML: (attributes) => (attributes.tooltip ? { title: attributes.tooltip } : {}),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: this.options.allowBase64
          ? 'img[src]'
          : 'img[src]:not([src^="data:"])',
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const attrs = { ...HTMLAttributes };
    if (attrs['data-source']) {
      attrs.class = `${attrs.class || ''} ${DATA_SOURCE_CLASS}`.trim();
      attrs[DATA_SOURCE_ELEMENT_ATTR] = 'image';
    }
    return ['img', mergeAttributes(this.options.HTMLAttributes, attrs)];
  },
  addCommands() {
    return {
      setImage: (options) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: options,
        });
      },
      updateImage: (options) => ({ tr, state }) => {
        const { selection } = state;
        const { from } = selection;
        const node = state.doc.nodeAt(from - 1);
        if (node && node.type.name === 'image') {
          tr.setNodeMarkup(from - 1, undefined, {
            ...node.attrs,
            ...options,
          });
          return true;
        }
        return false;
      },
    };
  },
});

// 分页符扩展
const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  parseHTML() {
    return [
      {
        tag: 'div[data-type="page-break"]',
      },
    ];
  },
  renderHTML() {
    return [
      'div',
      {
        'data-type': 'page-break',
        class: 'page-break',
        style: 'page-break-after: always; break-after: page; margin: 2rem 0; border-top: 2px dashed #cbd5e1; padding-top: 2rem;',
      },
    ];
  },
  addCommands() {
    return {
      setPageBreak: () => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
        });
      },
    };
  },
});

// 自定义 TableCell 扩展，支持 style 属性
const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attributes) => {
          if (!attributes.style) {
            return {};
          }
          return {
            style: attributes.style,
          };
        },
      },
    };
  },
});

// 自定义 TableRow 扩展，支持 style 属性
const CustomTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attributes) => {
          if (!attributes.style) {
            return {};
          }
          return {
            style: attributes.style,
          };
        },
      },
    };
  },
});

// 自定义 TableHeader 扩展，支持 style 属性
const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (element) => element.getAttribute('style'),
        renderHTML: (attributes) => {
          if (!attributes.style) {
            return {};
          }
          return {
            style: attributes.style,
          };
        },
      },
    };
  },
});

const DATA_SOURCE_ELEMENT_ATTR = 'data-source-element';
const DATA_SOURCE_CLASS = 'data-source-highlight';
const TEXT_DATA_SOURCE_TYPES: Array<TemplateTag['type']> = [
  'text',
  'number',
  'date',
  'datetime',
  'location',
  'boolean',
];
const IMAGE_DATA_SOURCE_TYPES: Array<TemplateTag['type']> = ['image', 'cda-image'];

type TagDataSource = {
  type: 'tag';
  tagId: string;
  tagName: string;
  tagType: TemplateTag['type'];
  value: string;
};

type ApiDataSource = {
  type: 'api';
  name: string;
  url: string;
  method: 'GET' | 'POST';
  headers?: string;
  body?: string;
  dataPath?: string;
  lastTestedAt?: string;
  value?: string;
};

type DataSourcePayload = TagDataSource | ApiDataSource;

interface DataSourceMenuState {
  x: number;
  y: number;
  targetType: 'text' | 'image';
  range?: { from: number; to: number };
  imagePos?: number;
  existingSource?: DataSourcePayload | null;
}

interface ApiFormState {
  name: string;
  url: string;
  method: 'GET' | 'POST';
  headers: string;
  body: string;
  dataPath: string;
}

const DataSourceMark = Mark.create({
  name: 'dataSource',
  inclusive: true,
  addAttributes() {
    return {
      data: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-source'),
        renderHTML: (attributes) => {
          if (!attributes.data) return {};
          return { 'data-source': attributes.data };
        },
      },
      sourceType: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-source-type'),
        renderHTML: (attributes) =>
          attributes.sourceType ? { 'data-source-type': attributes.sourceType } : {},
      },
      tooltip: {
        default: null,
        parseHTML: (element) => element.getAttribute('title'),
        renderHTML: (attributes) => (attributes.tooltip ? { title: attributes.tooltip } : {}),
      },
    };
  },
  parseHTML() {
    return [{ tag: `span[data-source]` }];
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: DATA_SOURCE_CLASS,
        [DATA_SOURCE_ELEMENT_ATTR]: 'text',
      }),
      0,
    ];
  },
});

const DATA_SOURCE_STYLES = `
.prose .${DATA_SOURCE_CLASS} {
  background-color: #fef3c7;
  border-bottom: 1px dashed #facc15;
  cursor: pointer;
  position: relative;
}
.prose .${DATA_SOURCE_CLASS}::after {
  content: attr(title);
  position: absolute;
  left: 0;
  top: 100%;
  margin-top: 2px;
  background: rgba(31, 41, 55, 0.95);
  color: #fefce8;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition: opacity 0.15s ease, transform 0.15s ease;
  z-index: 50;
}
.prose .${DATA_SOURCE_CLASS}:hover::after {
  opacity: 1;
  transform: translateY(0);
}
.prose img.${DATA_SOURCE_CLASS} {
  outline: 2px solid #facc15;
  outline-offset: 2px;
  border-radius: 4px;
}
.page-header-footer {
  position: absolute;
  left: 0;
  right: 0;
  font-size: 12px;
  color: #6b7280;
  z-index: 10;
}
.page-header {
  top: 0;
  border-bottom: 1px solid #e5e7eb;
  padding: 10px 40px;
  background: #fff;
}
.page-footer {
  bottom: 0;
  border-top: 1px solid #e5e7eb;
  padding: 10px 40px;
  background: #fff;
}
@media print {
  @page {
    margin: 0;
    size: A4;
  }
  .page-header {
    position: fixed;
    top: 0;
  }
  .page-footer {
    position: fixed;
    bottom: 0;
  }
}
`;

const stringifyDataSource = (payload: DataSourcePayload) =>
  encodeURIComponent(JSON.stringify(payload));
const parseDataSource = (value?: string | null): DataSourcePayload | null => {
  if (!value) return null;
  const tryParse = (raw: string) => {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  };
  try {
    const decoded = decodeURIComponent(value);
    return tryParse(decoded) ?? tryParse(value);
  } catch {
    return tryParse(value);
  }
};

const formatTooltip = (payload: DataSourcePayload) => {
  if (payload.type === 'tag') {
    return `标签：${payload.tagName} (${payload.tagType})`;
  }
  return `接口：${payload.name || payload.url}`;
};

const extractValueByPath = (data: any, path?: string) => {
  if (!path) return data;
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  return segments.reduce((acc, key) => {
    if (acc === undefined || acc === null) return undefined;
    return (acc as any)[key];
  }, data);
};

const formatTagValue = (tag: TemplateTag): string => {
  if (tag.type === 'location' && Array.isArray(tag.value)) {
    return tag.value.join('、');
  }
  if (tag.type === 'boolean') {
    return tag.value ? '是' : '否';
  }
  return typeof tag.value === 'string' ? tag.value : tag.value?.toString() || '';
};

const generateTempId = () => `temp_${Date.now()}`;

import { marked } from 'marked';
import TurndownService from 'turndown';
import imageCompression from 'browser-image-compression';
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Code,
  Image as ImageIcon,
  Minus,
  Redo2,
  Save,
  Undo2,
  CheckSquare,
  Table as TableIcon,
  X,
  RefreshCw,
  Columns,
  Rows,
  Trash2,
  Plus,
  Search,
  ChevronDown,
  ChevronUp,
  Tag as TagIcon,
  Database,
  Plug,
  PlusCircle,
  FlaskConical,
  FileText,
  Copy,
} from 'lucide-react';
import Modal from './Modal';
import type { TemplateTag } from './TemplateTagList';

interface TiptapEditorProps {
  content: string;
  onSave: (markdown: string) => Promise<void>;
  tags: TemplateTag[];
  onChangeTags: (tags: TemplateTag[]) => void;
}

const createTurndown = () => {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    emDelimiter: '*',
    codeBlockStyle: 'fenced',
    fence: '```',
  });

  // 添加表格支持
  turndown.addRule('table', {
    filter: 'table',
    replacement: (content, node) => {
      const table = node as HTMLTableElement;
      
      // 检查表格中是否有数据来源标记
      const hasDataSource = table.querySelector(`span[data-source], img[data-source]`);
      
      // 检查表格是否有自定义样式（行间距、padding等）
      const hasCustomStyles = (() => {
        // 检查表格本身是否有 style 属性
        if (table.getAttribute('style')) {
          return true;
        }
        // 检查所有行是否有 style 属性
        const rows = table.querySelectorAll('tr');
        for (const row of rows) {
          if (row.getAttribute('style')) {
            return true;
          }
        }
        // 检查所有单元格是否有 style 属性
        const cells = table.querySelectorAll('td, th');
        for (const cell of cells) {
          const style = cell.getAttribute('style');
          if (style) {
            // 检查是否有行间距相关的样式（line-height, padding等）
            const styleLower = style.toLowerCase();
            if (styleLower.includes('line-height') || 
                styleLower.includes('padding') ||
                styleLower.includes('height') ||
                styleLower.includes('min-height')) {
              return true;
            }
          }
        }
        return false;
      })();
      
      // 如果有数据来源或自定义样式，使用 HTML 表格格式以保留标记和样式
      if (hasDataSource || hasCustomStyles) {
        // 克隆表格并处理单元格内容
        const clonedTable = table.cloneNode(true) as HTMLTableElement;
        const cells = clonedTable.querySelectorAll('td, th');
        cells.forEach((cell) => {
          // 确保数据来源标记被正确保留
          const spans = cell.querySelectorAll('span[data-source]');
          spans.forEach((span) => {
            const dataSource = span.getAttribute('data-source');
            const sourceType = span.getAttribute('data-source-type');
            const title = span.getAttribute('title');
            if (dataSource) {
              // 确保属性被正确设置
              span.setAttribute('data-source', dataSource);
              if (sourceType) span.setAttribute('data-source-type', sourceType);
              if (title) span.setAttribute('title', title);
              if (!span.classList.contains(DATA_SOURCE_CLASS)) {
                span.classList.add(DATA_SOURCE_CLASS);
              }
              span.setAttribute(DATA_SOURCE_ELEMENT_ATTR, 'text');
            }
          });
        });
        return '\n' + clonedTable.outerHTML + '\n';
      }
      
      // 没有数据来源和自定义样式时，使用 markdown 表格格式
      const rows: string[] = [];
      
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
      
      const tbody = table.querySelector('tbody') || table;
      const bodyRows = Array.from(tbody.querySelectorAll('tr'));
      
      if (headerCells.length === 0 && bodyRows.length > 0) {
        const firstRow = bodyRows[0];
        headerCells = Array.from(firstRow.querySelectorAll('td, th')).map(
          (cell) => (cell.textContent || '').trim().replace(/\|/g, '\\|')
        );
        if (headerCells.length > 0) {
          rows.push('| ' + headerCells.join(' | ') + ' |');
          rows.push('| ' + headerCells.map(() => '---').join(' | ') + ' |');
          bodyRows.shift();
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

  // 任务列表支持 - 需要在列表项规则之前添加
  turndown.addRule('taskItem', {
    filter: (node) => {
      return (
        node.nodeName === 'LI' &&
        ((node as HTMLElement).classList.contains('task-list-item') ||
          (node as HTMLElement).querySelector('input[type="checkbox"]') !== null)
      );
    },
    replacement: (content, node) => {
      const checkbox = (node as HTMLElement).querySelector('input[type="checkbox"]') as HTMLInputElement;
      const isChecked = checkbox?.checked ? 'x' : ' ';
      // 移除复选框元素后的文本
      const text = content
        .replace(/<input[^>]*>/gi, '')
        .trim()
        .replace(/^\s*/, '');
      return `- [${isChecked}] ${text}`;
    },
  });

  turndown.addRule('taskList', {
    filter: (node) => {
      return (
        node.nodeName === 'UL' &&
        ((node as HTMLElement).classList.contains('contains-task-list') ||
          (node as HTMLElement).querySelector('li.task-list-item') !== null)
      );
    },
    replacement: (content) => {
      return content.trim() ? content + '\n' : '';
    },
  });

  // 图片支持（包含尺寸）
  turndown.addRule('image', {
    filter: 'img',
    replacement: (content, node) => {
      const img = node as HTMLImageElement;
      const alt = img.alt || '';
      const src = img.src || '';
      const title = img.title || '';
      const width = img.width ? ` width="${img.width}"` : '';
      const height = img.height ? ` height="${img.height}"` : '';
      const dataSource = img.getAttribute('data-source');
      const dataSourceType = img.getAttribute('data-source-type');
      
      // 如果有尺寸，使用 HTML 格式；否则使用 Markdown 格式
      if (width || height || dataSource || dataSourceType) {
        const dataAttrs =
          (dataSource ? ` data-source="${dataSource}"` : '') +
          (dataSourceType ? ` data-source-type="${dataSourceType}"` : '');
        return `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ''}${width}${height}${dataAttrs} />`;
      }
      return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
    },
  });

  turndown.addRule('dataSourceSpan', {
    filter: (node) => node.nodeName === 'SPAN' && (node as HTMLElement).getAttribute('data-source'),
    replacement: (content, node) => {
      const element = node as HTMLElement;
      const dataSource = element.getAttribute('data-source') || '';
      const sourceType = element.getAttribute('data-source-type') || '';
      const title = element.getAttribute('title') || '';
      return `<span data-source="${dataSource}" data-source-type="${sourceType}" title="${title}" class="${DATA_SOURCE_CLASS}">${content}</span>`;
    },
  });

  // 水平线
  turndown.addRule('horizontalRule', {
    filter: 'hr',
    replacement: () => '\n---\n\n',
  });

  // 强制换行
  turndown.addRule('lineBreak', {
    filter: 'br',
    replacement: () => '\n',
  });

  return turndown;
};

export default function TiptapEditor({ content, onSave, tags, onChangeTags }: TiptapEditorProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [initialMarkdown, setInitialMarkdown] = useState(content || '');
  const [currentMarkdown, setCurrentMarkdown] = useState(content || '');
  const turndown = useMemo(() => createTurndown(), []);
  useEffect(() => {
    const styleId = 'tiptap-data-source-style';
    if (document.getElementById(styleId)) {
      return;
    }
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = DATA_SOURCE_STYLES;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);
  
  // 查找替换相关状态
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [matches, setMatches] = useState<Array<{ from: number; to: number }>>([]);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [dataSourceMenu, setDataSourceMenu] = useState<DataSourceMenuState | null>(null);
  const [activeDataSourcePanel, setActiveDataSourcePanel] = useState<'tag' | 'api' | null>(null);
  const [tagSearch, setTagSearch] = useState('');
  const [quickTagModal, setQuickTagModal] = useState<{
    type: TemplateTag['type'];
    initialValue: string;
  } | null>(null);
  const [apiForm, setApiForm] = useState<ApiFormState>({
    name: '',
    url: '',
    method: 'GET',
    headers: '',
    body: '',
    dataPath: '',
  });
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<{ success: boolean; value?: string; message: string } | null>(null);
  
  // 页面格式定义（参考 @tiptap-pro/extension-pages）
  const PAGE_FORMATS = {
    A5: { name: 'A5', width: 148, height: 210 }, // mm
    A4: { name: 'A4', width: 210, height: 297 },
    A3: { name: 'A3', width: 297, height: 420 },
  } as const;
  
  type PageFormatType = keyof typeof PAGE_FORMATS;
  const [pageFormat, setPageFormat] = useState<PageFormatType>('A4');
  
  // 页眉、页脚、页码状态
  const [headerContent, setHeaderContent] = useState('');
  const [footerContent, setFooterContent] = useState('');
  const [pageNumberFormat, setPageNumberFormat] = useState('{page}/{total}');
  const [showPageNumber, setShowPageNumber] = useState(true);

  const htmlContent = useMemo(() => {
    try {
      // 配置 marked 以支持任务列表和 HTML
      const html = marked.parse(content || '', {
        breaks: true,
        gfm: true,
      }) as string;
      
      // 将任务列表的 markdown 语法转换为 HTML
      // - [x] 任务 -> <input type="checkbox" checked>
      // - [ ] 任务 -> <input type="checkbox">
      let processedHtml = html
        .replace(
          /<li>\[x\]\s*(.*?)<\/li>/gi,
          '<li class="task-list-item"><input type="checkbox" checked disabled> $1</li>'
        )
        .replace(
          /<li>\[\s*\]\s*(.*?)<\/li>/gi,
          '<li class="task-list-item"><input type="checkbox" disabled> $1</li>'
        )
        .replace(
          /<ul>\s*(<li class="task-list-item">.*?<\/li>\s*)+<\/ul>/gi,
          (match) => match.replace('<ul>', '<ul class="contains-task-list">')
        );
      
      // 确保表格单元格内的数据来源标记被正确识别
      // 使用临时 DOM 解析器处理表格
      if (typeof window !== 'undefined' && processedHtml.includes('<table')) {
        try {
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = processedHtml;
          const tables = tempDiv.querySelectorAll('table');
          tables.forEach((table) => {
            const cells = table.querySelectorAll('td, th');
            cells.forEach((cell) => {
              const spans = cell.querySelectorAll('span[data-source]');
              spans.forEach((span) => {
                const dataSource = span.getAttribute('data-source');
                if (dataSource) {
                  // 确保有必要的属性
                  if (!span.classList.contains(DATA_SOURCE_CLASS)) {
                    span.classList.add(DATA_SOURCE_CLASS);
                  }
                  if (!span.hasAttribute(DATA_SOURCE_ELEMENT_ATTR)) {
                    span.setAttribute(DATA_SOURCE_ELEMENT_ATTR, 'text');
                  }
                  // 确保 data-source-type 和 title 属性存在
                  if (!span.hasAttribute('data-source-type') && span.hasAttribute('data-source')) {
                    const parsed = parseDataSource(dataSource);
                    if (parsed) {
                      span.setAttribute('data-source-type', parsed.type);
                      span.setAttribute('title', formatTooltip(parsed));
                    }
                  }
                }
              });
            });
          });
          processedHtml = tempDiv.innerHTML;
        } catch (err) {
          console.warn('处理表格数据来源标记时出错:', err);
        }
      }
      
      // 确保 HTML 图片标签被正确解析（marked 默认会转义 HTML）
      // 如果内容中包含 <img> 标签，确保它们不被转义
      return processedHtml;
    } catch (err) {
      console.error('Markdown 解析失败', err);
      return content || '';
    }
  }, [content]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // 禁用默认的 codeBlock，使用 CodeBlockLowlight 替代
        codeBlock: false,
      }),
      DataSourceMark,
      CustomImage.configure({
        inline: true,
        allowBase64: false,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
      HardBreak,
      HorizontalRule,
      Table.configure({
        resizable: true,
      }),
      CustomTableRow,
      CustomTableHeader,
      CustomTableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      PageBreak,
    ],
    content: htmlContent,
    editorProps: {
      attributes: {
        class:
          'prose prose-slate max-w-none min-h-[calc(100vh-14rem)] px-4 py-3 focus:outline-none',
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(htmlContent, false);
    setInitialMarkdown(content || '');
    setCurrentMarkdown(content || '');
  }, [editor, htmlContent, content]);

  // 查找文本
  const findMatches = useCallback((text: string, caseSensitive: boolean) => {
    if (!editor || !text) {
      setMatches([]);
      setMatchCount(0);
      setCurrentMatchIndex(0);
      return;
    }

    const { doc } = editor.state;
    const matches: Array<{ from: number; to: number }> = [];
    const searchText = caseSensitive ? text : text.toLowerCase();

    // 遍历文档中的所有文本节点
    doc.descendants((node, pos) => {
      if (node.isText) {
        const nodeText = caseSensitive ? node.text : node.text.toLowerCase();
        let searchStart = 0;

        while (true) {
          const index = nodeText.indexOf(searchText, searchStart);
          if (index === -1) break;

          const from = pos + index;
          const to = pos + index + searchText.length;

          matches.push({ from, to });
          searchStart = index + 1;
        }
      }
      return true;
    });

    // 按位置排序
    matches.sort((a, b) => a.from - b.from);

    setMatches(matches);
    setMatchCount(matches.length);
    setCurrentMatchIndex(matches.length > 0 ? 1 : 0);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const handleUpdate = () => {
      const nextMarkdown = turndown.turndown(editor.getHTML());
      setCurrentMarkdown(nextMarkdown);
      
      // 如果查找替换面板打开且有查找文本，重新查找
      if (showFindReplace && findText) {
        setTimeout(() => {
          findMatches(findText, caseSensitive);
        }, 50);
      }
    };

    editor.on('update', handleUpdate);
    return () => {
      editor.off('update', handleUpdate);
    };
  }, [editor, turndown, showFindReplace, findText, caseSensitive, findMatches]);

  const hasChanges = currentMarkdown !== initialMarkdown;

  const handleSave = useCallback(async () => {
    if (!editor || !hasChanges) return;
    setIsSaving(true);
    try {
      await onSave(currentMarkdown);
      setInitialMarkdown(currentMarkdown);
      setLastSaved(new Date());
    } catch (err) {
      console.error('保存失败', err);
      alert('保存失败，请重试');
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [currentMarkdown, editor, hasChanges, onSave]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSave();
      }
      // Ctrl+F 打开查找替换
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setShowFindReplace(true);
        setTimeout(() => {
          const findInput = document.getElementById('find-input') as HTMLInputElement;
          findInput?.focus();
        }, 100);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  // 跳转到指定匹配项
  const goToMatch = useCallback((index: number) => {
    if (!editor || matches.length === 0 || index < 1 || index > matches.length) return;

    const match = matches[index - 1];
    editor.chain().focus().setTextSelection({ from: match.from, to: match.to }).run();
    setCurrentMatchIndex(index);
  }, [editor, matches]);

  // 查找下一个
  const findNext = useCallback(() => {
    if (matches.length === 0) return;
    const nextIndex = currentMatchIndex >= matches.length ? 1 : currentMatchIndex + 1;
    goToMatch(nextIndex);
  }, [matches, currentMatchIndex, goToMatch]);

  // 查找上一个
  const findPrevious = useCallback(() => {
    if (matches.length === 0) return;
    const prevIndex = currentMatchIndex <= 1 ? matches.length : currentMatchIndex - 1;
    goToMatch(prevIndex);
  }, [matches, currentMatchIndex, goToMatch]);

  // 替换当前匹配项
  const replaceCurrent = useCallback(() => {
    if (!editor || matches.length === 0 || currentMatchIndex === 0) return;

    const match = matches[currentMatchIndex - 1];
    editor
      .chain()
      .focus()
      .setTextSelection({ from: match.from, to: match.to })
      .deleteSelection()
      .insertContent(replaceText)
      .run();

    // 重新查找
    setTimeout(() => {
      findMatches(findText, caseSensitive);
    }, 100);
  }, [editor, matches, currentMatchIndex, replaceText, findText, caseSensitive, findMatches]);

  // 全部替换
  const replaceAll = useCallback(() => {
    if (!editor || matches.length === 0) return;

    // 从后往前替换，避免位置偏移
    const sortedMatches = [...matches].sort((a, b) => b.from - a.from);
    
    editor.chain().focus().run();
    
    sortedMatches.forEach((match) => {
      editor
        .chain()
        .setTextSelection({ from: match.from, to: match.to })
        .deleteSelection()
        .insertContent(replaceText)
        .run();
    });

    // 重新查找
    setTimeout(() => {
      findMatches(findText, caseSensitive);
    }, 100);
  }, [editor, matches, replaceText, findText, caseSensitive, findMatches]);

  // 当查找文本或大小写敏感选项改变时，重新查找
  useEffect(() => {
    if (showFindReplace && findText) {
      findMatches(findText, caseSensitive);
    } else {
      setMatches([]);
      setMatchCount(0);
      setCurrentMatchIndex(0);
    }
  }, [findText, caseSensitive, showFindReplace, findMatches]);

  const handleImageUpload = useCallback(async () => {
    if (!editor || isUploading) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      // 验证文件类型
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        alert('不支持的图片格式，仅支持 JPEG、PNG、GIF、WebP');
        return;
      }

      // 验证文件大小（10MB）
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        alert('图片大小不能超过 10MB');
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);
      try {
        // 压缩图片
        const options = {
          maxSizeMB: 0.5, // 500KB
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: file.type,
        };
        
        const compressedFile = await imageCompression(file, options);
        console.log(`图片压缩: ${(file.size / 1024).toFixed(2)} KB -> ${(compressedFile.size / 1024).toFixed(2)} KB`);

        // 创建 FormData
        const formData = new FormData();
        formData.append('file', compressedFile, file.name);

        // 使用 XMLHttpRequest 来获取上传进度
        const xhr = new XMLHttpRequest();
        
        const promise = new Promise<{ url: string }>((resolve, reject) => {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded / e.total) * 100);
              setUploadProgress(percentComplete);
            }
          });
          
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                resolve(data);
              } catch (err) {
                reject(new Error('解析响应失败'));
              }
            } else {
              try {
                const data = JSON.parse(xhr.responseText);
                reject(new Error(data.error || '上传失败'));
              } catch {
                reject(new Error(`上传失败: ${xhr.statusText}`));
              }
            }
          });
          
          xhr.addEventListener('error', () => {
            reject(new Error('网络错误'));
          });
          
          xhr.addEventListener('abort', () => {
            reject(new Error('上传已取消'));
          });
        });
        
        xhr.open('POST', '/api/upload/image');
        xhr.send(formData);
        
        const data = await promise;
        setUploadProgress(100);
        const imageUrl = data.url;

        // 插入图片到编辑器
        editor.chain().focus().setImage({ src: imageUrl }).run();
      } catch (err: any) {
        console.error('图片上传失败:', err);
        alert(err.message || '图片上传失败，请重试');
      } finally {
        setIsUploading(false);
        setTimeout(() => setUploadProgress(0), 500);
        // 重置 input，以便可以再次选择同一文件
        input.value = '';
      }
    };
    input.click();
  }, [editor, isUploading]);

  const getSelectedText = useCallback(() => {
    if (!editor) return '';
    const { state } = editor;
    const { selection } = state;
    if (selection.empty) return '';
    return state.doc.textBetween(selection.from, selection.to);
  }, [editor]);

  const getDataSourceAtRange = useCallback(
    (range?: { from: number; to: number }) => {
      if (!editor || !range) return null;
      const markType = editor.state.schema.marks.dataSource;
      if (!markType) return null;
      let found: DataSourcePayload | null = null;
      editor.state.doc.nodesBetween(range.from, range.to, (node) => {
        if (!node.isText) return true;
        const activeMark = markType.isInSet(node.marks);
        if (activeMark && !found) {
          found = parseDataSource(activeMark.attrs.data);
          return false;
        }
        return true;
      });
      return found;
    },
    [editor]
  );

  const getDataSourceForImage = useCallback(
    (pos?: number) => {
      if (!editor || pos === undefined || pos < 0) return null;
      const node = editor.state.doc.nodeAt(pos);
      if (node && node.type.name === 'image') {
        return parseDataSource(node.attrs.dataSource);
      }
      return null;
    },
    [editor]
  );

  const applyDataSourceToText = useCallback(
    (range: { from: number; to: number }, payload: DataSourcePayload, displayValue: string) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .command(({ tr, state }) => {
          tr.insertText(displayValue, range.from, range.to);
          const markType = state.schema.marks.dataSource;
          if (markType) {
            const mark = markType.create({
              data: stringifyDataSource(payload),
              sourceType: payload.type,
              tooltip: formatTooltip(payload),
            });
            tr.addMark(range.from, range.from + displayValue.length, mark);
          }
          return true;
        })
        .run();
    },
    [editor]
  );

  const applyDataSourceToImage = useCallback(
    (pos: number, payload: DataSourcePayload, nextSrc: string) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .command(({ tr, state }) => {
          const node = state.doc.nodeAt(pos);
          if (node && node.type.name === 'image') {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              src: nextSrc || node.attrs.src,
              dataSource: stringifyDataSource(payload),
              dataSourceType: payload.type,
              tooltip: formatTooltip(payload),
            });
            return true;
          }
          return false;
        })
        .run();
    },
    [editor]
  );

  const removeDataSourceFromTarget = useCallback(
    (target?: DataSourceMenuState | null) => {
      if (!editor) return;
      const currentTarget = target ?? dataSourceMenu;
      if (!currentTarget) return;

      if (currentTarget.targetType === 'text' && currentTarget.range) {
        editor.chain().focus().setTextSelection(currentTarget.range).unsetMark('dataSource').run();
      } else if (currentTarget.targetType === 'image' && typeof currentTarget.imagePos === 'number') {
        editor
          .chain()
          .focus()
          .command(({ tr, state }) => {
            const node = state.doc.nodeAt(currentTarget.imagePos!);
            if (node && node.type.name === 'image') {
              const nextAttrs = { ...node.attrs };
              delete nextAttrs.dataSource;
              delete nextAttrs.dataSourceType;
              delete nextAttrs.tooltip;
              tr.setNodeMarkup(currentTarget.imagePos!, undefined, nextAttrs);
              return true;
            }
            return false;
          })
          .run();
      }

      setDataSourceMenu(null);
      setActiveDataSourcePanel(null);
      setApiTestResult(null);
    },
    [editor, dataSourceMenu]
  );

  const resetApiForm = useCallback(() => {
    setApiForm({
      name: '',
      url: '',
      method: 'GET',
      headers: '',
      body: '',
      dataPath: '',
    });
    setApiTestResult(null);
  }, []);

  const hydrateApiForm = useCallback(
    (payload?: DataSourcePayload | null) => {
      if (payload && payload.type === 'api') {
        setApiForm({
          name: payload.name || '',
          url: payload.url,
          method: payload.method,
          headers: payload.headers || '',
          body: payload.body || '',
          dataPath: payload.dataPath || '',
        });
        setApiTestResult(
          payload.value
            ? { success: true, value: payload.value, message: '已使用上次成功的结果' }
            : null
        );
      } else {
        resetApiForm();
      }
    },
    [resetApiForm]
  );

  const resolveRangeFromElement = useCallback(
    (element: HTMLElement | null) => {
      if (!editor || !element) return null;
      const pos = editor.view.posAtDOM(element, 0);
      if (typeof pos !== 'number') return null;
      const markType = editor.state.schema.marks.dataSource;
      if (!markType) return null;
      const range = getMarkRange(editor.state.doc.resolve(pos), markType);
      if (!range) return null;
      return range;
    },
    [editor]
  );

  const handleApplyTag = useCallback(
    (tag: TemplateTag) => {
      if (!dataSourceMenu) return;
      const payload: TagDataSource = {
        type: 'tag',
        tagId: tag._id || generateTempId(),
        tagName: tag.name,
        tagType: tag.type,
        value: formatTagValue(tag),
      };

      if (dataSourceMenu.targetType === 'text' && dataSourceMenu.range) {
        const textValue = formatTagValue(tag);
        applyDataSourceToText(dataSourceMenu.range, payload, textValue);
      } else if (
        dataSourceMenu.targetType === 'image' &&
        typeof dataSourceMenu.imagePos === 'number'
      ) {
        if (!IMAGE_DATA_SOURCE_TYPES.includes(tag.type)) {
          alert('请选择图片或 CDA 图片类型的标签');
          return;
        }
        if (!tag.value) {
          alert('该标签暂无图片，请先在右侧标签列表中上传图片');
          return;
        }
        applyDataSourceToImage(dataSourceMenu.imagePos, payload, tag.value);
      }
      setDataSourceMenu(null);
      setActiveDataSourcePanel(null);
    },
    [applyDataSourceToImage, applyDataSourceToText, dataSourceMenu]
  );

  const handleQuickTagSave = useCallback(
    (tag: TemplateTag) => {
      const nextTag = { ...tag, _id: tag._id || generateTempId() };
      onChangeTags([...tags, nextTag]);
      setQuickTagModal(null);
      setTimeout(() => handleApplyTag(nextTag), 0);
    },
    [handleApplyTag, onChangeTags, tags]
  );

  const openQuickTagModal = useCallback(() => {
    if (!dataSourceMenu) return;
    let initialValue = '';
    if (dataSourceMenu.targetType === 'text' && dataSourceMenu.range && editor) {
      initialValue = editor.state.doc.textBetween(dataSourceMenu.range.from, dataSourceMenu.range.to);
    } else if (
      dataSourceMenu.targetType === 'image' &&
      typeof dataSourceMenu.imagePos === 'number' &&
      editor
    ) {
      const node = editor.state.doc.nodeAt(dataSourceMenu.imagePos);
      initialValue = node?.attrs.src || '';
    }
    setQuickTagModal({
      type: dataSourceMenu.targetType === 'image' ? 'image' : 'text',
      initialValue,
    });
  }, [dataSourceMenu, editor]);

  const filteredTags = useMemo(() => {
    const allowedTypes =
      dataSourceMenu?.targetType === 'image' ? IMAGE_DATA_SOURCE_TYPES : TEXT_DATA_SOURCE_TYPES;
    return tags
      .filter((tag) => allowedTypes.includes(tag.type))
      .filter((tag) => tag.name.toLowerCase().includes(tagSearch.toLowerCase()));
  }, [dataSourceMenu?.targetType, tagSearch, tags]);

  const testApiData = useCallback(async () => {
    if (!apiForm.url) {
      alert('请输入接口地址');
      return;
    }
    setIsTestingApi(true);
    try {
      let headers: Record<string, string> | undefined;
      if (apiForm.headers) {
        try {
          headers = JSON.parse(apiForm.headers);
        } catch {
          throw new Error('请求头需为 JSON 格式');
        }
      }

      const response = await fetch(apiForm.url, {
        method: apiForm.method,
        headers,
        body: apiForm.method === 'GET' ? undefined : apiForm.body || undefined,
      });

      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
      const extracted = extractValueByPath(data, apiForm.dataPath) ?? data;
      const value =
        extracted === null || extracted === undefined
          ? ''
          : typeof extracted === 'string'
          ? extracted
          : typeof extracted === 'number' || typeof extracted === 'boolean'
          ? String(extracted)
          : JSON.stringify(extracted);

      setApiTestResult({ success: true, value, message: '测试成功' });
    } catch (err: any) {
      setApiTestResult({
        success: false,
        message: err?.message || '接口测试失败',
      });
    } finally {
      setIsTestingApi(false);
    }
  }, [apiForm]);

  const handleApplyApiData = useCallback(() => {
    if (!dataSourceMenu) return;
    if (!apiForm.url) {
      alert('请先填写接口地址');
      return;
    }
    if (!apiTestResult?.success) {
      alert('请先测试接口并确保成功');
      return;
    }

    const value = apiTestResult.value || '';
    const payload: ApiDataSource = {
      type: 'api',
      name: apiForm.name || apiForm.url,
      url: apiForm.url,
      method: apiForm.method,
      headers: apiForm.headers,
      body: apiForm.body,
      dataPath: apiForm.dataPath,
      lastTestedAt: new Date().toISOString(),
      value,
    };

    if (dataSourceMenu.targetType === 'text' && dataSourceMenu.range) {
      applyDataSourceToText(dataSourceMenu.range, payload, value);
    } else if (
      dataSourceMenu.targetType === 'image' &&
      typeof dataSourceMenu.imagePos === 'number'
    ) {
      if (!value) {
        alert('接口未返回可用的图片地址');
        return;
      }
      applyDataSourceToImage(dataSourceMenu.imagePos, payload, value);
    }
    setDataSourceMenu(null);
    setActiveDataSourcePanel(null);
  }, [
    apiForm.body,
    apiForm.dataPath,
    apiForm.headers,
    apiForm.method,
    apiForm.name,
    apiForm.url,
    apiTestResult,
    applyDataSourceToImage,
    applyDataSourceToText,
    dataSourceMenu,
  ]);

  const getPopoverPosition = useCallback((x: number, y: number, width = 280, height = 260, offsetX = 10, offsetY = 10) => {
    if (typeof window === 'undefined') {
      return { left: x + offsetX, top: y + offsetY };
    }
    // 计算位置，在鼠标右下方显示，如果空间不够则调整
    let left = x + offsetX;
    let top = y + offsetY;
    
    // 如果右侧空间不够，显示在左侧
    if (left + width > window.innerWidth - 8) {
      left = x - width - offsetX;
    }
    
    // 如果下方空间不够，显示在上方
    if (top + height > window.innerHeight - 8) {
      top = y - height - offsetY;
    }
    
    // 确保不超出边界
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - height - 8));
    
    return { left, top };
  }, []);

  const fetchApiValue = useCallback(async (config: ApiDataSource) => {
    let headers: Record<string, string> | undefined;
    if (config.headers) {
      try {
        headers = JSON.parse(config.headers);
      } catch {
        headers = undefined;
      }
    }
    const response = await fetch(config.url, {
      method: config.method,
      headers,
      body: config.method === 'GET' ? undefined : config.body || undefined,
    });
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    const extracted = extractValueByPath(data, config.dataPath) ?? data;
    if (extracted === null || extracted === undefined) return '';
    if (typeof extracted === 'string') return extracted;
    if (typeof extracted === 'number' || typeof extracted === 'boolean') return String(extracted);
    return JSON.stringify(extracted);
  }, []);

  const refreshApiDataSources = useCallback(async () => {
    if (!editor) return;
    const targets: Array<
      | { kind: 'text'; range: { from: number; to: number }; payload: ApiDataSource }
      | { kind: 'image'; pos: number; payload: ApiDataSource }
    > = [];
    const markType = editor.state.schema.marks.dataSource;
    const visited = new Set<string>();

    editor.state.doc.descendants((node, pos) => {
      if (node.isText && markType) {
        const mark = markType.isInSet(node.marks);
        if (mark) {
          const payload = parseDataSource(mark.attrs.data);
          if (payload?.type === 'api') {
            const range = getMarkRange(editor.state.doc.resolve(pos), markType);
            if (range) {
              const key = `${range.from}-${range.to}`;
              if (!visited.has(key)) {
                visited.add(key);
                targets.push({ kind: 'text', range, payload });
              }
            }
          }
        }
      } else if (node.type.name === 'image' && node.attrs.dataSource) {
        const payload = parseDataSource(node.attrs.dataSource);
        if (payload?.type === 'api') {
          targets.push({ kind: 'image', pos, payload });
        }
      }
    });

    for (const target of targets) {
      try {
        const value = await fetchApiValue(target.payload);
        if (target.kind === 'text') {
          applyDataSourceToText(target.range, { ...target.payload, value }, value);
        } else {
          applyDataSourceToImage(target.pos, { ...target.payload, value }, value);
        }
      } catch (err) {
        console.warn('刷新接口数据失败', err);
      }
    }
  }, [applyDataSourceToImage, applyDataSourceToText, editor, fetchApiValue]);

  // 页面格式设置函数（类似官方扩展的 API）
  const setPageFormatCommand = useCallback((format: PageFormatType) => {
    setPageFormat(format);
  }, []);

  // 计算总页数（通过分页符数量+1）
  const getTotalPages = useCallback(() => {
    if (!editor) return 1;
    let pageCount = 1;
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'pageBreak') {
        pageCount++;
      }
      return true;
    });
    return pageCount;
  }, [editor]);

  // 格式化页码文本
  const formatPageNumber = useCallback((page: number, total: number) => {
    return pageNumberFormat
      .replace(/{page}/g, String(page))
      .replace(/{total}/g, String(total));
  }, [pageNumberFormat]);

  // 页面格式样式计算
  const getPageFormatStyle = useMemo(() => {
    // 转换为像素（96 DPI）：1mm ≈ 3.7795px
    const format = PAGE_FORMATS[pageFormat];
    const widthPx = Math.round(format.width * 3.7795);
    const heightPx = Math.round(format.height * 3.7795);
    return {
      maxWidth: `${widthPx}px`,
      width: '100%',
      margin: '0 auto 2rem auto', // 每页之间有间距
      backgroundColor: '#fff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      padding: '40px',
      paddingTop: headerContent ? '80px' : '40px', // 如果有页眉，增加顶部内边距
      paddingBottom: footerContent || showPageNumber ? '80px' : '40px', // 如果有页脚或页码，增加底部内边距
      minHeight: `${heightPx}px`, // 使用页面高度
      pageBreakAfter: 'always' as const, // 打印时分页
      breakAfter: 'page' as const,
      position: 'relative' as const,
    };
  }, [pageFormat, headerContent, footerContent, showPageNumber]);

  const buttonCommon =
    'p-2 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors';

  const renderToolbar = () => {
    if (!editor) return null;
    return (
      <div className="border-b bg-gray-50 p-2 flex items-center space-x-2 flex-wrap gap-2">
        {/* 文本格式 */}
        <div className="flex items-center space-x-1 border-r pr-2">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            disabled={!editor.can().chain().focus().toggleBold().run()}
            className={`${buttonCommon} ${editor.isActive('bold') ? 'bg-gray-300' : ''}`}
            title="粗体 (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            disabled={!editor.can().chain().focus().toggleItalic().run()}
            className={`${buttonCommon} ${editor.isActive('italic') ? 'bg-gray-300' : ''}`}
            title="斜体 (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </button>
        </div>

        {/* 标题 */}
        <div className="flex items-center space-x-1 border-r pr-2">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`${buttonCommon} ${editor.isActive('heading', { level: 1 }) ? 'bg-gray-300' : ''}`}
            title="标题 1"
          >
            <Heading1 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`${buttonCommon} ${editor.isActive('heading', { level: 2 }) ? 'bg-gray-300' : ''}`}
            title="标题 2"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`${buttonCommon} ${editor.isActive('heading', { level: 3 }) ? 'bg-gray-300' : ''}`}
            title="标题 3"
          >
            <Heading3 className="w-4 h-4" />
          </button>
        </div>

        {/* 列表 */}
        <div className="flex items-center space-x-1 border-r pr-2">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`${buttonCommon} ${editor.isActive('bulletList') ? 'bg-gray-300' : ''}`}
            title="项目符号列表"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`${buttonCommon} ${editor.isActive('orderedList') ? 'bg-gray-300' : ''}`}
            title="有序列表"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
            className={`${buttonCommon} ${editor.isActive('taskList') ? 'bg-gray-300' : ''}`}
            title="任务列表"
          >
            <CheckSquare className="w-4 h-4" />
          </button>
        </div>

        {/* 其他格式 */}
        <div className="flex items-center space-x-1 border-r pr-2">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`${buttonCommon} ${editor.isActive('blockquote') ? 'bg-gray-300' : ''}`}
            title="引用块"
          >
            <Quote className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
            className={`${buttonCommon} ${editor.isActive('codeBlock') ? 'bg-gray-300' : ''}`}
            title="代码块"
          >
            <Code className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleImageUpload}
            disabled={isUploading}
            className={`${buttonCommon} ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isUploading ? '上传中...' : '插入图片'}
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className={buttonCommon}
            title="水平线"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        {/* 表格 */}
        <div className="flex items-center space-x-1 border-r pr-2">
          <button
            type="button"
            onClick={() =>
              editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
            }
            className={buttonCommon}
            title="插入表格"
          >
            <TableIcon className="w-4 h-4" />
          </button>
        </div>

        {/* 页面设置（页面格式、页眉页脚页码） */}
        <div className="flex items-center space-x-1 border-r pr-2 relative group">
          <button
            type="button"
            className={`${buttonCommon} flex items-center space-x-1`}
            title="页面设置"
            onClick={(e) => {
              e.stopPropagation();
              // 点击时显示下拉菜单
              const menu = document.getElementById('header-footer-menu');
              if (menu) {
                const isHidden = menu.classList.contains('hidden');
                // 先隐藏所有其他菜单
                document.querySelectorAll('#header-footer-menu').forEach((m) => {
                  m.classList.add('hidden');
                });
                // 切换当前菜单
                if (isHidden) {
                  menu.classList.remove('hidden');
                } else {
                  menu.classList.add('hidden');
                }
              }
            }}
          >
            <FileText className="w-4 h-4" />
            <span className="text-sm">页面设置</span>
          </button>
          <div
            id="header-footer-menu"
            className="hidden absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg p-4 z-50 min-w-[320px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-3">
              {/* 页面格式 */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">页面尺寸</label>
                <select
                  value={pageFormat}
                  onChange={(e) => setPageFormat(e.target.value as PageFormatType)}
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-gray-700"
                >
                  {(Object.keys(PAGE_FORMATS) as PageFormatType[]).map((format) => (
                    <option key={format} value={format}>
                      {PAGE_FORMATS[format].name} ({PAGE_FORMATS[format].width} × {PAGE_FORMATS[format].height} mm)
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="border-t pt-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">页眉内容</label>
                  <input
                    type="text"
                    value={headerContent}
                    onChange={(e) => setHeaderContent(e.target.value)}
                    placeholder="输入页眉内容..."
                    className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-xs text-gray-500 mb-1">页脚内容</label>
                <input
                  type="text"
                  value={footerContent}
                  onChange={(e) => setFooterContent(e.target.value)}
                  placeholder="输入页脚内容..."
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              
              <div>
                <label className="flex items-center space-x-2 text-xs text-gray-700 mb-1">
                  <input
                    type="checkbox"
                    checked={showPageNumber}
                    onChange={(e) => setShowPageNumber(e.target.checked)}
                    className="rounded"
                  />
                  <span>显示页码</span>
                </label>
                {showPageNumber && (
                  <input
                    type="text"
                    value={pageNumberFormat}
                    onChange={(e) => setPageNumberFormat(e.target.value)}
                    placeholder="{page}/{total}"
                    className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 mt-1"
                  />
                )}
                <p className="text-xs text-gray-400 mt-1">
                  使用 {'{page}'} 表示当前页码，{'{total}'} 表示总页数
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 分页符 */}
        <div className="flex items-center space-x-1 border-r pr-2">
          <button
            type="button"
            onClick={() => editor.chain().focus().setPageBreak().run()}
            className={buttonCommon}
            title="插入分页符"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1" />

        {/* 操作 */}
        <div className="flex items-center space-x-1 border-l pl-2">
          <button
            type="button"
            onClick={() => {
              setShowFindReplace(!showFindReplace);
              if (!showFindReplace) {
                setTimeout(() => {
                  const findInput = document.getElementById('find-input') as HTMLInputElement;
                  findInput?.focus();
                }, 100);
              }
            }}
            className={`${buttonCommon} ${showFindReplace ? 'bg-gray-300' : ''}`}
            title="查找替换 (Ctrl+F)"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().setHardBreak().run()}
            className={buttonCommon}
            title="强制换行"
          >
            <span className="text-xs">换行</span>
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().chain().focus().undo().run()}
            className={buttonCommon}
            title="撤销 (Ctrl+Z)"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().chain().focus().redo().run()}
            className={buttonCommon}
            title="重做 (Ctrl+Y)"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-40 flex items-center space-x-2 transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? '保存中...' : '保存'}</span>
          </button>
          {lastSaved && (
            <span className="text-xs text-gray-500">
              已保存: {lastSaved.toLocaleTimeString('zh-CN')}
            </span>
          )}
        </div>
      </div>
    );
  };

  // 图片选择状态
  const [selectedImage, setSelectedImage] = useState<{
    pos: number;
    attrs: { src: string; width?: string; height?: string; alt?: string };
    element?: HTMLElement;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    imagePos?: number;
    isTable?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!editor) return;

    const handleSelectionUpdate = () => {
      const { selection } = editor.state;
      const { $from } = selection;
      
      // 检查当前节点是否是图片
      let imageNode = null;
      let imagePos = -1;
      
      // 检查当前节点
      if ($from.parent.type.name === 'image') {
        imageNode = $from.parent;
        imagePos = $from.before($from.depth);
      } else {
        // 检查相邻节点
        const nodeBefore = $from.nodeBefore;
        const nodeAfter = $from.nodeAfter;
        
        if (nodeBefore && nodeBefore.type.name === 'image') {
          imageNode = nodeBefore;
          imagePos = $from.pos - 1;
        } else if (nodeAfter && nodeAfter.type.name === 'image') {
          imageNode = nodeAfter;
          imagePos = $from.pos;
        }
      }
      
      if (imageNode && imageNode.type.name === 'image') {
        // 如果图片有数据来源，不设置 selectedImage，避免触发其他菜单
        if (imageNode.attrs.dataSource) {
          setSelectedImage(null);
          return;
        }
        
        // 查找对应的 DOM 元素
        const editorElement = editor.view.dom;
        const imageElements = editorElement.querySelectorAll('img');
        let imageElement: HTMLElement | null = null;
        
        // 通过 src 匹配找到对应的图片元素
        imageElements.forEach((img) => {
          if (img.getAttribute('src') === imageNode.attrs.src) {
            imageElement = img as HTMLElement;
          }
        });
        
        setSelectedImage({
          pos: imagePos,
          attrs: imageNode.attrs as any,
          element: imageElement || undefined,
        });
      } else {
        setSelectedImage(null);
      }
    };

    editor.on('selectionUpdate', handleSelectionUpdate);
    editor.on('update', handleSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
      editor.off('update', handleSelectionUpdate);
    };
  }, [editor]);

  const handleReplaceImage = useCallback(async () => {
    if (!editor || !selectedImage) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        alert('不支持的图片格式，仅支持 JPEG、PNG、GIF、WebP');
        return;
      }

      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        alert('图片大小不能超过 10MB');
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);
      try {
        // 压缩图片
        const options = {
          maxSizeMB: 0.5, // 500KB
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: file.type,
        };
        
        const compressedFile = await imageCompression(file, options);
        
        const formData = new FormData();
        formData.append('file', compressedFile, file.name);

        // 使用 XMLHttpRequest 来获取上传进度
        const xhr = new XMLHttpRequest();
        
        const promise = new Promise<{ url: string }>((resolve, reject) => {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded / e.total) * 100);
              setUploadProgress(percentComplete);
            }
          });
          
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText);
                resolve(data);
              } catch (err) {
                reject(new Error('解析响应失败'));
              }
            } else {
              try {
                const data = JSON.parse(xhr.responseText);
                reject(new Error(data.error || '上传失败'));
              } catch {
                reject(new Error(`上传失败: ${xhr.statusText}`));
              }
            }
          });
          
          xhr.addEventListener('error', () => {
            reject(new Error('网络错误'));
          });
          
          xhr.addEventListener('abort', () => {
            reject(new Error('上传已取消'));
          });
        });
        
        xhr.open('POST', '/api/upload/image');
        xhr.send(formData);
        
        const data = await promise;
        setUploadProgress(100);
        const imageUrl = data.url;

        // 替换图片
        editor
          .chain()
          .focus()
          .command(({ tr, state }) => {
            const node = state.doc.nodeAt(selectedImage.pos);
            if (node && node.type.name === 'image') {
              tr.setNodeMarkup(selectedImage.pos, undefined, {
                ...node.attrs,
                src: imageUrl,
              });
              return true;
            }
            return false;
          })
          .run();

        setSelectedImage(null);
      } catch (err: any) {
        console.error('图片替换失败:', err);
        alert(err.message || '图片替换失败，请重试');
      } finally {
        setIsUploading(false);
        setTimeout(() => setUploadProgress(0), 500);
        input.value = '';
      }
    };
    input.click();
  }, [editor, selectedImage]);

  // 更新图片尺寸
  const updateImageSize = useCallback((pos: number, width: number | null, height: number | null) => {
    if (!editor) return;

    editor
      .chain()
      .focus()
      .command(({ tr, state }) => {
        const node = state.doc.nodeAt(pos);
        if (node && node.type.name === 'image') {
          tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            width: width ? `${width}px` : null,
            height: height ? `${height}px` : null,
          });
          return true;
        }
        return false;
      })
      .run();
  }, [editor]);

  const handleRemoveImage = useCallback((imagePos?: number) => {
    if (!editor) return;
    const pos = imagePos ?? selectedImage?.pos;
    if (pos === undefined) return;

    editor
      .chain()
      .focus()
      .command(({ tr }) => {
        tr.delete(pos, pos + 1);
        return true;
      })
      .run();

    setSelectedImage(null);
    setContextMenu(null);
  }, [editor, selectedImage]);

  // 处理右键菜单
  useEffect(() => {
    if (!editor) return;

    const editorElement = editor.view.dom;
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const { selection } = editor.state;
      const hasTextSelection = selection && !selection.empty && selection.from !== selection.to;

      const imageElement = target.closest('img');
      if (imageElement) {
        event.preventDefault();
        setDataSourceMenu(null);
        setActiveDataSourcePanel(null);
        let imagePos = -1;
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'image' && node.attrs.src === imageElement.getAttribute('src')) {
            imagePos = pos;
            return false;
          }
          return true;
        });
        if (imagePos >= 0) {
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
            imagePos,
          });
        }
        return;
      }

      if (hasTextSelection) {
        event.preventDefault();
        const range = { from: selection.from, to: selection.to };
        setContextMenu(null);
        setDataSourceMenu({
          x: event.clientX,
          y: event.clientY,
          targetType: 'text',
          range,
          existingSource: getDataSourceAtRange(range),
        });
        setActiveDataSourcePanel(null);
        return;
      }

      const dsElement = target.closest(`[${DATA_SOURCE_ELEMENT_ATTR}]`) as HTMLElement | null;
      if (dsElement && dsElement.getAttribute(DATA_SOURCE_ELEMENT_ATTR) === 'text') {
        event.preventDefault();
        const range = resolveRangeFromElement(dsElement);
        if (range) {
          setContextMenu(null);
          setDataSourceMenu({
            x: event.clientX,
            y: event.clientY,
            targetType: 'text',
            range,
            existingSource: getDataSourceAtRange(range),
          });
          setActiveDataSourcePanel(null);
          return;
        }
      }

      const cell = target.closest('td, th');
      if (cell) {
        const { $from } = editor.state.selection;
        let isInTable = false;
        for (let i = $from.depth; i > 0; i--) {
          const node = $from.node(i);
          if (node.type.name === 'table') {
            isInTable = true;
            break;
          }
        }
        if (isInTable) {
          event.preventDefault();
          editor.chain().focus().run();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
            isTable: true,
          });
          return;
        }
      }

      setContextMenu(null);
      setDataSourceMenu(null);
      setActiveDataSourcePanel(null);
    };

    editorElement.addEventListener('contextmenu', handleContextMenu);
    return () => {
      editorElement.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [editor, getDataSourceAtRange, resolveRangeFromElement]);

  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;

    const handleDataSourceClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      
      // 如果点击的是弹窗内部，不处理
      if (target.closest('.data-source-popover') || target.closest('.fixed.bg-white.border.rounded-lg.shadow-lg')) {
        return;
      }
      
      // 检查是否是图片，并且有数据来源
      const imgElement = target.closest('img');
      if (imgElement && imgElement.hasAttribute('data-source')) {
        event.preventDefault();
        event.stopPropagation();
        
        let imagePos = -1;
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'image' && node.attrs.src === (imgElement as HTMLImageElement).src) {
            imagePos = pos;
            return false;
          }
          return true;
        });
        if (imagePos >= 0) {
          const existing = getDataSourceForImage(imagePos);
          // 关闭右键菜单（如果有）
          setContextMenu(null);
          // 直接打开对应的修改面板，不显示选择菜单
          setDataSourceMenu({
            x: event.clientX,
            y: event.clientY,
            targetType: 'image',
            imagePos,
            existingSource: existing,
          });
          // 根据现有数据来源类型直接打开对应面板
          if (existing?.type === 'api') {
            hydrateApiForm(existing);
            setActiveDataSourcePanel('api');
          } else {
            // 如果有数据来源但类型不是 api，则打开标签面板；如果没有数据来源，也打开标签面板
            setActiveDataSourcePanel('tag');
          }
        }
        return;
      }
      
      const dsElement = target.closest(`[${DATA_SOURCE_ELEMENT_ATTR}]`) as HTMLElement | null;
      if (!dsElement) return;

      event.preventDefault();
      event.stopPropagation();

      const elementType = dsElement.getAttribute(DATA_SOURCE_ELEMENT_ATTR);
      if (elementType === 'text') {
        const range = resolveRangeFromElement(dsElement);
        if (!range) return;
        const existing = getDataSourceAtRange(range);
        // 关闭右键菜单（如果有）
        setContextMenu(null);
        // 直接打开对应的修改面板，不显示选择菜单
        setDataSourceMenu({
          x: event.clientX,
          y: event.clientY,
          targetType: 'text',
          range,
          existingSource: existing,
        });
        // 根据现有数据来源类型直接打开对应面板
        if (existing?.type === 'api') {
          hydrateApiForm(existing);
          setActiveDataSourcePanel('api');
        } else {
          // 如果有数据来源但类型不是 api，则打开标签面板；如果没有数据来源，也打开标签面板
          setActiveDataSourcePanel('tag');
        }
      } else if (elementType === 'image') {
        let imagePos = -1;
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'image' && node.attrs.src === (dsElement as HTMLImageElement).src) {
            imagePos = pos;
            return false;
          }
          return true;
        });
        if (imagePos >= 0) {
          const existing = getDataSourceForImage(imagePos);
          // 关闭右键菜单（如果有）
          setContextMenu(null);
          // 直接打开对应的修改面板，不显示选择菜单
          setDataSourceMenu({
            x: event.clientX,
            y: event.clientY,
            targetType: 'image',
            imagePos,
            existingSource: existing,
          });
          // 根据现有数据来源类型直接打开对应面板
          if (existing?.type === 'api') {
            hydrateApiForm(existing);
            setActiveDataSourcePanel('api');
          } else {
            // 如果有数据来源但类型不是 api，则打开标签面板；如果没有数据来源，也打开标签面板
            setActiveDataSourcePanel('tag');
          }
        }
      }
    };

    dom.addEventListener('click', handleDataSourceClick);
    return () => {
      dom.removeEventListener('click', handleDataSourceClick);
    };
  }, [editor, getDataSourceAtRange, getDataSourceForImage, hydrateApiForm, resolveRangeFromElement]);

  useEffect(() => {
    if (!editor) return;
    refreshApiDataSources();
  }, [editor, refreshApiDataSources]);

  // 点击外部关闭页眉页脚菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const menu = document.getElementById('header-footer-menu');
      const button = event.target as HTMLElement;
      if (menu && !menu.contains(button) && !button.closest('[title="页面设置"]')) {
        menu.classList.add('hidden');
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // 点击其他地方关闭右键菜单
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // 如果点击的是数据来源弹窗内部，不关闭
      if (target?.closest('.data-source-popover')) {
        return;
      }
      // 如果点击的是右键菜单内部，不关闭（菜单容器已经有 stopPropagation，但为了保险起见还是检查）
      const contextMenuEl = target?.closest('.fixed.bg-white.border.rounded-lg.shadow-lg.py-1');
      if (contextMenuEl) {
        return;
      }
      // 点击外部，关闭所有菜单
      setContextMenu(null);
      setDataSourceMenu(null);
      setActiveDataSourcePanel(null);
    };
    // 延迟绑定，确保 React 事件处理器先注册
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClick);
    }, 0);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClick);
    };
  }, []);

  // 添加图片拖拽调整大小功能
  useEffect(() => {
    if (!editor || !selectedImage || !selectedImage.element) return;

    const img = selectedImage.element;
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'image-resize-handle';
    resizeHandle.style.cssText = `
      position: absolute;
      width: 12px;
      height: 12px;
      background: #3b82f6;
      border: 2px solid white;
      border-radius: 50%;
      cursor: nwse-resize;
      z-index: 1000;
      pointer-events: all;
    `;

    const updateHandlePosition = () => {
      const rect = img.getBoundingClientRect();
      const editorRect = editor.view.dom.getBoundingClientRect();
      resizeHandle.style.left = `${rect.right - editorRect.left - 6}px`;
      resizeHandle.style.top = `${rect.bottom - editorRect.top - 6}px`;
    };

    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      const currentWidth = img.offsetWidth;
      const currentHeight = img.offsetHeight;
      startWidth = currentWidth;
      startHeight = currentHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      e.preventDefault();
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      const newWidth = Math.max(50, startWidth + deltaX);
      const newHeight = Math.max(50, startHeight + deltaY);
      
      // 更新图片显示
      img.style.width = `${newWidth}px`;
      img.style.height = `${newHeight}px`;
      updateHandlePosition();
    };

    const handleMouseUp = () => {
      if (!isResizing) return;
      isResizing = false;
      
      const finalWidth = parseInt(img.style.width) || img.offsetWidth;
      const finalHeight = parseInt(img.style.height) || img.offsetHeight;
      
      // 更新编辑器中的图片尺寸
      updateImageSize(selectedImage.pos, finalWidth, finalHeight);
    };

    resizeHandle.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    const editorContainer = editor.view.dom.parentElement;
    if (editorContainer) {
      editorContainer.style.position = 'relative';
      editorContainer.appendChild(resizeHandle);
      updateHandlePosition();
    }

    return () => {
      resizeHandle.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      resizeHandle.remove();
    };
  }, [editor, selectedImage, updateImageSize]);

  return (
    <div className="h-full flex flex-col bg-white">
      {renderToolbar()}
      {isUploading && (
        <div className="bg-white border-b px-4 py-2">
          <div className="flex items-center space-x-3">
            <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary-600 h-full transition-all duration-300 ease-out"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-sm text-gray-600 min-w-[3rem] text-right">
              {uploadProgress}%
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">正在上传图片...</p>
        </div>
      )}
      {contextMenu && (
        <div
          className="fixed bg-white border rounded-lg shadow-lg py-1 z-50 min-w-[160px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.isTable ? (
            <>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b">
                列操作
              </div>
              <button
                onClick={() => {
                  editor.chain().focus().addColumnBefore().run();
                  setContextMenu(null);
                }}
                disabled={!editor.can().addColumnBefore()}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>在左侧添加列</span>
              </button>
              <button
                onClick={() => {
                  editor.chain().focus().addColumnAfter().run();
                  setContextMenu(null);
                }}
                disabled={!editor.can().addColumnAfter()}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>在右侧添加列</span>
              </button>
              <button
                onClick={() => {
                  editor.chain().focus().deleteColumn().run();
                  setContextMenu(null);
                }}
                disabled={!editor.can().deleteColumn()}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Columns className="w-4 h-4" />
                <span>删除列</span>
              </button>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-t border-b mt-1">
                行操作
              </div>
              <button
                onClick={() => {
                  editor.chain().focus().addRowBefore().run();
                  setContextMenu(null);
                }}
                disabled={!editor.can().addRowBefore()}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>在上方添加行</span>
              </button>
              <button
                onClick={() => {
                  editor.chain().focus().addRowAfter().run();
                  setContextMenu(null);
                }}
                disabled={!editor.can().addRowAfter()}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>在下方添加行</span>
              </button>
              <button
                onClick={() => {
                  editor.chain().focus().deleteRow().run();
                  setContextMenu(null);
                }}
                disabled={!editor.can().deleteRow()}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Rows className="w-4 h-4" />
                <span>删除行</span>
              </button>
              <div className="border-t mt-1" />
              <button
                onClick={() => {
                  editor.chain().focus().deleteTable().run();
                  setContextMenu(null);
                }}
                disabled={!editor.can().deleteTable()}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>删除表格</span>
              </button>
            </>
          ) : (
            <>
              {contextMenu.imagePos !== undefined && (
                <>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b">
                    数据来源
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const existing = getDataSourceForImage(contextMenu.imagePos!);
                      // 从右键菜单触发时，不设置 activeDataSourcePanel，显示选择菜单
                      setDataSourceMenu({
                        x: contextMenu.x,
                        y: contextMenu.y,
                        targetType: 'image',
                        imagePos: contextMenu.imagePos!,
                        existingSource: existing,
                      });
                      setActiveDataSourcePanel(null); // 不直接打开面板，显示选择菜单
                      // 延迟关闭右键菜单，确保数据来源菜单先渲染
                      setTimeout(() => {
                        setContextMenu(null);
                      }, 50);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <TagIcon className="w-4 h-4" />
                    <span>标签值</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      const existing = getDataSourceForImage(contextMenu.imagePos!);
                      hydrateApiForm(existing);
                      // 从右键菜单触发时，直接打开对应的面板
                      setDataSourceMenu({
                        x: contextMenu.x,
                        y: contextMenu.y,
                        targetType: 'image',
                        imagePos: contextMenu.imagePos!,
                        existingSource: existing,
                      });
                      setActiveDataSourcePanel('api');
                      // 延迟关闭右键菜单，确保数据来源菜单先渲染
                      setTimeout(() => {
                        setContextMenu(null);
                      }, 50);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2 border-b"
                  >
                    <Database className="w-4 h-4" />
                    <span>接口数据</span>
                  </button>
                </>
              )}
              <button
                onClick={() => {
                  if (contextMenu.imagePos !== undefined && contextMenu.imagePos >= 0) {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (!file) return;

                      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
                      if (!allowedTypes.includes(file.type)) {
                        alert('不支持的图片格式，仅支持 JPEG、PNG、GIF、WebP');
                        return;
                      }

                      const maxSize = 10 * 1024 * 1024;
                      if (file.size > maxSize) {
                        alert('图片大小不能超过 10MB');
                        return;
                      }

                      setIsUploading(true);
                      setUploadProgress(0);
                      try {
                        // 压缩图片
                        const options = {
                          maxSizeMB: 0.5, // 500KB
                          maxWidthOrHeight: 1920,
                          useWebWorker: true,
                          fileType: file.type,
                        };
                        
                        const compressedFile = await imageCompression(file, options);
                        console.log(`图片压缩: ${(file.size / 1024).toFixed(2)} KB -> ${(compressedFile.size / 1024).toFixed(2)} KB`);

                        const formData = new FormData();
                        formData.append('file', compressedFile, file.name);

                        // 使用 XMLHttpRequest 来获取上传进度
                        const xhr = new XMLHttpRequest();
                        
                        const promise = new Promise<{ url: string }>((resolve, reject) => {
                          xhr.upload.addEventListener('progress', (e) => {
                            if (e.lengthComputable) {
                              const percentComplete = Math.round((e.loaded / e.total) * 100);
                              setUploadProgress(percentComplete);
                            }
                          });
                          
                          xhr.addEventListener('load', () => {
                            if (xhr.status >= 200 && xhr.status < 300) {
                              try {
                                const data = JSON.parse(xhr.responseText);
                                resolve(data);
                              } catch (err) {
                                reject(new Error('解析响应失败'));
                              }
                            } else {
                              try {
                                const data = JSON.parse(xhr.responseText);
                                reject(new Error(data.error || '上传失败'));
                              } catch {
                                reject(new Error(`上传失败: ${xhr.statusText}`));
                              }
                            }
                          });
                          
                          xhr.addEventListener('error', () => {
                            reject(new Error('网络错误'));
                          });
                          
                          xhr.addEventListener('abort', () => {
                            reject(new Error('上传已取消'));
                          });
                        });
                        
                        xhr.open('POST', '/api/upload/image');
                        xhr.send(formData);
                        
                        const data = await promise;
                        setUploadProgress(100);
                        const imageUrl = data.url;

                        updateImageSize(contextMenu.imagePos!, null, null);
                        editor
                          .chain()
                          .focus()
                          .command(({ tr, state }) => {
                            const node = state.doc.nodeAt(contextMenu.imagePos!);
                            if (node && node.type.name === 'image') {
                              tr.setNodeMarkup(contextMenu.imagePos!, undefined, {
                                ...node.attrs,
                                src: imageUrl,
                              });
                              return true;
                            }
                            return false;
                          })
                          .run();

                        setContextMenu(null);
                      } catch (err: any) {
                        console.error('图片替换失败:', err);
                        alert(err.message || '图片替换失败，请重试');
                      } finally {
                        setIsUploading(false);
                        setTimeout(() => setUploadProgress(0), 500);
                        input.value = '';
                      }
                    };
                    input.click();
                  }
                }}
                disabled={isUploading}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 flex items-center space-x-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span>更换图片</span>
              </button>
              <button
                onClick={() => handleRemoveImage(contextMenu.imagePos)}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
              >
                <X className="w-4 h-4" />
                <span>删除图片</span>
              </button>
            </>
          )}
        </div>
      )}
      {/* 选择菜单：只在没有 activeDataSourcePanel 时显示（例如从右键菜单触发时） */}
      {dataSourceMenu && !activeDataSourcePanel && (
        <div
          className="fixed bg-white border rounded-lg shadow-lg py-1 z-50 min-w-[200px] data-source-popover"
          style={getPopoverPosition(dataSourceMenu.x, dataSourceMenu.y, 220, 160, 10, 10)}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b">
            数据来源
          </div>
          <button
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
            onClick={(e) => {
              e.stopPropagation();
              setTagSearch('');
              setActiveDataSourcePanel('tag');
            }}
          >
            <TagIcon className="w-4 h-4" />
            <span>标签值</span>
          </button>
          <button
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
            onClick={(e) => {
              e.stopPropagation();
              hydrateApiForm(dataSourceMenu.existingSource);
              setActiveDataSourcePanel('api');
            }}
          >
            <Database className="w-4 h-4" />
            <span>接口数据</span>
          </button>
          {dataSourceMenu.existingSource && (
            <button
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2 border-t mt-1"
              onClick={(e) => {
                e.stopPropagation();
                removeDataSourceFromTarget(dataSourceMenu);
              }}
            >
              <Trash2 className="w-4 h-4" />
              <span>移除数据来源</span>
            </button>
          )}
        </div>
      )}
      {dataSourceMenu && activeDataSourcePanel === 'tag' && (
        <div
          className="fixed bg-white border rounded-lg shadow-2xl w-[360px] p-4 z-50 data-source-popover"
          style={getPopoverPosition(dataSourceMenu.x, dataSourceMenu.y, 360, 420, 10, 10)}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">选择标签值</p>
              <p className="text-xs text-gray-500">
                当前目标：{dataSourceMenu.targetType === 'image' ? '图片' : '文本'}
              </p>
            </div>
            <button
              onClick={() => {
                setActiveDataSourcePanel(null);
                setDataSourceMenu(null);
              }}
              className="p-1 rounded hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mb-3">
            <input
              type="text"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              placeholder="搜索标签名称..."
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="max-h-64 overflow-y-auto border rounded divide-y">
            {filteredTags.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-500">
                暂无可用标签
              </div>
            ) : (
              filteredTags.map((tag) => (
                <button
                  key={tag._id}
                  className="w-full text-left px-3 py-2 hover:bg-primary-50 space-y-1"
                  onClick={() => handleApplyTag(tag)}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-800">{tag.name}</span>
                    <span className="text-xs text-gray-500 uppercase">{tag.type}</span>
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {tag.description || '无描述'}
                  </div>
                  <div className="text-sm text-gray-700 truncate">
                    {tag.type === 'image' || tag.type === 'cda-image'
                      ? tag.value
                      : formatTagValue(tag)}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              onClick={openQuickTagModal}
              className="inline-flex items-center space-x-2 px-3 py-2 border rounded text-sm text-gray-700 hover:bg-gray-50"
            >
              <PlusCircle className="w-4 h-4" />
              <span>快速添加标签</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveDataSourcePanel(null);
                setDataSourceMenu(null);
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              关闭
            </button>
          </div>
        </div>
      )}
      {dataSourceMenu && activeDataSourcePanel === 'api' && (
        <div
          className="fixed bg-white border rounded-lg shadow-2xl w-[420px] p-4 z-50 data-source-popover"
          style={getPopoverPosition(dataSourceMenu.x, dataSourceMenu.y, 420, 500, 10, 10)}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-gray-800">接口数据</p>
              <p className="text-xs text-gray-500">
                支持 GET / POST，请先测试接口后再应用
              </p>
            </div>
            <button
              onClick={() => {
                setActiveDataSourcePanel(null);
                setDataSourceMenu(null);
              }}
              className="p-1 rounded hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">接口名称（可选）</label>
              <input
                type="text"
                value={apiForm.name}
                onChange={(e) => setApiForm({ ...apiForm, name: e.target.value })}
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">接口地址</label>
              <input
                type="text"
                value={apiForm.url}
                onChange={(e) => setApiForm({ ...apiForm, url: e.target.value })}
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="https://example.com/api"
              />
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-28">
                <label className="text-xs text-gray-500 mb-1 block">请求方式</label>
                <select
                  value={apiForm.method}
                  onChange={(e) =>
                    setApiForm({ ...apiForm, method: e.target.value as ApiFormState['method'] })
                  }
                  className="w-full px-2 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">数据路径（可选）</label>
                <input
                  type="text"
                  value={apiForm.dataPath}
                  onChange={(e) => setApiForm({ ...apiForm, dataPath: e.target.value })}
                  placeholder="如：data.items[0].value"
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">请求头（JSON，可选）</label>
              <textarea
                value={apiForm.headers}
                onChange={(e) => setApiForm({ ...apiForm, headers: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder='{"Authorization":"Bearer ***"}'
              />
            </div>
            {apiForm.method === 'POST' && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">请求体（JSON，可选）</label>
                <textarea
                  value={apiForm.body}
                  onChange={(e) => setApiForm({ ...apiForm, body: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            )}
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={testApiData}
                disabled={isTestingApi}
                className="flex-1 inline-flex items-center justify-center space-x-2 px-3 py-2 border rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <FlaskConical className="w-4 h-4" />
                <span>{isTestingApi ? '测试中...' : '测试接口'}</span>
              </button>
              <button
                type="button"
                onClick={handleApplyApiData}
                disabled={!apiTestResult?.success}
                className="flex-1 inline-flex items-center justify-center space-x-2 px-3 py-2 bg-primary-600 text-white rounded text-sm hover:bg-primary-700 disabled:opacity-40"
              >
                <Plug className="w-4 h-4" />
                <span>应用数据</span>
              </button>
            </div>
            {apiTestResult && (
              <div
                className={`rounded px-3 py-2 text-sm ${
                  apiTestResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                }`}
              >
                {apiTestResult.message}
                {apiTestResult.value && apiTestResult.success && (
                  <div className="mt-1 text-xs text-gray-600 break-words">
                    预览：{apiTestResult.value}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      {quickTagModal && (
        <QuickTagModal
          isOpen
          defaultType={quickTagModal.type}
          initialValue={quickTagModal.initialValue}
          onClose={() => setQuickTagModal(null)}
          onSave={handleQuickTagSave}
        />
      )}
      {showFindReplace && (
        <div className="border-b bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="flex-1 flex items-center space-x-2">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">查找</label>
                <input
                  id="find-input"
                  type="text"
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder="输入要查找的文本..."
                  className="w-full px-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      findNext();
                    } else if (e.key === 'Escape') {
                      setShowFindReplace(false);
                    }
                  }}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">替换为</label>
                <input
                  type="text"
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder="输入替换文本..."
                  className="w-full px-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      replaceCurrent();
                    } else if (e.key === 'Escape') {
                      setShowFindReplace(false);
                    }
                  }}
                />
              </div>
            </div>
            <div className="flex items-end space-x-2">
              <div className="flex flex-col space-y-1">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={findPrevious}
                    disabled={matches.length === 0}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="上一个 (Shift+Enter)"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={findNext}
                    disabled={matches.length === 0}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="下一个 (Enter)"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                <div className="text-xs text-gray-500 text-center">
                  {matchCount > 0 ? `${currentMatchIndex} / ${matchCount}` : '无匹配'}
                </div>
              </div>
              <button
                type="button"
                onClick={replaceCurrent}
                disabled={matches.length === 0 || currentMatchIndex === 0}
                className="px-3 py-1.5 bg-primary-600 text-white rounded text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                替换
              </button>
              <button
                type="button"
                onClick={replaceAll}
                disabled={matches.length === 0}
                className="px-3 py-1.5 bg-primary-600 text-white rounded text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                全部替换
              </button>
              <label className="flex items-center space-x-1 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(e) => setCaseSensitive(e.target.checked)}
                  className="rounded"
                />
                <span>区分大小写</span>
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowFindReplace(false);
                  setFindText('');
                  setReplaceText('');
                  setMatches([]);
                  setMatchCount(0);
                  setCurrentMatchIndex(0);
                }}
                className="p-1.5 rounded hover:bg-gray-100"
                title="关闭 (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto bg-gray-100 p-4">
        <div style={getPageFormatStyle} className="mx-auto relative">
          {/* 页眉 */}
          {headerContent && (
            <div className="page-header-footer page-header">
              {headerContent}
            </div>
          )}
          
          {/* 编辑器内容 */}
          <EditorContent editor={editor} className="h-full" />
          
          {/* 页脚和页码 */}
          {(footerContent || showPageNumber) && (
            <div className="page-header-footer page-footer flex items-center justify-between">
              <div>{footerContent}</div>
              {showPageNumber && (
                <div>
                  {formatPageNumber(1, getTotalPages())}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface QuickTagModalProps {
  isOpen: boolean;
  defaultType: TemplateTag['type'];
  initialValue: string;
  onClose: () => void;
  onSave: (tag: TemplateTag) => void;
}

function QuickTagModal({ isOpen, defaultType, initialValue, onClose, onSave }: QuickTagModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setName('');
    setDescription('');
    setValue(initialValue);
  }, [initialValue, defaultType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('请输入标签名称');
      return;
    }
    const nextTag: TemplateTag = {
      _id: generateTempId(),
      name: name.trim(),
      description: description.trim(),
      type: defaultType,
      value,
    };
    onSave(nextTag);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="快速添加标签"
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            标签名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="请输入标签名称"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">标签描述</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            rows={2}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            标签值（{defaultType === 'image' || defaultType === 'cda-image' ? '图片 URL' : '文本'}）
          </label>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            rows={defaultType === 'image' || defaultType === 'cda-image' ? 2 : 3}
          />
          <p className="text-xs text-gray-500 mt-1">
            将当前选中的内容保存为标签，可在编辑器中反复引用
          </p>
        </div>
        <div className="flex justify-end space-x-3 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border rounded text-sm text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 text-white rounded text-sm hover:bg-primary-700"
          >
            保存并应用
          </button>
        </div>
      </form>
    </Modal>
  );
}
