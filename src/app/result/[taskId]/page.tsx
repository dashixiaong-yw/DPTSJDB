'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ComparisonItem } from '@/lib/platforms/types';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Download,
  Loader2,
  Search,
  ChevronDown,
} from 'lucide-react';

type FilterStatus = 'all' | 'mismatch' | 'missing';

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
    imageKey?: string;
    items: ComparisonItem[];
  }>;
  details: ComparisonItem[];
}

/** 环形图组件 */
function DonutChart({ value, max, color }: { value: number; max: number; color: string }) {
  const percent = max > 0 ? (value / max) * 100 : 0;
  const remain = 100 - percent;
  return (
    <div
      className="inline-flex items-center justify-center rounded-full"
      style={{
        width: 40,
        height: 40,
        background: `conic-gradient(${color} ${percent}%, #e5e7eb ${percent}% ${remain}%)`,
      }}
    >
      <div className="flex items-center justify-center w-[26px] h-[26px] rounded-full bg-white text-[10px] font-bold">
        {value}
      </div>
    </div>
  );
}

/** 状态徽章 */
function StatusBadge({ status, isZeroValue }: { status: string; isZeroValue?: boolean }) {
  if (isZeroValue) {
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        无需核对
      </Badge>
    );
  }
  const config: Record<string, { label: string; variant: 'outline' | 'destructive' | 'secondary'; icon: typeof CheckCircle2 }> = {
    match: { label: '一致', variant: 'outline', icon: CheckCircle2 },
    mismatch: { label: '不一致', variant: 'destructive', icon: XCircle },
    missing: { label: '缺失', variant: 'secondary', icon: AlertCircle },
  };
  const { label, variant, icon: Icon } = config[status] || config.missing;
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export default function ResultPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<ResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchResult = useCallback(async () => {
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
  }, [params.taskId]);

  useEffect(() => {
    fetchResult();
  }, [fetchResult]);

  const getMatchRate = (): number => {
    if (!data || data.stats.total === 0) return 0;
    return (data.stats.matched / data.stats.total) * 100;
  };

  // 筛选 + 搜索后的行数据
  const filteredRows = useMemo(() => {
    if (!data) return [];
    return data.groupedByRow
      .map((row) => {
        // 先按搜索过滤
        let items = row.items;
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          items = items.filter(
            (item) =>
              item.fieldName.toLowerCase().includes(query) ||
              String(item.tableValue).toLowerCase().includes(query) ||
              (item.ocrValue !== undefined && String(item.ocrValue).toLowerCase().includes(query))
          );
        }
        // 再按状态过滤
        if (filter === 'mismatch') {
          items = items.filter((i) => i.status === 'mismatch');
        } else if (filter === 'missing') {
          items = items.filter((i) => i.status === 'missing');
        }
        return { ...row, items };
      })
      .filter((row) => row.items.length > 0);
  }, [data, filter, searchQuery]);

  // 自动展开有问题的行（数据加载或筛选变化时）
  useEffect(() => {
    if (!data) return;
    const problemRows = new Set<string>();
    filteredRows.forEach((row) => {
      const hasProblem = row.items.some((i) => i.status === 'mismatch' || i.status === 'missing');
      if (hasProblem) {
        problemRows.add(`row-${row.rowIndex}`);
      }
    });
    setExpandedRows(problemRows);
  }, [data, filteredRows]);

  const toggleExpand = (rowKey: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
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
  const handleExportJSON = () => {
    if (!data) return;
    const report = {
      task: data.task,
      stats: data.stats,
      matchRate: `${getMatchRate().toFixed(1)}%`,
      exportedAt: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      details: data.groupedByRow.map((row) => ({
        rowIndex: row.rowIndex,
        shopName: row.shopName,
        month: row.month,
        items: row.items.map((item) => ({
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
        <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const matchRate = getMatchRate();

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl">
      {/* 标题区域 */}
      <div className="mb-6">
        <Button variant="ghost" onClick={() => router.push('/')} className="mb-3 -ml-2">
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回首页
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">比对结果</h1>
        <p className="text-sm text-gray-500 mt-1">
          {data.task.fileName} · {data.task.platform}
        </p>
      </div>

      {/* 统计概览 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="py-0">
          <CardContent className="flex items-center gap-3 p-4">
            <DonutChart value={data.stats.total} max={data.stats.total} color="#3b82f6" />
            <div>
              <div className="text-xl font-bold">{data.stats.total}</div>
              <div className="text-xs text-gray-500">总比对项</div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="flex items-center gap-3 p-4">
            <DonutChart value={data.stats.matched} max={data.stats.total} color="#22c55e" />
            <div>
              <div className="text-xl font-bold text-green-600">{data.stats.matched}</div>
              <div className="text-xs text-gray-500">一致</div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="flex items-center gap-3 p-4">
            <DonutChart value={data.stats.mismatched} max={data.stats.total} color="#ef4444" />
            <div>
              <div className="text-xl font-bold text-red-600">{data.stats.mismatched}</div>
              <div className="text-xs text-gray-500">不一致</div>
            </div>
          </CardContent>
        </Card>
        <Card className="py-0">
          <CardContent className="flex items-center gap-3 p-4">
            <DonutChart value={data.stats.missing} max={data.stats.total} color="#f59e0b" />
            <div>
              <div className="text-xl font-bold text-amber-600">{data.stats.missing}</div>
              <div className="text-xs text-gray-500">缺失</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 匹配率 */}
      <Card className="mb-4 py-0">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">匹配率</span>
            <span className="text-lg font-bold">{matchRate.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${matchRate}%`,
                background:
                  matchRate >= 90 ? '#22c55e' : matchRate >= 70 ? '#f59e0b' : '#ef4444',
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* 筛选 + 搜索 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {([
            { key: 'all' as FilterStatus, label: '全部' },
            { key: 'mismatch' as FilterStatus, label: `不一致${data.stats.mismatched > 0 ? `(${data.stats.mismatched})` : ''}` },
            { key: 'missing' as FilterStatus, label: `缺失${data.stats.missing > 0 ? `(${data.stats.missing})` : ''}` },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                filter === key
                  ? 'bg-white shadow-sm font-medium'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="搜索字段名..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* 手风琴：按行展示 */}
      <div className="space-y-2 mb-6">
        {filteredRows.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            {searchQuery ? '没有匹配的比对项' : '没有符合筛选条件的比对项'}
          </div>
        )}
        {filteredRows.map((row) => {
          const rowKey = `row-${row.rowIndex}`;
          const isExpanded = expandedRows.has(rowKey);
          const rowMismatched = row.items.filter((i) => i.status === 'mismatch').length;
          const rowMissing = row.items.filter((i) => i.status === 'missing').length;
          const hasProblem = rowMismatched > 0 || rowMissing > 0;
          // 问题项
          const problemItems = row.items.filter(
            (i) => i.status === 'mismatch' || i.status === 'missing'
          );
          // 一致项
          const matchItems = row.items.filter(
            (i) => i.status === 'match' && i.isZeroValue !== true
          );
          const zeroItems = row.items.filter((i) => i.isZeroValue === true);
          const showExpandAll = matchItems.length > 0 || zeroItems.length > 0;

          return (
            <Card key={rowKey} className={`py-0 overflow-hidden ${hasProblem ? 'border-l-4 border-l-red-400' : ''}`}>
              {/* 行标题 - 点击展开/折叠 */}
              <button
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                onClick={() => toggleExpand(rowKey)}
              >
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <ChevronDown
                    className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                  <span className="font-semibold truncate">{row.shopName}</span>
                  {row.month && (
                    <Badge variant="outline" className="text-xs shrink-0">{row.month}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  <span className="text-xs text-gray-400">{row.items.length}项</span>
                  {hasProblem ? (
                    <>
                      {rowMismatched > 0 && (
                        <Badge variant="destructive" className="text-xs">{rowMismatched}不一致</Badge>
                      )}
                      {rowMissing > 0 && (
                        <Badge variant="secondary" className="text-xs">{rowMissing}缺失</Badge>
                      )}
                    </>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                      全部一致
                    </Badge>
                  )}
                </div>
              </button>

              {/* 展开内容 */}
              {isExpanded && (
                <div className="border-t px-4 pb-4">
                  {/* 问题项（始终展示） */}
                  {problemItems.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-red-600 mb-2">
                        异常项 ({problemItems.length})
                      </div>
                      {/* 桌面端表格 */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50">
                              <th className="text-left py-2 px-3 font-medium">字段</th>
                              <th className="text-left py-2 px-3 font-medium">表格值</th>
                              <th className="text-left py-2 px-3 font-medium">OCR值</th>
                              <th className="text-left py-2 px-3 font-medium w-20">状态</th>
                            </tr>
                          </thead>
                          <tbody>
                            {problemItems.map((item, idx) => (
                              <ProblemRow key={idx} item={item} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* 移动端卡片 */}
                      <div className="sm:hidden space-y-2">
                        {problemItems.map((item, idx) => (
                          <ProblemCard key={idx} item={item} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 一致项（折叠） */}
                  {showExpandAll && (
                    <div className="mt-3">
                      <button
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(`${rowKey}-all`);
                        }}
                      >
                        <ChevronDown
                          className={`h-3 w-3 transition-transform ${
                            expandedRows.has(`${rowKey}-all`) ? 'rotate-180' : ''
                          }`}
                        />
                        {expandedRows.has(`${rowKey}-all`)
                          ? '收起一致项'
                          : `展开全部 ${row.items.length} 项`}
                      </button>
                      {expandedRows.has(`${rowKey}-all`) && (
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-gray-50">
                                <th className="text-left py-2 px-3 font-medium">字段</th>
                                <th className="text-left py-2 px-3 font-medium">表格值</th>
                                <th className="text-left py-2 px-3 font-medium">OCR值</th>
                                <th className="text-left py-2 px-3 font-medium w-20">状态</th>
                              </tr>
                            </thead>
                            <tbody>
                              {matchItems.map((item, idx) => (
                                <tr key={`m-${idx}`} className="border-b bg-green-50/50">
                                  <td className="py-2 px-3 font-medium">{item.fieldName}</td>
                                  <td className="py-2 px-3">{item.tableValue}</td>
                                  <td className="py-2 px-3">{item.ocrValue ?? '-'}</td>
                                  <td className="py-2 px-3">
                                    <StatusBadge status={item.status} />
                                  </td>
                                </tr>
                              ))}
                              {zeroItems.map((item, idx) => (
                                <tr key={`z-${idx}`} className="border-b bg-blue-50/50">
                                  <td className="py-2 px-3 font-medium">
                                    {item.fieldName}
                                    <span className="ml-1 text-xs text-blue-500">(值为0)</span>
                                  </td>
                                  <td className="py-2 px-3">{item.tableValue}</td>
                                  <td className="py-2 px-3 text-blue-600">{item.ocrValue ?? '0'}</td>
                                  <td className="py-2 px-3">
                                    <StatusBadge status={item.status} isZeroValue />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <Button className="flex-1" onClick={handleDownloadMarked}>
          <Download className="mr-2 h-4 w-4" />
          下载标记文件
        </Button>
        <Button variant="outline" className="flex-1" onClick={handleExportJSON}>
          <Download className="mr-2 h-4 w-4" />
          导出JSON报告
        </Button>
      </div>
    </div>
  );
}

/** 问题项表格行 */
function ProblemRow({ item }: { item: ComparisonItem }) {
  const isShopNameField = item.fieldName.includes('店铺名称');
  const isMonthField = item.fieldName.includes('月份');
  const isZeroValue = item.isZeroValue === true;

  const displayOcrValue = isShopNameField
    ? item.ocrShopName || '未识别'
    : isMonthField
      ? item.ocrMonth || (item.ocrDateRange ? `${item.ocrDateRange.start_date} ~ ${item.ocrDateRange.end_date}` : null)
      : item.ocrValue;

  let displayFieldName = item.fieldName;
  if (isShopNameField && item.fieldName.includes('(')) {
    const match = item.fieldName.match(/店铺名称\((.+)截图\)/);
    if (match) {
      displayFieldName = `店铺名称 [${match[1]}]`;
    }
  }

  return (
    <tr className={`border-b ${
      item.status === 'mismatch' ? 'bg-red-50' : 'bg-amber-50'
    }`}>
      <td className="py-2 px-3 font-medium">
        {displayFieldName}
        {(isShopNameField || isMonthField) && (
          <span className="ml-1 text-xs text-gray-400">(自动核对)</span>
        )}
        {isZeroValue && (
          <span className="ml-1 text-xs text-blue-500">(值为0)</span>
        )}
      </td>
      <td className="py-2 px-3">{item.tableValue}</td>
      <td className="py-2 px-3">
        {isZeroValue ? (
          <span className="text-blue-600">0</span>
        ) : displayOcrValue !== undefined && displayOcrValue !== null ? (
          <span className={item.status === 'mismatch' ? 'text-red-600 font-semibold' : ''}>
            {displayOcrValue}
            {isMonthField && item.ocrDateRange && !item.ocrDateRange.is_full_month && (
              <span className="ml-1 text-xs text-orange-600">(非完整月份)</span>
            )}
          </span>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="py-2 px-3">
        <StatusBadge status={item.status} isZeroValue={isZeroValue} />
      </td>
    </tr>
  );
}

/** 问题项移动端卡片 */
function ProblemCard({ item }: { item: ComparisonItem }) {
  const isShopNameField = item.fieldName.includes('店铺名称');
  const isMonthField = item.fieldName.includes('月份');
  const isZeroValue = item.isZeroValue === true;

  const displayOcrValue = isShopNameField
    ? item.ocrShopName || '未识别'
    : isMonthField
      ? item.ocrMonth || (item.ocrDateRange ? `${item.ocrDateRange.start_date} ~ ${item.ocrDateRange.end_date}` : null)
      : item.ocrValue;

  let displayFieldName = item.fieldName;
  if (isShopNameField && item.fieldName.includes('(')) {
    const match = item.fieldName.match(/店铺名称\((.+)截图\)/);
    if (match) {
      displayFieldName = `店铺名称 [${match[1]}]`;
    }
  }

  return (
    <div
      className={`rounded-lg p-3 text-sm ${
        item.status === 'mismatch' ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">{displayFieldName}</span>
        <StatusBadge status={item.status} isZeroValue={isZeroValue} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-400">表格值</span>
          <div className="font-medium mt-0.5">{item.tableValue}</div>
        </div>
        <div>
          <span className="text-gray-400">OCR值</span>
          <div className={`font-medium mt-0.5 ${item.status === 'mismatch' ? 'text-red-600' : ''}`}>
            {isZeroValue ? '0' : displayOcrValue ?? '-'}
          </div>
        </div>
      </div>
    </div>
  );
}
