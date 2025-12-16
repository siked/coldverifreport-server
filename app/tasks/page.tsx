'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import CategoryTree from '@/components/CategoryTree';
import Modal from '@/components/Modal';
import Alert from '@/components/Alert';
import Confirm from '@/components/Confirm';
import { Plus, BookMinus, Trash2, ChevronLeft, ChevronRight, FileText, Database } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { HotTable } from '@handsontable/react';
import { registerAllModules } from 'handsontable/registry';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';

registerAllModules();

interface TemplateTag {
  _id?: string;
  name: string;
  description?: string;
  type: 'text' | 'number' | 'date' | 'datetime' | 'location' | 'boolean' | 'image' | 'cda-image';
  value: any;
  functionConfig?: any;
}

interface Task {
  _id: string;
  taskNumber: string;
  taskName: string;
  categoryId: string;
  taskTypeId: string;
  userId: string;
  tags?: TemplateTag[];
  createdAt?: string;
  updatedAt?: string;
}

interface Category {
  _id: string;
  name: string;
  isTaskType?: boolean;
  templateId?: string;
}

interface Template {
  _id: string;
  name: string;
  categoryId: string;
  tags?: TemplateTag[];
}

// Handsontable 选中边框调试开关
const DEBUG_SELECTION = true;

export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [showTaskList, setShowTaskList] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [templateTags, setTemplateTags] = useState<TemplateTag[]>([]);
  const hotTableRef = useRef<any>(null);
  const saveTaskTagsRef = useRef<((taskId: string, tags: TemplateTag[]) => Promise<void>) | null>(null);
  const lastPasteTsRef = useRef<number>(0);
  const lastImageSaveRef = useRef<{ key: string; value: string; ts: number } | null>(null);
  const [imagePreview, setImagePreview] = useState<{
    url: string;
    isOpen: boolean;
    taskId: string | null;
    tagKey: string | null;
  }>({
    url: '',
    isOpen: false,
    taskId: null,
    tagKey: null,
  });
  const [formData, setFormData] = useState({
    taskNumber: '',
    taskName: '',
    categoryId: '',
    taskTypeId: '',
  });
  const [alert, setAlert] = useState<{ isOpen: boolean; message: string; type?: 'success' | 'error' | 'info' | 'warning' }>({
    isOpen: false,
    message: '',
    type: 'info',
  });
  const [confirm, setConfirm] = useState<{ isOpen: boolean; message: string; onConfirm: () => void }>({
    isOpen: false,
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    fetchTasks();
    fetchCategories();
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (selectedCategoryId !== null) {
      // 获取选中的分类信息
      const category = categories.find((c) => c._id === selectedCategoryId);
      
      // 只有任务类型才更新选中状态和加载任务列表
      if (category?.isTaskType) {
        setSelectedCategory(category);
        if (category.templateId) {
          fetchTemplateTags(category.templateId);
        }
        fetchTasks();
        setShowTaskList(true);
      }
      // 如果是普通文件夹，不做任何处理，保持上次选中的任务类型
    } else {
      setSelectedCategory(null);
      setShowTaskList(false);
      setTasks([]);
      setTemplateTags([]);
    }
  }, [selectedCategoryId, categories]);

  // 当选择分类变化且正在新建任务时，自动更新表单中的分类和模版
  useEffect(() => {
    if (showAddForm && !editingTask && selectedCategory && selectedCategory.isTaskType) {
      setFormData((prev) => ({
        ...prev,
        categoryId: selectedCategory._id,
        taskTypeId: selectedCategory.templateId || '',
      }));
    }
  }, [selectedCategory, showAddForm, editingTask]);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data = await res.json();
        let filtered = data.tasks;
        if (selectedCategoryId !== null) {
          filtered = filtered.filter((t: Task) => t.categoryId === selectedCategoryId);
        }
        setTasks(filtered);
      }
    } catch (error) {
      console.error('获取任务失败:', error);
    }
  }, [selectedCategoryId]);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories?type=task');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories);
      }
    } catch (error) {
      console.error('获取分类失败:', error);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates);
      }
    } catch (error) {
      console.error('获取模板失败:', error);
    }
  };

  const fetchTemplateTags = async (templateId: string) => {
    try {
      const res = await fetch(`/api/templates?id=${templateId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.template && data.template.tags) {
          setTemplateTags(data.template.tags);
        } else {
          setTemplateTags([]);
        }
      }
    } catch (error) {
      console.error('获取模板标签失败:', error);
      setTemplateTags([]);
    }
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories.find((c) => c._id === categoryId);
    return category?.name || '未分类';
  };

  const getTemplateName = (templateId: string) => {
    const template = templates.find((t) => t._id === templateId);
    return template?.name || '未选择';
  };

  const formatDate = (value: any) => {
    if (!value) return '';
    const d = typeof value === 'string' ? dayjs(value) : dayjs(value?.toString?.() || value);
    return d.isValid() ? d.format('YYYY-MM-DD') : '';
  };

  const formatDateTime = (value: any) => {
    if (!value) return '';
    const d = typeof value === 'string' ? dayjs(value) : dayjs(value?.toString?.() || value);
    return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : '';
  };

  const isValidDate = (value: any) => dayjs(value, 'YYYY-MM-DD', true).isValid();
  const isValidDateTime = (value: any) => dayjs(value, 'YYYY-MM-DD HH:mm', true).isValid();

  // 格式化标签值显示
  const formatTagValue = (tag: TemplateTag | undefined): string => {
    if (!tag) return '';
    const { type, value } = tag;
    if (value === null || value === undefined) return '';
    
    switch (type) {
      case 'boolean':
        return value ? '是' : '否';
      case 'date':
        return formatDate(value);
      case 'datetime':
        return formatDateTime(value);
      case 'location':
        return Array.isArray(value) ? value.join(', ') : value;
      case 'image':
      case 'cda-image':
        return value ? '📷' : '';
      default:
        return String(value);
    }
  };

  // 获取标签值用于编辑
  const getTagValue = (tag: TemplateTag | undefined): any => {
    if (!tag) return '';
    const { type, value } = tag;
    if (value === null || value === undefined) {
      switch (type) {
        case 'boolean':
          return false;
        case 'number':
          return 0;
        default:
          return '';
      }
    }
    return value;
  };

  // 创建自定义编辑器
  const createCustomEditor = (type: string) => {
    return class {
      hotInstance: any;
      td: HTMLElement | null = null;
      editor: HTMLElement | null = null;
      value: any = '';
      _isOpened: boolean = false;

      init() {
        this.editor = document.createElement('div');
        this.editor.className = 'custom-editor';
        this.editor.style.cssText = 'position: absolute; z-index: 1000; background: white; border: 1px solid #ccc; padding: 8px;';
      }

      getValue() {
        return this.value;
      }

      setValue(value: any) {
        this.value = value;
        if (this.editor) {
          if (type === 'boolean') {
            this.editor.innerHTML = `
              <label><input type="radio" name="bool" value="true" ${value === true ? 'checked' : ''}> 是</label>
              <label><input type="radio" name="bool" value="false" ${value === false ? 'checked' : ''}> 否</label>
            `;
            const inputs = this.editor.querySelectorAll('input');
            inputs.forEach((input) => {
              input.addEventListener('change', (e: any) => {
                this.value = e.target.value === 'true';
              });
            });
          } else if (type === 'date') {
            this.editor.innerHTML = `<input type="date" value="${value || ''}" style="width: 100%;">`;
            const input = this.editor.querySelector('input');
            if (input) {
              input.addEventListener('change', (e: any) => {
                this.value = e.target.value;
              });
            }
          } else if (type === 'datetime') {
            this.editor.innerHTML = `<input type="datetime-local" value="${value || ''}" style="width: 100%;">`;
            const input = this.editor.querySelector('input');
            if (input) {
              input.addEventListener('change', (e: any) => {
                this.value = e.target.value;
              });
            }
          } else if (type === 'number') {
            this.editor.innerHTML = `<input type="number" step="0.1" value="${value || 0}" style="width: 100%;">`;
            const input = this.editor.querySelector('input');
            if (input) {
              input.addEventListener('change', (e: any) => {
                this.value = parseFloat(e.target.value) || 0;
              });
            }
          } else {
            this.editor.innerHTML = `<input type="text" value="${value || ''}" style="width: 100%;">`;
            const input = this.editor.querySelector('input');
            if (input) {
              input.addEventListener('change', (e: any) => {
                this.value = e.target.value;
              });
            }
          }
        }
      }

      prepare(row: number, col: number, prop: string | number, td: HTMLElement, originalValue: any, cellProperties: any) {
        // prepare 方法在编辑器打开前调用
        // 确保编辑器已初始化
        if (!this.editor) {
          this.init();
        }
        // 设置初始值
        this.setValue(originalValue);
        this.td = td;
      }

      open(instance: any, td: HTMLElement) {
        this.hotInstance = instance;
        this.td = td;
        this._isOpened = true;
        // 确保编辑器已初始化
        if (!this.editor) {
          this.init();
        }
        const rect = td.getBoundingClientRect();
        if (this.editor) {
          this.editor.style.top = `${rect.bottom}px`;
          this.editor.style.left = `${rect.left}px`;
          document.body.appendChild(this.editor);
        }
      }

      close() {
        this._isOpened = false;
        if (this.editor && this.editor.parentNode) {
          this.editor.parentNode.removeChild(this.editor);
        }
      }

      focus() {
        const input = this.editor?.querySelector('input');
        if (input) {
          setTimeout(() => input.focus(), 0);
        }
      }

      beginEditing(initialValue: any) {
        if (!this._isOpened) {
          this.setValue(initialValue);
        }
      }

      finishEditing(restoreOriginalValue: boolean) {
        if (restoreOriginalValue) {
          // 恢复原始值
        }
        this.close();
      }

      isWaiting() {
        return false;
      }

      // Handsontable expects this method on custom editors
      enableFullEditMode() {
        return true;
      }

      isOpened() {
        return this._isOpened;
      }

      extend() {
        return {};
      }
    };
  };

  // 准备表格数据
  const tableData = useMemo(() => {
    if (!showTaskList || tasks.length === 0) return [];
    
    return tasks.map((task) => {
      const row: any = {
        _id: task._id,
        taskNumber: task.taskNumber,
        taskName: task.taskName,
        categoryId: task.categoryId,
        taskTypeId: task.taskTypeId,
        createdAt: task.createdAt ? new Date(task.createdAt).toLocaleString('zh-CN') : '',
      };

      // 添加标签字段
      if (task.tags && task.tags.length > 0) {
        task.tags.forEach((tag) => {
          // 对于图片类型，直接使用原始值（图片URL），而不是格式化后的值
          if (tag.type === 'image' || tag.type === 'cda-image') {
            row[`tag_${tag._id || tag.name}`] = tag.value || '';
          } else {
            row[`tag_${tag._id || tag.name}`] = formatTagValue(tag);
          }
          row[`_tag_${tag._id || tag.name}`] = tag; // 保存原始标签对象
        });
      } else if (templateTags.length > 0) {
        // 如果任务没有标签，使用模板标签的默认值
        templateTags.forEach((tag) => {
          // 对于图片类型，直接使用原始值（图片URL），而不是格式化后的值
          if (tag.type === 'image' || tag.type === 'cda-image') {
            row[`tag_${tag._id || tag.name}`] = getTagValue(tag) || '';
          } else {
            row[`tag_${tag._id || tag.name}`] = formatTagValue(tag);
          }
          row[`_tag_${tag._id || tag.name}`] = { ...tag, value: getTagValue(tag) };
        });
      }

      return row;
    });
  }, [tasks, templateTags, showTaskList, categories, templates]);

  // 计算表格高度（始终填满可用空间）
  const [tableHeight, setTableHeight] = useState(600);
  const contentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const calculateHeight = () => {
      if (typeof window === 'undefined' || !contentRef.current) return 600;

      const headerHeight = headerRef.current?.offsetHeight || 0;
      const contentHeight = contentRef.current.offsetHeight;
      const available = contentHeight - headerHeight;
      setTableHeight(Math.max(400, available));
    };

    // 延迟计算，确保DOM已渲染
    const timeoutId = setTimeout(calculateHeight, 100);
    
    calculateHeight();
    window.addEventListener('resize', calculateHeight);
    // 使用 ResizeObserver 监听容器大小变化
    const resizeObserver = new ResizeObserver(() => {
      // 延迟计算，避免频繁更新
      setTimeout(calculateHeight, 50);
    });
    if (tableContainerRef.current) {
      resizeObserver.observe(tableContainerRef.current);
    }
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current);
    }
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', calculateHeight);
      resizeObserver.disconnect();
    };
  }, [showTaskList, sidebarCollapsed]);

  // 统一的单元格高度设置函数
  const setCellHeight = useCallback((td: HTMLElement, parentRow?: HTMLElement | null) => {
    td.style.setProperty('height', '59px', 'important');
    td.style.setProperty('max-height', '59px', 'important');
    td.style.setProperty('min-height', '59px', 'important');
    td.style.setProperty('vertical-align', 'middle', 'important');
    td.style.boxSizing = 'border-box';
    if (parentRow) {
      parentRow.style.setProperty('height', '59px', 'important');
      parentRow.style.setProperty('max-height', '59px', 'important');
      parentRow.style.setProperty('min-height', '59px', 'important');
    }
  }, []);

  // 统一设置表格行高的函数（优化性能，批量设置样式）
  const fixManagementColumn = useCallback(() => {
    try {
      if (!hotTableRef.current?.hotInstance) {
        return;
      }
      const instance = hotTableRef.current.hotInstance;
      const table = instance?.rootElement;
      if (!table) {
        return;
      }
      
      // 处理所有表格结构，包括行号列
      const allTables = table.querySelectorAll('table');
      allTables.forEach((tbl: Element) => {
        // 设置表头行高度
        const headerRows = tbl.querySelectorAll('thead tr');
        headerRows.forEach((headerRow: Element) => {
          const rowElement = headerRow as HTMLElement;
          rowElement.style.setProperty('height', '59px', 'important');
          rowElement.style.setProperty('max-height', '59px', 'important');
          rowElement.style.setProperty('min-height', '59px', 'important');
          const cells = Array.from(rowElement.querySelectorAll('th'));
          cells.forEach((cell: HTMLElement) => {
            setCellHeight(cell, rowElement);
          });
        });
        
        // 设置数据行高度
        const tbody = tbl.querySelector('tbody');
        if (tbody) {
          const rows = tbody.querySelectorAll('tr');
          rows.forEach((row: Element) => {
            const rowElement = row as HTMLElement;
            rowElement.style.setProperty('height', '59px', 'important');
            rowElement.style.setProperty('max-height', '59px', 'important');
            rowElement.style.setProperty('min-height', '59px', 'important');
            const cells = Array.from(rowElement.querySelectorAll('td'));
            cells.forEach((cell: HTMLElement) => {
              // 强制设置高度，使用!important优先级，每次都设置确保不被覆盖
              setCellHeight(cell, rowElement);
              
              // 对于图片列，特殊处理
              const img = cell.querySelector('img');
              if (img) {
                // 图片列的特殊样式
                cell.style.overflow = 'hidden';
                cell.style.display = 'table-cell';
                // 确保图片不会撑开单元格
                img.style.maxWidth = '40px';
                img.style.maxHeight = '40px';
                img.style.width = 'auto';
                img.style.height = 'auto';
                img.style.objectFit = 'contain';
                img.style.display = 'block';
                img.style.margin = '0 auto';
                
                // 确保图片加载后行高不变
                const fixHeight = () => {
                  setCellHeight(cell, rowElement);
                };
                
                // 如果图片已经加载，立即修复
                if (img.complete) {
                  fixHeight();
                } else {
                  // 为图片添加加载事件
                  img.onload = fixHeight;
                  img.onerror = fixHeight;
                }
              } else {
                // 非图片列设置文本溢出处理
                cell.style.overflow = 'hidden';
                cell.style.textOverflow = 'ellipsis';
                cell.style.whiteSpace = 'nowrap';
              }
            });
          });
        }
      });
      
      // 特别处理行号列容器
      const rowHeaderContainers = table.querySelectorAll('.ht_clone_top_left_corner, .ht_clone_left');
      rowHeaderContainers.forEach((container: Element) => {
        const rows = container.querySelectorAll('tbody tr, thead tr');
        rows.forEach((row: Element) => {
          const rowElement = row as HTMLElement;
          rowElement.style.setProperty('height', '59px', 'important');
          rowElement.style.setProperty('max-height', '59px', 'important');
          rowElement.style.setProperty('min-height', '59px', 'important');
          const cells = row.querySelectorAll('th, td');
          cells.forEach((cell: Element) => {
            const cellElement = cell as HTMLElement;
            setCellHeight(cellElement, rowElement);
          });
        });
      });

      // 注意：不再在这里刷新边框，统一由 refreshSelectionBorders 处理
      // 这样可以确保高度设置和边框刷新的一致性
    } catch (error) {
      // 忽略错误，避免影响表格正常渲染
      console.warn('Error fixing row height:', error);
    }
  }, [setCellHeight]);

  const resetCellEvents = useCallback((td: HTMLElement) => {
    td.onclick = null;
    td.ondblclick = null;
  }, []);

  // 防抖的滚动处理函数
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleAfterScroll = useCallback(() => {
    // 立即应用样式，避免延迟导致的闪烁
    // 边框刷新由事件处理器统一处理（afterRender hook）
    requestAnimationFrame(() => {
      fixManagementColumn();
    });
  }, [fixManagementColumn]);

  // 根据当前选中单元格的真实高度，同步 rowHeight，减少边框错位
  const syncSelectionRowHeight = useCallback(() => {
    const instance = hotTableRef.current?.hotInstance;
    if (!instance) return;
    const sel = instance.getSelectedLast();
    if (!sel || sel.length < 2) return;
    const row = sel[0];
    const col = sel[1];
    const cell = instance.getCell(row, col);
    if (!cell) return;
    const rect = cell.getBoundingClientRect();
    const h = Math.round(rect.height || cell.offsetHeight || 0);
    if (!Number.isFinite(h) || h <= 0) return;
    if (typeof instance.setRowHeight === 'function') {
      console.log('syncSelectionRowHeight', row, h);
      instance.setRowHeight(row, h);
    }
  }, []);

  // 多次刷新选区边框，覆盖异步重排/加载导致的滞后
  const scheduleBorderRefresh = useCallback(() => {
    requestAnimationFrame(() => {
      syncSelectionRowHeight();
    });
  }, [ syncSelectionRowHeight]);

  // 当选择变化、编辑或表格重新渲染时，刷新边框位置
  useEffect(() => {
    const instance = hotTableRef.current?.hotInstance;
    if (!instance) return;

    const handler = () => {
      // 关键修复：先修复单元格高度，再刷新边框
      // 使用 requestAnimationFrame 确保 DOM 更新完成

    };

    // 选择相关事件
    instance.addHook('afterSelectionEnd', handler);
    instance.addHook('afterDeselect', handler);
    // 编辑相关事件 - 关键：监听编辑开始和结束
    instance.addHook('afterBeginEditing', handler);
    instance.addHook('afterFinishEditing', handler);
    // 渲染相关事件 - 重要：每次渲染后都要修复高度和边框
    instance.addHook('afterRender', handler);
    // 验证相关事件
    instance.addHook('afterValidate', handler);
    // 数据加载完成后也需要刷新
    instance.addHook('afterLoadData', handler);

    return () => {
      instance.removeHook('afterSelectionEnd', handler);
      instance.removeHook('afterDeselect', handler);
      instance.removeHook('afterBeginEditing', handler);
      instance.removeHook('afterFinishEditing', handler);
      instance.removeHook('afterRender', handler);
      instance.removeHook('afterValidate', handler);
      instance.removeHook('afterLoadData', handler);
    };
  }, [ showTaskList]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // 使用MutationObserver监听DOM变化，立即修复行高
  useEffect(() => {
    if (!hotTableRef.current?.hotInstance) {
      return;
    }
    
    const instance = hotTableRef.current.hotInstance;
    const table = instance?.rootElement;
    if (!table) {
      return;
    }

    // 创建MutationObserver监听DOM变化
    const observer = new MutationObserver(() => {
      // 立即修复行高，避免闪烁；随后多次刷新边框防止错位
      requestAnimationFrame(() => {
        fixManagementColumn();
        scheduleBorderRefresh();
      });
    });

    // 观察表格容器的所有变化
    observer.observe(table, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    return () => {
      observer.disconnect();
    };
  }, [fixManagementColumn, showTaskList]);

  // 更新表格数据
  useEffect(() => {
    if (hotTableRef.current?.hotInstance && tableData.length > 0) {
      hotTableRef.current.hotInstance.loadData(tableData);
      // 数据加载后固定管理列
      // 边框刷新由 afterLoadData 事件处理器统一处理
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          fixManagementColumn();
        });
      });
    }
  }, [tableData, fixManagementColumn]);

  // 更新表格高度
  useEffect(() => {
    if (hotTableRef.current?.hotInstance) {
      hotTableRef.current.hotInstance.updateSettings({ height: tableHeight });
    }
  }, [tableHeight]);


  // 保存任务标签
  const saveTaskTags = useCallback(async (taskId: string, tags: TemplateTag[]) => {
    try {
      const task = tasks.find((t) => t._id === taskId);
      if (!task) return;

      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          taskNumber: task.taskNumber,
          taskName: task.taskName,
          categoryId: task.categoryId,
          taskTypeId: task.taskTypeId,
          tags,
        }),
      });

      if (res.ok) {
        await fetchTasks();
      } else {
        const data = await res.json();
        setAlert({ isOpen: true, message: data.error || '保存失败', type: 'error' });
      }
    } catch (error) {
      setAlert({ isOpen: true, message: '保存失败', type: 'error' });
    }
  }, [tasks, fetchTasks]);

  // 更新 ref
  useEffect(() => {
    saveTaskTagsRef.current = saveTaskTags;
  }, [saveTaskTags]);

  // 上传图片到七牛云（通过后端接口）
  const uploadImageToQiniuApi = useCallback(async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload/image', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '上传失败');
      }
      const data = await res.json();
      return data.url as string;
    } catch (error: any) {
      console.error('上传图片到七牛云失败:', error);
      setAlert({ isOpen: true, message: error.message || '上传失败', type: 'error' });
      return null;
    }
  }, []);

  // 将 base64 图片上传到七牛云
  const uploadBase64ToQiniu = useCallback(
    async (base64: string): Promise<string | null> => {
      try {
        const match = base64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!match) {
          setAlert({ isOpen: true, message: '粘贴的图片格式不支持', type: 'warning' });
          return null;
        }
        const mime = match[1];
        const b64 = match[2];
        const byteString = atob(b64);
        const arrayBuffer = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(arrayBuffer);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ia], { type: mime });
        const file = new File([blob], `paste-${Date.now()}.png`, { type: mime });
        return await uploadImageToQiniuApi(file);
      } catch (error: any) {
        console.error('Base64 上传失败:', error);
        setAlert({ isOpen: true, message: '图片上传失败', type: 'error' });
        return null;
      }
    },
    [uploadImageToQiniuApi]
  );

  // 保存任务字段
  const saveTaskField = useCallback(async (taskId: string, field: string, value: any) => {
    try {
      const task = tasks.find((t) => t._id === taskId);
      if (!task) return;

      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          taskNumber: field === 'taskNumber' ? value : task.taskNumber,
          taskName: field === 'taskName' ? value : task.taskName,
          categoryId: task.categoryId,
          taskTypeId: task.taskTypeId,
          tags: task.tags,
        }),
      });

      if (res.ok) {
        await fetchTasks();
      } else {
        const data = await res.json();
        setAlert({ isOpen: true, message: data.error || '保存失败', type: 'error' });
      }
    } catch (error) {
      setAlert({ isOpen: true, message: '保存失败', type: 'error' });
    }
  }, [tasks, fetchTasks, setAlert]);

  // 判断列是否为图片类型标签
  const isImageTagColumn = useCallback(
    (prop: any) => {
      if (typeof prop !== 'string') return false;
      if (!prop.startsWith('tag_')) return false;
      const tagKey = prop.replace('tag_', '');
      const targetTag = templateTags.find((t) => (t._id || t.name) === tagKey);
      return targetTag?.type === 'image' || targetTag?.type === 'cda-image';
    },
    [templateTags]
  );

  // 校验给定 tagKey 是否为图片类型
  const isImageTagKey = useCallback(
    (tagKey: string | null | undefined) => {
      if (!tagKey) return false;
      const targetTag = templateTags.find((t) => (t._id || t.name) === tagKey);
      return targetTag?.type === 'image' || targetTag?.type === 'cda-image';
    },
    [templateTags]
  );

  // 图片重新上传（在预览弹窗中触发）
  const handleImageReupload = useCallback(() => {
    if (!imagePreview.taskId || !imagePreview.tagKey) {
      setAlert({ isOpen: true, message: '未找到图片对应的任务或标签', type: 'error' });
      return;
    }
    if (!isImageTagKey(imagePreview.tagKey)) {
      setAlert({ isOpen: true, message: '仅图片类型支持预览与重新上传', type: 'warning' });
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (event: any) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        setAlert({ isOpen: true, message: '请选择图片格式的文件', type: 'error' });
        return;
      }

      const imageUrl = await uploadImageToQiniuApi(file);
      if (!imageUrl) return;

      const task = tasks.find((t) => t._id === imagePreview.taskId);
      if (!task) {
        setAlert({ isOpen: true, message: '未找到对应任务', type: 'error' });
        return;
      }

      const updatedTags = [...(task.tags || [])];
      const tagIndex = updatedTags.findIndex((t) => (t._id || t.name) === imagePreview.tagKey);
      if (tagIndex >= 0) {
        updatedTags[tagIndex] = { ...updatedTags[tagIndex], value: imageUrl };
      } else {
        const originalTag = templateTags.find((t) => (t._id || t.name) === imagePreview.tagKey);
        if (originalTag) {
          updatedTags.push({ ...originalTag, value: imageUrl });
        }
      }

      await saveTaskTags(task._id, updatedTags);
      setImagePreview((prev) => ({ ...prev, url: imageUrl }));
    };

    input.click();
  }, [imagePreview, tasks, templateTags, saveTaskTags, setAlert, setImagePreview, isImageTagKey, uploadImageToQiniuApi]);

  // 准备表格列配置
  const columns = useMemo(() => {
    const setImagePreviewFn = setImagePreview;

    const cols: any[] = [
      { data: 'taskNumber', title: '任务编号', editor: 'text', width: 120, renderer: (instance: any, td: HTMLElement, row: number, col: number, prop: string, value: any) => {
        td.textContent = value || '';
        resetCellEvents(td);
        const parentRow = td.parentElement as HTMLElement;
        setCellHeight(td, parentRow);
        td.style.overflow = 'hidden';
        td.style.textOverflow = 'ellipsis';
        td.style.whiteSpace = 'nowrap';
        return td;
      }},
      { data: 'taskName', title: '任务名称', editor: 'text', width: 200, renderer: (instance: any, td: HTMLElement, row: number, col: number, prop: string, value: any) => {
        td.textContent = value || '';
        resetCellEvents(td);
        const parentRow = td.parentElement as HTMLElement;
        setCellHeight(td, parentRow);
        td.style.overflow = 'hidden';
        td.style.textOverflow = 'ellipsis';
        td.style.whiteSpace = 'nowrap';
        return td;
      }},
      { data: 'createdAt', title: '创建时间', readOnly: true, width: 180, renderer: (instance: any, td: HTMLElement, row: number, col: number, prop: string, value: any) => {
        td.textContent = value || '';
        resetCellEvents(td);
        const parentRow = td.parentElement as HTMLElement;
        setCellHeight(td, parentRow);
        td.style.overflow = 'hidden';
        td.style.textOverflow = 'ellipsis';
        td.style.whiteSpace = 'nowrap';
        return td;
      }},
    ];

    // 添加标签列
    templateTags.forEach((tag) => {
      const tagKey = `tag_${tag._id || tag.name}`;
      let editor: any = 'text';
      let renderer: any = undefined;

      switch (tag.type) {
        case 'number':
          editor = 'numeric';
          renderer = (instance: any, td: HTMLElement, row: number, col: number, prop: string, value: any) => {
            td.textContent = formatTagValue({ ...tag, value });
            resetCellEvents(td);
            const parentRow = td.parentElement as HTMLElement;
            setCellHeight(td, parentRow);
            td.style.overflow = 'hidden';
            td.style.textOverflow = 'ellipsis';
            td.style.whiteSpace = 'nowrap';
            return td;
          };
          break;
        case 'date':
          editor = 'date';
          renderer = (instance: any, td: HTMLElement, row: number, col: number, prop: string, value: any) => {
            td.textContent = formatTagValue({ ...tag, value });
            resetCellEvents(td);
            const parentRow = td.parentElement as HTMLElement;
            setCellHeight(td, parentRow);
            td.style.overflow = 'hidden';
            td.style.textOverflow = 'ellipsis';
            td.style.whiteSpace = 'nowrap';
            return td;
          };
          cols.push({
            data: tagKey,
            title: tag.name,
            editor,
            renderer,
            type: 'date',
            dateFormat: 'YYYY-MM-DD',
            correctFormat: true,
            allowInvalid: false,
            defaultDate: '',
            datePickerConfig: {
              firstDay: 0,
              showWeekNumber: true,
              disableDayFn: (date: Date) => date.getDay() === 0 || date.getDay() === 6,
            },
            width: 150,
          });
          return;
        case 'datetime':
          // 使用内置 date 编辑器 + 时间选择（flatpickr），仅在保存时做格式与时间合并处理
          editor = 'date';
          renderer = (instance: any, td: HTMLElement, row: number, col: number, prop: string, value: any) => {
            td.textContent = formatTagValue({ ...tag, value });
            resetCellEvents(td);
            const parentRow = td.parentElement as HTMLElement;
            setCellHeight(td, parentRow);
            td.style.overflow = 'hidden';
            td.style.textOverflow = 'ellipsis';
            td.style.whiteSpace = 'nowrap';
            return td;
          };
          cols.push({
            data: tagKey,
            title: tag.name,
            editor,
            renderer,
            type: 'date',
            dateFormat: 'YYYY-MM-DD HH:mm',
            correctFormat: true,
            allowInvalid: false,
            datePickerConfig: {
              enableTime: true,
              time_24hr: true,
              minuteIncrement: 1,
            },
            width: 180,
          });
          return;
        case 'boolean':
          editor = 'checkbox';
          renderer = (instance: any, td: HTMLElement, row: number, col: number, prop: string, value: any) => {
            td.textContent = value === '是' || value === true ? '是' : '否';
            resetCellEvents(td);
            const parentRow = td.parentElement as HTMLElement;
            setCellHeight(td, parentRow);
            td.style.overflow = 'hidden';
            td.style.textOverflow = 'ellipsis';
            td.style.whiteSpace = 'nowrap';
            return td;
          };
          break;
        case 'image':
        case 'cda-image':
          editor = false; // 禁用编辑，通过双击处理
          renderer = (instance: any, td: HTMLElement, row: number, col: number, prop: string, value: any) => {
            const parentRow = td.parentElement as HTMLElement;
            // 使用统一的设置高度函数
            setCellHeight(td, parentRow);
            td.style.textAlign = 'center';
            td.style.cursor = 'pointer';
            td.style.padding = '5px';
            td.style.overflow = 'hidden';
            td.style.display = 'table-cell';
            
            const rowData = instance.getDataAtRow(row);
            const taskId = rowData?._id || (instance.getSourceDataAtRow ? instance.getSourceDataAtRow(row)?._id : null);
            const tagKey = prop.replace('tag_', '');
            // 仅允许图片类型打开预览
            if (!isImageTagKey(tagKey)) {
              return td;
            }
            
            // 清除旧内容
            td.innerHTML = '';
            
            // 确保value是字符串类型的图片URL
            const imageUrl = typeof value === 'string' ? value : (value || '');
            
            if (imageUrl && imageUrl !== '' && imageUrl !== '📷') {
              const img = document.createElement('img');
              img.src = imageUrl;
              // 图片样式：限制最大尺寸，确保不会撑开单元格
              img.style.maxWidth = '40px';
              img.style.maxHeight = '40px';
              img.style.width = 'auto';
              img.style.height = 'auto';
              img.style.cursor = 'pointer';
              img.style.objectFit = 'contain';
              img.style.display = 'block';
              img.style.margin = '0 auto';
              img.style.verticalAlign = 'middle';
              img.alt = '图片';
              
              // 图片加载事件，确保加载前后行高都不变
              const fixHeight = () => {
                setCellHeight(td, parentRow);
              };
              
              // 如果图片已经加载完成，立即修复高度
              if (img.complete) {
                fixHeight();
              } else {
                img.onload = fixHeight;
                img.onerror = fixHeight;
              }
              
              td.appendChild(img);
              
              // 单击不执行任何操作，双击打开预览弹窗
              td.onclick = null;
              td.ondblclick = (e) => {
                e.stopPropagation();
                setImagePreviewFn({
                  url: imageUrl || '',
                  isOpen: true,
                  taskId: taskId || null,
                  tagKey,
                });
              };
            } else {
              const span = document.createElement('span');
              span.textContent = '未上传';
              span.style.color = '#999';
              span.style.display = 'inline-block';
              span.style.verticalAlign = 'middle';
              td.appendChild(span);
              
              td.onclick = null;
              td.ondblclick = (e) => {
                e.stopPropagation();
                setImagePreviewFn({
                  url: '',
                  isOpen: true,
                  taskId: taskId || null,
                  tagKey,
                });
              };
            }
            return td;
          };
          break;
        case 'location':
          editor = 'text';
          renderer = (instance: any, td: HTMLElement, row: number, col: number, prop: string, value: any) => {
            td.textContent = formatTagValue({ ...tag, value });
            resetCellEvents(td);
            const parentRow = td.parentElement as HTMLElement;
            setCellHeight(td, parentRow);
            td.style.overflow = 'hidden';
            td.style.textOverflow = 'ellipsis';
            td.style.whiteSpace = 'nowrap';
            return td;
          };
          break;
        default:
          // 为所有没有自定义渲染器的列添加默认渲染器
          renderer = (instance: any, td: HTMLElement, row: number, col: number, prop: string, value: any) => {
            td.textContent = formatTagValue({ ...tag, value });
            resetCellEvents(td);
            const parentRow = td.parentElement as HTMLElement;
            setCellHeight(td, parentRow);
            td.style.overflow = 'hidden';
            td.style.textOverflow = 'ellipsis';
            td.style.whiteSpace = 'nowrap';
            return td;
          };
          break;
      }

      cols.push({
        data: tagKey,
        title: tag.name,
        editor,
        renderer: renderer || ((instance: any, td: HTMLElement, row: number, col: number, prop: string, value: any) => {
          // 最后的兜底渲染器，确保所有单元格都有统一样式
          td.textContent = formatTagValue({ ...tag, value });
          resetCellEvents(td);
          const parentRow = td.parentElement as HTMLElement;
          setCellHeight(td, parentRow);
          td.style.overflow = 'hidden';
          td.style.textOverflow = 'ellipsis';
          td.style.whiteSpace = 'nowrap';
          return td;
        }),
        width: 150,
        copyable: true, // 明确允许复制（尤其是图片列 editor=false 时）
      });
    });

    // 添加管理列
    cols.push({
      data: '_actions',
      title: '管理',
      readOnly: true,
      width: 100,
      renderer: (instance: any, td: HTMLElement, row: number, col: number, prop: string, value: any) => {
        const rowData = instance.getDataAtRow(row);
        // 从数据中获取 _id（数据中仍然有 _id，只是不显示在列中）
        const taskId = rowData?._id || (instance.getSourceDataAtRow ? instance.getSourceDataAtRow(row)?._id : null);
        
        // 使用统一的设置高度函数
        const parentRow = td.parentElement as HTMLElement;
        setCellHeight(td, parentRow);
        
        if (taskId) {
          td.innerHTML = `
            <button class="action-btn" data-action="data" data-task-id="${taskId}" title="数据编辑" style="background: none; border: none; cursor: pointer; padding: 4px; color: #3b82f6;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
              </svg>
            </button>
          `;
          td.style.textAlign = 'center';
          const btn = td.querySelector('.action-btn');
          if (btn) {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const taskId = (e.target as HTMLElement).closest('.action-btn')?.getAttribute('data-task-id');
              if (taskId) {
                window.open(`/tasks/${taskId}/data`, '_blank');
              }
            });
          }
        }
        return td;
      },
    });

    return cols;
  }, [templateTags, categories, templates, tasks, saveTaskTags, setImagePreview, setCellHeight, isImageTagKey, resetCellEvents]);

  // 处理单元格修改
  const handleAfterChange = useCallback((changes: any, source: string) => {
    if (source === 'loadData' || source === 'imagePaste') return;

    changes?.forEach((change: any[]) => {
      const [row, prop, oldValue, newValue] = change;
      const rowData = hotTableRef.current?.hotInstance?.getDataAtRow(row);
      // 从数据中获取 _id（数据中仍然有 _id，只是不显示在列中）
      const taskId = rowData?._id || (hotTableRef.current?.hotInstance?.getSourceDataAtRow ? hotTableRef.current.hotInstance.getSourceDataAtRow(row)?._id : null);

      if (!taskId) return;

      // 如果是标签字段
      if (prop.startsWith('tag_') && !prop.startsWith('_tag_')) {
        const tagKey = prop.replace('tag_', '');
        const task = tasks.find((t) => t._id === taskId);
        if (!task) return;

        // 获取原始标签对象
        const originalTag = task.tags?.find((t) => (t._id || t.name) === tagKey) || 
                           templateTags.find((t) => (t._id || t.name) === tagKey);
        
        if (!originalTag) return;

        // 输入格式校验：不合法则恢复原值并提示
        const hot = hotTableRef.current?.hotInstance;
        const normalizeDateValue = (val: any, format: 'date' | 'datetime') => {
          if (val === null || val === undefined || val === '') return '';
          if (typeof val === 'string') return val.trim();
          const d = dayjs(val);
          return d.isValid() ? d.format(format === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm') : '';
        };

        if (originalTag.type === 'date') {
          const normalized = normalizeDateValue(newValue, 'date');
          if (normalized && !isValidDate(normalized)) {
            hot?.setDataAtRowProp(row, prop, oldValue || '', 'validationRestore');
            setAlert({
              isOpen: true,
              message: '日期格式不正确，请使用 YYYY-MM-DD 格式',
              type: 'warning',
            });
            return;
          }
        }

        if (originalTag.type === 'datetime') {
          const normalizedNew = normalizeDateValue(newValue, 'datetime');
          const normalizedOld = normalizeDateValue(oldValue, 'datetime');

          // 优先做合法性校验
          if (normalizedNew && !isValidDateTime(normalizedNew)) {
            hot?.setDataAtRowProp(row, prop, oldValue || '', 'validationRestore');
            setAlert({
              isOpen: true,
              message: '时间格式不正确，请使用 YYYY-MM-DD HH:mm 格式',
              type: 'warning',
            });
            return;
          }

          // 如果用户只通过日期选择器改了“日期”，导致时间部分被置为 00:00，
          // 则自动把旧时间拼回去，达到“只改日期不改时间”的体验。
          if (
            normalizedNew &&
            normalizedOld &&
            normalizedNew.length === 16 &&
            normalizedOld.length === 16 &&
            normalizedNew.slice(0, 10) !== normalizedOld.slice(0, 10) && // 日期确实变了
            normalizedNew.slice(11) === '00:00' && // 新值时间部分被置为 00:00
            isValidDateTime(normalizedOld)
          ) {
            const merged = `${normalizedNew.slice(0, 10)} ${normalizedOld.slice(11)}`;
            // 立即更新单元格显示为合并后的值
            hot?.setDataAtRowProp(row, prop, merged, 'datetimeAdjust');
            // 同时把 newValue 替换为 merged，后续保存时用合并后的时间
            // eslint-disable-next-line no-param-reassign
            change[3] = merged;
          }
        }

        // 更新标签值
        let updatedValue = newValue;
        if (originalTag.type === 'number') {
          updatedValue = parseFloat(newValue) || 0;
        } else if (originalTag.type === 'boolean') {
          updatedValue = newValue === '是' || newValue === true;
        } else if (originalTag.type === 'location') {
          updatedValue = typeof newValue === 'string' ? newValue.split(',').map((s: string) => s.trim()) : newValue;
        } else if (originalTag.type === 'date') {
          updatedValue = normalizeDateValue(newValue, 'date');
        } else if (originalTag.type === 'datetime') {
          updatedValue = normalizeDateValue(newValue, 'datetime');
        }

        // 更新任务的 tags
        const updatedTags = [...(task.tags || [])];
        const tagIndex = updatedTags.findIndex((t) => (t._id || t.name) === tagKey);
        const updatedTag = { ...originalTag, value: updatedValue };
        
        if (tagIndex >= 0) {
          updatedTags[tagIndex] = updatedTag;
        } else {
          updatedTags.push(updatedTag);
        }

        // 保存到数据库
        saveTaskTags(taskId, updatedTags);
      } else if (prop === 'taskNumber' || prop === 'taskName') {
        // 更新基础字段
        saveTaskField(taskId, prop, newValue);
      }
    });
    
  }, [tasks, templateTags, saveTaskTags, saveTaskField]);

  // 将粘贴的图片 URL 写入任务标签并保存
  const applyImagePaste = useCallback(
    async (rowIndex: number, prop: string, rawValue: any) => {
      try {
        const hot = hotTableRef.current?.hotInstance;
        if (!hot || !prop) return;

        let value = typeof rawValue === 'string' ? rawValue.trim() : '';
        if (!value) {
          setAlert({
            isOpen: true,
            message: '剪贴板中未检测到图片 URL',
            type: 'warning',
          });
          return;
        }

        console.log('[paste] applyImagePaste run', { rowIndex, prop, rawValue, value });

        // 避免同一单元格相同值在短时间内重复提交（例如双触发）
        const dupKey = `${rowIndex}-${prop}`;
        const now = Date.now();
        if (
          lastImageSaveRef.current &&
          lastImageSaveRef.current.key === dupKey &&
          lastImageSaveRef.current.value === value &&
          now - lastImageSaveRef.current.ts < 300
        ) {
          console.log('[paste] skipped duplicate save', { dupKey, value });
          return;
        }

        // 如果是 base64 图片，先上传到七牛云
        if (value.startsWith('data:image/')) {
          const uploadedUrl = await uploadBase64ToQiniu(value);
          if (!uploadedUrl) return;
          value = uploadedUrl;
        }

        const rowData = hot.getSourceDataAtRow(rowIndex);
        const taskId = rowData?._id;
        if (!taskId) return;

        const tagKey = prop.replace('tag_', '');
        const task = tasks.find((t) => t._id === taskId);
        if (!task) return;

        const originalTag =
          task.tags?.find((t) => (t._id || t.name) === tagKey) ||
          templateTags.find((t) => (t._id || t.name) === tagKey);
        if (!originalTag) return;

        const updatedTags = [...(task.tags || [])];
        const tagIndex = updatedTags.findIndex((t) => (t._id || t.name) === tagKey);
        const nextTag = { ...originalTag, value };

        if (tagIndex >= 0) {
          updatedTags[tagIndex] = nextTag;
        } else {
          updatedTags.push(nextTag);
        }

        // 立即更新表格显示，并标记来源避免重复保存
        hot.setDataAtRowProp(rowIndex, prop, value, 'imagePaste');

        if (saveTaskTagsRef.current) {
          await saveTaskTagsRef.current(taskId, updatedTags);
        }

        lastImageSaveRef.current = { key: dupKey, value, ts: now };
      } catch (error) {
        setAlert({
          isOpen: true,
          message: '粘贴图片地址失败，请重试',
          type: 'error',
        });
      }
    },
    [tasks, templateTags, setAlert]
  );

  // 复制图片单元格时，始终复制图片 URL（用源数据而非渲染值，避免空串）
  const handleBeforeCopy = useCallback(
    (data: any[][], coords: any[]) => {
      const hot = hotTableRef.current?.hotInstance;
      if (!hot || !coords?.length || !data?.length) return;

      console.log('[copy] beforeCopy fired', { coords, dataSnapshot: data });

      coords.forEach((range, rangeIndex) => {
        const baseRow = range.startRow;
        const baseCol = range.startCol;

        for (let r = 0; r < data.length; r++) {
          const rowIndex = baseRow + r;
          const rowData = hot.getSourceDataAtRow(rowIndex);
          for (let c = 0; c < data[r].length; c++) {
            const colIndex = baseCol + c;
            const prop = hot.colToProp(colIndex) as string;
            if (isImageTagColumn(prop)) {
              // 优先用源数据单元格（可能是最新 setDataAtRowProp 的值）
              let raw = hot.getSourceDataAtCell(rowIndex, colIndex);
              // 兜底再从 _tag_ 中取 value（加载表格时保留了原始标签对象）
              if (!raw) {
                const tagKey = prop.replace('tag_', '');
                raw = rowData ? (rowData as any)[`_tag_${tagKey}`]?.value : undefined;
              }
              data[r][c] = typeof raw === 'string' ? raw : raw || '';
              // 确保单元格标记为可复制（某些情况下 editor=false 会阻止）
              const meta = hot.getCellMeta(rowIndex, colIndex);
              meta.copyable = true;
            }
          }
        }
      });

      console.log('[copy] beforeCopy final data', { data });
    },
    [isImageTagColumn]
  );

  // 复制完成后日志
  const handleAfterCopy = useCallback((data: any[][], coords: any[]) => {
    console.log('[copy] afterCopy fired', { coords, data });
  }, []);

  // 粘贴图片 URL 到单元格后，写入标签并保存
  const handleAfterPaste = useCallback(
    (data: any[][], coords: any[]) => {
      const hot = hotTableRef.current?.hotInstance;
      if (!hot || !coords?.length || !data?.length) return;

      console.log('[paste] afterPaste fired', { coords, dataSnapshot: data });

      // 标记最近一次由 Handsontable 处理的粘贴时间，用于避免与全局兜底重复触发
      lastPasteTsRef.current = Date.now();

      // 避免重复调用同一单元格（部分粘贴场景 coords/data 会重复触发）
      const handled = new Set<string>();

      coords.forEach((range) => {
        data.forEach((rowItems, rIndex) => {
          rowItems?.forEach((cellValue, cIndex) => {
            const colIndex = range.startCol + cIndex;
            const prop = hot.colToProp(colIndex);
            const rowIndex = range.startRow + rIndex;
            const key = `${rowIndex}-${String(prop)}`;
            if (isImageTagColumn(prop) && !handled.has(key)) {
              handled.add(key);
              const textValue =
                typeof cellValue === 'string'
                  ? cellValue.trim()
                  : cellValue === null || cellValue === undefined
                  ? ''
                  : String(cellValue).trim();
              console.log('[paste] applyImagePaste', { rowIndex, prop, textValue });
              void applyImagePaste(rowIndex, prop as string, textValue);
            }
          });
        });
      });
    },
    [applyImagePaste, isImageTagColumn]
  );

  // 填充柄：如果首个单元格包含递增数字（含前缀/后缀/补零），自动生成序号
  const handleBeforeAutofill = useCallback(
    (selectionData: any[][], sourceRange: any, targetRange: any) => {
      const hot = hotTableRef.current?.hotInstance;
      if (!hot) return;

      // 获取原始选区左上角的值作为序列起点
      const fromRow = Math.min(sourceRange?.from?.row ?? 0, sourceRange?.to?.row ?? 0);
      const fromCol = Math.min(sourceRange?.from?.col ?? 0, sourceRange?.to?.col ?? 0);
      const firstValue = hot.getDataAtCell(fromRow, fromCol);
      if (firstValue === null || firstValue === undefined) return;

      const text = String(firstValue);
      // 匹配「前缀 + 数字 + 后缀」，数字部分用于递增，保留原有位数补零
      const match = text.match(/^([^\d]*)(\d+)(.*)$/);
      if (!match) return;
      const [, prefix, numPart, suffix] = match;
      const base = Number(numPart);
      if (Number.isNaN(base)) return;
      const padLength = numPart.length;

      // 根据目标区域尺寸构造完整的填充数据（确保多行多列都递增）
      const rowsCount = Math.abs((targetRange?.to?.row ?? 0) - (targetRange?.from?.row ?? 0)) + 1;
      const colsCount = Math.abs((targetRange?.to?.col ?? 0) - (targetRange?.from?.col ?? 0)) + 1;

      const result: any[][] = Array.from({ length: rowsCount }, () => Array.from({ length: colsCount }, () => ''));
      let offset = 1; // 从 base+1 开始
      for (let r = 0; r < rowsCount; r++) {
        for (let c = 0; c < colsCount; c++) {
          const nextNum = String(base + offset).padStart(padLength, '0');
          result[r][c] = `${prefix}${nextNum}${suffix}`;
          offset += 1;
        }
      }

      return result;
    },
    []
  );

  // 填充完成后刷新边框，避免高度异步导致的错位
  const handleAfterAutofill = useCallback(() => {
    requestAnimationFrame(() => {
      fixManagementColumn();
      scheduleBorderRefresh();
    });
  }, [fixManagementColumn, scheduleBorderRefresh]);

  // 全局粘贴兜底：Clipboard API 受限时，仍可通过 Ctrl/Cmd+V 写入图片 URL
  useEffect(() => {
    const handleGlobalPaste = (event: ClipboardEvent) => {
      const hot = hotTableRef.current?.hotInstance;
      if (!hot) return;

      const selection = hot.getSelectedLast();
      if (!selection) return;

      const [row, col] = selection;
      const prop = hot.colToProp(col);
      if (!isImageTagColumn(prop)) return;

      // 若本次粘贴刚刚被 Handsontable 处理过，则跳过兜底，避免重复提交
      if (event.timeStamp && Math.abs(event.timeStamp - lastPasteTsRef.current) < 300) {
        console.log('[paste] global skipped due to recent ht paste', {
          eventTs: event.timeStamp,
          lastHtTs: lastPasteTsRef.current,
        });
        return;
      }

      // 如果事件已被阻止，说明已经有处理方
      if (event.defaultPrevented) {
        return;
      }

      const text = event.clipboardData?.getData('text') || '';
      if (!text) {
        setAlert({
          isOpen: true,
          message: '无法读取剪贴板内容，请先复制图片 URL',
          type: 'warning',
        });
        return;
      }

      console.log('[paste] global paste fallback', { row, col, prop, text });

      event.preventDefault();
      void applyImagePaste(row, prop as string, text);
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [applyImagePaste, isImageTagColumn, setAlert]);

  // 全局 copy 日志：确认快捷键触发
  useEffect(() => {
    const handleGlobalCopy = (event: ClipboardEvent) => {
      const hot = hotTableRef.current?.hotInstance;
      if (!hot) return;
      const selection = hot.getSelectedLast();
      if (!selection) return;
      const [row, col] = selection;
      const prop = hot.colToProp(col);
      console.log('[copy] global copy event', { row, col, prop, isImageTag: isImageTagColumn(prop) });
    };

    window.addEventListener('copy', handleGlobalCopy);
    return () => {
      window.removeEventListener('copy', handleGlobalCopy);
    };
  }, [isImageTagColumn]);

  // 兜底快捷键复制：若 HotTable 内部未触发 copy hook，则主动调用插件复制
  useEffect(() => {
    const handleKeydownCopy = (event: KeyboardEvent) => {
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const isCopy =
        (isMac && event.metaKey && event.key.toLowerCase() === 'c') ||
        (!isMac && event.ctrlKey && event.key.toLowerCase() === 'c');
      if (!isCopy) return;

      const hot = hotTableRef.current?.hotInstance;
      if (!hot) return;
      const selection = hot.getSelectedLast();
      if (!selection) return;

      const plugin = hot.getPlugin('copyPaste');
      if (plugin?.copy) {
        console.log('[copy] keydown fallback -> plugin.copy()');
        event.preventDefault();
        plugin.copy();
      }
    };

    window.addEventListener('keydown', handleKeydownCopy, true);
    return () => {
      window.removeEventListener('keydown', handleKeydownCopy, true);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.taskNumber || !formData.taskName || !formData.categoryId || !formData.taskTypeId) {
      setAlert({ isOpen: true, message: '请填写所有字段', type: 'warning' });
      return;
    }

    try {
      const url = editingTask ? '/api/tasks' : '/api/tasks';
      const method = editingTask ? 'PUT' : 'POST';
      const body = editingTask
        ? { id: editingTask._id, ...formData }
        : formData;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setFormData({
          taskNumber: '',
          taskName: '',
          categoryId: '',
          taskTypeId: '',
        });
        setShowAddForm(false);
        setEditingTask(null);
        await fetchTasks();
      } else {
        const data = await res.json();
        setAlert({ isOpen: true, message: data.error || '操作失败', type: 'error' });
      }
    } catch (error) {
      setAlert({ isOpen: true, message: '操作失败', type: 'error' });
    }
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    // 查找任务所属的分类
    const taskCategory = categories.find((c) => c._id === task.categoryId);
    setFormData({
      taskNumber: task.taskNumber,
      taskName: task.taskName,
      categoryId: task.categoryId,
      taskTypeId: task.taskTypeId || taskCategory?.templateId || '',
    });
    setShowAddForm(true);
  };

  const handleDelete = (id: string) => {
    setConfirm({
      isOpen: true,
      message: '确定要删除这个任务吗？',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/tasks?id=${id}`, {
            method: 'DELETE',
          });

          if (res.ok) {
            await fetchTasks();
          } else {
            const data = await res.json();
            setAlert({ isOpen: true, message: data.error || '删除失败', type: 'error' });
          }
        } catch (error) {
          setAlert({ isOpen: true, message: '删除失败', type: 'error' });
        }
      },
    });
  };

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingTask(null);
    setFormData({
      taskNumber: '',
      taskName: '',
      categoryId: '',
      taskTypeId: '',
    });
  };

  // 添加全局样式来强制固定行高
  useEffect(() => {
    const styleId = 'fixed-row-height-style';
    if (document.getElementById(styleId)) {
      return;
    }
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* 强制固定表格行高 */
      .handsontable tbody tr {
        height: 59px !important;
        max-height: 59px !important;
        min-height: 59px !important;
      }
      .handsontable tbody td {
        height: 59px !important;
        max-height: 59px !important;
        min-height: 59px !important;
        vertical-align: middle !important;
      }
      .handsontable thead tr {
        height: 59px !important;
        max-height: 59px !important;
        min-height: 59px !important;
      }
      .handsontable thead th {
        height: 59px !important;
        max-height: 59px !important;
        min-height: 59px !important;
        vertical-align: middle !important;
      }
      /* 确保图片不会撑开单元格 */
      .handsontable tbody td img {
        max-height: 40px !important;
        max-width: 40px !important;
        width: auto !important;
        height: auto !important;
        object-fit: contain !important;
        display: block !important;
        margin: 0 auto !important;
        vertical-align: middle !important;
      }
      /* 确保所有单元格行高固定（包括包含图片的单元格） */
      .handsontable tbody td {
        height: 59px !important;
        max-height: 59px !important;
        min-height: 59px !important;
        overflow: hidden !important;
        vertical-align: middle !important;
        box-sizing: border-box !important;
      }
      /* 确保所有行行高固定 */
      .handsontable tbody tr {
        height: 59px !important;
        max-height: 59px !important;
        min-height: 59px !important;
      }
      /* 行号列的行高 */
      .handsontable .ht_clone_top_left_corner tbody tr,
      .handsontable .ht_clone_left tbody tr {
        height: 59px !important;
        max-height: 59px !important;
        min-height: 59px !important;
      }
      .handsontable .ht_clone_top_left_corner tbody td,
      .handsontable .ht_clone_left tbody td {
        height: 59px !important;
        max-height: 59px !important;
        min-height: 59px !important;
        vertical-align: middle !important;
      }
      .handsontable .ht_clone_top_left_corner thead tr,
      .handsontable .ht_clone_left thead tr {
        height: 59px !important;
        max-height: 59px !important;
        min-height: 59px !important;
      }
      .handsontable .ht_clone_top_left_corner thead th,
      .handsontable .ht_clone_left thead th {
        height: 59px !important;
        max-height: 59px !important;
        min-height: 59px !important;
        vertical-align: middle !important;
      }
      /* 行号单元格 */
      .handsontable th.ht_clone_top_left_corner,
      .handsontable td.ht_clone_top_left_corner,
      .handsontable th[rowheader],
      .handsontable td[rowheader],
      .handsontable .ht_clone_top_left_corner th,
      .handsontable .ht_clone_top_left_corner td,
      .handsontable .ht_clone_left th,
      .handsontable .ht_clone_left td {
        height: 50px !important;
        max-height: 50px !important;
        min-height: 50px !important;
        line-height: 50px !important;
        padding: 0 !important;
        box-sizing: border-box !important;
        vertical-align: middle !important;
      }
      /* 确保行号列的行高一致 */
      .handsontable .ht_clone_top_left_corner tbody tr,
      .handsontable .ht_clone_left tbody tr {
        height: 59px !important;
        max-height: 59px !important;
        min-height: 59px !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      const existingStyle = document.getElementById(styleId);
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  return (
    <Layout>
      <div className="h-[calc(100vh-4rem)] flex">
        {/* 左侧分类树 */}
        <div
          className={`${
            sidebarCollapsed ? 'w-0' : 'w-64'
          } flex-shrink-0 transition-all duration-300 overflow-hidden`}
        >
          <CategoryTree
            type="task"
            onCategorySelect={(categoryId) => {
              // 只有任务类型才更新选中状态
              const category = categories.find((c) => c._id === categoryId);
              if (category?.isTaskType) {
                setSelectedCategoryId(categoryId);
              }
              // 普通文件夹不做处理，保持上次选中的任务类型
            }}
            onCategoryDoubleClick={(categoryId, category) => {
              // 只有任务类型才处理双击事件
              if (category.isTaskType) {
                setSelectedCategoryId(categoryId);
                setSelectedCategory(category);
                fetchTasks();
                setShowTaskList(true);
              }
              // 普通文件夹双击不做任何处理
            }}
            selectedCategoryId={selectedCategoryId}
          />
        </div>

        {/* 折叠按钮 */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex-shrink-0 w-6 bg-gray-100 hover:bg-gray-200 flex items-center justify-center border-r"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>

        {/* 右侧任务列表 */}
        <div ref={contentRef} className="flex-1 flex flex-col overflow-hidden bg-gray-50">
          <div className="flex-1 flex flex-col min-w-0">
            <div ref={headerRef} className="flex items-center justify-between px-4 py-3 flex-shrink-0 border-b bg-white">
              <div className="flex flex-col">
                <div className="flex items-center space-x-3">
                  <h1 className="text-xl font-bold text-gray-800">任务管理</h1>
                  <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-3 py-1">
                    当前任务模版：
                    <span className="font-medium text-gray-900 ml-1">
                      {selectedCategory && selectedCategory.templateId
                        ? getTemplateName(selectedCategory.templateId)
                        : '未选择'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  if (!selectedCategory || !selectedCategory.isTaskType) {
                    setAlert({ isOpen: true, message: '请先双击选择一个任务类型分类', type: 'warning' });
                    return;
                  }
                  setShowAddForm(true);
                  setEditingTask(null);
                  setFormData({
                    taskNumber: '',
                    taskName: '',
                    categoryId: selectedCategory._id,
                    taskTypeId: selectedCategory.templateId || '',
                  });
                }}
                disabled={!showTaskList || !selectedCategory || !selectedCategory.isTaskType}
                className="flex items-center space-x-1.5 bg-primary-600 text-white px-3 py-1.5 rounded text-sm hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                <span>新建任务</span>
              </button>
            </div>

            {!showTaskList && selectedCategoryId && selectedCategory && !selectedCategory.isTaskType && (
              <div className="flex-1 flex items-center justify-center bg-white">
                <div className="text-center text-gray-500">
                  <p className="text-base mb-1">当前选择的是普通目录</p>
                  <p className="text-xs">请双击任务类型分类（显示 [任务类型] 标识）来加载任务列表</p>
                </div>
              </div>
            )}

            {!showTaskList && selectedCategoryId === null && (
              <div className="flex-1 flex items-center justify-center bg-white">
                <div className="text-center text-gray-500">
                  <p className="text-base mb-1">请选择分类</p>
                  <p className="text-xs">双击任务类型分类来加载任务列表</p>
                </div>
              </div>
            )}

            <Modal
              isOpen={showAddForm}
              onClose={handleCancel}
              title={editingTask ? '编辑任务' : '新建任务'}
              size="lg"
            >
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      任务编号
                    </label>
                    <input
                      type="text"
                      value={formData.taskNumber}
                      onChange={(e) =>
                        setFormData({ ...formData, taskNumber: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                      placeholder="请输入任务编号"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      任务名称
                    </label>
                    <input
                      type="text"
                      value={formData.taskName}
                      onChange={(e) =>
                        setFormData({ ...formData, taskName: e.target.value })
                      }
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                      placeholder="请输入任务名称"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      所属任务分类
                    </label>
                    {editingTask ? (
                      <select
                        value={formData.categoryId}
                        onChange={(e) => {
                          const selectedCat = categories.find((c) => c._id === e.target.value);
                          setFormData({
                            ...formData,
                            categoryId: e.target.value,
                            taskTypeId: selectedCat?.templateId || '',
                          });
                        }}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">请选择分类</option>
                        {categories
                          .filter((cat) => cat.isTaskType)
                          .map((cat) => (
                            <option key={cat._id} value={cat._id}>
                              {cat.name}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={selectedCategory?.name || ''}
                        disabled
                        className="w-full px-4 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      任务模版
                    </label>
                    <input
                      type="text"
                      value={getTemplateName(formData.taskTypeId)}
                      disabled
                      className="w-full px-4 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      模版已从任务类型自动获取
                    </p>
                  </div>
                </div>
                <div className="flex space-x-2 justify-end">
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                  >
                    {editingTask ? '更新' : '创建'}
                  </button>
                </div>
              </form>
            </Modal>

            {showTaskList && (
              <div className="flex-1 flex flex-col min-h-0 bg-white">
                {tasks.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <p>当前任务类型下暂无任务</p>
                      <p className="text-xs mt-1">点击"新建任务"按钮创建第一个任务</p>
                    </div>
                  </div>
                ) : (
                  <div ref={tableContainerRef} className="flex-1 min-h-0" style={{ width: '100%', height: '100%' }}>
                    <HotTable
                      ref={hotTableRef}
                      data={tableData}
                      columns={columns}
                      colHeaders={true}
                      rowHeaders={true}
                      width="100%"
                      height={tableHeight}
                    copyPaste={true}
                      licenseKey="non-commercial-and-evaluation"
                      afterChange={handleAfterChange}
                      afterRender={fixManagementColumn}
                      afterScroll={handleAfterScroll}
                      beforeCopy={handleBeforeCopy}
                      afterCopy={handleAfterCopy}
                      afterPaste={handleAfterPaste}
                      beforeAutofill={handleBeforeAutofill}
                      afterAutofill={handleAfterAutofill}
                      manualColumnResize={true}
                      stretchH="all"
                      className="ht-theme-main"
                      autoWrapRow={false}
                      autoWrapCol={false}
                      rowHeights={59}
                      wordWrap={false}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 提示弹窗 */}
        <Alert
          isOpen={alert.isOpen}
          onClose={() => setAlert({ isOpen: false, message: '', type: 'info' })}
          message={alert.message}
          type={alert.type}
        />

        {/* 确认弹窗 */}
        <Confirm
          isOpen={confirm.isOpen}
          onClose={() => setConfirm({ isOpen: false, message: '', onConfirm: () => {} })}
          onConfirm={confirm.onConfirm}
          message={confirm.message}
          type="danger"
        />

        {/* 图片预览弹窗（仅图片类型） */}
        {imagePreview.isOpen && imagePreview.tagKey && isImageTagKey(imagePreview.tagKey) && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={() => setImagePreview({ url: '', isOpen: false, taskId: null, tagKey: null })}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h3 className="text-lg font-semibold text-gray-800">图片预览</h3>
                <button
                  type="button"
                  onClick={() => setImagePreview({ url: '', isOpen: false, taskId: null, tagKey: null })}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  关闭
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-center bg-gray-50 rounded-lg min-h-[320px]">
                  {imagePreview.url ? (
                    <img
                      src={imagePreview.url}
                      alt="预览"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <span className="text-gray-500 text-sm">暂无图片，点击下方重新上传</span>
                  )}
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={handleImageReupload}
                    className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50"
                    disabled={!imagePreview.taskId || !imagePreview.tagKey}
                  >
                    重新上传图片
                  </button>
                  <button
                    type="button"
                    onClick={() => setImagePreview({ url: '', isOpen: false, taskId: null, tagKey: null })}
                    className="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}