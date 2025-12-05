'use client';

import { AlertTriangle, X } from 'lucide-react';
import { useEffect } from 'react';

interface ConfirmProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export default function Confirm({
  isOpen,
  onClose,
  onConfirm,
  title = '确认操作',
  message,
  confirmText = '确定',
  cancelText = '取消',
  type = 'warning',
}: ConfirmProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const typeConfig = {
    danger: {
      iconColor: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      confirmColor: 'bg-red-600 hover:bg-red-700',
    },
    warning: {
      iconColor: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      confirmColor: 'bg-yellow-600 hover:bg-yellow-700',
    },
    info: {
      iconColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      confirmColor: 'bg-blue-600 hover:bg-blue-700',
    },
  };

  const config = typeConfig[type];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      <div className={`relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 ${config.bgColor} ${config.borderColor} border-2`}>
        <div className="p-4">
          <div className="flex items-start">
            <AlertTriangle className={`w-6 h-6 ${config.iconColor} mr-3 flex-shrink-0 mt-0.5`} />
            <div className="flex-1">
              {title && (
                <h3 className="text-lg font-semibold mb-2 text-gray-800">
                  {title}
                </h3>
              )}
              <p className="text-gray-700 whitespace-pre-line">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="ml-4 p-1 hover:bg-gray-200 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md font-medium hover:bg-gray-300 transition-colors"
            >
              {cancelText}
            </button>
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`px-4 py-2 ${config.confirmColor} text-white rounded-md font-medium transition-colors`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

