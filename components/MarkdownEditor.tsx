'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bold, Italic, Heading, List, Link as LinkIcon, Save } from 'lucide-react';

interface MarkdownEditorProps {
  content: string;
  onSave: (content: string) => Promise<void>;
  autoSave?: boolean;
  autoSaveInterval?: number;
}

export default function MarkdownEditor({
  content: initialContent,
  onSave,
  autoSave = true,
  autoSaveInterval = 2000,
}: MarkdownEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  useEffect(() => {
    if (!autoSave) return;

    const timer = setTimeout(() => {
      if (content !== initialContent) {
        handleSave();
      }
    }, autoSaveInterval);

    return () => clearTimeout(timer);
  }, [content, autoSaveInterval, autoSave, initialContent]);

  const handleSave = async () => {
    if (content === initialContent) return;

    setIsSaving(true);
    try {
      await onSave(content);
      setLastSaved(new Date());
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const insertText = (before: string, after: string = '') => {
    const textarea = document.getElementById('markdown-editor') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const newText = content.substring(0, start) + before + selectedText + after + content.substring(end);

    setContent(newText);

    // 恢复光标位置
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selectedText.length);
    }, 0);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 工具栏 */}
      <div className="border-b bg-gray-50 p-2 flex items-center space-x-2">
        <button
          onClick={() => insertText('**', '**')}
          className="p-2 hover:bg-gray-200 rounded"
          title="粗体"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => insertText('*', '*')}
          className="p-2 hover:bg-gray-200 rounded"
          title="斜体"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => insertText('## ', '')}
          className="p-2 hover:bg-gray-200 rounded"
          title="标题"
        >
          <Heading className="w-4 h-4" />
        </button>
        <button
          onClick={() => insertText('- ', '')}
          className="p-2 hover:bg-gray-200 rounded"
          title="列表"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => insertText('[', '](url)')}
          className="p-2 hover:bg-gray-200 rounded"
          title="链接"
        >
          <LinkIcon className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <button
          onClick={handleSave}
          disabled={isSaving || content === initialContent}
          className="px-4 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? '保存中...' : '保存'}</span>
        </button>
        {lastSaved && (
          <span className="text-xs text-gray-500">
            已保存: {lastSaved.toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* 编辑器区域 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 编辑区 */}
        <div className="flex-1 border-r">
          <textarea
            id="markdown-editor"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full p-4 border-none resize-none focus:outline-none font-mono text-sm"
            placeholder="开始编写 Markdown 内容..."
          />
        </div>

        {/* 预览区 */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          <div className="prose max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || '*暂无内容*'}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}


