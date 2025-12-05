'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Copy, Clipboard } from 'lucide-react';
import Modal from './Modal';
import Alert from './Alert';
import Confirm from './Confirm';

interface Category {
  _id: string;
  name: string;
  parentId: string | null;
  type: 'task' | 'template';
  isTaskType?: boolean;
  templateId?: string;
  userId: string;
}

interface Template {
  _id: string;
  name: string;
  categoryId: string;
}

interface CategoryTreeProps {
  type: 'task' | 'template';
  onCategorySelect?: (categoryId: string | null) => void;
  onCategoryDoubleClick?: (categoryId: string, category: Category) => void;
  selectedCategoryId?: string | null;
}

export default function CategoryTree({ type, onCategorySelect, onCategoryDoubleClick, selectedCategoryId }: CategoryTreeProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateCategories, setTemplateCategories] = useState<Category[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTaskTypeModal, setShowTaskTypeModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newTaskTypeName, setNewTaskTypeName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedTemplateCategoryId, setSelectedTemplateCategoryId] = useState<string>('');
  const [editingTemplateId, setEditingTemplateId] = useState<string>('');
  const [editingTemplateCategoryId, setEditingTemplateCategoryId] = useState<string>('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    nodeId: string;
    node: Category;
  } | null>(null);
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [copiedCategory, setCopiedCategory] = useState<Category | null>(null);

  const filteredTemplates = selectedTemplateCategoryId
    ? templates.filter((template) => template.categoryId === selectedTemplateCategoryId)
    : [];
  const filteredEditingTemplates = editingTemplateCategoryId
    ? templates.filter((template) => template.categoryId === editingTemplateCategoryId)
    : [];
  useEffect(() => {
    fetchCategories();
    if (type === 'task') {
      fetchTemplates();
      fetchTemplateCategories();
    }
  }, [type]);

  // 点击外部关闭右键菜单
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
    };
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  // 键盘快捷键处理（全局，但只在非输入状态下生效）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果正在编辑或输入，不处理快捷键
      const activeElement = document.activeElement;
      if (
        activeElement?.tagName === 'INPUT' ||
        activeElement?.tagName === 'TEXTAREA' ||
        activeElement?.isContentEditable
      ) {
        return;
      }

      // Ctrl+C 或 Cmd+C (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        if (selectedCategoryId) {
          const category = categories.find((c) => c._id === selectedCategoryId);
          if (category) {
            e.preventDefault();
            setCopiedCategory(category);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCategoryId, categories, editingId]);

  const fetchCategories = async () => {
    try {
      const res = await fetch(`/api/categories?type=${type}`);
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

  const fetchTemplateCategories = async () => {
    try {
      const res = await fetch('/api/categories?type=template');
      if (res.ok) {
        const data = await res.json();
        setTemplateCategories(data.categories);
      }
    } catch (error) {
      console.error('获取模板分类失败:', error);
    }
  };

  const buildTree = (items: Category[], parentId: string | null = null): Category[] => {
    return items
      .filter((item) => item.parentId === parentId)
      .map((item) => ({
        ...item,
        children: buildTree(items, item._id),
      }));
  };

  const handleToggle = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const handleAdd = async (e: React.FormEvent, parentIdToUse?: string | null) => {
    e.preventDefault();
    if (!newCategoryName.trim()) {
      setAlert({ isOpen: true, message: '请输入分类名称', type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategoryName,
          parentId: parentIdToUse !== undefined ? parentIdToUse : parentId,
          type,
        }),
      });

      if (res.ok) {
        setNewCategoryName('');
        setParentId(null);
        setShowAddModal(false);
        await fetchCategories();
      } else {
        const data = await res.json();
        setAlert({ isOpen: true, message: data.error || '创建失败', type: 'error' });
      }
    } catch (error) {
      setAlert({ isOpen: true, message: '创建失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleAddTaskType = async (e: React.FormEvent, parentIdToUse?: string | null) => {
    e.preventDefault();
    if (!newTaskTypeName.trim() || !selectedTemplateCategoryId || !selectedTemplateId) {
      setAlert({ isOpen: true, message: '请填写任务类型名称并选择模版分类与模版', type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTaskTypeName,
          parentId: parentIdToUse !== undefined ? parentIdToUse : parentId,
          type: 'task',
          isTaskType: true,
          templateId: selectedTemplateId,
        }),
      });

      if (res.ok) {
        setNewTaskTypeName('');
        setSelectedTemplateId('');
        setSelectedTemplateCategoryId('');
        setParentId(null);
        setShowTaskTypeModal(false);
        await fetchCategories();
      } else {
        const data = await res.json();
        setAlert({ isOpen: true, message: data.error || '创建失败', type: 'error' });
      }
    } catch (error) {
      setAlert({ isOpen: true, message: '创建失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingName.trim()) {
      setAlert({ isOpen: true, message: '请输入分类名称', type: 'warning' });
      return;
    }

    if (!editingId) return;

    const editingCategory = categories.find((c) => c._id === editingId);
    // 如果是任务类型，必须选择模版
    if (editingCategory?.isTaskType && !editingTemplateId) {
      setAlert({ isOpen: true, message: '任务类型必须选择模版', type: 'warning' });
      return;
    }

    setLoading(true);
    try {
      const body: any = { id: editingId, name: editingName };
      // 如果是任务类型，添加 templateId
      if (editingCategory?.isTaskType) {
        body.templateId = editingTemplateId;
      }

      const res = await fetch('/api/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setEditingId(null);
        setEditingName('');
        setEditingTemplateId('');
        setEditingTemplateCategoryId('');
        setShowEditModal(false);
        await fetchCategories();
      } else {
        const data = await res.json();
        setAlert({ isOpen: true, message: data.error || '更新失败', type: 'error' });
      }
    } catch (error) {
      setAlert({ isOpen: true, message: '更新失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: string) => {
    const category = categories.find((c) => c._id === id);
    const categoryName = category?.name || '该分类';
    
    // 检查是否有子分类
    const children = categories.filter((c) => c.parentId === id);
    let message = `确定要删除"${categoryName}"吗？`;
    if (children.length > 0) {
      message += `\n\n该分类下有 ${children.length} 个子分类，删除后将同时删除所有子分类及其下的任务/模板。`;
    }
    
    setConfirm({
      isOpen: true,
      message,
      onConfirm: async () => {
        setLoading(true);
        try {
          const res = await fetch(`/api/categories?id=${id}`, {
            method: 'DELETE',
          });

          if (res.ok) {
            await fetchCategories();
          } else {
            const data = await res.json();
            setAlert({ isOpen: true, message: data.error || '删除失败', type: 'error' });
          }
        } catch (error) {
          setAlert({ isOpen: true, message: '删除失败', type: 'error' });
        } finally {
          setLoading(false);
        }
      },
    });
  };

  const handleMove = async (categoryId: string, newParentId: string | null) => {
    try {
      const res = await fetch('/api/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: categoryId,
          parentId: newParentId,
          action: 'move',
        }),
      });

      if (res.ok) {
        await fetchCategories();
      } else {
        const data = await res.json();
        setAlert({ isOpen: true, message: data.error || '移动失败', type: 'error' });
      }
    } catch (error) {
      setAlert({ isOpen: true, message: '移动失败', type: 'error' });
    }
  };

  const handlePaste = async (targetParentId: string | null) => {
    if (!copiedCategory) return;

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: copiedCategory.name,
          parentId: targetParentId,
          type: copiedCategory.type,
          isTaskType: copiedCategory.isTaskType,
          templateId: copiedCategory.templateId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const newCategoryId = data.category._id;
        
        // 如果是任务类型分类，复制该分类下的所有任务
        if (copiedCategory.isTaskType && copiedCategory._id && type === 'task') {
          await copyTasks(copiedCategory._id, newCategoryId);
        }
        
        // 如果复制的分类有子分类，需要递归复制
        if (copiedCategory._id) {
          const children = categories.filter((c) => c.parentId === copiedCategory._id);
          if (children.length > 0) {
            // 递归复制子分类
            await copyChildrenRecursive(children, newCategoryId);
          }
        }
        
        await fetchCategories();
      } else {
        const data = await res.json();
        setAlert({ isOpen: true, message: data.error || '粘贴失败', type: 'error' });
      }
    } catch (error) {
      setAlert({ isOpen: true, message: '粘贴失败', type: 'error' });
    }
  };

  const copyChildrenRecursive = async (children: Category[], newParentId: string): Promise<void> => {
    for (const child of children) {
      try {
        const res = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: child.name,
            parentId: newParentId,
            type: child.type,
            isTaskType: child.isTaskType,
            templateId: child.templateId,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const newChildId = data.category._id;
          
          // 如果是任务类型分类，复制该分类下的所有任务
          if (child.isTaskType && child._id && type === 'task') {
            await copyTasks(child._id, newChildId);
          }
          
          // 递归复制子分类
          const grandChildren = categories.filter((c) => c.parentId === child._id);
          if (grandChildren.length > 0) {
            await copyChildrenRecursive(grandChildren, newChildId);
          }
        }
      } catch (error) {
        console.error('复制子分类失败:', error);
      }
    }
  };

  const copyTasks = async (sourceCategoryId: string, targetCategoryId: string): Promise<void> => {
    try {
      // 获取源分类下的所有任务
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data = await res.json();
        const sourceTasks = data.tasks.filter((t: any) => t.categoryId === sourceCategoryId);
        
        // 获取目标分类信息（需要知道 taskTypeId）
        const targetCategory = categories.find((c) => c._id === targetCategoryId);
        if (!targetCategory || !targetCategory.isTaskType || !targetCategory.templateId) {
          return;
        }
        
        // 复制每个任务
        for (const task of sourceTasks) {
          try {
            await fetch('/api/tasks', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                taskNumber: task.taskNumber,
                taskName: task.taskName,
                categoryId: targetCategoryId,
                taskTypeId: targetCategory.templateId,
              }),
            });
          } catch (error) {
            console.error('复制任务失败:', error);
          }
        }
      }
    } catch (error) {
      console.error('获取任务失败:', error);
    }
  };

  const renderNode = (node: Category & { children?: Category[] }, level: number = 0) => {
    const isExpanded = expandedIds.has(node._id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedCategoryId === node._id;
    const isEditing = editingId === node._id;
    const isDragging = draggedNodeId === node._id;
    const isDragOver = dragOverNodeId === node._id;

    return (
      <div key={node._id}>
        <div
          className={`flex items-center py-1 px-2 hover:bg-gray-100 rounded transition-colors ${
            isSelected ? 'bg-primary-50' : ''
          } ${isDragging ? 'opacity-50' : ''} ${isDragOver ? 'bg-blue-100 border-2 border-blue-400' : ''}`}
          style={{ paddingLeft: `${level * 20 + 8}px` }}
          draggable={!isEditing}
          onDragStart={(e) => {
            setDraggedNodeId(node._id);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', node._id);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (draggedNodeId && draggedNodeId !== node._id) {
              // 检查被拖拽的分类是否是目标分类的子分类（防止循环引用）
              const isDescendant = (checkId: string, ancestorId: string): boolean => {
                if (checkId === ancestorId) return true;
                const checkNode = categories.find(c => c._id === checkId);
                if (!checkNode || !checkNode.parentId) return false;
                if (checkNode.parentId === ancestorId) return true;
                return isDescendant(checkNode.parentId, ancestorId);
              };
              // 如果目标分类是被拖拽分类的子分类，则不允许
              if (!isDescendant(node._id, draggedNodeId)) {
                setDragOverNodeId(node._id);
              }
            }
          }}
          onDragLeave={() => {
            setDragOverNodeId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId && draggedId !== node._id) {
              // 检查被拖拽的分类是否是目标分类的子分类（防止循环引用）
              const isDescendant = (checkId: string, ancestorId: string): boolean => {
                if (checkId === ancestorId) return true;
                const checkNode = categories.find(c => c._id === checkId);
                if (!checkNode || !checkNode.parentId) return false;
                if (checkNode.parentId === ancestorId) return true;
                return isDescendant(checkNode.parentId, ancestorId);
              };
              // 如果目标分类是被拖拽分类的子分类，则不允许
              if (!isDescendant(node._id, draggedId)) {
                handleMove(draggedId, node._id);
              } else {
                setAlert({ isOpen: true, message: '不能将分类移动到自己的子分类下', type: 'warning' });
              }
            }
            setDraggedNodeId(null);
            setDragOverNodeId(null);
          }}
          onDragEnd={() => {
            setDraggedNodeId(null);
            setDragOverNodeId(null);
          }}
        >
          <button
            onClick={() => hasChildren && handleToggle(node._id)}
            className="mr-1 w-4 h-4 flex items-center justify-center"
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )
            ) : (
              <span className="w-4" />
            )}
          </button>

          {node.isTaskType ? (
            <FileText className="w-4 h-4 mr-1 text-blue-600" />
          ) : isExpanded ? (
            <FolderOpen className="w-4 h-4 mr-1 text-primary-600" />
          ) : (
            <Folder className="w-4 h-4 mr-1 text-primary-600" />
          )}

          {isEditing ? (
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={() => handleEdit(node._id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleEdit(node._id);
                } else if (e.key === 'Escape') {
                  setEditingId(null);
                  setEditingName('');
                }
              }}
              autoFocus
              className="flex-1 px-2 py-1 border border-primary-300 rounded text-sm"
            />
          ) : (
            <>
              <button
                onClick={() => {
                  onCategorySelect?.(node._id);
                }}
                onDoubleClick={() => {
                  onCategoryDoubleClick?.(node._id, node);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    nodeId: node._id,
                    node: node,
                  });
                }}
                className="flex-1 text-left text-sm"
              >
                {node.name}
              </button>
            </>
          )}
        </div>

        {isExpanded && hasChildren && (
          <div>
            {node.children!.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const tree = buildTree(categories);
  const templateCategoryTree = buildTree(templateCategories);

  const renderTemplateCategoryOptions = (
    nodes: (Category & { children?: Category[] })[],
    level = 0
  ): JSX.Element[] => {
    let options: JSX.Element[] = [];
    nodes.forEach((node) => {
      options.push(
        <option key={node._id} value={node._id}>
          {`${level > 0 ? `${'-'.repeat(level * 2)} ` : ''}${node.name}`}
        </option>
      );
      if (node.children && node.children.length > 0) {
        options = options.concat(renderTemplateCategoryOptions(node.children, level + 1));
      }
    });
    return options;
  };

  return (
    <div 
      className="h-full flex flex-col bg-white border-r"
      tabIndex={0}
      onKeyDown={(e) => {
        // 如果正在编辑，不处理快捷键
        if (editingId) return;
        
        // Ctrl+C 或 Cmd+C (Mac)
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
          if (selectedCategoryId) {
            const category = categories.find((c) => c._id === selectedCategoryId);
            if (category) {
              e.preventDefault();
              setCopiedCategory(category);
            }
          }
        }
        // Ctrl+V 或 Cmd+V (Mac)
        else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
          if (copiedCategory) {
            e.preventDefault();
            handlePaste(selectedCategoryId);
          }
        }
      }}
    >
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-800">分类管理</h3>
          <div
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                nodeId: '',
                node: {} as Category,
              });
            }}
            className="p-1 hover:bg-gray-100 rounded cursor-pointer"
            title="右键添加根分类"
          >
            <Plus className="w-4 h-4" />
          </div>
        </div>

        
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <button
          onClick={() => onCategorySelect?.(null)}
          className={`w-full text-left py-1 px-2 rounded text-sm mb-1 ${
            selectedCategoryId === null ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-100'
          }`}
        >
          全部
        </button>
        <div
          className={`mb-1 py-2 px-2 rounded border-2 border-dashed transition-colors ${
            dragOverNodeId === null && draggedNodeId ? 'border-blue-400 bg-blue-50' : 'border-transparent'
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            if (draggedNodeId) {
              setDragOverNodeId(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            const draggedId = e.dataTransfer.getData('text/plain');
            if (draggedId) {
              handleMove(draggedId, null);
            }
            setDraggedNodeId(null);
            setDragOverNodeId(null);
          }}
        >
          {tree.map((node) => renderNode(node))}
        </div>
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed bg-white rounded-md shadow-lg py-1 z-20 min-w-[160px] border border-gray-200"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.nodeId ? (
              <>
                {type === 'task' && (
                  <button
                    onClick={() => {
                      setParentId(contextMenu.nodeId);
                      setNewTaskTypeName('');
                      setSelectedTemplateId('');
                      setSelectedTemplateCategoryId('');
                      setShowTaskTypeModal(true);
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  >
                    <Plus className="w-4 h-4 mr-2 text-blue-600" />
                    添加任务类型
                  </button>
                )}
                <button
                  onClick={() => {
                    setParentId(contextMenu.nodeId);
                    setNewCategoryName('');
                      setShowAddModal(true);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                >
                  <Plus className="w-4 h-4 mr-2 text-green-600" />
                  添加子分类
                </button>
                <div className="border-t border-gray-200 my-1" />
                <button
                  onClick={() => {
                    setCopiedCategory(contextMenu.node);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  复制 (Ctrl+C)
                </button>
                  <button
                  onClick={() => {
                    const node = contextMenu.node;
                    setEditingId(contextMenu.nodeId);
                    setEditingName(node.name);
                    // 如果是任务类型，设置模版相关的状态
                    if (node.isTaskType && node.templateId) {
                      // 找到当前模版所属的分类
                      const currentTemplate = templates.find((t) => t._id === node.templateId);
                      if (currentTemplate) {
                        setEditingTemplateCategoryId(currentTemplate.categoryId);
                        setEditingTemplateId(node.templateId);
                      } else {
                        setEditingTemplateCategoryId('');
                        setEditingTemplateId('');
                      }
                    } else {
                      setEditingTemplateCategoryId('');
                      setEditingTemplateId('');
                    }
                    setShowEditModal(true);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                >
                  <Edit2 className="w-4 h-4 mr-2" />
                  编辑
                </button>
                <div className="border-t border-gray-200 my-1" />
                <button
                  onClick={() => {
                    handleDelete(contextMenu.nodeId);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  删除
                </button>
                {copiedCategory && (
                  <>
                    <div className="border-t border-gray-200 my-1" />
                    <button
                      onClick={() => {
                        handlePaste(contextMenu.nodeId);
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    >
                      <Clipboard className="w-4 h-4 mr-2" />
                      粘贴 (Ctrl+V)
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                {type === 'task' && (
                  <button
                    onClick={() => {
                      setShowTaskTypeModal(true);
                      setSelectedTemplateCategoryId('');
                      setSelectedTemplateId('');
                      setParentId(null);
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                  >
                    <Plus className="w-4 h-4 mr-2 text-blue-600" />
                    添加任务类型
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowAddModal(true);
                    setParentId(null);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  添加根分类
                </button>
                {copiedCategory && (
                  <>
                    <div className="border-t border-gray-200 my-1" />
                    <button
                      onClick={() => {
                        handlePaste(null);
                        setContextMenu(null);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                    >
                      <Clipboard className="w-4 h-4 mr-2" />
                      粘贴 (Ctrl+V)
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* 添加分类弹窗 */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setNewCategoryName('');
          setParentId(null);
        }}
        title="添加分类"
        size="sm"
      >
        <form onSubmit={(e) => handleAdd(e, parentId)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              分类名称
            </label>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="请输入分类名称"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
              autoFocus
              required
            />
          </div>
          {parentId && (
            <div className="text-sm text-gray-500">
              父分类: {categories.find(c => c._id === parentId)?.name || '未知'}
            </div>
          )}
          <div className="flex space-x-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowAddModal(false);
                setNewCategoryName('');
                setParentId(null);
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 添加任务类型弹窗 */}
      <Modal
        isOpen={showTaskTypeModal}
        onClose={() => {
          setShowTaskTypeModal(false);
          setNewTaskTypeName('');
          setSelectedTemplateId('');
          setSelectedTemplateCategoryId('');
          setParentId(null);
        }}
        title="添加任务类型"
        size="sm"
      >
        <form onSubmit={(e) => handleAddTaskType(e, parentId)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              任务类型名称
            </label>
            <input
              type="text"
              value={newTaskTypeName}
              onChange={(e) => setNewTaskTypeName(e.target.value)}
              placeholder="请输入任务类型名称"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              模版分类
            </label>
            <select
              value={selectedTemplateCategoryId}
              onChange={(e) => {
                setSelectedTemplateCategoryId(e.target.value);
                setSelectedTemplateId('');
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
              required
              disabled={templateCategories.length === 0}
            >
              <option value="">请选择模版分类</option>
              {renderTemplateCategoryOptions(templateCategoryTree)}
            </select>
            {templateCategories.length === 0 && (
              <p className="text-xs text-red-500 mt-1">暂无模版分类，请先在模板管理中创建</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              选择模版
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
              required
              disabled={!selectedTemplateCategoryId || filteredTemplates.length === 0}
            >
              <option value="">
                {!selectedTemplateCategoryId
                  ? '请先选择模版分类'
                  : filteredTemplates.length === 0
                  ? '该分类下暂无模版'
                  : '请选择模版'}
              </option>
              {filteredTemplates.map((template) => (
                <option key={template._id} value={template._id}>
                  {template.name}
                </option>
              ))}
            </select>
            {!selectedTemplateCategoryId && (
              <p className="text-xs text-gray-500 mt-1">请选择模版分类后再选择模版</p>
            )}
          </div>
          {parentId && (
            <div className="text-sm text-gray-500">
              父分类: {categories.find(c => c._id === parentId)?.name || '未知'}
            </div>
          )}
          <div className="flex space-x-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowTaskTypeModal(false);
                setNewTaskTypeName('');
                setSelectedTemplateId('');
                setSelectedTemplateCategoryId('');
                setParentId(null);
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 编辑分类弹窗 */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingId(null);
          setEditingName('');
          setEditingTemplateId('');
          setEditingTemplateCategoryId('');
        }}
        title="编辑分类"
        size="sm"
      >
        <form onSubmit={handleEdit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              分类名称
            </label>
            <input
              type="text"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              placeholder="请输入分类名称"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
              autoFocus
              required
            />
          </div>
          {editingId && categories.find((c) => c._id === editingId)?.isTaskType && type === 'task' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  模版分类
                </label>
                <select
                  value={editingTemplateCategoryId}
                  onChange={(e) => {
                    setEditingTemplateCategoryId(e.target.value);
                    setEditingTemplateId('');
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  required
                  disabled={templateCategories.length === 0}
                >
                  <option value="">请选择模版分类</option>
                  {renderTemplateCategoryOptions(templateCategoryTree)}
                </select>
                {templateCategories.length === 0 && (
                  <p className="text-xs text-red-500 mt-1">暂无模版分类，请先在模板管理中创建</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  选择模版
                </label>
                <select
                  value={editingTemplateId}
                  onChange={(e) => setEditingTemplateId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  required
                  disabled={!editingTemplateCategoryId || filteredEditingTemplates.length === 0}
                >
                  <option value="">
                    {!editingTemplateCategoryId
                      ? '请先选择模版分类'
                      : filteredEditingTemplates.length === 0
                      ? '该分类下暂无模版'
                      : '请选择模版'}
                  </option>
                  {filteredEditingTemplates.map((template) => (
                    <option key={template._id} value={template._id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                {!editingTemplateCategoryId && (
                  <p className="text-xs text-gray-500 mt-1">请选择模版分类后再选择模版</p>
                )}
              </div>
            </>
          )}
          <div className="flex space-x-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowEditModal(false);
                setEditingId(null);
                setEditingName('');
                setEditingTemplateId('');
                setEditingTemplateCategoryId('');
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? '更新中...' : '更新'}
            </button>
          </div>
        </form>
      </Modal>

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
    </div>
  );
}

