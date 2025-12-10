'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
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
import Color from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
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
    // 检查 dataSource 属性（Tiptap 会将 data-source 转换为 dataSource）
    if (attrs.dataSource || attrs['data-source']) {
      attrs.class = `${attrs.class || ''} ${DATA_SOURCE_CLASS}`.trim();
      attrs[DATA_SOURCE_ELEMENT_ATTR] = 'image';
      // 确保 data-source 属性被正确输出
      if (attrs.dataSource && !attrs['data-source']) {
        attrs['data-source'] = attrs.dataSource;
      }
      // 确保 data-source-type 属性被正确输出
      if (attrs.dataSourceType && !attrs['data-source-type']) {
        attrs['data-source-type'] = attrs.dataSourceType;
      }
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

// 字体大小扩展
const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element) => {
          const fontSize = element.style.fontSize;
          if (fontSize) {
            return fontSize;
          }
          // 支持中文字体大小（一号、小一、二号、小二等）
          const classList = Array.from(element.classList);
          for (const className of classList) {
            if (className.includes('font-size-')) {
              return className.replace('font-size-', '');
            }
          }
          return null;
        },
        renderHTML: (attributes) => {
          if (!attributes.fontSize) {
            return {};
          }
          // 如果是中文字体大小，使用 class；否则使用 style
          const fontSizeMap: Record<string, string> = {
            '一号': '26pt',
            '小一': '24pt',
            '二号': '22pt',
            '小二': '18pt',
            '三号': '16pt',
            '小三': '15pt',
            '四号': '14pt',
            '小四': '12pt',
            '五号': '10.5pt',
            '小五': '9pt',
            '六号': '7.5pt',
            '小六': '6.5pt',
            '七号': '5.5pt',
            '八号': '5pt',
          };
          const fontSize = fontSizeMap[attributes.fontSize] || attributes.fontSize;
          return {
            style: `font-size: ${fontSize}`,
          };
        },
      },
    };
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setFontSize: (fontSize: string) => ({ chain }: any) => {
        return chain().setMark(this.name, { fontSize }).run();
      },
      unsetFontSize: () => ({ chain }: any) => {
        return chain().setMark(this.name, { fontSize: null }).removeEmptyTextStyle().run();
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
  formatting?: TagFormattingOption | null;
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

type CurveChartDataSource = {
  type: 'curveChart';
  config: import('./tiptap/CurveChartConfigPanel').CurveChartConfig;
  imageUrl?: string;
  // 用于避免重复渲染：由配置 + 关联任务 + 标签值计算出的签名
  inputSignature?: string;
};

type DataSourcePayload = TagDataSource | ApiDataSource | CalculationDataSource | CurveChartDataSource;

interface DataSourceMenuState {
  x: number;
  y: number;
  targetType: 'text' | 'image';
  range?: { from: number; to: number };
  imagePos?: number;
  existingSource?: DataSourcePayload | null;
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

const collectHeadings = (doc: any): HeadingItem[] => {
  const collected: HeadingItem[] = [];
  doc.descendants((node: any, pos: number) => {
    if (node.type?.name === 'heading' && [1, 2, 3].includes(node.attrs?.level)) {
      collected.push({
        id: `h-${pos}-${node.attrs.level}`,
        level: node.attrs.level as 1 | 2 | 3,
        text: (node.textContent || '').trim() || '（空标题）',
        pos,
        endPos: doc.content.size,
      });
    }
    return true;
  });

  collected.forEach((item, index) => {
    const nextBlock = collected
      .slice(index + 1)
      .find((h) => h.level <= item.level);
    item.endPos = nextBlock ? nextBlock.pos : doc.content.size;
  });

  return collected;
};

const getParentKey = (list: HeadingItem[], index: number): string => {
  const current = list[index];
  for (let i = index - 1; i >= 0; i--) {
    if (list[i].level < current.level) {
      return list[i].id;
    }
  }
  return 'root';
};

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
  // 支持 curveChart 类型
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

const formatTooltip = (payload: DataSourcePayload): string => {
  if (payload.type === 'tag') {
    return `标签：${payload.tagName} (${payload.tagType})`;
  }
  if (payload.type === 'calculation') {
    const calcLabels: Record<CalculationDataSource['calculationType'], string> = {
      add: '加法',
      subtract: '减法',
      multiply: '乘法',
      divide: '除法',
      modulo: '取余',
      floor: '取整',
      abs: '取绝对值',
      max: '取最大值',
      min: '取最小值',
      timeDiff: '时间差（天时分）',
    };
    return `运算：${calcLabels[payload.calculationType]} (${payload.tagName1}${payload.tagName2 ? `, ${payload.tagName2}` : ''})`;
  }
  if (payload.type === 'curveChart') {
    return `曲线图：${payload.config.dataType === 'temperature' ? '温度' : '湿度'}`;
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

const parseToDate = (value: any) => {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const date = new Date(normalized);
    return isNaN(date.getTime()) ? null : date;
  }
  return null;
};

const formatDateValue = (value: any, pattern: string) => {
  const date = parseToDate(value);
  if (!date) return typeof value === 'string' ? value : value?.toString() || '';

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  const replaceToken = (input: string, token: string, valueToUse: string) =>
    input.replace(new RegExp(token, 'g'), valueToUse);

  let output = pattern || 'YYYY-MM-DD HH:mm:ss';
  output = replaceToken(output, 'YYYY', year);
  output = replaceToken(output, 'yyyy', year);
  output = replaceToken(output, 'MM', month);
  output = replaceToken(output, 'DD', day);
  output = replaceToken(output, 'dd', day);
  output = replaceToken(output, 'HH', hours);
  output = replaceToken(output, 'mm', minutes);
  output = replaceToken(output, 'ss', seconds);

  return output;
};

const formatTagValue = (tag: TemplateTag, formatting?: TagFormattingOption | null): string => {
  if (
    (tag.type === 'date' || tag.type === 'datetime') &&
    formatting &&
    (formatting.type === 'date' || formatting.type === 'datetime')
  ) {
    return formatDateValue(tag.value, formatting.pattern);
  }

  if (tag.type === 'number' && formatting?.type === 'number') {
    const num = typeof tag.value === 'number' ? tag.value : Number(tag.value);
    if (!Number.isNaN(num)) {
      // 先检查条件判断
      if (formatting.conditions && formatting.conditions.length > 0) {
        for (const condition of formatting.conditions) {
          let matched = false;
          switch (condition.operator) {
            case '>':
              matched = num > condition.value;
              break;
            case '>=':
              matched = num >= condition.value;
              break;
            case '<':
              matched = num < condition.value;
              break;
            case '<=':
              matched = num <= condition.value;
              break;
            case '==':
              matched = num === condition.value;
              break;
          }
          if (matched) {
            return condition.output;
          }
        }
      }
      // 如果没有条件匹配，使用默认的小数位数格式化
      const decimals = Math.max(0, Math.min(20, formatting.decimals ?? 0));
      return num.toFixed(decimals);
    }
  }

  if (tag.type === 'boolean' && formatting?.type === 'boolean') {
    return tag.value ? formatting.trueText : formatting.falseText;
  }

  if (tag.type === 'location' && Array.isArray(tag.value)) {
    // 如果设置了输出数量，返回数组长度
    if (formatting?.type === 'location' && formatting.outputCount) {
      return String(tag.value.length);
    }
    // 处理前缀和后缀
    let result = tag.value;
    if (formatting?.type === 'location') {
      if (formatting.prefix || formatting.suffix) {
        result = tag.value.map((item) => {
          return `${formatting.prefix || ''}${item}${formatting.suffix || ''}`;
        });
      }
    }
    return result.join('、');
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
  FileText,
  Copy,
  FileDown,
  ClipboardList,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Palette,
  Type,
  Highlighter,
} from 'lucide-react';
import Modal from './Modal';
import type { TemplateTag } from './TemplateTagList';
import DataSourceApiPanel from './tiptap/DataSourceApiPanel';
import DataSourceMenu from './tiptap/DataSourceMenu';
import OutlineSidebar from './tiptap/OutlineSidebar';
import TagSelectorPanel, { TagFormattingOption, NumberCondition } from './tiptap/TagSelectorPanel';
import CalculationPanel, { CalculationDataSource } from './tiptap/CalculationPanel';
import CurveChartConfigPanel, { CurveChartConfig } from './tiptap/CurveChartConfigPanel';
import TaskSelectorModal from './tiptap/TaskSelectorModal';
import type { ApiFormState, ApiTestResult, HeadingItem } from './tiptap/types';
import { CellSelection } from '@tiptap/pm/tables';

interface TiptapEditorProps {
  content: string;
  onSave: (markdown: string) => Promise<void>;
  tags: TemplateTag[];
  onChangeTags: (tags: TemplateTag[]) => void;
  templateId?: string;
  templateName?: string;
  initialSelectedTask?: {
    _id: string;
    taskNumber: string;
    taskName: string;
    categoryId: string;
    taskTypeId: string;
  } | null;
  onTaskChange?: (task: {
    _id: string;
    taskNumber: string;
    taskName: string;
    categoryId: string;
    taskTypeId: string;
  } | null) => void;
}

export interface TiptapEditorRef {
  openTaskSelector: () => void;
  selectedTask: {
    _id: string;
    taskNumber: string;
    taskName: string;
    categoryId: string;
    taskTypeId: string;
  } | null;
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
                styleLower.includes('min-height') ||
                styleLower.includes('background') ||
                styleLower.includes('background-color')) {
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

  // 文本对齐规则优化：使用 innerHTML 而不是 content 参数，保留原始 HTML 结构
  turndown.addRule('textAlign', {
    filter: (node) => {
      const element = node as HTMLElement;
      if (!element.style) return false;
      const textAlign = element.style.textAlign || (typeof window !== 'undefined' ? window.getComputedStyle(element).textAlign : '');
      return Boolean(textAlign && ['left', 'center', 'right', 'justify'].includes(textAlign));
    },
    replacement: (content, node) => {
      const element = node as HTMLElement;
      const textAlign = element.style.textAlign || (typeof window !== 'undefined' ? window.getComputedStyle(element).textAlign : '');
      if (!textAlign || textAlign === 'left') {
        return content;
      }
      // 使用 innerHTML 保留原始 HTML 结构，避免 Markdown 语法被重复处理
      const clonedElement = element.cloneNode(true) as HTMLElement;
      clonedElement.style.textAlign = textAlign;
      return clonedElement.outerHTML;
    },
  });

  // 段落对齐处理
  turndown.addRule('paragraphAlign', {
    filter: 'p',
    replacement: (content, node) => {
      const element = node as HTMLElement;
      const textAlign = element.style.textAlign || (typeof window !== 'undefined' ? window.getComputedStyle(element).textAlign : '');
      if (!textAlign || textAlign === 'left') {
        return content;
      }
      // 使用 innerHTML 保留原始 HTML 结构
      const clonedElement = element.cloneNode(true) as HTMLElement;
      clonedElement.style.textAlign = textAlign;
      return clonedElement.outerHTML;
    },
  });

  return turndown;
};

const TiptapEditor = forwardRef<TiptapEditorRef, TiptapEditorProps>(({ content, onSave, tags, onChangeTags, templateId, templateName, initialSelectedTask, onTaskChange }, ref) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [initialMarkdown, setInitialMarkdown] = useState(content || '');
  const [currentMarkdown, setCurrentMarkdown] = useState(content || '');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
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
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [draggingHeadingId, setDraggingHeadingId] = useState<string | null>(null);
  const [dragOverHeadingId, setDragOverHeadingId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [resizingSidebar, setResizingSidebar] = useState(false);
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const [dataSourceMenu, setDataSourceMenu] = useState<DataSourceMenuState | null>(null);
  const [activeDataSourcePanel, setActiveDataSourcePanel] = useState<'tag' | 'api' | 'calculation' | 'curveChart' | null>(null);
  const [curveChartConfig, setCurveChartConfig] = useState<CurveChartConfig | null>(null);
  const [tagSearch, setTagSearch] = useState('');
  const [quickTagModal, setQuickTagModal] = useState<{
    type: TemplateTag['type'];
    initialValue: string;
    dataSourceMenu: DataSourceMenuState;
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
  const [apiTestResult, setApiTestResult] = useState<ApiTestResult>(null);
  const tagsForChartRef = useRef<TemplateTag[]>(tags);
  const tagsValueSignature = useMemo(() => {
    const normalized = tags.map((t) => ({
      id: t._id || t.name,
      name: t.name,
      type: t.type,
      value: t.value,
    }));
    normalized.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
    return JSON.stringify(normalized);
  }, [tags]);

// 为曲线图收集相关的标签快照（只包含配置中引用到的标签，避免无关标签变动导致重渲染）
const buildCurveChartTagSnapshot = (config: CurveChartConfig, allTags: TemplateTag[]) => {
  const relatedIds = new Set<string>();
  if (config.startTimeTagId) relatedIds.add(config.startTimeTagId);
  if (config.endTimeTagId) relatedIds.add(config.endTimeTagId);

  config.lines.forEach((line) => {
    if (line.type === 'curve' && line.locationTags) {
      line.locationTags.forEach((id) => relatedIds.add(id));
    }
    if (line.type === 'average' && line.averageLocationTags) {
      line.averageLocationTags.forEach((id) => relatedIds.add(id));
    }
  });

  (config.phaseNotes || []).forEach((note) => {
    if (note.type === 'region') {
      if (note.startTimeTagId) relatedIds.add(note.startTimeTagId);
      if (note.endTimeTagId) relatedIds.add(note.endTimeTagId);
    } else if (note.type === 'time') {
      if (note.timeTagId) relatedIds.add(note.timeTagId);
    }
  });

  const snapshot = allTags
    .filter((t) => (t._id ? relatedIds.has(t._id) : false))
    .map((t) => ({
      id: t._id,
      name: t.name,
      type: t.type,
      value: t.value,
    }))
    .sort((a, b) => (a.id || '').localeCompare(b.id || ''));

  return snapshot;
};

// 根据曲线图配置、任务ID与“相关标签值快照”生成输入签名，避免未变更时重复渲染
const computeCurveChartInputSignature = (
  config: CurveChartConfig,
  taskId: string | null | undefined,
  allTags: TemplateTag[]
) => {
  const tagSnapshot = buildCurveChartTagSnapshot(config, allTags);
  return JSON.stringify({
    config,
    taskId: taskId || 'none',
    tags: tagSnapshot,
  });
};

  useEffect(() => {
    tagsForChartRef.current = tags;
  }, [tags]);
  
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
  
  // 关联任务状态
  const [selectedTask, setSelectedTask] = useState<{
    _id: string;
    taskNumber: string;
    taskName: string;
    categoryId: string;
    taskTypeId: string;
  } | null>(initialSelectedTask || null);
  const [showTaskSelector, setShowTaskSelector] = useState(false);

  // 同步 initialSelectedTask 的变化到 selectedTask
  useEffect(() => {
    const taskId = initialSelectedTask?._id;
    const currentTaskId = selectedTask?._id;
    
    // 只有当任务ID真正改变时才更新
    if (taskId !== currentTaskId) {
      if (initialSelectedTask) {
        setSelectedTask(initialSelectedTask);
      } else if (initialSelectedTask === null) {
        // 只有当明确传递 null 时才清空（避免 undefined 时误清空）
        setSelectedTask(null);
      }
    }
  }, [initialSelectedTask?._id, selectedTask?._id]); // 只依赖任务ID，避免对象引用变化导致重复更新

  const htmlContent = useMemo(() => {
    try {
      const contentStr = content || '';
      const contentLength = contentStr.length;
      
      // 检查内容大小，避免处理过大的内容导致递归错误
      const MAX_SAFE_SIZE = 5 * 1024 * 1024; // 5MB
      
      if (contentLength > MAX_SAFE_SIZE) {
        console.warn(`[TiptapEditor] Markdown 内容过大 (${(contentLength / 1024 / 1024).toFixed(2)}MB)，使用简化处理`);
        // 对于超大内容，直接返回原始内容（假设已经是 HTML）
        // 或者进行简单的文本处理
        if (contentStr.trim().startsWith('<')) {
          // 如果已经是 HTML，直接返回
          return contentStr;
        }
        // 否则进行最基本的处理
        return contentStr
          .replace(/\n/g, '<br>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');
      }
      
      // 配置 marked 以支持任务列表和 HTML
      // 设置最大嵌套深度，避免递归错误
      const markedOptions: any = {
        breaks: true,
        gfm: true,
        // 限制嵌套深度，避免递归错误
        pedantic: false,
        sanitize: false,
        smartLists: true,
        smartypants: false,
        headerIds: false, // 不生成 header ID
        mangle: false, // 不混淆邮箱地址
      };
      
      let html: string;
      try {
        // marked.parse 在同步模式下返回 string
        html = String(marked.parse(contentStr, markedOptions));
      } catch (markedError: any) {
        // 如果 marked 解析失败（可能是递归错误），尝试使用更安全的配置
        if (markedError.message?.includes('recursion') || markedError.message?.includes('too much')) {
          console.warn('[TiptapEditor] Marked 解析出现递归错误，使用简化配置重试');
          // 使用最简化的配置重试
          html = String(marked.parse(contentStr, {
            breaks: false,
            gfm: false,
            pedantic: false,
          }));
        } else {
          throw markedError;
        }
      }
      
      // 将任务列表的 markdown 语法转换为 HTML
      // - [x] 任务 -> <input type="checkbox" checked>
      // - [ ] 任务 -> <input type="checkbox">
      // 对于大文件，使用更安全的替换方法
      let processedHtml = html;
      
      if (html.length < MAX_SAFE_SIZE) {
        // 小文件可以使用正则表达式
        processedHtml = html
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
      } else {
        // 大文件使用简单的字符串替换
        processedHtml = html
          .replace(/<li>\[x\]\s*/gi, '<li class="task-list-item"><input type="checkbox" checked disabled> ')
          .replace(/<li>\[\s*\]\s*/gi, '<li class="task-list-item"><input type="checkbox" disabled> ');
      }
      
      // 确保表格单元格内的数据来源标记被正确识别
      // 使用临时 DOM 解析器处理表格
      if (typeof window !== 'undefined' && processedHtml.includes('<table')) {
        try {
          // 对于大文件，限制处理的表格数量
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = processedHtml;
          const tables = tempDiv.querySelectorAll('table');
          const maxTables = processedHtml.length > MAX_SAFE_SIZE ? 100 : tables.length;
          
          for (let i = 0; i < Math.min(tables.length, maxTables); i++) {
            const table = tables[i];
            const cells = table.querySelectorAll('td, th');
            const maxCells = processedHtml.length > MAX_SAFE_SIZE ? 1000 : cells.length;
            
            for (let j = 0; j < Math.min(cells.length, maxCells); j++) {
              const cell = cells[j];
              const spans = cell.querySelectorAll('span[data-source]');
              const maxSpans = processedHtml.length > MAX_SAFE_SIZE ? 100 : spans.length;
              
              for (let k = 0; k < Math.min(spans.length, maxSpans); k++) {
                const span = spans[k];
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
              }
            }
          }
          processedHtml = tempDiv.innerHTML;
        } catch (err) {
          console.warn('处理表格数据来源标记时出错:', err);
        }
      }
      
      // 确保 HTML 图片标签被正确解析（marked 默认会转义 HTML）
      // 如果内容中包含 <img> 标签，确保它们不被转义
      return processedHtml;
    } catch (err: any) {
      console.error('Markdown 解析失败', err);
      // 如果解析失败，尝试返回原始内容（可能是 HTML）
      if (err.message?.includes('recursion') || err.message?.includes('too much')) {
        console.warn('[TiptapEditor] 检测到递归错误，返回原始内容');
        // 如果原始内容看起来像 HTML，直接返回
        if (content && content.trim().startsWith('<')) {
          return content;
        }
        // 否则进行最基本的处理
        return (content || '').replace(/\n/g, '<br>');
      }
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
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      FontSize,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: htmlContent,
    editorProps: {
      attributes: {
        class:
          'prose prose-slate max-w-none min-h-[calc(100vh-14rem)] px-4 py-3 focus:outline-none',
      },
    },
  });

  const buildHeadings = useCallback(() => {
    if (!editor) return;
    setHeadings(collectHeadings(editor.state.doc));
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(htmlContent, false);
    setInitialMarkdown(content || '');
    setCurrentMarkdown(content || '');
    buildHeadings();
  }, [editor, htmlContent, content, buildHeadings]);

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
      if (node.isText && node.text) {
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
      buildHeadings();
      
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
  }, [editor, turndown, showFindReplace, findText, caseSensitive, findMatches, buildHeadings]);

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

  const handleExportDocx = useCallback(async () => {
    if (!templateId) {
      alert('无法导出：缺少模板 ID');
      return;
    }
    
    setIsExporting(true);
    setExportProgress(0);
    let progressInterval: NodeJS.Timeout | null = null;
    
    try {
      // 先保存当前内容（如果有更改）
      if (hasChanges && editor) {
        await handleSave();
      }
      
      // 使用 XMLHttpRequest 来获取下载进度
      const xhr = new XMLHttpRequest();
      xhr.responseType = 'blob';
      
      // 根据内容大小估算处理时间
      const contentLength = currentMarkdown.length;
      const contentSizeKB = contentLength / 1024;
      let intervalTime = 200;
      let increment = 2;
      
      // 内容越大，处理时间越长
      if (contentSizeKB < 50) {
        intervalTime = 150;
        increment = 3;
      } else if (contentSizeKB > 200) {
        intervalTime = 300;
        increment = 1.5;
      }
      
      // 模拟服务器处理进度（从 10% 缓慢增长到 90%）
      const PROCESSING_PHASE_MIN = 10;
      let simulatedProgress = PROCESSING_PHASE_MIN;
      progressInterval = setInterval(() => {
        if (simulatedProgress < 90) {
          simulatedProgress += increment;
          setExportProgress(Math.min(simulatedProgress, 90));
        }
      }, intervalTime);
      
      const promise = new Promise<{ blob: Blob; filename: string }>((resolve, reject) => {
        xhr.addEventListener('loadstart', () => {
          setExportProgress(PROCESSING_PHASE_MIN);
        });
        
        xhr.addEventListener('progress', (e) => {
          if (e.lengthComputable && e.total > 0) {
            // 下载阶段占 90-100% 的进度
            const downloadPercent = Math.round((e.loaded / e.total) * 10);
            setExportProgress(Math.min(90 + downloadPercent, 100));
          }
        });
        
        xhr.addEventListener('load', () => {
          // 清除模拟进度
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
          
          if (xhr.status >= 200 && xhr.status < 300) {
            setExportProgress(100);
            
            // 获取文件名
            const contentDisposition = xhr.getResponseHeader('Content-Disposition');
            let filename = templateName || 'document';
            if (contentDisposition) {
              const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
              if (filenameMatch) {
                filename = decodeURIComponent(filenameMatch[1]);
              }
            }
            if (!filename.endsWith('.docx')) {
              filename += '.docx';
            }
            
            resolve({ blob: xhr.response, filename });
          } else {
            try {
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const data = JSON.parse(reader.result as string);
                  reject(new Error(data.error || '导出失败'));
                } catch {
                  reject(new Error(`导出失败: ${xhr.statusText}`));
                }
              };
              reader.readAsText(xhr.response);
            } catch {
              reject(new Error(`导出失败: ${xhr.statusText}`));
            }
          }
        });
        
        xhr.addEventListener('error', () => {
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
          reject(new Error('网络错误'));
        });
        
        xhr.addEventListener('abort', () => {
          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }
          reject(new Error('导出已取消'));
        });
      });
      
      xhr.open('POST', '/api/templates/export-docx');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({
        templateId,
        content: currentMarkdown,
        html: editor?.getHTML?.()
      }));
      
      const { blob, filename } = await promise;
      
      // 下载文件
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
      console.error('导出 DOCX 失败:', err);
      alert(err.message || '导出失败，请重试');
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
      setIsExporting(false);
      setTimeout(() => setExportProgress(0), 500);
    }
  }, [templateId, templateName, currentMarkdown, hasChanges, editor, handleSave]);

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

  const handleNavigateHeading = useCallback(
    (heading: HeadingItem) => {
      if (!editor) return;
      const targetPos = Math.min(heading.pos + 1, editor.state.doc.content.size);
      editor.chain().focus().setTextSelection(targetPos).run();
      const dom = editor.view.nodeDOM(heading.pos);
      if (dom instanceof HTMLElement) {
        dom.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    [editor]
  );

  const handleDeleteHeadingSection = useCallback(
    (headingId: string) => {
      if (!editor) return;
      const target = headings.find((h) => h.id === headingId);
      if (!target) return;
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          tr.delete(target.pos, target.endPos);
          return true;
        })
        .run();
    },
    [editor, headings]
  );

  const moveHeadingSection = useCallback(
    (sourceId: string, targetId: string) => {
      if (!editor) return;
      // 使用最新文档快照，避免使用旧的位置信息导致内容丢失
      const current = collectHeadings(editor.state.doc);
      const sourceIndex = current.findIndex((h) => h.id === sourceId);
      const targetIndex = current.findIndex((h) => h.id === targetId);
      const source = current[sourceIndex];
      const target = current[targetIndex];
      if (!source || !target || source.id === target.id) return;
      if (source.level !== target.level) return;
      // 限制仅在同一父级（更高层级）内移动，避免跨区段吞掉内容
      if (getParentKey(current, sourceIndex) !== getParentKey(current, targetIndex)) {
        return;
      }

      const { state, view } = editor;
      const from = source.pos;
      const to = source.endPos;
      const slice = state.doc.slice(from, to);
      const tr = state.tr;
      tr.delete(from, to);
      // 使用 mapping 来获得删除后的正确插入位置，避免跨越时吞掉区段
      const mappedPos = tr.mapping.map(target.pos);
      tr.insert(mappedPos, slice.content);
      view.dispatch(tr);
      // 移动后立即重建目录，确保下一次拖拽使用最新范围
      buildHeadings();
    },
    [editor, buildHeadings]
  );

  const handleHeadingDragStart = useCallback((headingId: string) => {
    setDraggingHeadingId(headingId);
    setDragOverHeadingId(null);
  }, []);

  const handleHeadingDragOver = useCallback(
    (event: React.DragEvent, target: HeadingItem) => {
      event.preventDefault();
      if (!draggingHeadingId) return;
      const source = headings.find((h) => h.id === draggingHeadingId);
      if (!source || source.level !== target.level) return;
      setDragOverHeadingId(target.id);
    },
    [draggingHeadingId, headings]
  );

  const handleHeadingDrop = useCallback(
    (targetId: string) => {
      if (draggingHeadingId && draggingHeadingId !== targetId) {
        moveHeadingSection(draggingHeadingId, targetId);
      }
      setDraggingHeadingId(null);
      setDragOverHeadingId(null);
    },
    [draggingHeadingId, moveHeadingSection]
  );

  const handleHeadingDragEnd = useCallback(() => {
    setDraggingHeadingId(null);
    setDragOverHeadingId(null);
  }, []);

  const startResizeSidebar = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setResizingSidebar(true);
  }, []);

  useEffect(() => {
    if (!resizingSidebar) return;
    const handleMove = (event: MouseEvent) => {
      const rect = sidebarRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = Math.min(480, Math.max(180, event.clientX - rect.left));
      setSidebarWidth(next);
    };
    const handleUp = () => setResizingSidebar(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [resizingSidebar]);

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
      if (!editor) {
        console.error('applyDataSourceToImage: editor is null');
        return;
      }
      
      console.log('applyDataSourceToImage called:', { pos, nextSrc, payloadType: payload.type });
      
      // 先尝试通过位置查找节点
      let node = editor.state.doc.nodeAt(pos);
      let actualPos = pos;
      const oldSrc = node?.attrs?.src;
      const oldDataSource = node?.attrs?.dataSource;
      
      // 如果通过位置找不到，尝试遍历所有图片节点
      if (!node || node.type.name !== 'image') {
        console.log('Node not found at pos, searching all image nodes...');
        let found = false;
        editor.state.doc.descendants((n, p) => {
          if (n.type.name === 'image') {
            // 优先通过位置匹配
            if (p === pos) {
              node = n;
              actualPos = p;
              found = true;
              return false; // 停止遍历
            }
            // 如果位置不匹配，尝试通过旧的 src 或 dataSource 匹配
            if (oldSrc && n.attrs.src === oldSrc) {
              node = n;
              actualPos = p;
              found = true;
              return false;
            }
            if (oldDataSource && n.attrs.dataSource === oldDataSource) {
              node = n;
              actualPos = p;
              found = true;
              return false;
            }
          }
          return true;
        });
        
        if (!found) {
          console.error('applyDataSourceToImage: Image node not found at pos', pos, 'oldSrc:', oldSrc);
          return;
        }
      }
      
      if (!node || node.type.name !== 'image') {
        console.error('applyDataSourceToImage: Image node not found at pos', pos);
        return;
      }
      
      console.log('Found image node at pos:', actualPos, 'old src:', node.attrs.src);
      
      // 确保 oldSrc 有值（如果之前为 undefined，现在 node 已确认存在）
      const finalOldSrc = oldSrc || node.attrs.src;
      
      // 创建新的属性对象
      const newAttrs = {
        ...node.attrs,
        src: nextSrc || node.attrs.src,
        dataSource: stringifyDataSource(payload),
        dataSourceType: payload.type,
        tooltip: formatTooltip(payload),
      };
      
      // 直接使用事务更新节点
      const tr = editor.state.tr;
      tr.setNodeMarkup(actualPos, undefined, newAttrs);
      editor.view.dispatch(tr);
      
      console.log('Image node updated, new src:', newAttrs.src, 'old src:', finalOldSrc);
      
      // 立即查找并更新 DOM 元素（在事务应用后）
      setTimeout(() => {
        if (!editor) return;
        
        const { view } = editor;
        const editorElement = view.dom;
        const allImages = editorElement.querySelectorAll('img');
        let imgElement: HTMLImageElement | null = null;
        
        // 通过旧的 src 查找图片元素
        allImages.forEach((img) => {
          const imgSrc = img.getAttribute('src');
          // 精确匹配或部分匹配（处理 URL 编码等情况）
          if (imgSrc === finalOldSrc || (finalOldSrc && imgSrc?.includes(finalOldSrc.split('/').pop() || ''))) {
            imgElement = img as HTMLImageElement;
            return;
          }
        });
        
        if (imgElement) {
          console.log('Found DOM img element by old src, updating to:', nextSrc);
          // 强制更新 src，添加时间戳防止缓存
          const urlWithTimestamp = nextSrc + (nextSrc.includes('?') ? '&' : '?') + '_t=' + Date.now();
          
          // 直接更新 src
          imgElement.src = urlWithTimestamp;
          
          // 确保 data-source 属性被正确设置
          const dataSourceStr = stringifyDataSource(payload);
          if (dataSourceStr) {
            imgElement.setAttribute('data-source', dataSourceStr);
            imgElement.setAttribute('data-source-type', payload.type);
            if (formatTooltip(payload)) {
              imgElement.setAttribute('title', formatTooltip(payload));
            }
          }
          
          // 如果时间戳版本加载失败，回退到原始 URL
          imgElement.onerror = () => {
            console.warn('Image with timestamp failed, falling back to original URL');
            if (imgElement) {
              imgElement.src = nextSrc;
            }
          };
          
          // 图片加载成功后，确保视图同步
          imgElement.onload = () => {
            console.log('Image loaded successfully');
          };
        } else {
          console.warn('DOM img element not found by old src:', finalOldSrc, 'trying by position');
          // 如果找不到，尝试通过位置查找
          try {
            const domAtPos = view.domAtPos(actualPos);
            if (domAtPos && domAtPos.node && domAtPos.node.nodeType === 1) {
              const element = domAtPos.node as HTMLElement;
              if (element.tagName === 'IMG') {
                imgElement = element as HTMLImageElement;
              } else {
                imgElement = element.querySelector('img');
              }
              if (imgElement) {
                console.log('Found DOM img element by position, updating src');
                const urlWithTimestamp = nextSrc + (nextSrc.includes('?') ? '&' : '?') + '_t=' + Date.now();
                imgElement.src = urlWithTimestamp;
                
                // 确保 data-source 属性被正确设置
                const dataSourceStr = stringifyDataSource(payload);
                if (dataSourceStr) {
                  imgElement.setAttribute('data-source', dataSourceStr);
                  imgElement.setAttribute('data-source-type', payload.type);
                  if (formatTooltip(payload)) {
                    imgElement.setAttribute('title', formatTooltip(payload));
                  }
                }
              }
            }
          } catch (e) {
            console.error('Error finding DOM element by position:', e);
          }
        }
      }, 0);
    },
    [editor]
  );

  // 页面加载后，恢复所有曲线图数据来源
  useEffect(() => {
    if (!editor || !selectedTask) return;
    
    // 延迟执行，确保 DOM 已更新，并等待任务数据加载完成
    const restoreCurveCharts = async () => {
      if (!editor || !selectedTask) return;
      
      // 检查任务数据是否已加载到 LokiJS
      try {
        const { getCurrentTaskId, getAllTaskDataFromLoki } = await import('@/lib/lokijs');
        const currentTaskId = getCurrentTaskId();
        if (currentTaskId !== selectedTask._id) {
          console.log(`[曲线图恢复] 任务数据未加载，等待中... (任务ID: ${selectedTask._id})`);
          // 如果数据未加载，延迟重试
          setTimeout(restoreCurveCharts, 1000);
          return;
        }
        
        const allData = getAllTaskDataFromLoki(selectedTask._id);
        if (allData.length === 0) {
          console.log(`[曲线图恢复] 任务数据为空，等待中... (任务ID: ${selectedTask._id})`);
          // 如果数据为空，延迟重试
          setTimeout(restoreCurveCharts, 1000);
          return;
        }
      } catch (err) {
        console.error('[曲线图恢复] 检查任务数据失败:', err);
        return;
      }
      
      // 查找所有有曲线图数据来源的图片节点
      const curveChartImages: Array<{
        pos: number;
        config: CurveChartConfig;
        existingInputSignature?: string;
        imageUrl?: string;
      }> = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'image' && node.attrs.dataSource) {
          const dataSource = parseDataSource(node.attrs.dataSource);
          if (dataSource && dataSource.type === 'curveChart' && dataSource.config) {
            curveChartImages.push({
              pos,
              config: dataSource.config,
              existingInputSignature: dataSource.inputSignature,
              imageUrl: dataSource.imageUrl,
            });
          }
        }
        return true;
      });
      
      // 如果有曲线图需要恢复，重新生成它们
      if (curveChartImages.length > 0) {
        console.log(`[曲线图恢复] 发现 ${curveChartImages.length} 个曲线图需要恢复`);
        curveChartImages.forEach(async ({ pos, config, existingInputSignature, imageUrl }) => {
          try {
            const nextSignature = computeCurveChartInputSignature(
              config,
              selectedTask._id,
              tagsForChartRef.current
            );
            // 如果输入参数未变化且已有图片，则跳过重新渲染
            if (existingInputSignature && existingInputSignature === nextSignature && imageUrl) {
              console.log(`[曲线图恢复] 输入未变更，跳过位置 ${pos} 的重渲染`);
              return;
            }

            const { generateCurveChart } = await import('@/lib/generateCurveChart');
            const imageBlob = await generateCurveChart(selectedTask._id, config, tagsForChartRef.current);
            
            // 上传图片到服务器
            const formData = new FormData();
            formData.append('file', imageBlob, 'curve-chart.png');
            
            const response = await fetch('/api/upload/image', {
              method: 'POST',
              body: formData,
            });
            
            if (response.ok) {
              const data = await response.json();
              const imageUrl = data.url;
              
              // 更新图片节点
              const payload: CurveChartDataSource = {
                type: 'curveChart',
                config,
                imageUrl,
              inputSignature: nextSignature,
              };
              
              applyDataSourceToImage(pos, payload, imageUrl);
              console.log(`[曲线图恢复] 成功恢复曲线图，位置: ${pos}`);
            } else {
              console.error(`[曲线图恢复] 上传曲线图失败，位置: ${pos}`);
            }
          } catch (err: any) {
            console.error(`[曲线图恢复] 恢复曲线图失败，位置: ${pos}:`, err);
          }
        });
      }
    };
    
    setTimeout(restoreCurveCharts, 500);
  }, [editor, selectedTask, tagsValueSignature, applyDataSourceToImage]);

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
    (tag: TemplateTag, formatting?: TagFormattingOption | null) => {
      if (!dataSourceMenu) return;
      const textValue = formatTagValue(tag, formatting);
      const payload: TagDataSource = {
        type: 'tag',
        tagId: tag._id || generateTempId(),
        tagName: tag.name,
        tagType: tag.type,
        value: textValue,
        formatting,
      };

      if (dataSourceMenu.targetType === 'text' && dataSourceMenu.range) {
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
      if (!quickTagModal) return;
      const nextTag = { ...tag, _id: tag._id || generateTempId() };
      onChangeTags([...tags, nextTag]);
      const savedDataSourceMenu = quickTagModal.dataSourceMenu;
      setQuickTagModal(null);
      
      // 使用保存的 dataSourceMenu 来应用标签
      setTimeout(() => {
        if (!editor) return;
        
        if (savedDataSourceMenu.targetType === 'text' && savedDataSourceMenu.range) {
          const textValue = formatTagValue(nextTag, null);
          const payload: TagDataSource = {
            type: 'tag',
            tagId: nextTag._id || generateTempId(),
            tagName: nextTag.name,
            tagType: nextTag.type,
            value: textValue,
            formatting: null,
          };
          applyDataSourceToText(savedDataSourceMenu.range, payload, textValue);
        } else if (
          savedDataSourceMenu.targetType === 'image' &&
          typeof savedDataSourceMenu.imagePos === 'number'
        ) {
          if (!IMAGE_DATA_SOURCE_TYPES.includes(nextTag.type)) {
            alert('请选择图片或 CDA 图片类型的标签');
            return;
          }
          if (!nextTag.value) {
            alert('该标签暂无图片，请先在右侧标签列表中上传图片');
            return;
          }
          const payload: TagDataSource = {
            type: 'tag',
            tagId: nextTag._id || generateTempId(),
            tagName: nextTag.name,
            tagType: nextTag.type,
            value: nextTag.value,
            formatting: null,
          };
          applyDataSourceToImage(savedDataSourceMenu.imagePos, payload, nextTag.value);
        }
        setDataSourceMenu(null);
        setActiveDataSourcePanel(null);
      }, 0);
    },
    [quickTagModal, onChangeTags, tags, editor, formatTagValue, applyDataSourceToText, applyDataSourceToImage]
  );

  const openQuickTagModal = useCallback((selectedType?: TemplateTag['type']) => {
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
    // 如果传入了选择的类型，使用该类型；否则根据 targetType 推断
    let type: TemplateTag['type'];
    if (selectedType) {
      type = selectedType;
    } else {
      type = dataSourceMenu.targetType === 'image' ? 'image' : 'text';
    }
    setQuickTagModal({
      type,
      initialValue,
      dataSourceMenu: { ...dataSourceMenu }, // 保存 dataSourceMenu 的副本
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

  // 计算运算结果
  const calculateValue = useCallback(
    (data: CalculationDataSource): string => {
      if (data.calculationType === 'timeDiff') {
        const tag1 = tags.find((t) => t._id === data.tagId1);
        const tag2 = data.tagId2 ? tags.find((t) => t._id === data.tagId2) : null;
        if (!tag1) return '标签1不存在';
        if (!tag2) return '结束时间不存在';

        const start = parseToDate(tag1.value);
        const end = parseToDate(tag2.value);
        if (!start) return '开始时间无效';
        if (!end) return '结束时间无效';

        const diffMs = end.getTime() - start.getTime();
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const days = Math.floor(diffMinutes / (60 * 24));
        const hours = Math.floor((diffMinutes % (60 * 24)) / 60);
        const minutes = diffMinutes % 60;

        const parts: string[] = [];
        if (days !== 0) parts.push(`${days}天`);
        if (hours !== 0) parts.push(`${hours}时`);
        parts.push(`${minutes}分`);
        return parts.join('');
      }

      const tag1 = tags.find((t) => t._id === data.tagId1);
      if (!tag1) return '标签1不存在';

      const val1 = typeof tag1.value === 'number' ? tag1.value : Number(tag1.value);
      if (Number.isNaN(val1)) return '标签1无效数值';

      if (data.tagId2) {
        const tag2 = tags.find((t) => t._id === data.tagId2);
        if (!tag2) return '标签2不存在';

        const val2 = typeof tag2.value === 'number' ? tag2.value : Number(tag2.value);
        if (Number.isNaN(val2)) return '标签2无效数值';

        let result: number;
        switch (data.calculationType) {
          case 'add':
            result = val1 + val2;
            break;
          case 'subtract':
            result = val1 - val2;
            break;
          case 'multiply':
            result = val1 * val2;
            break;
          case 'divide':
            if (val2 === 0) return '除数不能为0';
            result = val1 / val2;
            break;
          case 'modulo':
            if (val2 === 0) return '除数不能为0';
            result = val1 % val2;
            break;
          case 'max':
            result = Math.max(val1, val2);
            break;
          case 'min':
            result = Math.min(val1, val2);
            break;
          default:
            return '未知运算类型';
        }
        return result.toFixed(data.decimals);
      } else {
        let result: number;
        switch (data.calculationType) {
          case 'floor':
            result = Math.floor(val1);
            break;
          case 'abs':
            result = Math.abs(val1);
            break;
          default:
            return '未知运算类型';
        }
        return result.toFixed(data.decimals);
      }
    },
    [tags]
  );

  const handleApplyCalculation = useCallback(
    (data: CalculationDataSource) => {
      if (!dataSourceMenu) return;

      // 重新计算值（确保使用最新的标签值）
      const calculatedValue = calculateValue(data);
      const payload: CalculationDataSource = {
        ...data,
        value: calculatedValue,
      };

      if (dataSourceMenu.targetType === 'text' && dataSourceMenu.range) {
        applyDataSourceToText(dataSourceMenu.range, payload, calculatedValue);
      } else if (
        dataSourceMenu.targetType === 'image' &&
        typeof dataSourceMenu.imagePos === 'number'
      ) {
        // 运算类不支持图片
        alert('运算类仅支持文本目标');
        return;
      }
      setDataSourceMenu(null);
      setActiveDataSourcePanel(null);
    },
    [calculateValue, applyDataSourceToText, dataSourceMenu]
  );

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
          {/* 字体颜色 */}
          <div className="relative group">
            <button
              type="button"
              className={`${buttonCommon} flex items-center space-x-1`}
              title="字体颜色"
              onClick={(e) => {
                e.stopPropagation();
                const menu = document.getElementById('color-menu');
                if (menu) {
                  const isHidden = menu.classList.contains('hidden');
                  document.querySelectorAll('#color-menu').forEach((m) => {
                    m.classList.add('hidden');
                  });
                  if (isHidden) {
                    menu.classList.remove('hidden');
                  } else {
                    menu.classList.add('hidden');
                  }
                }
              }}
            >
              <Palette className="w-4 h-4" />
            </button>
            <div
              id="color-menu"
              className="hidden absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg p-2 z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-8 gap-1">
                {['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFFFFF', '#808080', '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#C0C0C0'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      if (editor) {
                        editor.chain().focus().setColor(color).run();
                        document.getElementById('color-menu')?.classList.add('hidden');
                      }
                    }}
                    className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <input
                type="color"
                onChange={(e) => {
                  if (editor) {
                    editor.chain().focus().setColor(e.target.value).run();
                    document.getElementById('color-menu')?.classList.add('hidden');
                  }
                }}
                className="w-full mt-2 h-8 rounded border"
              />
            </div>
          </div>
          {/* 背景颜色 */}
          <div className="relative group">
            <button
              type="button"
              className={`${buttonCommon} flex items-center space-x-1 ${editor.isActive('highlight') ? 'bg-gray-300' : ''}`}
              title="背景颜色"
              onClick={(e) => {
                e.stopPropagation();
                const menu = document.getElementById('highlight-menu');
                if (menu) {
                  const isHidden = menu.classList.contains('hidden');
                  document.querySelectorAll('#highlight-menu').forEach((m) => {
                    m.classList.add('hidden');
                  });
                  if (isHidden) {
                    menu.classList.remove('hidden');
                  } else {
                    menu.classList.add('hidden');
                  }
                }
              }}
            >
              <Highlighter className="w-4 h-4" />
            </button>
            <div
              id="highlight-menu"
              className="hidden absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg p-2 z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-8 gap-1">
                {['#FFFF00', '#FF0000', '#00FF00', '#0000FF', '#FF00FF', '#00FFFF', '#FFA500', '#FFC0CB', '#808080', '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#C0C0C0'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      if (editor) {
                        editor.chain().focus().toggleHighlight({ color }).run();
                        document.getElementById('highlight-menu')?.classList.add('hidden');
                      }
                    }}
                    className="w-6 h-6 rounded border border-gray-300 hover:scale-110 transition-transform"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
              <input
                type="color"
                onChange={(e) => {
                  if (editor) {
                    editor.chain().focus().toggleHighlight({ color: e.target.value }).run();
                    document.getElementById('highlight-menu')?.classList.add('hidden');
                  }
                }}
                className="w-full mt-2 h-8 rounded border"
              />
            </div>
          </div>
          {/* 字体大小 */}
          <div className="relative group">
            <button
              type="button"
              className={`${buttonCommon} flex items-center space-x-1`}
              title="字体大小"
              onClick={(e) => {
                e.stopPropagation();
                const menu = document.getElementById('font-size-menu');
                if (menu) {
                  const isHidden = menu.classList.contains('hidden');
                  document.querySelectorAll('#font-size-menu').forEach((m) => {
                    m.classList.add('hidden');
                  });
                  if (isHidden) {
                    menu.classList.remove('hidden');
                  } else {
                    menu.classList.add('hidden');
                  }
                }
              }}
            >
              <Type className="w-4 h-4" />
            </button>
            <div
              id="font-size-menu"
              className="hidden absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg p-2 z-50 min-w-[120px]"
              onClick={(e) => e.stopPropagation()}
            >
              {['一号', '小一', '二号', '小二', '三号', '小三', '四号', '小四', '五号', '小五', '六号', '小六', '七号', '八号'].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => {
                    if (editor) {
                      (editor.chain().focus() as any).setFontSize(size).run();
                      document.getElementById('font-size-menu')?.classList.add('hidden');
                    }
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 rounded"
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
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

        {/* 文本对齐 */}
        <div className="flex items-center space-x-1 border-r pr-2">
          <button
            type="button"
            onClick={() => editor && editor.chain().focus().setTextAlign('left').run()}
            className={`${buttonCommon} ${editor?.isActive({ textAlign: 'left' }) ? 'bg-gray-300' : ''}`}
            title="左对齐"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor && editor.chain().focus().setTextAlign('center').run()}
            className={`${buttonCommon} ${editor?.isActive({ textAlign: 'center' }) ? 'bg-gray-300' : ''}`}
            title="居中"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor && editor.chain().focus().setTextAlign('right').run()}
            className={`${buttonCommon} ${editor?.isActive({ textAlign: 'right' }) ? 'bg-gray-300' : ''}`}
            title="右对齐"
          >
            <AlignRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => editor && editor.chain().focus().setTextAlign('justify').run()}
            className={`${buttonCommon} ${editor?.isActive({ textAlign: 'justify' }) ? 'bg-gray-300' : ''}`}
            title="两端对齐"
          >
            <AlignJustify className="w-4 h-4" />
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
            onClick={() => editor && (editor.chain().focus() as any).setPageBreak().run()}
            className={buttonCommon}
            title="插入分页符"
          >
            <Copy className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1" />

        {/* 操作 */}
        <div className="flex items-center space-x-1 border-l pl-2">
          {templateId && (
            <button
              type="button"
              onClick={handleExportDocx}
              disabled={isExporting}
              className={`${buttonCommon} ${isExporting ? 'opacity-50 cursor-not-allowed' : ''}`}
              title="导出为 Word 文档"
            >
              <FileDown className="w-4 h-4" />
            </button>
          )}
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
    cellBackground?: string;
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

  // 更新选中单元格背景色
  const setCellBackground = useCallback(
    (color: string | null) => {
      if (!editor) return;
      const existingStyle = editor.getAttributes('tableCell')?.style as string | undefined;
      const stripBackground = (style: string) =>
        style
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s && !s.toLowerCase().startsWith('background-color'));
      const baseParts = existingStyle ? stripBackground(existingStyle) : [];
      if (color) {
        baseParts.push(`background-color: ${color}`);
      }
      const nextStyle = baseParts.length > 0 ? baseParts.join('; ') : null;
      editor.chain().focus().setCellAttribute('style', nextStyle).run();
    },
    [editor]
  );

  // 通过 imagePos 替换图片
  const handleReplaceImageByPos = useCallback(async (imagePos: number) => {
    if (!editor || imagePos < 0) return;

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
        updateImageSize(imagePos, null, null);
        editor
          .chain()
          .focus()
          .command(({ tr, state }) => {
            const node = state.doc.nodeAt(imagePos);
            if (node && node.type.name === 'image') {
              tr.setNodeMarkup(imagePos, undefined, {
                ...node.attrs,
                src: imageUrl,
              });
              return true;
            }
            return false;
          })
          .run();

        setSelectedImage(null);
        setDataSourceMenu(null);
        setActiveDataSourcePanel(null);
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
  }, [editor, updateImageSize]);

  const handleReplaceImage = useCallback(async () => {
    if (!editor || !selectedImage) return;
    await handleReplaceImageByPos(selectedImage.pos);
  }, [editor, selectedImage, handleReplaceImageByPos]);

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
      const isCellSel = selection instanceof CellSelection;
      const hasTextSelection = !isCellSel && selection && !selection.empty && selection.from !== selection.to;

      const imageElement = target.closest('img');
      if (imageElement) {
        event.preventDefault();
        setContextMenu(null);
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
          const existing = getDataSourceForImage(imagePos);
          setDataSourceMenu({
            x: event.clientX,
            y: event.clientY,
            targetType: 'image',
            imagePos,
            existingSource: existing,
          });
          // 只要命中图片即走数据来源菜单
          return;
        }
      }

      if (isCellSel) {
        event.preventDefault();
        editor.chain().focus().run();
        setContextMenu({
          x: event.clientX,
          y: event.clientY,
          isTable: true,
          cellBackground: undefined,
        });
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
            cellBackground:
              (cell as HTMLElement).style.backgroundColor ||
              window.getComputedStyle(cell as HTMLElement).backgroundColor,
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
      if (imgElement) {
        // 检查 DOM 元素是否有 data-source 属性，或者检查节点属性
        const hasDataSourceAttr = imgElement.hasAttribute('data-source');
        
        // 尝试通过 DOM 元素找到对应的节点位置
        let imagePos = -1;
        const imgSrc = (imgElement as HTMLImageElement).src;
        // 移除时间戳参数进行匹配
        const baseSrc = imgSrc.split('?')[0].split('&')[0];
        
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'image') {
            const nodeSrc = node.attrs.src || '';
            const nodeBaseSrc = nodeSrc.split('?')[0].split('&')[0];
            // 匹配基础 URL（不包含查询参数）
            if (nodeBaseSrc === baseSrc || nodeSrc === imgSrc) {
              // 检查节点是否有数据来源
              if (node.attrs.dataSource || hasDataSourceAttr) {
                imagePos = pos;
                return false;
              }
            }
          }
          return true;
        });
        
        if (imagePos >= 0) {
          const existing = getDataSourceForImage(imagePos);
          // 如果有数据来源（节点属性或 DOM 属性），才打开编辑面板
          if (existing || hasDataSourceAttr) {
            console.log('[数据来源点击] 检测到图片数据来源，打开编辑面板', {
              imagePos,
              hasDataSourceAttr,
              existingType: existing?.type,
            });
            event.preventDefault();
            event.stopPropagation();
            
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
            } else if (existing?.type === 'curveChart') {
              setCurveChartConfig(existing.config);
              setActiveDataSourcePanel('curveChart');
            } else {
              // 如果有数据来源但类型不是 api 或 curveChart，则打开标签面板；如果没有数据来源，也打开标签面板
              setActiveDataSourcePanel('tag');
            }
            return;
          } else {
            console.log('[数据来源点击] 图片没有数据来源', { imagePos, hasDataSourceAttr });
          }
        } else {
          console.log('[数据来源点击] 未找到图片节点位置', { imgSrc, baseSrc });
        }
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
          if (existing && existing.type === 'api') {
            hydrateApiForm(existing);
            setActiveDataSourcePanel('api');
          } else if (existing && existing.type === 'calculation') {
            setActiveDataSourcePanel('calculation');
          } else if (existing && existing.type === 'curveChart') {
            setCurveChartConfig(existing.config);
            setActiveDataSourcePanel('curveChart');
          } else {
            // 如果有数据来源但类型不是 api、calculation 或 curveChart，则打开标签面板；如果没有数据来源，也打开标签面板
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
          if (existing && existing.type === 'api') {
            hydrateApiForm(existing);
            setActiveDataSourcePanel('api');
          } else if (existing && existing.type === 'calculation') {
            setActiveDataSourcePanel('calculation');
          } else if (existing && existing.type === 'curveChart') {
            setCurveChartConfig(existing.config);
            setActiveDataSourcePanel('curveChart');
          } else {
            // 如果有数据来源但类型不是 api、calculation 或 curveChart，则打开标签面板；如果没有数据来源，也打开标签面板
            setActiveDataSourcePanel('tag');
          }
        }
      }
    };

    dom.addEventListener('click', handleDataSourceClick);
    return () => {
      dom.removeEventListener('click', handleDataSourceClick);
    };
  }, [editor, getDataSourceAtRange, getDataSourceForImage, hydrateApiForm, resolveRangeFromElement, setCurveChartConfig]);

  useEffect(() => {
    if (!editor) return;
    refreshApiDataSources();
  }, [editor, refreshApiDataSources]);

  // 同步标签值变化到文档中的数据来源
  const prevTagsRef = useRef<TemplateTag[]>(tags);
  useEffect(() => {
    if (!editor) return;
    
    // 比较标签值变化，找出改变的标签（通过 tagId 匹配）
    const changedTags: TemplateTag[] = [];
    tags.forEach((tag) => {
      if (!tag._id) return;
      const prevTag = prevTagsRef.current.find((t) => t._id === tag._id);
      if (!prevTag) {
        // 新标签，不需要更新文档（文档中还没有使用它）
        return;
      }
      // 深度比较值是否改变
      let valueChanged = false;
      if (Array.isArray(tag.value) && Array.isArray(prevTag.value)) {
        valueChanged = JSON.stringify(tag.value) !== JSON.stringify(prevTag.value);
      } else {
        valueChanged = tag.value !== prevTag.value;
      }
      if (valueChanged) {
        changedTags.push(tag);
      }
    });

    if (changedTags.length === 0) {
      prevTagsRef.current = tags;
      return;
    }

    // 遍历文档，找到所有使用这些标签的数据来源并更新
    const markType = editor.state.schema.marks.dataSource;
    const updates: Array<
      | { kind: 'text'; range: { from: number; to: number }; payload: TagDataSource | CalculationDataSource }
      | { kind: 'image'; pos: number; payload: TagDataSource }
    > = [];
    const visitedRanges = new Set<string>();

    editor.state.doc.descendants((node, pos) => {
      // 处理文本节点中的数据来源标记
      if (node.isText && markType) {
        const mark = markType.isInSet(node.marks);
        if (mark) {
          const payload = parseDataSource(mark.attrs.data);
          if (payload?.type === 'tag') {
            const tagPayload = payload as TagDataSource;
            const changedTag = changedTags.find((t) => t._id === tagPayload.tagId);
            if (changedTag) {
              const range = getMarkRange(editor.state.doc.resolve(pos), markType);
              if (range) {
                const key = `${range.from}-${range.to}`;
                if (!visitedRanges.has(key)) {
                  visitedRanges.add(key);
                  const updatedPayload: TagDataSource = {
                    ...tagPayload,
                    tagName: changedTag.name,
                    tagType: changedTag.type,
                    value: formatTagValue(changedTag, tagPayload.formatting),
                  };
                  updates.push({ kind: 'text', range, payload: updatedPayload });
                }
              }
            }
          } else if (payload?.type === 'calculation') {
            const calcPayload = payload as CalculationDataSource;
            // 检查运算类是否使用了变化的标签
            const usesChangedTag =
              changedTags.some((t) => t._id === calcPayload.tagId1) ||
              (calcPayload.tagId2 && changedTags.some((t) => t._id === calcPayload.tagId2));
            if (usesChangedTag) {
              const range = getMarkRange(editor.state.doc.resolve(pos), markType);
              if (range) {
                const key = `${range.from}-${range.to}`;
                if (!visitedRanges.has(key)) {
                  visitedRanges.add(key);
                  // 重新计算值
                  const recalculatedValue = calculateValue(calcPayload);
                  const updatedPayload: CalculationDataSource = {
                    ...calcPayload,
                    value: recalculatedValue,
                  };
                  updates.push({ kind: 'text', range, payload: updatedPayload });
                }
              }
            }
          }
        }
      }
      // 处理图片节点中的数据来源
      else if (node.type.name === 'image' && node.attrs.dataSource) {
        const payload = parseDataSource(node.attrs.dataSource);
        if (payload?.type === 'tag') {
          const tagPayload = payload as TagDataSource;
          const changedTag = changedTags.find((t) => t._id === tagPayload.tagId);
          if (changedTag) {
            const updatedPayload: TagDataSource = {
              ...tagPayload,
              tagName: changedTag.name,
              tagType: changedTag.type,
              value: changedTag.value,
            };
            updates.push({ kind: 'image', pos, payload: updatedPayload });
          }
        }
      }
      return true;
    });

    // 批量更新文档
    if (updates.length > 0) {
      editor.chain().focus().command(({ tr, state }) => {
        // 从后往前更新，避免位置偏移
        const sortedUpdates = [...updates].sort((a, b) => {
          const posA = a.kind === 'text' ? a.range.from : a.pos;
          const posB = b.kind === 'text' ? b.range.from : b.pos;
          return posB - posA;
        });

        sortedUpdates.forEach((update) => {
          if (update.kind === 'text') {
            const { range, payload } = update;
            let displayValue: string;
            if (payload.type === 'tag') {
              const tag = tags.find((t) => t._id === payload.tagId);
              if (!tag) return;
              displayValue = formatTagValue(tag, payload.formatting);
            } else if (payload.type === 'calculation') {
              displayValue = payload.value;
            } else {
              return;
            }
            tr.insertText(displayValue, range.from, range.to);
            if (markType) {
              const mark = markType.create({
                data: stringifyDataSource(payload),
                sourceType: payload.type,
                tooltip: formatTooltip(payload),
              });
              tr.addMark(range.from, range.from + displayValue.length, mark);
            }
          } else if (update.kind === 'image') {
            const { pos, payload } = update;
            const node = state.doc.nodeAt(pos);
            if (node && node.type.name === 'image') {
              const tag = tags.find((t) => t._id === payload.tagId);
              const nextSrc = tag?.value || node.attrs.src;
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                src: nextSrc,
                dataSource: stringifyDataSource(payload),
                dataSourceType: payload.type,
                tooltip: formatTooltip(payload),
              });
            }
          }
        });
        return true;
      }).run();
    }

    prevTagsRef.current = tags;
  }, [tags, editor, formatTagValue, calculateValue]);

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
      if (!target) return;
      
      // 如果点击的是数据来源弹窗内部，不关闭
      const popover = target.closest('.data-source-popover');
      if (popover) {
        return;
      }
      
      // 如果点击的是曲线图线条编辑表单（独立弹窗），不关闭
      // 检查所有可能的父元素（包括当前元素）
      let currentElement: HTMLElement | null = target;
      while (currentElement && currentElement !== document.body) {
        // 检查 data 属性
        if (currentElement.hasAttribute('data-curve-chart-line-form') ||
            currentElement.hasAttribute('data-curve-chart-line-form-content')) {
          return;
        }
        // 检查类名
        if (currentElement.classList && currentElement.classList.contains('data-source-popover')) {
          return;
        }
        currentElement = currentElement.parentElement;
      }
      
      // 使用 closest 作为备用检查
      const lineFormElement = target.closest('[data-curve-chart-line-form="true"]') ||
                              target.closest('[data-curve-chart-line-form-content="true"]') ||
                              target.closest('.data-source-popover');
      if (lineFormElement) {
        return;
      }
      
      // 如果点击的是添加线条按钮、菜单或其父元素，不关闭
      const addLineElement = target.closest('[data-curve-chart-add-line="true"]') ||
                            target.closest('[data-curve-chart-add-line-button="true"]') ||
                            target.closest('[data-curve-chart-add-line-menu="true"]');
      if (addLineElement) {
        return;
      }
      
      // 如果点击的是右键菜单内部，不关闭（菜单容器已经有 stopPropagation，但为了保险起见还是检查）
      const contextMenuEl = target.closest('.fixed.bg-white.border.rounded-lg.shadow-lg.py-1');
      if (contextMenuEl) {
        return;
      }
      
      // 检查是否点击了设置按钮或其内部的 SVG 元素
      const settingsButton = target.closest('button[title="格式化设置"]');
      if (settingsButton) {
        return;
      }
      
      // 检查是否点击了关闭格式化设置的按钮
      const closeFormattingButton = target.closest('button[title="关闭格式化设置"]');
      if (closeFormattingButton) {
        return;
      }
      
      // 点击外部，关闭所有菜单
      setContextMenu(null);
      setDataSourceMenu(null);
      setActiveDataSourcePanel(null);
    };
    // 延迟绑定，确保 React 事件处理器先注册
    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClick, true); // 使用 capture 模式，但会在检查中排除弹窗
    }, 100); // 增加延迟，确保 React 事件处理完成
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClick, true);
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

  // 处理任务选择
  const handleTaskSelect = async (task: {
    _id: string;
    taskNumber: string;
    taskName: string;
    categoryId: string;
    taskTypeId: string;
  }) => {
    setSelectedTask(task);
    setShowTaskSelector(false);
    
    // 加载任务数据到 LokiJS
    try {
      const { getAllCachedData } = await import('@/lib/cache');
      const { loadTaskDataToLoki } = await import('@/lib/lokijs');
      
      console.log(`[任务关联] 开始加载任务数据到 LokiJS (任务ID: ${task._id})`);
      const allData = await getAllCachedData(task._id);
      
      if (allData.length > 0) {
        await loadTaskDataToLoki(task._id, allData);
        console.log(`[任务关联] 成功加载 ${allData.length} 条数据到 LokiJS`);
      } else {
        console.warn(`[任务关联] 任务 ${task._id} 在 IndexedDB 中没有数据`);
      }
    } catch (error) {
      console.error('[任务关联] 加载数据到 LokiJS 失败:', error);
    }
    
    onTaskChange?.(task);
  };

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    openTaskSelector: () => {
      setShowTaskSelector(true);
    },
    selectedTask,
  }));

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
      {isExporting && (
        <div className="bg-white border-b px-4 py-2">
          <div className="flex items-center space-x-3">
            <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary-600 h-full transition-all duration-300 ease-out"
                style={{ width: `${exportProgress}%` }}
              />
            </div>
            <span className="text-sm text-gray-600 min-w-[3rem] text-right">
              {exportProgress}%
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {exportProgress < 10 
              ? '正在准备导出...' 
              : exportProgress < 90 
              ? '正在生成 Word 文档...' 
              : exportProgress < 100
              ? '正在下载文件...'
              : '导出完成'}
          </p>
        </div>
      )}
      {contextMenu && contextMenu.isTable && (
        <div
          className="fixed bg-white border rounded-lg shadow-lg py-1 z-50 min-w-[160px]"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b">
            列操作
          </div>
          <button
            onClick={() => {
              editor?.chain().focus().addColumnBefore().run();
              setContextMenu(null);
            }}
            disabled={!editor?.can().addColumnBefore()}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>在左侧添加列</span>
          </button>
          <button
            onClick={() => {
              editor?.chain().focus().addColumnAfter().run();
              setContextMenu(null);
            }}
            disabled={!editor?.can().addColumnAfter()}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>在右侧添加列</span>
          </button>
          <button
            onClick={() => {
              editor?.chain().focus().deleteColumn().run();
              setContextMenu(null);
            }}
            disabled={!editor?.can().deleteColumn()}
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
              editor?.chain().focus().addRowBefore().run();
              setContextMenu(null);
            }}
            disabled={!editor?.can().addRowBefore()}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>在上方添加行</span>
          </button>
          <button
            onClick={() => {
              editor?.chain().focus().addRowAfter().run();
              setContextMenu(null);
            }}
            disabled={!editor?.can().addRowAfter()}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>在下方添加行</span>
          </button>
          <button
            onClick={() => {
              editor?.chain().focus().deleteRow().run();
              setContextMenu(null);
            }}
            disabled={!editor?.can().deleteRow()}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Rows className="w-4 h-4" />
            <span>删除行</span>
          </button>
          <div className="border-t mt-1" />
          <button
            onClick={() => {
              editor?.chain().focus().deleteTable().run();
              setContextMenu(null);
            }}
            disabled={!editor?.can().deleteTable()}
            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>删除表格</span>
          </button>
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-t border-b mt-1">
            单元格
          </div>
          <button
            onClick={() => {
              editor?.chain().focus().mergeCells().run();
              setContextMenu(null);
            }}
            disabled={!editor?.can().mergeCells()}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Columns className="w-4 h-4" />
            <span>合并单元格</span>
          </button>
          <button
            onClick={() => {
              editor?.chain().focus().splitCell().run();
              setContextMenu(null);
            }}
            disabled={!editor?.can().splitCell()}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            <Rows className="w-4 h-4" />
            <span>拆分单元格</span>
          </button>
          <div className="px-3 py-2 text-xs text-gray-500 border-t">
            单元格背景色
          </div>
          <div className="px-3 pb-3 flex flex-wrap gap-2">
            {['#ffffff', '#fef3c7', '#e0f2fe', '#ecfeff', '#f3e8ff', '#fee2e2', '#dcfce7', '#e5e7eb'].map(
              (color) => (
                <button
                  key={color}
                  onClick={() => {
                    setCellBackground(color === '#ffffff' ? null : color);
                    setContextMenu(null);
                  }}
                  className={`w-6 h-6 rounded border ${contextMenu.cellBackground === color ? 'ring-2 ring-primary-500' : 'border-gray-300'}`}
                  style={{ backgroundColor: color }}
                  title={color === '#ffffff' ? '默认' : color}
                />
              )
            )}
            <button
              onClick={() => {
                setCellBackground(null);
                setContextMenu(null);
              }}
              className="px-2 py-1 text-xs border rounded text-gray-700 hover:bg-gray-100"
            >
              重置
            </button>
          </div>
        </div>
      )}
      {/* 选择菜单：只在没有 activeDataSourcePanel 时显示（例如从右键菜单触发时） */}
      {dataSourceMenu && !activeDataSourcePanel && (
        <DataSourceMenu
          position={getPopoverPosition(dataSourceMenu.x, dataSourceMenu.y, 220, 160, 10, 10)}
          hasExistingSource={Boolean(dataSourceMenu.existingSource)}
          targetType={dataSourceMenu.targetType}
          onSelectTag={() => {
            setTagSearch('');
            setActiveDataSourcePanel('tag');
          }}
          onSelectApi={() => {
            hydrateApiForm(dataSourceMenu.existingSource);
            setActiveDataSourcePanel('api');
          }}
          onSelectCalculation={() => {
            setActiveDataSourcePanel('calculation');
          }}
          onSelectCurveChart={
            dataSourceMenu.targetType === 'image'
              ? () => {
                  const existing = dataSourceMenu.existingSource;
                  if (existing && existing.type === 'curveChart') {
                    setCurveChartConfig(existing.config);
                  } else {
                    setCurveChartConfig(null);
                  }
                  setActiveDataSourcePanel('curveChart');
                }
              : undefined
          }
          onRemove={dataSourceMenu.existingSource ? () => removeDataSourceFromTarget(dataSourceMenu) : undefined}
          onReplaceImage={
            dataSourceMenu.targetType === 'image' && typeof dataSourceMenu.imagePos === 'number'
              ? () => handleReplaceImageByPos(dataSourceMenu.imagePos!)
              : undefined
          }
          onRemoveImage={
            dataSourceMenu.targetType === 'image' && typeof dataSourceMenu.imagePos === 'number'
              ? () => {
                  handleRemoveImage(dataSourceMenu.imagePos);
                  setDataSourceMenu(null);
                  setActiveDataSourcePanel(null);
                }
              : undefined
          }
          isUploading={isUploading}
        />
      )}
      {dataSourceMenu && activeDataSourcePanel === 'tag' && (
        <TagSelectorPanel
          position={getPopoverPosition(dataSourceMenu.x, dataSourceMenu.y, 360, 420, 10, 10)}
          targetType={dataSourceMenu.targetType}
          filteredTags={filteredTags}
          tagSearch={tagSearch}
          onTagSearchChange={setTagSearch}
          onApplyTag={handleApplyTag}
          onOpenQuickAdd={openQuickTagModal}
          onClose={() => {
            setActiveDataSourcePanel(null);
            setDataSourceMenu(null);
          }}
          formatTagValue={formatTagValue}
          existingSource={
            dataSourceMenu.existingSource?.type === 'tag' ? dataSourceMenu.existingSource : null
          }
        />
      )}
      {dataSourceMenu && activeDataSourcePanel === 'api' && (
        <DataSourceApiPanel
          position={getPopoverPosition(dataSourceMenu.x, dataSourceMenu.y, 420, 500, 10, 10)}
          apiForm={apiForm}
          isTesting={isTestingApi}
          testResult={apiTestResult}
          onChangeForm={(patch) => setApiForm({ ...apiForm, ...patch })}
          onTest={testApiData}
          onApply={handleApplyApiData}
          onClose={() => {
            setActiveDataSourcePanel(null);
            setDataSourceMenu(null);
          }}
        />
      )}
      {dataSourceMenu && activeDataSourcePanel === 'calculation' && (
        <CalculationPanel
          position={getPopoverPosition(dataSourceMenu.x, dataSourceMenu.y, 420, 500, 10, 10)}
          targetType={dataSourceMenu.targetType}
          tags={tags}
          onApply={handleApplyCalculation}
          onClose={() => {
            setActiveDataSourcePanel(null);
            setDataSourceMenu(null);
          }}
          existingSource={
            dataSourceMenu.existingSource?.type === 'calculation' ? dataSourceMenu.existingSource : null
          }
        />
      )}
      {dataSourceMenu && activeDataSourcePanel === 'curveChart' && dataSourceMenu.targetType === 'image' && (
        <CurveChartConfigPanel
          position={getPopoverPosition(dataSourceMenu.x, dataSourceMenu.y, 500, 600, 10, 10)}
          tags={tags}
          selectedTaskId={selectedTask?._id || null}
          config={curveChartConfig}
          onChange={setCurveChartConfig}
          onApply={async () => {
            if (!curveChartConfig || !selectedTask || typeof dataSourceMenu.imagePos !== 'number') {
              alert('请先配置曲线图参数并关联任务');
              return;
            }
            try {
              const nextSignature = computeCurveChartInputSignature(
                curveChartConfig,
                selectedTask._id,
                tags
              );

              const existingCurve =
                dataSourceMenu.existingSource && dataSourceMenu.existingSource.type === 'curveChart'
                  ? (dataSourceMenu.existingSource as CurveChartDataSource)
                  : null;

              // 输入未发生变化且已有图片，直接复用，避免重复渲染
              if (
                existingCurve &&
                existingCurve.inputSignature === nextSignature &&
                existingCurve.imageUrl
              ) {
                applyDataSourceToImage(dataSourceMenu.imagePos, existingCurve, existingCurve.imageUrl);
                setActiveDataSourcePanel(null);
                setDataSourceMenu(null);
                setCurveChartConfig(null);
                return;
              }

              setIsUploading(true);
              setUploadProgress(0);
              
              // 调用 API 生成曲线图
              // 在客户端生成曲线图
              const { generateCurveChart } = await import('@/lib/generateCurveChart');
              const imageBlob = await generateCurveChart(
                selectedTask._id,
                curveChartConfig,
                tags
              );

              // 上传图片到服务器
              const formData = new FormData();
              formData.append('file', imageBlob, 'curve-chart.png');

              const response = await fetch('/api/upload/image', {
                method: 'POST',
                body: formData,
              });

              if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || '上传曲线图失败');
              }

              const data = await response.json();
              const imageUrl = data.url;

              // 应用曲线图数据来源
              const payload: CurveChartDataSource = {
                type: 'curveChart',
                config: curveChartConfig,
                imageUrl,
                inputSignature: nextSignature,
              };

              // 先应用数据源，然后等待一下确保图片更新
              console.log('Applying curve chart to image:', {
                imagePos: dataSourceMenu.imagePos,
                imageUrl,
                payload
              });
              
              // 保存 imagePos，因为 applyDataSourceToImage 可能会修改文档
              const savedImagePos = dataSourceMenu.imagePos;
              
              applyDataSourceToImage(savedImagePos, payload, imageUrl);
              
              // 使用 setTimeout 确保图片更新完成后再关闭面板
              setTimeout(() => {
                setActiveDataSourcePanel(null);
                setDataSourceMenu(null);
                setCurveChartConfig(null);
              }, 300);
            } catch (err: any) {
              alert(err.message || '生成曲线图失败');
            } finally {
              setIsUploading(false);
              setTimeout(() => setUploadProgress(0), 500);
            }
          }}
          onClose={() => {
            setActiveDataSourcePanel(null);
            setDataSourceMenu(null);
            setCurveChartConfig(null);
          }}
        />
      )}
      {quickTagModal && (
        <QuickTagModal
          isOpen
          defaultType={quickTagModal.type}
          initialValue={quickTagModal.initialValue}
          targetType={quickTagModal.dataSourceMenu.targetType}
          onClose={() => setQuickTagModal(null)}
          onSave={handleQuickTagSave}
        />
      )}
      <TaskSelectorModal
        isOpen={showTaskSelector}
        onClose={() => setShowTaskSelector(false)}
        onSelect={handleTaskSelect}
        selectedTaskId={selectedTask?._id || null}
      />
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
      <div className="flex-1 flex overflow-hidden bg-gray-100">
        <OutlineSidebar
          headings={headings}
          width={sidebarWidth}
          sidebarRef={sidebarRef}
          draggingHeadingId={draggingHeadingId}
          dragOverHeadingId={dragOverHeadingId}
          resizing={resizingSidebar}
          onRefresh={buildHeadings}
          onNavigate={handleNavigateHeading}
          onDelete={handleDeleteHeadingSection}
          onDragStart={handleHeadingDragStart}
          onDragOver={handleHeadingDragOver}
          onDrop={handleHeadingDrop}
          onDragEnd={handleHeadingDragEnd}
          onStartResize={startResizeSidebar}
        />
        <div className="flex-1 overflow-auto p-4">
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
    </div>
  );
}) as React.ForwardRefExoticComponent<TiptapEditorProps & React.RefAttributes<TiptapEditorRef>>;

