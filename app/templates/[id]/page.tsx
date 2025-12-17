'use client';

import { useEffect, useRef, useState, use } from 'react';
import Layout from '@/components/Layout';
import TiptapEditor, { TiptapEditorRef } from '@/components/TiptapEditor';
import TemplateTagList, { TemplateTag } from '@/components/TemplateTagList';
import { ArrowLeft, FileInput, RefreshCcw, X, ClipboardList } from 'lucide-react';

interface TemplateDetail {
  _id: string;
  name: string;
  content: string;
  tags?: TemplateTag[];
  taskId?: string;
  updatedAt?: string;
}

export default function TemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [selectedTask, setSelectedTask] = useState<{
    _id: string;
    taskNumber: string;
    taskName: string;
    categoryId: string;
    taskTypeId: string;
  } | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingName, setEditingName] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorRef = useRef<TiptapEditorRef | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const loadTemplate = async (templateId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/templates?id=${templateId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '加载模板失败');
      }
      const data = await res.json();
      const loadedTemplate = {
        ...data.template,
        tags: data.template.tags || [],
      };
      setTemplate(loadedTemplate);
      
      // 如果模板有关联的任务，自动加载任务数据到 LokiJS
      if (loadedTemplate.taskId) {
        try {
          const { getAllCachedData } = await import('@/lib/cache');
          const { loadTaskDataToLoki } = await import('@/lib/lokijs');
          
          console.log(`[模板加载] 检测到关联任务，开始加载任务数据到 LokiJS (任务ID: ${loadedTemplate.taskId})`);
          
          // 先获取任务详情
          try {
            const taskRes = await fetch('/api/tasks');
            if (taskRes.ok) {
              const taskData = await taskRes.json();
              const foundTask = taskData.tasks?.find((t: any) => t._id === loadedTemplate.taskId);
              if (foundTask) {
                setSelectedTask({
                  _id: foundTask._id,
                  taskNumber: foundTask.taskNumber,
                  taskName: foundTask.taskName,
                  categoryId: foundTask.categoryId,
                  taskTypeId: foundTask.taskTypeId,
                });
              }
            }
          } catch (taskErr) {
            console.warn('[模板加载] 获取任务详情失败:', taskErr);
          }
          
          // 加载任务数据到 LokiJS
          const allData = await getAllCachedData(loadedTemplate.taskId);
          
          if (allData.length > 0) {
            await loadTaskDataToLoki(loadedTemplate.taskId, allData);
            console.log(`[模板加载] 成功加载 ${allData.length} 条数据到 LokiJS`);
          } else {
            console.warn(`[模板加载] 任务 ${loadedTemplate.taskId} 在 IndexedDB 中没有数据`);
          }
        } catch (error) {
          console.error('[模板加载] 加载任务数据到 LokiJS 失败:', error);
        }
      }
    } catch (err: any) {
      setError(err.message || '加载模板失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplate(id);
  }, [id]);

  useEffect(() => {
    if (template) {
      setEditingName(template.name);
    }
  }, [template?._id]);

  const handleSaveTemplate = async (content: string) => {
    if (!template) return;
    try {
      const res = await fetch('/api/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: template._id,
          name: template.name,
          content,
          tags: template.tags || [],
          taskId: selectedTask?._id || template.taskId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '保存失败');
      }

      setTemplate({ ...template, content, taskId: selectedTask?._id || template.taskId, updatedAt: new Date().toISOString() });
    } catch (err: any) {
      alert(err.message || '保存失败');
      throw err;
    }
  };

  const handleTagsChange = async (tags: TemplateTag[]) => {
    if (!template) return;
    try {
      const res = await fetch('/api/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: template._id,
          name: template.name,
          content: template.content,
          tags,
          taskId: selectedTask?._id || template.taskId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '保存标签失败');
      }

      setTemplate({ ...template, tags, updatedAt: new Date().toISOString() });
    } catch (err: any) {
      alert(err.message || '保存标签失败');
    }
  };

  const handleNameSave = async () => {
    if (!template) return;
    const trimmedName = editingName.trim();
    if (!trimmedName) {
      alert('模板名称不能为空');
      setEditingName(template.name);
      setIsEditingName(false);
      return;
    }
    if (trimmedName === template.name) {
      setIsEditingName(false);
      return;
    }
    try {
      const res = await fetch('/api/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: template._id,
          name: trimmedName,
          content: template.content,
          tags: template.tags || [],
          taskId: selectedTask?._id || template.taskId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '保存名称失败');
      }

      setTemplate({ ...template, name: trimmedName, updatedAt: new Date().toISOString() });
      setIsEditingName(false);
    } catch (err: any) {
      alert(err.message || '保存名称失败');
      setEditingName(template.name);
    }
  };

  const handleNameCancel = () => {
    if (template) {
      setEditingName(template.name);
    }
    setIsEditingName(false);
  };

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  // 动态设置网页标题：模版[任务名称]
  useEffect(() => {
    const taskName = selectedTask?.taskName || template?.name;
    if (typeof document !== 'undefined') {
      document.title = taskName ? `模版-${taskName}` : '模版编辑';
    }
  }, [selectedTask?.taskName, template?.name]);

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          正在加载模板...
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center space-y-4">
          <p className="text-red-500">{error}</p>
          <button
            onClick={() => loadTemplate(id)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
          >
            <RefreshCcw className="w-4 h-4" />
            <span>重新加载</span>
          </button>
        </div>
      );
    }

    if (!template) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          未找到模板
        </div>
      );
    }

    return (
      <TiptapEditor
        ref={editorRef}
        content={template.content}
        onSave={handleSaveTemplate}
        tags={template.tags || []}
        onChangeTags={handleTagsChange}
        templateId={template._id}
        templateName={template.name}
        initialSelectedTask={selectedTask}
        onTaskChange={async (task) => {
          const newTaskId = task?._id;
          const currentTaskId = template?.taskId;
          
          // 只有当任务ID真正改变时才保存
          if (newTaskId === currentTaskId) {
            // 任务ID没有变化，只更新状态，不保存
            setSelectedTask(task);
            return;
          }
          
          setSelectedTask(task);
          
          // 当任务改变时，保存到模板
          if (template && task) {
            try {
              const res = await fetch('/api/templates', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: template._id,
                  name: template.name,
                  content: template.content,
                  tags: template.tags || [],
                  taskId: task._id,
                }),
              });

              if (res.ok) {
                setTemplate({ ...template, taskId: task._id, updatedAt: new Date().toISOString() });
                console.log('[任务关联] 已保存任务关联到模板');
              }
            } catch (err: any) {
              console.error('[任务关联] 保存任务关联失败:', err);
            }
          } else if (template && !task && currentTaskId) {
            // 如果取消任务关联（从有任务变为无任务），才保存
            try {
              const res = await fetch('/api/templates', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: template._id,
                  name: template.name,
                  content: template.content,
                  tags: template.tags || [],
                  taskId: null,
                }),
              });

              if (res.ok) {
                setTemplate({ ...template, taskId: undefined, updatedAt: new Date().toISOString() });
                console.log('[任务关联] 已取消任务关联');
              }
            } catch (err: any) {
              console.error('[任务关联] 取消任务关联失败:', err);
            }
          }
        }}
      />
    );
  };

  return (
    <Layout>
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex-1">
            <p className="text-xs text-gray-500 mb-1">模板名称</p>
            {isEditingName && template ? (
              <input
                ref={nameInputRef}
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleNameSave();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    handleNameCancel();
                  }
                }}
                className="text-xl font-semibold text-gray-800 bg-transparent border-b-2 border-primary-600 focus:outline-none focus:border-primary-700 w-full"
              />
            ) : (
              <h2
                className="text-xl font-semibold text-gray-800 cursor-pointer hover:text-primary-600 transition-colors"
                onDoubleClick={() => {
                  if (template) {
                    setEditingName(template.name);
                    setIsEditingName(true);
                  }
                }}
                title="双击编辑"
              >
                {template?.name || '加载中...'}
              </h2>
            )}
            {template?.updatedAt && (
              <p className="text-xs text-gray-500 mt-1">
                最近更新：{new Date(template.updatedAt).toLocaleString('zh-CN')}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => (window.location.href = '/templates')}
              className="inline-flex items-center space-x-2 px-4 py-2 border rounded text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>返回列表</span>
            </button>
            <button
              onClick={() => editorRef.current?.openTaskSelector()}
              className="inline-flex items-center space-x-2 px-4 py-2 border rounded text-gray-700 hover:bg-gray-50"
            >
              <ClipboardList className="w-4 h-4" />
              <span>{selectedTask ? selectedTask.taskName : '关联任务'}</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="inline-flex items-center space-x-2 px-4 py-2 border rounded text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <FileInput className="w-4 h-4" />
              <span>{isImporting ? '导入中...' : '导入 Word'}</span>
            </button>
            <button
              onClick={() => window.close()}
              className="inline-flex items-center space-x-2 px-4 py-2 border rounded text-gray-700 hover:bg-gray-50"
            >
              <X className="w-4 h-4" />
              <span>关闭标签</span>
            </button>
          </div>
        </div>
        {isImporting && (
          <div className="bg-white border-t px-6 py-3">
            <div className="flex items-center space-x-3">
              <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary-600 h-full transition-all duration-300 ease-out"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <span className="text-sm text-gray-600 min-w-[3rem] text-right">
                {importProgress}%
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {importProgress < 30 
                ? '正在上传文件...' 
                : importProgress < 100 
                ? '正在处理文档并上传图片...' 
                : '导入完成'}
            </p>
          </div>
        )}
        <div className="flex-1 overflow-hidden bg-white flex">
          <div className="flex-1 overflow-hidden">{renderContent()}</div>
          <div className="w-80 border-l">
            <TemplateTagList
              tags={template?.tags || []}
              onChange={handleTagsChange}
              templateId={template?._id || ''}
              taskId={selectedTask?._id || template?.taskId}
            />
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx"
          className="hidden"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            if (!template) {
              alert('请先选择模板');
              return;
            }
            setIsImporting(true);
            setImportProgress(0);
            let progressInterval: NodeJS.Timeout | null = null;
            
            try {
              const formData = new FormData();
              formData.append('file', file);
              formData.append('templateId', template._id);
              
              // 使用 XMLHttpRequest 来获取上传进度
              const xhr = new XMLHttpRequest();
              
              // 文件上传阶段占 30% 的进度
              const UPLOAD_PHASE_MAX = 30;
              // 服务器处理阶段占 70% 的进度（从 30% 到 100%）
              const PROCESSING_PHASE_MIN = 30;
              const PROCESSING_PHASE_MAX = 100;
              
              const promise = new Promise<{ markdown: string }>((resolve, reject) => {
                xhr.upload.addEventListener('progress', (e) => {
                  if (e.lengthComputable) {
                    // 文件上传进度映射到 0-30%
                    const uploadPercent = Math.round((e.loaded / e.total) * UPLOAD_PHASE_MAX);
                    setImportProgress(uploadPercent);
                  }
                });
                
                xhr.addEventListener('loadstart', () => {
                  // 开始上传
                  setImportProgress(0);
                });
                
                xhr.addEventListener('load', () => {
                  // 文件上传完成，设置为 30%，开始服务器处理阶段
                  setImportProgress(PROCESSING_PHASE_MIN);
                  
                  // 根据文件大小估算处理时间（大文件需要更长时间）
                  // 文件大小 < 1MB: 快速处理，每 150ms 增长 3%
                  // 文件大小 1-5MB: 中等速度，每 200ms 增长 2%
                  // 文件大小 > 5MB: 慢速处理，每 300ms 增长 1.5%
                  const fileSizeMB = file.size / (1024 * 1024);
                  let intervalTime = 200;
                  let increment = 2;
                  
                  if (fileSizeMB < 1) {
                    intervalTime = 150;
                    increment = 3;
                  } else if (fileSizeMB > 5) {
                    intervalTime = 300;
                    increment = 1.5;
                  }
                  
                  // 模拟服务器处理进度（从 30% 缓慢增长到 90%）
                  let simulatedProgress = PROCESSING_PHASE_MIN;
                  progressInterval = setInterval(() => {
                    if (simulatedProgress < 90) {
                      simulatedProgress += increment;
                      setImportProgress(Math.min(simulatedProgress, 90));
                    }
                  }, intervalTime);
                  
                  if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                      const data = JSON.parse(xhr.responseText);
                      // 清除模拟进度
                      if (progressInterval) {
                        clearInterval(progressInterval);
                        progressInterval = null;
                      }
                      setImportProgress(100);
                      resolve(data);
                    } catch (err) {
                      if (progressInterval) {
                        clearInterval(progressInterval);
                        progressInterval = null;
                      }
                      reject(new Error('解析响应失败'));
                    }
                  } else {
                    if (progressInterval) {
                      clearInterval(progressInterval);
                      progressInterval = null;
                    }
                    try {
                      const data = JSON.parse(xhr.responseText);
                      reject(new Error(data.error || '导入失败'));
                    } catch {
                      reject(new Error(`导入失败: ${xhr.statusText}`));
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
                  reject(new Error('上传已取消'));
                });
              });
              
              xhr.open('POST', '/api/templates/import-docx');
              xhr.send(formData);
              
              const data = await promise;
              setImportProgress(100);
              setTemplate({ ...template, content: data.markdown || '' });
            } catch (err: any) {
              if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
              }
              alert(err.message || '导入失败');
            } finally {
              if (progressInterval) {
                clearInterval(progressInterval);
                progressInterval = null;
              }
              setIsImporting(false);
              setTimeout(() => setImportProgress(0), 500);
            }
          }}
        />
      </div>
    </Layout>
  );
}


