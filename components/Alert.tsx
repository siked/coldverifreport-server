'use client';

import { useEffect } from 'react';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

interface AlertProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
}

export default function Alert({ isOpen, onClose, title, message, type = 'info' }: AlertProps) {
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
    success: {
      icon: CheckCircle,
      iconColor: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      titleColor: 'text-green-800',
    },
    error: {
      icon: AlertCircle,
      iconColor: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      titleColor: 'text-red-800',
    },
    warning: {
      icon: AlertCircle,
      iconColor: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-200',
      titleColor: 'text-yellow-800',
    },
    info: {
      icon: Info,
      iconColor: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      titleColor: 'text-blue-800',
    },
  };

  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      <div className={`relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 ${config.bgColor} ${config.borderColor} border-2`}>
        <div className="p-4">
          <div className="flex items-start">
            <Icon className={`w-6 h-6 ${config.iconColor} mr-3 flex-shrink-0 mt-0.5`} />
            <div className="flex-1">
              {title && (
                <h3 className={`text-lg font-semibold mb-2 ${config.titleColor}`}>
                  {title}
                </h3>
              )}
              <p className="text-gray-700">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="ml-4 p-1 hover:bg-gray-200 rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                type === 'success'
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : type === 'error'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : type === 'warning'
                  ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

