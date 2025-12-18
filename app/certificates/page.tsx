'use client';

import { useState, useEffect, useRef } from 'react';
import { HotTable, type HotTableClass } from '@handsontable/react';
import { registerAllModules } from 'handsontable/registry';
import Handsontable from 'handsontable';
import 'handsontable/dist/handsontable.full.min.css';

// 注册 Handsontable 所有内置模块（包含 date 单元格类型）
registerAllModules();
import Layout from '@/components/Layout';
import Modal from '@/components/Modal';
import { Plus, Edit2, Trash2, FileText, Eye, Upload, Search } from 'lucide-react';

interface Device {
  _id: string;
  deviceNumber: string;
  userId: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Certificate {
  _id: string;
  certificateNumber: string;
  deviceId: string;
  issueDate: string;
  expiryDate: string;
  pdfUrl?: string;
  userId: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DeviceExpiryInfo {
  deviceId: string;
  latestExpiryDate: string | null;
  daysRemaining: number | null;
  colorClass: string;
}

interface BatchRow {
  deviceNumber: string;
  certificateNumber: string;
  issueDate: string;
  expiryDate: string;
  pdfUrl: string;
  status?: 'pending' | 'success' | 'error';
  error?: string;
}

const DEFAULT_BATCH_ROWS = 1000;
const PDF_COL_INDEX = 4;
const STATUS_COL_INDEX = 5;
const ERROR_COL_INDEX = 6;

const BATCH_HEADERS = [
  '设备编号 *',
  '证书编号 *',
  '签发日期 *',
  '到期时间 *',
  'PDF文件（单击预览 / 双击上传）',
  '状态',
  '错误信息',
];

const BATCH_COLUMNS = [
  { data: 'deviceNumber', type: 'text', width: 150 },
  { data: 'certificateNumber', type: 'text', width: 150 },
  { data: 'issueDate', type: 'date', dateFormat: 'YYYY-MM-DD', correctFormat: true, width: 130 },
  { data: 'expiryDate', type: 'date', dateFormat: 'YYYY-MM-DD', correctFormat: true, width: 130 },
  { 
    data: 'pdfUrl', 
    type: 'text', 
    width: 450, 
    manualColumnResize: false,
    wordWrap: false,
    renderer: function(instance: any, td: HTMLTableCellElement, row: number, col: number, prop: string | number, value: any, cellProperties: any) {
      const url = value || '';
      // 设置样式：右对齐，只显示URL末尾部分
      td.style.whiteSpace = 'nowrap';
      td.style.overflow = 'hidden';
      td.style.textOverflow = 'ellipsis';
      td.style.textAlign = 'right';
      td.style.direction = 'ltr'; // 保持从左到右的方向
      td.title = url; // 鼠标悬停显示完整内容
      
      // 只显示末尾部分（450px宽度大约可显示60-70个字符，显示最后60个字符）
      if (url.length > 63) {
        td.textContent = '...' + url.slice(-63); // 前面用省略号，后面显示最后60个字符
      } else {
        td.textContent = url;
      }
    }
  },
  { data: 'status', readOnly: true, width: 80 },
  { data: 'error', readOnly: true, width: 150 },
];

const createEmptyBatchRows = (): BatchRow[] =>
  Array.from({ length: DEFAULT_BATCH_ROWS }, () => ({
    deviceNumber: '',
    certificateNumber: '',
    issueDate: '',
    expiryDate: '',
    pdfUrl: '',
    status: 'pending',
  }));

export default function CertificatesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [deviceExpiryInfo, setDeviceExpiryInfo] = useState<Map<string, DeviceExpiryInfo>>(new Map());
  
  // 设备相关状态
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<Device | null>(null);
  const [deviceNumber, setDeviceNumber] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  
  // 证书相关状态
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [editingCertificate, setEditingCertificate] = useState<Certificate | null>(null);
  const [certificateNumber, setCertificateNumber] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  // 批量导入状态
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchRows, setBatchRows] = useState<BatchRow[]>([]);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);
  const [isUploadingBatchPdf, setIsUploadingBatchPdf] = useState(false);
  const [currentUploadRow, setCurrentUploadRow] = useState<number | null>(null);
  const batchFileInputRef = useRef<HTMLInputElement | null>(null);
  const hotTableRef = useRef<HotTableClass | null>(null);

  const handleOpenBatchModal = () => {
    setBatchRows(createEmptyBatchRows());
    setShowBatchModal(true);
  };

  const handleBatchFieldChange = (
    index: number,
    field: keyof BatchRow,
    value: string
  ) => {
    setBatchRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;

        const updated: BatchRow = { ...row, [field]: value, status: 'pending', error: undefined };

        if (field === 'issueDate') {
          const autoExpiry = calculateExpiryDate(value);
          if (autoExpiry) {
            updated.expiryDate = autoExpiry;
          }
        }

        return updated;
      })
    );
  };

  const handleBatchAfterChange = (changes: any[] | null, source?: string) => {
    if (!changes || source === 'loadData') return;
    changes.forEach(([row, prop, _oldValue, newValue]) => {
      if (row === null || row === undefined || prop === null || prop === undefined) return;
      handleBatchFieldChange(row as number, prop as keyof BatchRow, String(newValue ?? ''));
    });
  };

  const triggerBatchPdfUpload = (rowIndex: number) => {
    if (isUploadingBatchPdf) return;
    setCurrentUploadRow(rowIndex);
    if (batchFileInputRef.current) {
      batchFileInputRef.current.value = '';
      batchFileInputRef.current.click();
    }
  };

  const handleBatchCellMouseDown = (event: any, coords: any) => {
    if (coords?.col === PDF_COL_INDEX && coords?.row >= 0) {
      const row = batchRows[coords.row];
      if (!row) return;
      // 单击预览
      if (event?.detail === 1 && row.pdfUrl) {
        handlePreviewPdf(row.pdfUrl);
      }
      // 双击上传
      if (event?.detail === 2) {
        event.preventDefault();
        triggerBatchPdfUpload(coords.row);
      }
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  useEffect(() => {
    if (devices.length > 0) {
      fetchAllDeviceExpiryInfo();
    }
  }, [devices]);

  useEffect(() => {
    if (selectedDeviceId) {
      fetchCertificates(selectedDeviceId);
    } else {
      setCertificates([]);
    }
  }, [selectedDeviceId]);

  const fetchDevices = async (): Promise<Device[] | null> => {
    try {
      const res = await fetch('/api/devices');
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices);
        return data.devices;
      }
      return null;
    } catch (error) {
      console.error('获取设备列表失败:', error);
      return null;
    }
  };

  const fetchCertificates = async (deviceId: string) => {
    try {
      const res = await fetch(`/api/certificates?deviceId=${deviceId}`);
      if (res.ok) {
        const data = await res.json();
        setCertificates(data.certificates);
      }
    } catch (error) {
      console.error('获取证书列表失败:', error);
    }
  };

  // 计算天数差和颜色
  const calculateDaysRemaining = (expiryDate: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getExpiryColorClass = (daysRemaining: number | null): string => {
    if (daysRemaining === null) return 'bg-gray-100 text-gray-600';
    if (daysRemaining < 0) return 'bg-red-100 text-red-700';
    if (daysRemaining < 30) return 'bg-yellow-100 text-yellow-700';
    return 'bg-green-100 text-green-700';
  };

  const getExpiryText = (daysRemaining: number | null): string => {
    if (daysRemaining === null) return '无证书';
    if (daysRemaining < 0) return `过期 ${Math.abs(daysRemaining)}天`;
    return `${daysRemaining}天`;
  };

  // 获取所有设备的到期信息
  const fetchAllDeviceExpiryInfo = async (deviceList?: Device[]) => {
    const expiryInfoMap = new Map<string, DeviceExpiryInfo>();
    const devicesToProcess = deviceList || devices;
    
    for (const device of devicesToProcess) {
      try {
        const res = await fetch(`/api/certificates?deviceId=${device._id}`);
        if (res.ok) {
          const data = await res.json();
          const deviceCertificates: Certificate[] = data.certificates || [];
          
          if (deviceCertificates.length > 0) {
            // 找到最新的到期时间（最晚的到期时间）
            const expiryDates = deviceCertificates
              .map(cert => cert.expiryDate)
              .filter(date => date)
              .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
            
            if (expiryDates.length > 0) {
              const latestExpiryDate = expiryDates[0];
              const daysRemaining = calculateDaysRemaining(latestExpiryDate);
              const colorClass = getExpiryColorClass(daysRemaining);
              
              expiryInfoMap.set(device._id, {
                deviceId: device._id,
                latestExpiryDate,
                daysRemaining,
                colorClass,
              });
            } else {
              expiryInfoMap.set(device._id, {
                deviceId: device._id,
                latestExpiryDate: null,
                daysRemaining: null,
                colorClass: 'text-gray-500',
              });
            }
          } else {
            expiryInfoMap.set(device._id, {
              deviceId: device._id,
              latestExpiryDate: null,
              daysRemaining: null,
              colorClass: 'text-gray-500',
            });
          }
        }
      } catch (error) {
        console.error(`获取设备 ${device._id} 的证书失败:`, error);
        expiryInfoMap.set(device._id, {
          deviceId: device._id,
          latestExpiryDate: null,
          daysRemaining: null,
          colorClass: 'text-gray-500',
        });
      }
    }
    
    setDeviceExpiryInfo(expiryInfoMap);
  };

  // 设备相关操作
  const handleAddDevice = () => {
    setEditingDevice(null);
    setDeviceNumber('');
    setShowDeviceModal(true);
  };

  const handleEditDevice = (device: Device) => {
    setEditingDevice(device);
    setDeviceNumber(device.deviceNumber);
    setShowDeviceModal(true);
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('确定要删除该设备吗？删除设备将同时删除该设备的所有证书。')) {
      return;
    }

    try {
      const res = await fetch(`/api/devices?id=${deviceId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        const updatedDevices = await fetchDevices();
        // 设备删除后，重新获取到期信息
        if (updatedDevices && updatedDevices.length > 0) {
          await fetchAllDeviceExpiryInfo(updatedDevices);
        } else {
          setDeviceExpiryInfo(new Map());
        }
        if (selectedDeviceId === deviceId) {
          setSelectedDeviceId(null);
          setCertificates([]);
        }
      } else {
        const data = await res.json();
        alert(data.error || '删除设备失败');
      }
    } catch (error) {
      console.error('删除设备失败:', error);
      alert('删除设备失败');
    }
  };

  const handleSaveDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deviceNumber.trim()) {
      alert('请输入设备编号');
      return;
    }

    // 检查设备编号是否已存在
    const trimmedDeviceNumber = deviceNumber.trim();
    const existingDevice = devices.find(
      (device) =>
        device.deviceNumber.toLowerCase() === trimmedDeviceNumber.toLowerCase() &&
        (!editingDevice || device._id !== editingDevice._id)
    );

    if (existingDevice) {
      alert('设备编号已存在');
      return;
    }

    try {
      const res = editingDevice
        ? await fetch('/api/devices', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: editingDevice._id,
              deviceNumber: trimmedDeviceNumber,
            }),
          })
        : await fetch('/api/devices', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deviceNumber: trimmedDeviceNumber,
            }),
          });

      if (res.ok) {
        const updatedDevices = await fetchDevices();
        // 设备保存后，重新获取到期信息
        if (updatedDevices && updatedDevices.length > 0) {
          await fetchAllDeviceExpiryInfo(updatedDevices);
        }
        setShowDeviceModal(false);
        setEditingDevice(null);
        setDeviceNumber('');
      } else {
        const data = await res.json();
        alert(data.error || '保存设备失败');
      }
    } catch (error) {
      console.error('保存设备失败:', error);
      alert('保存设备失败');
    }
  };

  // 证书相关操作
  // 计算到期时间（签发日期加1年）
  const calculateExpiryDate = (issueDateValue: string): string => {
    if (!issueDateValue) return '';
    
    const issueDateObj = new Date(issueDateValue);
    if (isNaN(issueDateObj.getTime())) return '';
    
    // 加1年
    const expiryDateObj = new Date(issueDateObj);
    expiryDateObj.setFullYear(expiryDateObj.getFullYear() + 1);
    
    // 格式化为 YYYY-MM-DD
    const year = expiryDateObj.getFullYear();
    const month = String(expiryDateObj.getMonth() + 1).padStart(2, '0');
    const day = String(expiryDateObj.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  };

  const handleAddCertificate = () => {
    if (!selectedDeviceId) {
      alert('请先选择设备');
      return;
    }
    setEditingCertificate(null);
    setCertificateNumber('');
    setIssueDate('');
    setExpiryDate('');
    setPdfUrl('');
    setShowCertificateModal(true);
  };

  const handleEditCertificate = (certificate: Certificate) => {
    setEditingCertificate(certificate);
    setCertificateNumber(certificate.certificateNumber);
    setIssueDate(certificate.issueDate);
    setExpiryDate(certificate.expiryDate);
    setPdfUrl(certificate.pdfUrl || '');
    setShowCertificateModal(true);
  };

  const handleDeleteCertificate = async (certificateId: string) => {
    if (!confirm('确定要删除该证书吗？')) {
      return;
    }

    try {
      const res = await fetch(`/api/certificates?id=${certificateId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        if (selectedDeviceId) {
          await fetchCertificates(selectedDeviceId);
        }
        // 证书删除后，重新获取到期信息
        await fetchAllDeviceExpiryInfo();
      } else {
        const data = await res.json();
        alert(data.error || '删除证书失败');
      }
    } catch (error) {
      console.error('删除证书失败:', error);
      alert('删除证书失败');
    }
  };

  const handleSaveCertificate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certificateNumber.trim() || !issueDate || !expiryDate) {
      alert('请填写所有必填字段');
      return;
    }

    if (!selectedDeviceId) {
      alert('请先选择设备');
      return;
    }

    try {
      const res = editingCertificate
        ? await fetch('/api/certificates', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: editingCertificate._id,
              certificateNumber: certificateNumber.trim(),
              issueDate,
              expiryDate,
              pdfUrl: pdfUrl || undefined,
            }),
          })
        : await fetch('/api/certificates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              certificateNumber: certificateNumber.trim(),
              deviceId: selectedDeviceId,
              issueDate,
              expiryDate,
              pdfUrl: pdfUrl || undefined,
            }),
          });

      if (res.ok) {
        if (selectedDeviceId) {
          await fetchCertificates(selectedDeviceId);
        }
        // 证书保存后，重新获取到期信息
        await fetchAllDeviceExpiryInfo();
        setShowCertificateModal(false);
        setEditingCertificate(null);
        setCertificateNumber('');
        setIssueDate('');
        setExpiryDate('');
        setPdfUrl('');
      } else {
        const data = await res.json();
        alert(data.error || '保存证书失败');
      }
    } catch (error) {
      console.error('保存证书失败:', error);
      alert('保存证书失败');
    }
  };

  const handleBatchImport = async () => {
    const preparedRows = batchRows.map((row, index) => ({
      index,
      deviceNumber: row.deviceNumber.trim(),
      certificateNumber: row.certificateNumber.trim(),
      issueDate: row.issueDate,
      expiryDate: row.expiryDate,
      pdfUrl: (row.pdfUrl || '').trim(),
    }));

    const validRows = preparedRows.filter(
      (row) => row.deviceNumber && row.certificateNumber && row.issueDate && row.expiryDate
    );

    if (validRows.length === 0) {
      alert('请至少填写一行完整数据（设备编号、证书编号、签发日期、到期时间必填）');
      return;
    }

    setIsSubmittingBatch(true);
    setBatchRows((prev) =>
      prev.map((row, idx) =>
        validRows.some((v) => v.index === idx) ? { ...row, status: 'pending', error: undefined } : row
      )
    );

    try {
      const res = await fetch('/api/certificates/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      });

      if (res.ok) {
        const data = await res.json();
        const successSet = new Set<number>(data.successes || []);
        const errorMap: Map<number, string> = new Map();
        (data.errors || []).forEach((err: { index: number; message: string }) => {
          errorMap.set(err.index, err.message);
        });

        setBatchRows((prev) =>
          prev.map((row, idx) => {
            if (successSet.has(idx)) {
              return { ...row, status: 'success', error: undefined };
            }
            if (errorMap.has(idx)) {
              return { ...row, status: 'error', error: errorMap.get(idx) };
            }
            return row;
          })
        );

        if ((data.successCount || 0) > 0) {
          const updatedDevices = await fetchDevices();
          if (updatedDevices && updatedDevices.length > 0) {
            await fetchAllDeviceExpiryInfo(updatedDevices);
          }
          if (selectedDeviceId) {
            await fetchCertificates(selectedDeviceId);
          }
          alert(
            `导入完成：成功 ${data.successCount || 0} 条，失败 ${data.failedCount || 0} 条`
          );
        } else {
          alert('未成功导入数据，请检查表格内容');
        }
      } else {
        const data = await res.json();
        alert(data.error || '批量导入失败');
      }
    } catch (error) {
      console.error('批量导入失败:', error);
      alert('批量导入失败');
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  // PDF上传处理
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('请上传PDF文件');
      return;
    }

    setIsUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload/pdf', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setPdfUrl(data.url);
        // alert('PDF上传成功');
      } else {
        const data = await res.json();
        alert(data.error || 'PDF上传失败');
      }
    } catch (error) {
      console.error('PDF上传失败:', error);
      alert('PDF上传失败');
    } finally {
      setIsUploadingPdf(false);
      // 重置input，允许重复上传同一文件
      e.target.value = '';
    }
  };

  const handleBatchPdfFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || currentUploadRow === null) return;

    if (file.type !== 'application/pdf') {
      alert('请上传PDF文件');
      return;
    }

    setIsUploadingBatchPdf(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload/pdf', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        // 同步更新 state
        setBatchRows((prev) =>
          prev.map((row, idx) =>
            idx === currentUploadRow
              ? { ...row, pdfUrl: data.url, status: 'pending', error: undefined }
              : row
          )
        );
        // 直接写入表格，避免因引用比较未触发渲染时看不到更新
        const hot = hotTableRef.current?.hotInstance;
        if (hot) {
          hot.setDataAtCell(currentUploadRow, PDF_COL_INDEX, data.url, 'upload');
        }
      } else {
        const data = await res.json();
        alert(data.error || 'PDF上传失败');
      }
    } catch (error) {
      console.error('批量PDF上传失败:', error);
      alert('PDF上传失败');
    } finally {
      setIsUploadingBatchPdf(false);
      setCurrentUploadRow(null);
      e.target.value = '';
    }
  };

  // PDF预览
  const handlePreviewPdf = (url: string) => {
    setPreviewPdfUrl(url);
  };

  const handleClosePreview = () => {
    setPreviewPdfUrl(null);
  };

  return (
    <Layout>
      <div className="h-screen flex flex-col">
        <div className="flex-1 flex overflow-hidden">
          {/* 左侧设备列表 */}
          <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">设备列表</h2>
              <button
                onClick={handleAddDevice}
                className="p-2 text-primary-600 hover:bg-primary-50 rounded-md transition-colors"
                title="添加设备"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="p-4">
                {/* 搜索框 */}
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchKeyword}
                      onChange={(e) => setSearchKeyword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm"
                      placeholder="搜索设备编号..."
                    />
                  </div>
                </div>
                <div className="text-sm font-medium text-gray-700 mb-2">设备编号</div>
                <div className="space-y-1">
                  {[...devices]
                    .filter((device) => {
                      if (!searchKeyword.trim()) return true;
                      return device.deviceNumber.toLowerCase().includes(searchKeyword.toLowerCase());
                    })
                    .sort((a, b) => {
                      const infoA = deviceExpiryInfo.get(a._id);
                      const infoB = deviceExpiryInfo.get(b._id);
                      
                      // 没有到期信息的排在最后
                      if (!infoA?.latestExpiryDate && !infoB?.latestExpiryDate) return 0;
                      if (!infoA?.latestExpiryDate) return 1;
                      if (!infoB?.latestExpiryDate) return -1;
                      
                      // 按照最新到期时间排序（到期时间早的在前）
                      const dateA = new Date(infoA.latestExpiryDate!).getTime();
                      const dateB = new Date(infoB.latestExpiryDate!).getTime();
                      return dateA - dateB;
                    })
                    .map((device) => {
                      const expiryInfo = deviceExpiryInfo.get(device._id);
                      const daysRemaining = expiryInfo?.daysRemaining;
                      const latestExpiryDate = expiryInfo?.latestExpiryDate;
                      const colorClass = expiryInfo?.colorClass || 'text-gray-500';
                      
                      return (
                        <div
                          key={device._id}
                          className={`p-3 rounded-md cursor-pointer transition-colors group ${
                            selectedDeviceId === device._id
                              ? 'bg-primary-100 text-primary-700'
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => setSelectedDeviceId(device._id)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium truncate flex-1 min-w-0">{device.deviceNumber}</span>
                            <div className="relative ml-2 flex items-center">
                              {/* 到期时间标签 - 默认显示，hover时隐藏 */}
                              <div className="flex items-center space-x-1 opacity-100 group-hover:opacity-0 group-hover:pointer-events-none transition-opacity">
                                {latestExpiryDate && daysRemaining !== null && daysRemaining !== undefined ? (
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${colorClass}`}
                                    title={`到期时间: ${latestExpiryDate}`}
                                  >
                                    {getExpiryText(daysRemaining)}
                                  </span>
                                ) : (
                                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${colorClass}`}>
                                    {getExpiryText(null)}
                                  </span>
                                )}
                              </div>
                              {/* 编辑、删除按钮 - 默认隐藏，hover时显示 */}
                              <div className="absolute right-0 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditDevice(device);
                                  }}
                                  className="p-1 text-gray-500 hover:text-primary-600 rounded"
                                  title="编辑"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteDevice(device._id);
                                  }}
                                  className="p-1 text-gray-500 hover:text-red-600 rounded"
                                  title="删除"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  {devices.filter((device) => {
                    if (!searchKeyword.trim()) return true;
                    return device.deviceNumber.toLowerCase().includes(searchKeyword.toLowerCase());
                  }).length === 0 && (
                    <div className="text-center text-gray-500 py-8">
                      {devices.length === 0 
                        ? '暂无设备，点击 + 添加设备'
                        : searchKeyword.trim() 
                          ? `未找到包含"${searchKeyword}"的设备`
                          : '暂无设备，点击 + 添加设备'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* 右侧证书列表 */}
          <div className="flex-1 flex flex-col bg-gray-50">
            <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">
                {selectedDeviceId
                  ? `证书列表 - ${devices.find((d) => d._id === selectedDeviceId)?.deviceNumber || ''}`
                  : '证书列表'}
              </h2>
              <div className="flex items-center space-x-3">
                <button
                  onClick={handleOpenBatchModal}
                  className="px-4 py-2 border border-primary-200 text-primary-700 bg-primary-50 rounded-md hover:bg-primary-100 transition-colors flex items-center space-x-2"
                >
                  <Upload className="w-4 h-4" />
                  <span>批量添加证书</span>
                </button>
                {selectedDeviceId && (
                  <button
                    onClick={handleAddCertificate}
                    className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors flex items-center space-x-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>添加证书</span>
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {selectedDeviceId ? (
                <div className="bg-white rounded-lg shadow-sm">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">证书编号</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">签发日期</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">到期时间</th>
                        <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">PDF文件</th>
                        <th className="px-4 py-3 text-right text-sm font-medium text-gray-700">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {certificates.map((certificate) => (
                        <tr key={certificate._id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{certificate.certificateNumber}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{certificate.issueDate}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{certificate.expiryDate}</td>
                          <td className="px-4 py-3 text-sm">
                            {certificate.pdfUrl ? (
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handlePreviewPdf(certificate.pdfUrl!)}
                                  className="text-primary-600 hover:text-primary-700 flex items-center space-x-1"
                                  title="单击预览"
                                >
                                  <Eye className="w-4 h-4" />
                                  <span className="text-xs">预览</span>
                                </button>
                                {/* <span 
                                  className="text-gray-500 text-xs truncate max-w-[400px] cursor-pointer hover:text-primary-600" 
                                  title={certificate.pdfUrl}
                                  onClick={() => {
                                    navigator.clipboard.writeText(certificate.pdfUrl!);
                                    alert('已复制完整URL到剪贴板');
                                  }}
                                >
                                  {certificate.pdfUrl}
                                </span> */}
                              </div>
                            ) : (
                              <span className="text-gray-400">未上传</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleEditCertificate(certificate)}
                                className="p-1 text-gray-500 hover:text-primary-600 rounded"
                                title="编辑"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteCertificate(certificate._id)}
                                className="p-1 text-gray-500 hover:text-red-600 rounded"
                                title="删除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {certificates.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                            暂无证书，点击"添加证书"按钮添加
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  请从左侧选择设备查看证书列表
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 设备编辑弹窗 */}
        <Modal
          isOpen={showDeviceModal}
          onClose={() => {
            setShowDeviceModal(false);
            setEditingDevice(null);
            setDeviceNumber('');
          }}
          title={editingDevice ? '编辑设备' : '添加设备'}
          size="sm"
        >
          <form onSubmit={handleSaveDevice} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                设备编号 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={deviceNumber}
                onChange={(e) => setDeviceNumber(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                placeholder="请输入设备编号"
                required
                autoFocus
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeviceModal(false);
                  setEditingDevice(null);
                  setDeviceNumber('');
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
              >
                保存
              </button>
            </div>
          </form>
        </Modal>

        {/* 证书编辑弹窗 */}
        <Modal
          isOpen={showCertificateModal}
          onClose={() => {
            setShowCertificateModal(false);
            setEditingCertificate(null);
            setCertificateNumber('');
            setIssueDate('');
            setExpiryDate('');
            setPdfUrl('');
          }}
          title={editingCertificate ? '编辑证书' : '添加证书'}
          size="md"
        >
          <form onSubmit={handleSaveCertificate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                证书编号 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={certificateNumber}
                onChange={(e) => setCertificateNumber(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                placeholder="请输入证书编号"
                required
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  签发日期 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => {
                    const newIssueDate = e.target.value;
                    setIssueDate(newIssueDate);
                    // 自动计算到期时间（签发日期加1年）
                    if (newIssueDate) {
                      const calculatedExpiryDate = calculateExpiryDate(newIssueDate);
                      setExpiryDate(calculatedExpiryDate);
                    }
                  }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  到期时间 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  required
                />
                {issueDate && expiryDate && (
                  <p className="text-xs text-gray-500 mt-1">到期时间已自动计算（签发日期+1年），可手动修改</p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PDF文件
              </label>
              <div className="space-y-2">
                {pdfUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2 p-2 bg-gray-50 rounded-md">
                      <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <span 
                        className="text-sm text-gray-700 flex-1 truncate cursor-pointer hover:text-primary-600"
                        title={pdfUrl}
                        onClick={() => {
                          navigator.clipboard.writeText(pdfUrl);
                          alert('已复制完整URL到剪贴板');
                        }}
                      >
                        {pdfUrl}
                      </span>
                      <button
                        type="button"
                        onClick={() => handlePreviewPdf(pdfUrl)}
                        className="text-primary-600 hover:text-primary-700 flex-shrink-0"
                        title="预览"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
                <label 
                  className="flex items-center justify-center w-full px-4 py-2 border-2 border-dashed border-gray-300 rounded-md cursor-pointer hover:border-primary-500 transition-colors"
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    const input = document.getElementById('pdf-upload-input') as HTMLInputElement;
                    if (input && !isUploadingPdf) {
                      input.click();
                    }
                  }}
                >
                  <input
                    id="pdf-upload-input"
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={handlePdfUpload}
                    className="hidden"
                    disabled={isUploadingPdf}
                  />
                  <div className="flex items-center space-x-2">
                    {isUploadingPdf ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                        <span className="text-sm text-gray-600">上传中...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-600">
                          {pdfUrl ? '重新上传PDF（双击或点击）' : '双击或点击上传PDF文件'}
                        </span>
                      </>
                    )}
                  </div>
                </label>
                <p className="text-xs text-gray-500">双击或点击上传PDF文件到七牛云</p>
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setShowCertificateModal(false);
                  setEditingCertificate(null);
                  setCertificateNumber('');
                  setIssueDate('');
                  setExpiryDate('');
                  setPdfUrl('');
                }}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors"
              >
                保存
              </button>
            </div>
          </form>
        </Modal>

        {/* 批量导入证书弹窗 */}
        <Modal
          isOpen={showBatchModal}
          onClose={() => {
            setShowBatchModal(false);
            setBatchRows([]);
            setCurrentUploadRow(null);
          }}
          title="批量添加证书"
          size="2xl"
        >
          <div className="space-y-4">


            <div className="border rounded-lg overflow-hidden">
              <HotTable
                ref={hotTableRef}
                data={batchRows}
                columns={BATCH_COLUMNS}
                colHeaders={BATCH_HEADERS}
                rowHeaders
                stretchH="last"
                height="75vh"
                manualColumnResize={true}
                manualRowResize={false}
                filters
                dropdownMenu
                contextMenu
                copyPaste
                licenseKey="non-commercial-and-evaluation"
                afterChange={handleBatchAfterChange}
                afterOnCellMouseDown={handleBatchCellMouseDown}
                cells={(_row, col) => {
                  if (col === STATUS_COL_INDEX || col === ERROR_COL_INDEX) {
                    return { readOnly: true, className: 'bg-gray-50' };
                  }
                  if (col === PDF_COL_INDEX) {
                    return { className: 'cursor-pointer' };
                  }
                  return {};
                }}
              />
            </div>

            <input
              ref={batchFileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={handleBatchPdfFileChange}
              disabled={isUploadingBatchPdf}
            />

            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500 space-y-1">
                <p>说明：</p>
                <p>1）双击 PDF 列可上传文件到七牛云，自动生成随机文件名并显示完整 URL，单击可预览。</p>
                <p>2）导入时若设备不存在将自动创建。</p>
              </div>
              <button
                type="button"
                onClick={handleBatchImport}
                className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 transition-colors flex items-center space-x-2 disabled:opacity-60"
                disabled={isSubmittingBatch || isUploadingBatchPdf}
              >
                {isSubmittingBatch ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>导入中...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>导入</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>

        {/* PDF预览弹窗 */}
        {previewPdfUrl && (
          <Modal
            isOpen={!!previewPdfUrl}
            onClose={handleClosePreview}
            title="PDF预览"
            size="xl"
          >
            <div className="w-full h-[80vh]">
              <iframe
                src={previewPdfUrl}
                className="w-full h-full border-0"
                title="PDF预览"
              />
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  );
}

