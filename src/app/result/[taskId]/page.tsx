'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ComparisonItem } from '@/lib/platforms/types';
import { 
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
  Loader2
} from 'lucide-react';

interface ResultData {
  task: {
    id: string;
    fileName: string;
    platform: string;
    status: string;
    createdAt: string;
    completedAt?: string;
  };
  stats: {
    total: number;
    matched: number;
    mismatched: number;
    missing: number;
  };
  groupedByRow: Array<{
    rowIndex: number;
    shopName: string;
    month?: string;
    imageKey?: string; // 图片标识
    items: ComparisonItem[];
  }>;
  details: ComparisonItem[];
}

export default function ResultPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchResult();
  }, [params.taskId]);

  const fetchResult = async () => {
    try {
      const response = await fetch(`/api/task/${params.taskId}/result`);
      if (!response.ok) {
        throw new Error('获取结果失败');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const config = {
      match: { label: '一致', variant: 'outline' as const, icon: CheckCircle2 },
      mismatch: { label: '不一致', variant: 'destructive' as const, icon: XCircle },
      missing: { label: '缺失', variant: 'secondary' as const, icon: AlertCircle },
    };
    
    const { label, variant, icon: Icon } = config[status as keyof typeof config] || config.missing;
    return (
      <Badge variant={variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
      </Badge>
    );
  };

  const getMatchRate = () => {
    if (!data || data.stats.total === 0) return 0;
    return ((data.stats.matched / data.stats.total) * 100).toFixed(1);
  };

  // 下载标记文件
  const handleDownloadMarked = async () => {
    if (!data) return;
    
    try {
      const response = await fetch(`/api/task/${params.taskId}/download`);
      if (!response.ok) {
        throw new Error('下载失败');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.task.fileName.replace('.xlsx', '')}_marked.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('下载失败:', err);
      alert('下载失败，请重试');
    }
  };

  // 导出JSON报告
  const handleExportJSON = async () => {
    if (!data) return;
    
    const report = {
      task: data.task,
      stats: data.stats,
      matchRate: `${getMatchRate()}%`,
      exportedAt: new Date().toISOString(),
      details: data.groupedByRow.map(row => ({
        rowIndex: row.rowIndex,
        shopName: row.shopName,
        month: row.month,
        items: row.items.map(item => ({
          fieldName: item.fieldName,
          tableValue: item.tableValue,
          ocrValue: item.ocrValue,
          status: item.status,
          location: `${item.sheetName} ${item.cellRef}`,
        })),
      })),
    };
    
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${data.task.fileName.replace('.xlsx', '')}_report.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* 标题区域 */}
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push('/')}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回首页
        </Button>
        
        <h1 className="text-3xl font-bold mb-2">比对结果</h1>
        <p className="text-gray-600">
          文件: {data.task.fileName} | 平台: {data.task.platform}
        </p>
      </div>

      {/* 统计概览 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">
              {data.stats.total}
            </div>
            <p className="text-sm text-gray-600">总比对项</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {data.stats.matched}
            </div>
            <p className="text-sm text-gray-600">一致项</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              {data.stats.mismatched}
            </div>
            <p className="text-sm text-gray-600">不一致项</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">
              {data.stats.missing}
            </div>
            <p className="text-sm text-gray-600">缺失项</p>
          </CardContent>
        </Card>
      </div>

      {/* 匹配率 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">匹配率</span>
            <span className="text-2xl font-bold text-green-600">{getMatchRate()}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full"
              style={{ width: `${getMatchRate()}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* 下载按钮 */}
      <div className="flex gap-4 mb-6">
        <Button className="flex-1" onClick={handleDownloadMarked}>
          <Download className="mr-2 h-4 w-4" />
          下载标记文件
        </Button>
        <Button variant="outline" className="flex-1" onClick={handleExportJSON}>
          <Download className="mr-2 h-4 w-4" />
          导出JSON报告
        </Button>
      </div>

      {/* 详细结果 - 按行展示 */}
      <Card>
        <CardHeader>
          <CardTitle>详细比对结果</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {data.groupedByRow.map((row) => {
              // 统计该行的匹配情况
              const rowMatched = row.items.filter(i => i.status === 'match').length;
              const rowMismatched = row.items.filter(i => i.status === 'mismatch').length;
              const rowMissing = row.items.filter(i => i.status === 'missing').length;
              const rowTotal = row.items.length;
              
              return (
                <div key={row.rowIndex} className="border rounded-lg p-4">
                  {/* 行标题区域 - 显示行号、店铺、统计信息 */}
                  <div className="flex items-center justify-between mb-3 pb-3 border-b">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-bold">行{row.rowIndex}</span>
                      <span className="text-gray-600">|</span>
                      <span className="text-lg">{row.shopName}</span>
                      {row.month && (
                        <Badge variant="outline" className="text-xs">{row.month}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{rowTotal} 项</Badge>
                      {rowMismatched > 0 && (
                        <Badge variant="destructive" className="text-xs">{rowMismatched} 不一致</Badge>
                      )}
                      {rowMatched === rowTotal && (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">✓ 全部一致</Badge>
                      )}
                    </div>
                  </div>
                  
                  {/* 比对结果表格 */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left py-2 px-3 w-12">序号</th>
                          <th className="text-left py-2 px-3">字段名</th>
                          <th className="text-left py-2 px-3">表格值</th>
                          <th className="text-left py-2 px-3">OCR识别值</th>
                          <th className="text-left py-2 px-3 w-24">状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.items.map((item, index) => {
                          // 特殊处理店铺名称和月份字段
                          const isShopNameField = item.fieldName.includes('店铺名称');
                          const isMonthField = item.fieldName.includes('月份');
                          const isZeroValue = item.isZeroValue === true; // 表格值为0的字段
                          const displayOcrValue = isShopNameField 
                            ? (item.ocrShopName || '未识别') 
                            : isMonthField 
                              ? (item.ocrMonth || (item.ocrDateRange ? `${item.ocrDateRange.start_date} ~ ${item.ocrDateRange.end_date}` : null))
                              : item.ocrValue;
                          
                          // 解析店铺名称字段，提取图片类型
                          let displayFieldName = item.fieldName;
                          if (isShopNameField && item.fieldName.includes('(')) {
                            // 格式: "店铺名称(万相台无界版截图)" -> "店铺名称 [万相台无界版]"
                            const match = item.fieldName.match(/店铺名称\((.+)截图\)/);
                            if (match) {
                              displayFieldName = `店铺名称 [${match[1]}]`;
                            }
                          }
                          
                          return (
                            <tr key={index} className={`border-b hover:bg-gray-50 ${
                              item.status === 'mismatch' ? 'bg-red-50' : 
                              isZeroValue ? 'bg-blue-50' : // 表格值为0的字段显示蓝色背景
                              item.status === 'match' ? 'bg-green-50' : 
                              item.status === 'missing' ? 'bg-gray-100' : ''
                            }`}>
                              <td className="py-2 px-3 text-gray-500 font-medium">
                                {index + 1}
                              </td>
                              <td className="py-2 px-3 font-medium">
                                {displayFieldName}
                                {/* 特殊字段标记 */}
                                {(isShopNameField || isMonthField) && (
                                  <span className="ml-2 text-xs text-gray-400">(自动核对)</span>
                                )}
                                {isZeroValue && (
                                  <span className="ml-2 text-xs text-blue-500">(值为0)</span>
                                )}
                              </td>
                              <td className="py-2 px-3">{item.tableValue}</td>
                              <td className="py-2 px-3">
                                {isZeroValue ? (
                                  <span className="text-blue-600">0</span>
                                ) : displayOcrValue !== undefined && displayOcrValue !== null ? (
                                  <span className={item.status === 'mismatch' ? 'text-red-600 font-medium' : ''}>
                                    {displayOcrValue}
                                    {/* 日期范围完整性提示 */}
                                    {isMonthField && item.ocrDateRange && !item.ocrDateRange.is_full_month && (
                                      <span className="ml-2 text-xs text-orange-600">(非完整月份)</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              {/* 状态列 */}
                              <td className="py-2 px-3">
                                {isZeroValue ? (
                                  <Badge variant="outline" className="flex items-center gap-1 bg-blue-50 text-blue-700 border-blue-200">
                                    <CheckCircle2 className="h-3 w-3" />
                                    无需核对
                                  </Badge>
                                ) : getStatusBadge(item.status)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
