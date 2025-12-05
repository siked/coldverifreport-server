'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import CategoryTree from '@/components/CategoryTree';
import Modal from '@/components/Modal';
import Alert from '@/components/Alert';
import Confirm from '@/components/Confirm';
import { Plus, BookMinus, Trash2, ChevronLeft, ChevronRight, FileText, Database } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Task {
  _id: string;
  taskNumber: string;
  taskName: string;
  categoryId: string;
  taskTypeId: string;
  userId: string;
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
}

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
        fetchTasks();
        setShowTaskList(true);
      }
      // 如果是普通文件夹，不做任何处理，保持上次选中的任务类型
    } else {
      setSelectedCategory(null);
      setShowTaskList(false);
      setTasks([]);
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

  const fetchTasks = async () => {
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
  };

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

  const getCategoryName = (categoryId: string) => {
    const category = categories.find((c) => c._id === categoryId);
    return category?.name || '未分类';
  };

  const getTemplateName = (templateId: string) => {
    const template = templates.find((t) => t._id === templateId);
    return template?.name || '未选择';
  };

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
        <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div className="flex flex-col">
                <div className="flex items-center space-x-4">
                  <h1 className="text-2xl font-bold text-gray-800">任务管理</h1>
                  <div className="text-sm text-gray-600 bg-white border border-gray-200 rounded-full px-4 py-1 shadow-sm">
                    当前任务模版：
                    <span className="font-medium text-gray-900 ml-1">
                      {selectedCategory && selectedCategory.templateId
                        ? getTemplateName(selectedCategory.templateId)
                        : '未选择'}
                    </span>
                  </div>
                </div>
                {!selectedCategory && (
                  <span className="text-xs text-gray-500 mt-2">
                    双击左侧任务类型后，这里会显示对应模版
                  </span>
                )}
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
                className="flex items-center space-x-2 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-5 h-5" />
                <span>新建任务</span>
              </button>
            </div>

            {!showTaskList && selectedCategoryId && selectedCategory && !selectedCategory.isTaskType && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <div className="text-center text-gray-500 py-8">
                  <p className="text-lg mb-2">当前选择的是普通目录</p>
                  <p className="text-sm">请双击任务类型分类（显示 [任务类型] 标识）来加载任务列表</p>
                </div>
              </div>
            )}

            {!showTaskList && selectedCategoryId === null && (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <div className="text-center text-gray-500 py-8">
                  <p className="text-lg mb-2">请选择分类</p>
                  <p className="text-sm">双击任务类型分类来加载任务列表</p>
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
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        任务编号
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        任务名称
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        所属任务分类
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        任务模版
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        创建时间
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tasks.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                          暂无任务
                        </td>
                      </tr>
                    ) : (
                      tasks.map((task) => (
                        <tr key={task._id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {task.taskNumber}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{task.taskName}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">
                              {getCategoryName(task.categoryId)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">
                              {getTemplateName(task.taskTypeId)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">
                              {task.createdAt
                                ? new Date(task.createdAt).toLocaleString('zh-CN')
                                : '-'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => router.push(`/tasks/${task._id}/data`)}
                              className="text-blue-600 hover:text-blue-900 mr-4"
                              title="数据编辑"
                            >
                              <Database className="w-4 h-4 inline" />
                            </button>
                            <button
                              onClick={() => handleEdit(task)}
                              className="text-primary-600 hover:text-primary-900 mr-4"
                              title="编辑任务"
                            >
                              <BookMinus className="w-4 h-4 inline" />
                            </button>
                            <button
                              onClick={() => handleDelete(task._id)}
                              className="text-red-600 hover:text-red-900"
                              title="删除任务"
                            >
                              <Trash2 className="w-4 h-4 inline" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {showTaskList && tasks.length === 0 && !showAddForm && (
              <div className="bg-white rounded-lg shadow p-6 mt-6">
                <div className="text-center text-gray-500 py-8">
                  <p>当前任务类型下暂无任务</p>
                  <p className="text-sm mt-2">点击"新建任务"按钮创建第一个任务</p>
                </div>
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
      </div>
    </Layout>
  );
}

