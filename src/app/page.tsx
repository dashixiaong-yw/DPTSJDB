'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Loader2,
  Download,
  Eye,
  Play,
  Timer,
  Image as ImageIcon,
  AlertCircle,
  History,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { toast } from 'sonner';

interface TaskStatus {
  id: string;
  status: 'uploaded' | 'pending' | 'processing' | 'completed' | 'failed';
  platform?: string;
  progress?: number;
  currentStep?: string;
  error?: string;
  fileName: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  totalImages?: number;
  processedImages?: number;
  resultPath?: string;
}

interface HistoryTask extends TaskStatus {
  file_name: string;
  file_path: string;
  error_message?: string;
  result_path?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  current_step?: string;
  total_images?: number;
  processed_images?: number;
}

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentTask, setCurrentTask] = useState<TaskStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [historyTasks, setHistoryTasks] = useState<HistoryTask[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  // 清理OCR缓存
  const handleClearCache = async () => {
    if (!confirm('确定要清理OCR缓存吗？清理后重新处理文件将重新进行OCR识别。')) {
      return;
    }
    
    setClearingCache(true);
    try {
      const response = await fetch('/api/cache/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ocr' }),
      });
      
      if (response.ok) {
        const data = await response.json();
        toast.success('缓存已清理', {
          description: `已清理 ${data.clearedCount || 0} 条OCR缓存记录`,
        });
      } else {
        toast.error('清理失败', {
          description: '请稍后重试',
        });
      }
    } catch (error) {
      console.error('清理缓存失败:', error);
      toast.error('清理失败', {
        description: '网络错误，请稍后重试',
      });
    } finally {
      setClearingCache(false);
    }
  };

  // 加载历史记录
  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch('/api/tasks');
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.tasks) {
          setHistoryTasks(data.tasks);
        }
      }
    } catch (error) {
      console.error('加载历史记录失败:', error);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // 页面加载时获取历史记录
  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 计算耗时
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (currentTask?.status === 'processing' && currentTask?.startedAt) {
      timer = setInterval(() => {
        const start = new Date(currentTask.startedAt!).getTime();
        const now = Date.now();
        setElapsedTime(Math.floor((now - start) / 1000));
      }, 1000);
    } else {
      setElapsedTime(0);
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [currentTask?.status, currentTask?.startedAt]);

  // 格式化耗时
  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}分${secs}秒`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setUploadError(null); // 清除之前的错误
    
    console.log('===== 文件选择 =====');
    
    if (selectedFile) {
      console.log('选择的文件:');
      console.log('  - 文件名:', selectedFile.name);
      console.log('  - 文件大小:', (selectedFile.size / 1024 / 1024).toFixed(2), 'MB');
      console.log('  - MIME类型:', selectedFile.type || '(空)');
      console.log('  - 最后修改:', selectedFile.lastModified);
      
      // 验证文件格式 - 支持MIME类型和文件扩展名双重检查
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/octet-stream', // 有些浏览器会发送这个类型
        '', // 某些浏览器可能不发送type
      ];
      const validExtensions = ['.xlsx', '.xls'];
      const fileName = selectedFile.name.toLowerCase();
      const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
      const hasValidType = validTypes.includes(selectedFile.type);
      
      console.log('文件验证:');
      console.log('  - 扩展名有效:', hasValidExtension, '(' + fileName + ')');
      console.log('  - MIME类型有效:', hasValidType, '(' + (selectedFile.type || '空') + ')');
      
      if (!hasValidType && !hasValidExtension) {
        const errorMsg = `文件格式不支持 (MIME: ${selectedFile.type || '空'})，请上传 .xlsx 或 .xls 格式的 Excel 文件`;
        console.error('验证失败:', errorMsg);
        setUploadError(errorMsg);
        toast.error('文件格式错误', {
          description: '请上传 .xlsx 或 .xls 格式的 Excel 文件',
        });
        return;
      }
      
      // 如果只有扩展名正确但MIME类型不是Excel，给出警告但允许上传
      if (!hasValidType && hasValidExtension) {
        console.log('文件MIME类型不是标准Excel类型，但扩展名正确，允许上传');
      }
      
      // 验证文件大小（100MB）
      if (selectedFile.size > 100 * 1024 * 1024) {
        const errorMsg = `文件大小 ${(selectedFile.size / 1024 / 1024).toFixed(2)}MB 超过100MB限制`;
        console.error('验证失败:', errorMsg);
        setUploadError(errorMsg);
        toast.error('文件过大', {
          description: '文件大小不能超过 100MB',
        });
        return;
      }
      
      console.log('文件验证通过，已设置文件');
      setFile(selectedFile);
      // 选择新文件时重置任务状态
      setCurrentTask(null);
    } else {
      console.log('未选择文件');
    }
  };

  // 带重试的上传函数
  const fetchWithRetry = async (url: string, options: RequestInit, maxRetries = 3): Promise<Response> => {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, options);
        return response;
      } catch (error) {
        lastError = error as Error;
        console.log(`上传尝试 ${attempt}/${maxRetries} 失败:`, lastError.message);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    throw lastError || new Error('上传失败');
  };

  // 方案一：FormData 分片上传（推荐）
  const uploadWithFormDataChunks = async (file: File): Promise<{ taskId: string }> => {
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB 每片（增加分片大小，减少分片数量）
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let uploadId: string | null = null;

    console.log(`开始 FormData 分片上传: ${file.name}, 大小: ${(file.size / 1024 / 1024).toFixed(2)}MB, 分片数: ${totalChunks}`);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      console.log(`准备上传分片 ${i + 1}/${totalChunks}, 大小: ${(chunk.size / 1024).toFixed(2)}KB`);
      
      const formData = new FormData();
      if (uploadId) {
        formData.append('uploadId', uploadId);
      }
      formData.append('chunkIndex', i.toString());
      formData.append('totalChunks', totalChunks.toString());
      formData.append('chunk', chunk);
      formData.append('fileName', file.name);
      formData.append('fileSize', file.size.toString());
      formData.append('mimeType', file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      formData.append('isLastChunk', (i === totalChunks - 1).toString());

      let response: Response;
      let data: any;
      let retryCount = 0;
      const maxRetries = 5;
      
      // 重试逻辑
      while (retryCount < maxRetries) {
        try {
          response = await fetch('/api/upload/chunk-v2', {
            method: 'POST',
            body: formData,
          });

          const responseText = await response.text();
          
          try {
            data = JSON.parse(responseText);
          } catch {
            if (responseText.includes('Request Entity') || responseText.includes('413')) {
              throw new Error('代理服务器限制请求大小，请尝试上传更小的文件');
            }
            throw new Error(`服务器响应异常: ${responseText.substring(0, 100)}...`);
          }

          if (!response.ok || !data.success) {
            throw new Error(data.error || `分片 ${i + 1} 上传失败`);
          }
          
          // 成功，跳出重试循环
          break;
        } catch (error) {
          retryCount++;
          console.error(`分片 ${i + 1} 上传失败，第 ${retryCount} 次重试:`, error);
          
          if (retryCount >= maxRetries) {
            throw error;
          }
          
          // 等待后重试
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }

      if (!uploadId && data!.uploadId) {
        uploadId = data!.uploadId;
      }

      // 更新进度
      setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
      console.log(`分片 ${i + 1}/${totalChunks} 上传成功`, data);

      // 如果完成，直接返回任务ID（后端已完成存储）
      if (data!.isComplete) {
        if (data!.taskId) {
          console.log('上传完成，任务ID:', data!.taskId, '文件大小:', data!.fileSize);
          return { taskId: data!.taskId };
        } else {
          throw new Error('服务器返回数据缺少任务ID');
        }
      }
    }

    // 循环结束但未收到完成信号
    console.error('分片上传循环结束但未收到完成信号');
    throw new Error('分片上传未完成，请检查网络连接后重试');
  };

  // 删除任务
  const handleDeleteTask = async (taskId: string, isProcessing: boolean = false) => {
    const confirmMessage = isProcessing 
      ? '此任务正在处理中，确定要停止并删除吗？任务将被中断，所有数据将被删除。' 
      : '确定要删除此任务吗？此操作不可恢复。';
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const response = await fetch(`/api/tasks?taskId=${taskId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || '删除失败');
      }

      toast.success(isProcessing ? '任务已停止并删除' : '任务已删除');
      
      // 刷新历史记录
      loadHistory();
      
      // 如果删除的是当前任务，清除当前任务
      if (currentTask?.id === taskId) {
        setCurrentTask(null);
      }
    } catch (error) {
      toast.error('删除失败', {
        description: error instanceof Error ? error.message : '未知错误',
      });
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      console.log('开始上传文件:', file.name, (file.size / 1024 / 1024).toFixed(2), 'MB');
      
      // 使用 FormData 分片上传
      const result = await uploadWithFormDataChunks(file);
      
      setCurrentTask({
        id: result.taskId,
        status: 'uploaded',
        fileName: file.name,
        createdAt: new Date().toISOString(),
      });

      // 刷新历史记录
      loadHistory();

      toast.success('上传成功', {
        description: '文件已上传，点击下方"开始比对"按钮开始处理',
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '上传失败，请重试';
      console.error('上传失败:', errorMsg);
      setUploadError(errorMsg);
      toast.error('上传失败', {
        description: errorMsg,
      });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleStartComparison = async () => {
    if (!currentTask) return;

    setStarting(true);
    setUploadError(null);

    try {
      const response = await fetch(`/api/task/${currentTask.id}/start`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '启动任务失败');
      }

      const result = await response.json();
      
      setCurrentTask(prev => prev ? { ...prev, status: 'processing' } : null);

      toast.success('开始处理', {
        description: '正在进行OCR识别和数据比对，请稍候...',
      });

      // 开始轮询任务状态
      pollTaskStatus(currentTask.id);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      setUploadError(errorMsg);
      toast.error('启动失败', {
        description: errorMsg,
      });
    } finally {
      setStarting(false);
    }
  };

  const pollTaskStatus = async (taskId: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/task/${taskId}/status`);
        
        if (!response.ok) {
          console.error('查询任务状态失败');
          return;
        }
        
        const data = await response.json();
        
        setCurrentTask(prev => prev ? { ...prev, ...data } : null);

        if (data.status === 'processing' || data.status === 'pending') {
          setTimeout(poll, 2000);
        } else if (data.status === 'completed') {
          // 刷新历史记录
          loadHistory();
          toast.success('处理完成', {
            description: '数据比对已完成，可以查看结果',
          });
        } else if (data.status === 'failed') {
          // 刷新历史记录
          loadHistory();
          toast.error('处理失败', {
            description: data.error || '处理过程中发生错误',
          });
        }
      } catch (error) {
        console.error('轮询任务状态失败:', error);
      }
    };

    poll();
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      uploaded: { label: '已上传', variant: 'outline' },
      pending: { label: '等待中', variant: 'secondary' },
      processing: { label: '处理中', variant: 'default' },
      completed: { label: '已完成', variant: 'outline' },
      failed: { label: '失败', variant: 'destructive' },
    };
    
    const config = statusMap[status] || statusMap.pending;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'uploaded':
        return <FileSpreadsheet className="h-5 w-5 text-blue-500" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-gray-400" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-8">
        {/* 标题区域 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            多平台账单对比系统
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            支持抖音、拼多多、淘宝平台的Excel账单自动化比对
          </p>
        </div>

        {/* 上传区域 */}
        <Card className="max-w-3xl mx-auto mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-6 w-6" />
              文件上传
            </CardTitle>
            <CardDescription>
              上传包含嵌入截图的Excel文件，系统将自动识别平台并比对数据
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* 文件选择 */}
              <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <FileSpreadsheet className="h-12 w-12 text-gray-400 mb-4" />
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {file ? file.name : '点击选择或拖拽Excel文件到此处'}
                  </span>
                  <span className="text-xs text-gray-400 mt-2">
                    支持 .xlsx 和 .xls 格式，最大 100MB
                  </span>
                </label>
              </div>

              {/* 上传错误提示 */}
              {uploadError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="whitespace-pre-wrap">
                    <strong>上传失败:</strong> {uploadError}
                  </AlertDescription>
                </Alert>
              )}

              {/* 上传按钮 */}
              {file && !currentTask && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    已选择: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </div>
                  <Button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="min-w-[120px]"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        上传中
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        开始上传
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* 上传进度 */}
              {uploading && uploadProgress > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>上传进度</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 任务状态 */}
        {currentTask && (
          <Card className="max-w-3xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                任务状态
                {getStatusIcon(currentTask.status)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <FileSpreadsheet className="h-8 w-8 text-blue-500" />
                    <div>
                      <p className="font-medium">{currentTask.fileName}</p>
                      <p className="text-sm text-gray-600">
                        任务ID: {currentTask.id}
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(currentTask.status)}
                </div>

                {currentTask.platform && (
                  <Alert>
                    <AlertDescription>
                      识别平台: <strong>{currentTask.platform}</strong>
                    </AlertDescription>
                  </Alert>
                )}

                {/* 开始比对按钮 */}
                {currentTask.status === 'uploaded' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>文件已上传成功，准备就绪</span>
                    </div>
                    <Button
                      onClick={handleStartComparison}
                      disabled={starting}
                      className="w-full"
                      size="lg"
                    >
                      {starting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          启动中...
                        </>
                      ) : (
                        <>
                          <Play className="mr-2 h-4 w-4" />
                          开始比对
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* 处理中提示 - 带进度和耗时 */}
                {currentTask.status === 'processing' && (
                  <div className="space-y-4">
                    {/* 进度条 */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-gray-700">
                          {currentTask.currentStep || '正在处理...'}
                        </span>
                        <span className="text-gray-600">{currentTask.progress || 0}%</span>
                      </div>
                      <Progress value={currentTask.progress || 0} className="h-2" />
                    </div>

                    {/* 耗时显示 */}
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Timer className="h-4 w-4" />
                        <span>已耗时: {formatElapsedTime(elapsedTime)}</span>
                      </div>
                    </div>

                    {/* 图片处理进度 */}
                    {currentTask.totalImages && currentTask.totalImages > 0 && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <ImageIcon className="h-4 w-4" />
                        <span>
                          图片处理: {currentTask.processedImages || 0} / {currentTask.totalImages}
                        </span>
                      </div>
                    )}

                    {/* 停止并删除按钮 */}
                    <Button 
                      variant="destructive" 
                      className="w-full"
                      onClick={() => handleDeleteTask(currentTask.id, true)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      停止处理并删除任务
                    </Button>
                  </div>
                )}

                {currentTask.status === 'completed' && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>处理完成！可以查看比对结果</span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        className="flex-1"
                        onClick={() => router.push(`/result/${currentTask.id}`)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        查看结果
                      </Button>
                      <Button variant="outline" className="flex-1">
                        <Download className="mr-2 h-4 w-4" />
                        下载报告
                      </Button>
                    </div>
                  </div>
                )}

                {/* 失败错误信息 */}
                {currentTask.status === 'failed' && currentTask.error && (
                  <Alert variant="destructive" className="space-y-2">
                    <AlertDescription>
                      <div className="font-medium mb-2">❌ 处理失败</div>
                      <pre className="text-xs whitespace-pre-wrap bg-red-50 p-3 rounded border border-red-200 overflow-auto max-h-60">
                        {currentTask.error}
                      </pre>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 历史记录 */}
        <div className="max-w-4xl mx-auto mt-8">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  历史记录
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleClearCache}
                    disabled={clearingCache}
                    title="清理OCR缓存，重新处理时将重新识别"
                  >
                    <Trash2 className={`h-4 w-4 ${clearingCache ? 'animate-pulse' : ''}`} />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={loadHistory}
                    disabled={loadingHistory}
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingHistory ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>
              <CardDescription>
                最近处理的文件记录，点击可查看详情
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingHistory && historyTasks.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  <p>加载中...</p>
                </div>
              ) : historyTasks.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <History className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p>暂无历史记录</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historyTasks.map((task) => (
                    <div 
                      key={task.id}
                      className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        {getStatusIcon(task.status)}
                        <div>
                          <p className="font-medium text-sm">{task.file_name}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(task.created_at).toLocaleString('zh-CN')}
                            {task.platform && ` · ${task.platform}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(task.status)}
                        {task.status === 'completed' && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => router.push(`/result/${task.id}`)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              查看结果
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => handleDeleteTask(task.id, false)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {task.status === 'uploaded' && (
                          <>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setCurrentTask({
                                  id: task.id,
                                  status: task.status,
                                  fileName: task.file_name,
                                  createdAt: task.created_at,
                                  platform: task.platform,
                                });
                              }}
                            >
                              <Play className="h-4 w-4 mr-1" />
                              继续处理
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => handleDeleteTask(task.id, false)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {task.status === 'failed' && (
                          <>
                            <span className="text-xs text-red-500 max-w-[150px] truncate" title={task.error_message}>
                              {task.error_message?.substring(0, 20)}...
                            </span>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => handleDeleteTask(task.id, false)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {task.status === 'processing' && (
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => handleDeleteTask(task.id, true)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            停止并删除
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 功能说明 */}
        <div className="max-w-4xl mx-auto mt-12">
          <h2 className="text-2xl font-bold text-center mb-6">功能特点</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">智能平台识别</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  自动识别抖音、拼多多、淘宝平台，无需手动选择
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">OCR图片识别</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  使用Kimi K2.5模型提取Excel嵌入截图中的店铺名、金额、日期等关键数据
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">智能比对</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  自动比对表格数据与图片数据，高亮差异和缺失项
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
