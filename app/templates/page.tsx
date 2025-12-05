'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import CategoryTree from '@/components/CategoryTree';
import { Plus, Edit2, Trash2 } from 'lucide-react';

interface Template {
  _id: string;
  name: string;
  content: string;
  categoryId: string;
  userId: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Category {
  _id: string;
  name: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateCategoryId, setNewTemplateCategoryId] = useState('');

  useEffect(() => {
    fetchTemplates();
    fetchCategories();
  }, []);

  useEffect(() => {
    if (selectedCategoryId !== null) {
      fetchTemplates();
    }
  }, [selectedCategoryId]);

  // 当选择分类变化且正在新建模板时，自动更新表单中的分类
  useEffect(() => {
    if (showAddForm && selectedCategoryId) {
      setNewTemplateCategoryId(selectedCategoryId);
    }
  }, [selectedCategoryId, showAddForm]);

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data = await res.json();
        let filtered = data.templates;
        if (selectedCategoryId !== null) {
          filtered = filtered.filter((t: Template) => t.categoryId === selectedCategoryId);
        }
        setTemplates(filtered);
      }
    } catch (error) {
      console.error('获取模板失败:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories?type=template');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories);
      }
    } catch (error) {
      console.error('获取分类失败:', error);
    }
  };

  const getCategoryName = (categoryId: string) => {
    const category = categories.find((c) => c._id === categoryId);
    return category?.name || '未分类';
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim() || !newTemplateCategoryId) {
      alert('请填写模板名称并选择分类');
      return;
    }

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName,
          content: '',
          categoryId: newTemplateCategoryId,
        }),
      });

      if (res.ok) {
        setNewTemplateName('');
        setNewTemplateCategoryId('');
        setShowAddForm(false);
        await fetchTemplates();
      } else {
        const data = await res.json();
        alert(data.error || '创建失败');
      }
    } catch (error) {
      alert('创建失败');
    }
  };

  const handleEditTemplate = (template: Template) => {
    const editUrl = `/templates/${template._id}`;
    window.open(editUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('确定要删除这个模板吗？')) return;

    try {
      const res = await fetch(`/api/templates?id=${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        await fetchTemplates();
      } else {
        const data = await res.json();
        alert(data.error || '删除失败');
      }
    } catch (error) {
      alert('删除失败');
    }
  };

  return (
    <Layout>
      <div className="h-[calc(100vh-4rem)]">
        <div className="h-full flex">
          {/* 左侧分类树 */}
          <div className="w-64 flex-shrink-0">
            <CategoryTree
              type="template"
              onCategorySelect={setSelectedCategoryId}
              selectedCategoryId={selectedCategoryId}
            />
          </div>

          {/* 右侧模板列表 */}
          <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold text-gray-800">模板管理</h1>
                <button
                  onClick={() => {
                    setShowAddForm(true);
                    setNewTemplateCategoryId(selectedCategoryId || '');
                  }}
                  className="flex items-center space-x-2 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700"
                >
                  <Plus className="w-5 h-5" />
                  <span>新建模板</span>
                </button>
              </div>

              {showAddForm && (
                <div className="bg-white rounded-lg shadow p-6 mb-6">
                  <h3 className="text-lg font-semibold mb-4">新建模板</h3>
                  <form onSubmit={handleCreateTemplate} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        模板名称
                      </label>
                      <input
                        type="text"
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                        placeholder="请输入模板名称"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        所属分类
                      </label>
                      <select
                        value={newTemplateCategoryId}
                        onChange={(e) => setNewTemplateCategoryId(e.target.value)}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                      >
                        <option value="">请选择分类</option>
                        {categories.map((cat) => (
                          <option key={cat._id} value={cat._id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                      >
                        创建
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddForm(false);
                          setNewTemplateName('');
                          setNewTemplateCategoryId('');
                        }}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                      >
                        取消
                      </button>
                    </div>
                  </form>
                </div>
              )}

              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        模板名称
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        所属分类
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        更新时间
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {templates.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                          暂无模板
                        </td>
                      </tr>
                    ) : (
                      templates.map((template) => (
                        <tr key={template._id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {template.name}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">
                              {getCategoryName(template.categoryId)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-500">
                              {template.updatedAt
                                ? new Date(template.updatedAt).toLocaleString('zh-CN')
                                : '-'}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => handleEditTemplate(template)}
                              className="text-primary-600 hover:text-primary-900 mr-4"
                            >
                              <Edit2 className="w-4 h-4 inline" />
                            </button>
                            <button
                              onClick={() => handleDeleteTemplate(template._id)}
                              className="text-red-600 hover:text-red-900"
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
          </div>
        </div>
      </div>
    </Layout>
  );
}

