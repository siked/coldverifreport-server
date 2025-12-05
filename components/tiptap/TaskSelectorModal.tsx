'use client';

import { useState, useEffect, useMemo } from 'react';
import Modal from '../Modal';
import { Search, Check, ChevronRight, ChevronDown, Folder, FolderOpen, FileText } from 'lucide-react';

interface Task {
  _id: string;
  taskNumber: string;
  taskName: string;
  categoryId: string;
  taskTypeId: string;
}

interface Category {
  _id?: string;
  name: string;
  parentId: string | null;
  isTaskType?: boolean;
  children?: Category[];
}

interface TaskSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (task: Task) => void;
  selectedTaskId?: string | null;
}

export default function TaskSelectorModal({
  isOpen,
  onClose,
  onSelect,
  selectedTaskId,
}: TaskSelectorModalProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      fetchTasks();
    }
  }, [isOpen]);

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories?type=task');
      if (res.ok) {
        const data = await res.json();
        // 获取所有 task 类型的分类（包括普通文件夹和任务类型），用于构建完整的树形结构
        const allCategories = data.categories || [];
        console.log('获取到的分类数据:', allCategories, '数量:', allCategories.length);
        setCategories(allCategories);
      } else {
        console.error('获取分类失败，状态码:', res.status);
      }
    } catch (error) {
      console.error('获取分类失败:', error);
    }
  };

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('获取任务失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 构建分类树结构（显示所有分类，但只允许选择任务类型分类）
  const categoryTree = useMemo(() => {
    if (categories.length === 0) {
      console.log('分类列表为空');
      return [];
    }
    
    // 构建树形结构
    const buildTree = (parentId: string | null): Category[] => {
      const filtered = categories.filter((cat) => {
        if (parentId === null) {
          // 根节点：parentId 为 null 或 undefined
          return !cat.parentId || cat.parentId === null;
        }
        // 子节点：parentId 匹配
        return cat.parentId === parentId;
      });
      
      return filtered.map((cat) => ({
        ...cat,
        children: buildTree(cat._id || null),
      }));
    };
    
    const tree = buildTree(null);
    console.log('构建的分类树:', tree, '原始分类数量:', categories.length);
    return tree;
  }, [categories]);

  // 获取分类名称（包括父级路径）
  const getCategoryPath = (categoryId: string): string => {
    const category = categories.find((c) => c._id === categoryId);
    if (!category) return '未分类';
    
    const path: string[] = [];
    let current: Category | undefined = category;
    
    while (current) {
      path.unshift(current.name);
      if (current.parentId) {
        current = categories.find((c) => c._id === current.parentId);
      } else {
        break;
      }
    }
    
    return path.join(' / ');
  };

  // 过滤任务
  const filteredTasks = useMemo(() => {
    let filtered = tasks;
    
    // 按分类过滤
    if (selectedCategoryId) {
      filtered = filtered.filter((task) => task.categoryId === selectedCategoryId);
    }
    
    // 按搜索文本过滤
    if (searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(
        (task) =>
          task.taskName.toLowerCase().includes(searchLower) ||
          task.taskNumber.toLowerCase().includes(searchLower)
      );
    }
    
    return filtered;
  }, [tasks, selectedCategoryId, searchText]);

  const handleSelectTask = (task: Task) => {
    onSelect(task);
    onClose();
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

  // 渲染分类树（参考 CategoryTree 的 UI 风格）
  const renderCategoryTree = (items: Category[], level: number = 0) => {
    if (items.length === 0) {
      return (
        <div className="text-xs text-gray-400 text-center py-4">
          暂无分类
        </div>
      );
    }
    
    return (
      <div>
        {items.map((item) => {
          if (!item._id) return null;
          
          const isExpanded = expandedIds.has(item._id);
          const hasChildren = item.children && item.children.length > 0;
          const isSelected = selectedCategoryId === item._id;
          const isTaskType = item.isTaskType;
          
          return (
            <div key={item._id}>
              <div
                className={`flex items-center py-1 px-2 hover:bg-gray-100 rounded transition-colors ${
                  isSelected ? 'bg-primary-50' : ''
                }`}
                style={{ paddingLeft: `${level * 20 + 8}px` }}
              >
                <button
                  type="button"
                  onClick={() => hasChildren && handleToggle(item._id!)}
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

                {isTaskType ? (
                  <FileText className="w-4 h-4 mr-1 text-blue-600" />
                ) : isExpanded ? (
                  <FolderOpen className="w-4 h-4 mr-1 text-primary-600" />
                ) : (
                  <Folder className="w-4 h-4 mr-1 text-primary-600" />
                )}

                <button
                  type="button"
                  onClick={() => {
                    // 只允许选择任务类型分类
                    if (isTaskType) {
                      setSelectedCategoryId(item._id || null);
                    }
                  }}
                  disabled={!isTaskType}
                  className={`flex-1 text-left text-sm ${
                    !isTaskType
                      ? 'text-gray-400 cursor-not-allowed'
                      : isSelected
                      ? 'text-primary-700 font-medium'
                      : 'text-gray-700'
                  }`}
                  title={!isTaskType ? '请选择任务类型分类' : ''}
                >
                  {item.name}
                </button>
              </div>

              {isExpanded && hasChildren && (
                <div>
                  {renderCategoryTree(item.children!, level + 1)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="关联任务" size="lg">
      <div className="flex h-[500px] border rounded-lg overflow-hidden">
        {/* 左侧分类列表 */}
        <div className="w-64 border-r bg-gray-50 overflow-y-auto p-3">
          <div className="mb-3">
            <button
              type="button"
              onClick={() => setSelectedCategoryId(null)}
              className={`w-full text-left px-3 py-2 rounded text-sm hover:bg-gray-100 transition-colors ${
                selectedCategoryId === null
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-gray-700'
              }`}
            >
              全部任务
            </button>
          </div>
          {categories.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-4">
              加载中...
            </div>
          ) : categoryTree.length === 0 ? (
            <div className="text-xs text-gray-400 text-center py-4">
              暂无分类
            </div>
          ) : (
            renderCategoryTree(categoryTree)
          )}
        </div>

        {/* 右侧任务列表 */}
        <div className="flex-1 flex flex-col bg-white">
          {/* 搜索框 */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索任务名称或编号..."
                className="w-full pl-10 pr-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {/* 任务列表 */}
          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                加载中...
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                {searchText || selectedCategoryId
                  ? '没有找到匹配的任务'
                  : '暂无任务'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTasks.map((task) => (
                  <button
                    key={task._id}
                    type="button"
                    onClick={() => handleSelectTask(task)}
                    className={`w-full text-left p-3 border rounded-lg hover:bg-gray-50 transition-colors ${
                      selectedTaskId === task._id
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="font-medium text-gray-900">
                            {task.taskName}
                          </span>
                          {selectedTaskId === task._id && (
                            <Check className="w-4 h-4 text-primary-600" />
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mb-1">
                          编号: {task.taskNumber}
                        </div>
                        <div className="text-xs text-gray-400">
                          分类: {getCategoryPath(task.categoryId)}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

