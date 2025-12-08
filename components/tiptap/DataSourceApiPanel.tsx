import { FlaskConical, Plug, X } from 'lucide-react';
import React from 'react';
import type { ApiFormState, ApiTestResult } from './types';

interface DataSourceApiPanelProps {
  position: { left: number; top: number };
  apiForm: ApiFormState;
  isTesting: boolean;
  testResult: ApiTestResult;
  onChangeForm: (patch: Partial<ApiFormState>) => void;
  onTest: () => void;
  onApply: () => void;
  onClose: () => void;
}

export default function DataSourceApiPanel({
  position,
  apiForm,
  isTesting,
  testResult,
  onChangeForm,
  onTest,
  onApply,
  onClose,
}: DataSourceApiPanelProps) {
  return (
    <div
      className="fixed bg-white border rounded-lg shadow-2xl w-[420px] p-4 z-50 data-source-popover"
      style={position}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-800">接口数据</p>
          <p className="text-xs text-gray-500">支持 GET / POST，请先测试接口后再应用</p>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">接口名称（可选）</label>
          <input
            type="text"
            value={apiForm.name}
            onChange={(e) => onChangeForm({ name: e.target.value })}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">接口地址</label>
          <input
            type="text"
            value={apiForm.url}
            onChange={(e) => onChangeForm({ url: e.target.value })}
            className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="https://example.com/api"
          />
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-28">
            <label className="text-xs text-gray-500 mb-1 block">请求方式</label>
            <select
              value={apiForm.method}
              onChange={(e) => onChangeForm({ method: e.target.value as ApiFormState['method'] })}
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
              onChange={(e) => onChangeForm({ dataPath: e.target.value })}
              placeholder="如：data.items[0].value"
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">请求头（JSON，可选）</label>
          <textarea
            value={apiForm.headers}
            onChange={(e) => onChangeForm({ headers: e.target.value })}
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
              onChange={(e) => onChangeForm({ body: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        )}
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={onTest}
            disabled={isTesting}
            className="flex-1 inline-flex items-center justify-center space-x-2 px-3 py-2 border rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <FlaskConical className="w-4 h-4" />
            <span>{isTesting ? '测试中...' : '测试接口'}</span>
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!testResult?.success}
            className="flex-1 inline-flex items-center justify-center space-x-2 px-3 py-2 bg-primary-600 text-white rounded text-sm hover:bg-primary-700 disabled:opacity-40"
          >
            <Plug className="w-4 h-4" />
            <span>应用数据</span>
          </button>
        </div>
        {testResult && (
          <div
            className={`rounded px-3 py-2 text-sm ${
              testResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
            }`}
          >
            {testResult.message}
            {testResult.value && testResult.success && (
              <div className="mt-1 text-xs text-gray-600 break-words">预览：{testResult.value}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}







