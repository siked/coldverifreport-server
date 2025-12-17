'use client';

import { useEffect, useRef, useState, use } from 'react';
import Layout from '@/components/Layout';
import TiptapEditor, { TiptapEditorRef } from '@/components/TiptapEditor';
import TemplateTagList, { TemplateTag } from '@/components/TemplateTagList';
import { ArrowLeft, RefreshCcw } from 'lucide-react';

interface TaskDetail {
  _id: string;
  taskNumber: string;
  taskName: string;
  categoryId: string;
  taskTypeId: string;
  tags?: TemplateTag[];
  reportContent?: string;
}

interface TemplateDetail {
  _id: string;
  name: string;
  content: string;
  tags?: TemplateTag[];
}

export default function TaskReportCreatePage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = use(params);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [template, setTemplate] = useState<TemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<TiptapEditorRef | null>(null);
  const hasLoadedLokiRef = useRef<string | null>(null);

  const loadTaskAndTemplate = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      // 1. 获取当前用户的所有任务，在前端筛选出目标任务
      const taskRes = await fetch('/api/tasks');
      if (!taskRes.ok) {
        const data = await taskRes.json().catch(() => ({}));
        throw new Error(data.error || '加载任务失败');
      }
      const taskData = await taskRes.json();
      const foundTask: TaskDetail | undefined = taskData.tasks?.find(
        (t: TaskDetail) => t._id === id
      );
      if (!foundTask) {
        throw new Error('未找到对应任务');
      }
      setTask(foundTask);

      if (!foundTask.taskTypeId) {
        throw new Error('当前任务未配置模板，无法生成报告');
      }

      // 2. 根据任务的 taskTypeId 加载模板
      const tplRes = await fetch(`/api/templates?id=${foundTask.taskTypeId}`);
      if (!tplRes.ok) {
        const data = await tplRes.json().catch(() => ({}));
        throw new Error(data.error || '加载模板失败');
      }
      const tplData = await tplRes.json();
      const loadedTemplate: TemplateDetail = {
        ...tplData.template,
        tags: tplData.template.tags || [],
      };
      setTemplate(loadedTemplate);
    } catch (err: any) {
      setError(err.message || '加载任务或模板失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (taskId) {
      loadTaskAndTemplate(taskId);
    }
  }, [taskId]);

  // 自动将任务数据加载到 LokiJS，避免曲线生成时提示“内存中没有数据”
  useEffect(() => {
    const loadToLoki = async () => {
      if (!task?._id) return;
      if (hasLoadedLokiRef.current === task._id) return;
      try {
        const { getAllCachedData } = await import('@/lib/cache');
        const { loadTaskDataToLoki } = await import('@/lib/lokijs');
        const allData = await getAllCachedData(task._id);
        if (allData.length > 0) {
          await loadTaskDataToLoki(task._id, allData);
          console.log(`[任务关联] 已将任务 ${task._id} 的 ${allData.length} 条数据加载到 LokiJS`);
          hasLoadedLokiRef.current = task._id;
        } else {
          console.warn(`[任务关联] 任务 ${task._id} 在缓存中没有数据，曲线生成可能失败`);
        }
      } catch (err) {
        console.error('[任务关联] 自动加载任务数据到 LokiJS 失败:', err);
      }
    };
    void loadToLoki();
  }, [task?._id]);

  const handleTaskTagsChange = async (nextTags: TemplateTag[]) => {
    if (!task) return;
    try {
      const res = await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: task._id,
          taskNumber: task.taskNumber,
          taskName: task.taskName,
          categoryId: task.categoryId,
          taskTypeId: task.taskTypeId,
          tags: nextTags,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '保存任务标签失败');
      }

      setTask({ ...task, tags: nextTags });
    } catch (err: any) {
      alert(err.message || '保存任务标签失败');
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          正在加载任务与模板数据...
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center space-y-4">
          <p className="text-red-500">{error}</p>
          <button
            onClick={() => loadTaskAndTemplate(taskId)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700"
          >
            <RefreshCcw className="w-4 h-4" />
            <span>重新加载</span>
          </button>
        </div>
      );
    }

    if (!task || !template) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
          未找到任务或模板数据
        </div>
      );
    }

    const initialContent = task.reportContent && task.reportContent.trim().length > 0
      ? task.reportContent
      : template.content;

    return (
      <TiptapEditor
        ref={editorRef}
        content={initialContent}
        // 生成报告模式：将文档内容保存到任务表的 reportContent 字段
        onSave={async (content: string) => {
          if (!task) return;
          try {
            const res = await fetch('/api/tasks', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: task._id,
                taskNumber: task.taskNumber,
                taskName: task.taskName,
                categoryId: task.categoryId,
                taskTypeId: task.taskTypeId,
                tags: task.tags || [],
                reportContent: content,
              }),
            });

            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || '保存报告失败');
            }

            setTask({ ...task, reportContent: content });
          } catch (err: any) {
            alert(err.message || '保存报告失败');
            throw err;
          }
        }}
        tags={task.tags || template.tags || []}
        onChangeTags={handleTaskTagsChange}
        templateId={template._id}
        templateName={template.name}
        initialSelectedTask={{
          _id: task._id,
          taskNumber: task.taskNumber,
          taskName: task.taskName,
          categoryId: task.categoryId,
          taskTypeId: task.taskTypeId,
        }}
        // 在生成报告模式下，不允许在编辑器中切换到其他任务
        onTaskChange={async () => {
          return;
        }}
      />
    );
  };

  useEffect(() => {
    if (task?.taskName) {
      document.title = `生成-${task.taskName}`;
    } else {
      document.title = '生成报告';
    }
  }, [task?.taskName]);

  return (
    <Layout>
      <div className="h-[calc(100vh-4rem)] flex flex-col">
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex-1 flex items-center space-x-4">
            <button
              onClick={() => {
                // 优先返回任务数据页，其次返回任务列表
                if (task) {
                  window.location.href = `/tasks/${task._id}/data`;
                } else {
                  window.location.href = '/tasks';
                }
              }}
              className="inline-flex items-center space-x-2 px-3 py-1.5 border rounded text-gray-700 hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>返回</span>
            </button>
            <div className="flex flex-col">
              <p className="text-xs text-gray-500 mb-1">生成报告</p>
              <h2 className="text-xl font-semibold text-gray-800">
                {task
                  ? `${task.taskNumber} - ${task.taskName}`
                  : '加载中...'}
              </h2>
              {template && (
                <p className="text-xs text-gray-500 mt-1">
                  使用模板：{template.name}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-white flex">
          <div className="flex-1 overflow-hidden">{renderContent()}</div>
          <div className="w-80 border-l">
            <TemplateTagList
              tags={task?.tags || template?.tags || []}
              onChange={handleTaskTagsChange}
              templateId={template?._id || ''}
              taskId={task?._id}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}