TiptapEditor.displayName = 'TiptapEditor';

export default TiptapEditor;

interface QuickTagModalProps {
  isOpen: boolean;
  defaultType: TemplateTag['type'];
  initialValue: string;
  targetType: 'text' | 'image';
  onClose: () => void;
  onSave: (tag: TemplateTag) => void;
}

function QuickTagModal({ isOpen, defaultType, initialValue, targetType, onClose, onSave }: QuickTagModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [value, setValue] = useState(initialValue);
  const [tagType, setTagType] = useState<TemplateTag['type']>(defaultType);

  // 根据 targetType 获取可用的标签类型
  const availableTagTypes = useMemo(() => {
    if (targetType === 'image') {
      return [
        { value: 'image' as const, label: '图片' },
        { value: 'cda-image' as const, label: 'CDA 图片' },
      ];
    }
    return [
      { value: 'text' as const, label: '文本' },
      { value: 'number' as const, label: '数字' },
      { value: 'date' as const, label: '日期' },
      { value: 'datetime' as const, label: '时间' },
      { value: 'location' as const, label: '布点区域' },
      { value: 'boolean' as const, label: '布尔' },
    ];
  }, [targetType]);

  useEffect(() => {
    setName('');
    setDescription('');
    setValue(initialValue);
    setTagType(defaultType); // 当 defaultType 改变时，更新 tagType
  }, [initialValue, defaultType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('请输入标签名称');
      return;
    }
    
    // 根据标签类型封装值
    let formattedValue: any = value;
    if (tagType === 'location') {
      // location 类型需要数组格式
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) {
          // 尝试解析：支持逗号、分号、换行符分割，也支持范围格式
          const parts = trimmed
            .split(/[,;\n]/)
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
          
          // 如果只有一个值，直接作为数组
          if (parts.length === 1) {
            formattedValue = [parts[0]];
          } else if (parts.length > 1) {
            // 多个值，直接使用
            formattedValue = parts;
          } else {
            formattedValue = [];
          }
        } else {
          formattedValue = [];
        }
      } else if (Array.isArray(value)) {
        formattedValue = value;
      } else {
        formattedValue = [];
      }
    } else if (tagType === 'number') {
      // number 类型转换为数字
      const num = Number(value);
      formattedValue = !Number.isNaN(num) ? num : 0;
    } else if (tagType === 'boolean') {
      // boolean 类型转换为布尔值
      if (typeof value === 'string') {
        formattedValue = value.toLowerCase() === 'true' || value === '1' || value === '是';
      } else {
        formattedValue = Boolean(value);
      }
    } else {
      // 其他类型保持字符串
      formattedValue = typeof value === 'string' ? value : String(value || '');
    }
    
    const nextTag: TemplateTag = {
      _id: generateTempId(),
      name: name.trim(),
      description: description.trim(),
      type: tagType, // 使用选择的标签类型
      value: formattedValue,
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
            标签类型 <span className="text-red-500">*</span>
          </label>
          <select
            value={tagType}
            onChange={(e) => setTagType(e.target.value as TemplateTag['type'])}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {availableTagTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </div>
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
            标签值（{(() => {
              if (tagType === 'image' || tagType === 'cda-image') return '图片 URL';
              if (tagType === 'location') return '布点区域';
              if (tagType === 'number') return '数字';
              if (tagType === 'date') return '日期';
              if (tagType === 'datetime') return '时间';
              if (tagType === 'boolean') return '布尔值';
              return '文本';
            })()}）
          </label>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            rows={tagType === 'image' || tagType === 'cda-image' ? 2 : 3}
            placeholder={
              tagType === 'location'
                ? '如 C001、C001-C010，多个值用逗号或换行分隔'
                : tagType === 'number'
                ? '请输入数字'
                : tagType === 'date'
                ? '格式：YYYY-MM-DD'
                : tagType === 'datetime'
                ? '格式：YYYY-MM-DD HH:mm'
                : tagType === 'boolean'
                ? 'true/false 或 是/否'
                : undefined
            }
          />
          <p className="text-xs text-gray-500 mt-1">
            {tagType === 'location'
              ? '输入布点区域编号，支持单个值（如 C001）或范围（如 C001-C010），多个值用逗号或换行分隔'
              : '将当前选中的内容保存为标签，可在编辑器中反复引用'}
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
