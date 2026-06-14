import { NextRequest, NextResponse } from 'next/server';
import { fieldMappingStore } from '@/lib/services';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// 模板上传 - 解析并保存字段映射
export async function POST(request: NextRequest) {
  try {
    // 检查Content-Type
    const contentType = request.headers.get('content-type');
    if (!contentType?.includes('multipart/form-data')) {
      return NextResponse.json({ error: '请使用multipart/form-data格式上传' }, { status: 400 });
    }

    const formData = await request.formData();
    const fileEntry = formData.get('file');
    const platform = (formData.get('platform') as string) || '拼多多';

    if (!fileEntry || !(fileEntry instanceof File)) {
      return NextResponse.json({ error: '请上传模板文件' }, { status: 400 });
    }

    const file = fileEntry;

    console.log(`开始解析模板: ${file.name}, 大小: ${(file.size / 1024).toFixed(2)}KB, 平台: ${platform}`);

    // 检查文件大小（限制5MB）
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: '模板文件不能超过5MB' }, { status: 400 });
    }

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // 解析 Excel 文件
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // 获取所有工作表的表头字段
    const allHeaders: string[] = [];
    
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
      
      // 读取第一行作为表头
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
        const cell = worksheet[cellAddress];
        if (cell && cell.v) {
          const header = String(cell.v).trim();
          if (header && !allHeaders.includes(header)) {
            allHeaders.push(header);
          }
        }
      }
    }

    console.log('解析到的表头字段:', allHeaders);

    // 拼多多特定字段映射规则 - 基于用户提供的确切模板
    const platformMappings: Record<string, Record<string, string>> = {
      '拼多多': {
        // 基础信息字段
        '店铺名称（必填）': '店铺名称',
        '店铺名称': '店铺名称',
        '负责人名字（必填）': '负责人',
        '账单月份（必填）': '月份',
        '月份': '月份',
        
        // 金额相关字段 - 这些是OCR能识别的字段
        '营业额（必填）': '营业额',
        '营业额': '营业额',
        '退款金额（必填）': '退款金额',
        '退款金额': '退款金额',
        '刷单金额（必填）': '刷单金额',
        '刷单金额': '刷单金额',
        '账单中退款金额（必填）': '账单中退款金额',
        '账单中退款金额': '账单中退款金额',
        '提现金额（必填）': '提现金额',
        '提现金额': '提现金额',
        '账单中支出总额（必填）': '账单中支出总额',
        '账单中支出总额': '账单中支出总额',
        '账单中收入总额（已删除）': '账单中收入总额',
        '账单中交易收入金额（已删除）': '账单中交易收入金额',
        
        // 计算字段
        '货物及快递成本': '货物及快递成本',
        '账单成本': '账单成本',
        '利润': '利润',
        '店长分红': '店长分红',
        '公司分红': '公司分红',
        '净利润': '净利润',
        '利润率': '利润率',
        '净利率': '净利率',
        '需转账金额': '需转账金额',
        
        // 状态字段
        '是否结算': '是否结算',
        '结算状态': '结算状态',
        
        // 其他字段
        '备注': '备注',
        '核对信息': '核对信息',
        
        // 截图相关字段（这些列包含图片）
        '刷单文件汇总【上传表格文件或截图】': '刷单文件汇总',
        '月度数据报表截图（必填）': '月度数据报表截图',
        '多多账单截图（必填）': '多多账单截图',
      },
      '抖音': {
        '店铺名称': '店铺名称',
        '店铺': '店铺名称',
        '订单编号': '订单编号',
        '商品名称': '商品名称',
        '成交金额': '成交金额',
        '实付金额': '成交金额',
        '佣金': '佣金',
        '推广费': '佣金',
        '数量': '数量',
        '下单时间': '下单时间',
        '支付时间': '支付时间',
        '状态': '状态',
      },
      '淘宝': {
        '店铺名称': '店铺名称',
        '订单编号': '订单编号',
        '商品名称': '商品名称',
        '净营业额': '净营业额',
        '实付金额': '净营业额',
        '佣金': '佣金',
        '数量': '数量',
        '下单时间': '下单时间',
        '状态': '状态',
      },
    };

    const commonMappings = platformMappings[platform] || platformMappings['拼多多'];

    // 自动匹配字段
    const mappings: Array<{
      tableField: string;
      imageField: string;
      confidence: number;
    }> = [];

    for (const tableField of allHeaders) {
      // 精确匹配
      if (commonMappings[tableField]) {
        mappings.push({
          tableField,
          imageField: commonMappings[tableField],
          confidence: 1.0,
        });
        continue;
      }

      // 模糊匹配
      const normalizedTableField = tableField.toLowerCase().replace(/[\s_-]/g, '');
      let matched = false;
      
      for (const [key, imageField] of Object.entries(commonMappings)) {
        const normalizedKey = key.toLowerCase().replace(/[\s_-]/g, '');
        if (normalizedTableField.includes(normalizedKey) || normalizedKey.includes(normalizedTableField)) {
          mappings.push({
            tableField,
            imageField,
            confidence: 0.9,
          });
          matched = true;
          break;
        }
      }
      
      // 如果没有匹配到，使用自身作为映射（用户可以后续确认）
      if (!matched && tableField.length > 0 && tableField.length < 20) {
        mappings.push({
          tableField,
          imageField: tableField,
          confidence: 0.5,
        });
      }
    }

    console.log('自动匹配结果:', mappings);

    // 保存到内存存储
    // 先删除该平台的旧映射
    fieldMappingStore.delete(platform);

    // 插入新映射
    if (mappings.length > 0) {
      const records = mappings.map(m => ({
        platform,
        table_field: m.tableField,
        image_field: m.imageField,
        confidence: m.confidence,
        confirmed: m.confidence >= 0.9, // 高置信度自动确认
      }));

      fieldMappingStore.set(platform, records);
    }

    return NextResponse.json({
      success: true,
      platform,
      tableFields: allHeaders,
      mappings,
      message: `成功保存 ${mappings.length} 条字段映射`,
    });

  } catch (error) {
    console.error('模板处理失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '模板处理失败' },
      { status: 500 }
    );
  }
}

// 获取字段映射
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');

    // 从内存存储获取字段映射
    let data: Array<{ platform: string; table_field: string; image_field: string; confidence: number; confirmed: boolean }>;

    if (platform) {
      const platformData = fieldMappingStore.get(platform);
      data = platformData ? platformData.map(item => ({ ...item, platform })) : [];
    } else {
      // 获取所有映射
      data = [];
      for (const [plat, items] of fieldMappingStore.entries()) {
        for (const item of items) {
          data.push({ ...item, platform: plat });
        }
      }
    }

    // 按平台分组
    const groupedByPlatform = data.reduce((acc, item) => {
      if (!acc[item.platform]) {
        acc[item.platform] = [];
      }
      acc[item.platform].push(item);
      return acc;
    }, {} as Record<string, unknown[]>);

    return NextResponse.json({
      success: true,
      mappings: groupedByPlatform,
    });

  } catch (error) {
    console.error('获取字段映射失败:', error);
    return NextResponse.json(
      { error: '获取字段映射失败' },
      { status: 500 }
    );
  }
}


