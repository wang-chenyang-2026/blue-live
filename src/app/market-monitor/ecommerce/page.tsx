'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Tag,
  Building2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from 'recharts';

/* ========== Types ========== */
interface EcommerceView {
  key: string;
  label: string;
  message: string;
}

interface FilterState {
  industry: string;
  category: string;
  brand: string;
  timeRange: string;
}

interface KpiCard {
  label: string;
  value: string;
  change: number;
  icon: React.ReactNode;
  color: string;
}

type CategoryTree = Record<string, Record<string, string[]>>;

const VIEWS: EcommerceView[] = [
  { key: '大盘趋势', label: '大盘趋势', message: '查看大盘趋势数据' },
  { key: '品牌排行', label: '品牌排行', message: '查看品牌销售排行' },
  { key: '销售价量', label: '销售价量', message: '查看销售价量数据' },
  { key: '店铺列表', label: '店铺列表', message: '查看店铺列表' },
  { key: '商品列表', label: '商品列表', message: '查看商品列表' },
  { key: '价格区间', label: '价格区间', message: '查看价格区间分析' },
  { key: '价格交叉', label: '价格交叉', message: '查看价格交叉分析' },
  { key: '热词频次', label: '热词频次', message: '查看热词频次数据' },
];

const TIME_RANGES = ['近30天', '近90天', '近半年', '近一年', '本年度'];

/* ========== Preset Industry Data (保留原有5个行业的精致数据) ========== */
// 原有5个行业 → 新49个行业的映射，保留原有品牌/店铺/商品/热词数据
const PRESET_BRANDS: Record<string, string[]> = {
  '数码产品': ['全部品牌', 'vivo', 'iQOO', '华为', '小米', 'OPPO', '荣耀', '苹果'],
  '大家电': ['全部品牌', '海尔', '美的', '格力', '海信', 'TCL', '松下'],
  '生活电器': ['全部品牌', '美的', '九阳', '苏泊尔', '飞利浦', '戴森', '小熊'],
  '护肤': ['全部品牌', '雅诗兰黛', '兰蔻', '欧莱雅', '珀莱雅', '薇诺娜', '花西子'],
  '彩妆香水': ['全部品牌', '雅诗兰黛', '兰蔻', 'MAC', '圣罗兰', '迪奥', '香奈儿'],
  '个护清洁': ['全部品牌', '宝洁', '联合利华', '舒肤佳', '力士', '多芬', '六神'],
  '饮料冲调': ['全部品牌', '蒙牛', '伊利', '农夫山泉', '可口可乐', '三只松鼠', '元气森林'],
  '休闲零食': ['全部品牌', '三只松鼠', '良品铺子', '百草味', '来伊份', '卫龙', '洽洽'],
  '粮油速食': ['全部品牌', '金龙鱼', '福临门', '鲁花', '康师傅', '统一', '白象'],
  '服装配饰': ['全部品牌', '耐克', '阿迪达斯', '安踏', '李宁', '优衣库', 'ZARA'],
  '运动服饰': ['全部品牌', '耐克', '阿迪达斯', '安踏', '李宁', '彪马', 'Under Armour'],
  '户外服饰': ['全部品牌', '北面', '哥伦比亚', '始祖鸟', '探路者', '凯乐石', '骆驼'],
  '鞋包': ['全部品牌', '耐克', '阿迪达斯', '新百伦', '百丽', 'Coach', 'MK'],
};

const PRESET_BRAND_COLORS: Record<string, { name: string; color: string }[]> = {
  '数码产品': [
    { name: 'vivo', color: '#4158D0' }, { name: 'iQOO', color: '#FF6B35' },
    { name: '华为', color: '#FF4D4F' }, { name: '小米', color: '#FAAD14' },
    { name: 'OPPO', color: '#52C41A' }, { name: '荣耀', color: '#1890FF' },
    { name: '苹果', color: '#722ED1' }, { name: '真我', color: '#13C2C2' },
  ],
  '大家电': [
    { name: '海尔', color: '#4158D0' }, { name: '美的', color: '#FF6B35' },
    { name: '格力', color: '#FF4D4F' }, { name: '海信', color: '#FAAD14' },
    { name: 'TCL', color: '#52C41A' }, { name: '松下', color: '#1890FF' },
    { name: '奥克斯', color: '#722ED1' }, { name: '志高', color: '#13C2C2' },
  ],
  '生活电器': [
    { name: '美的', color: '#4158D0' }, { name: '九阳', color: '#FF6B35' },
    { name: '苏泊尔', color: '#FF4D4F' }, { name: '飞利浦', color: '#FAAD14' },
    { name: '戴森', color: '#52C41A' }, { name: '小熊', color: '#1890FF' },
    { name: '摩飞', color: '#722ED1' }, { name: '北鼎', color: '#13C2C2' },
  ],
  '护肤': [
    { name: '雅诗兰黛', color: '#4158D0' }, { name: '兰蔻', color: '#FF6B35' },
    { name: '欧莱雅', color: '#FF4D4F' }, { name: '珀莱雅', color: '#FAAD14' },
    { name: '薇诺娜', color: '#52C41A' }, { name: '花西子', color: '#1890FF' },
    { name: 'SK-II', color: '#722ED1' }, { name: '资生堂', color: '#13C2C2' },
  ],
  '彩妆香水': [
    { name: '雅诗兰黛', color: '#4158D0' }, { name: '兰蔻', color: '#FF6B35' },
    { name: 'MAC', color: '#FF4D4F' }, { name: '圣罗兰', color: '#FAAD14' },
    { name: '迪奥', color: '#52C41A' }, { name: '香奈儿', color: '#1890FF' },
    { name: '纪梵希', color: '#722ED1' }, { name: '阿玛尼', color: '#13C2C2' },
  ],
  '个护清洁': [
    { name: '宝洁', color: '#4158D0' }, { name: '联合利华', color: '#FF6B35' },
    { name: '舒肤佳', color: '#FF4D4F' }, { name: '力士', color: '#FAAD14' },
    { name: '多芬', color: '#52C41A' }, { name: '六神', color: '#1890FF' },
    { name: '施华蔻', color: '#722ED1' }, { name: '清扬', color: '#13C2C2' },
  ],
  '饮料冲调': [
    { name: '蒙牛', color: '#4158D0' }, { name: '伊利', color: '#FF6B35' },
    { name: '农夫山泉', color: '#FF4D4F' }, { name: '可口可乐', color: '#FAAD14' },
    { name: '三只松鼠', color: '#52C41A' }, { name: '元气森林', color: '#1890FF' },
    { name: '统一', color: '#722ED1' }, { name: '康师傅', color: '#13C2C2' },
  ],
  '休闲零食': [
    { name: '三只松鼠', color: '#4158D0' }, { name: '良品铺子', color: '#FF6B35' },
    { name: '百草味', color: '#FF4D4F' }, { name: '来伊份', color: '#FAAD14' },
    { name: '卫龙', color: '#52C41A' }, { name: '洽洽', color: '#1890FF' },
    { name: '盼盼', color: '#722ED1' }, { name: '旺旺', color: '#13C2C2' },
  ],
  '粮油速食': [
    { name: '金龙鱼', color: '#4158D0' }, { name: '福临门', color: '#FF6B35' },
    { name: '鲁花', color: '#FF4D4F' }, { name: '康师傅', color: '#FAAD14' },
    { name: '统一', color: '#52C41A' }, { name: '白象', color: '#1890FF' },
    { name: '今麦郎', color: '#722ED1' }, { name: '海天', color: '#13C2C2' },
  ],
  '服装配饰': [
    { name: '耐克', color: '#4158D0' }, { name: '阿迪达斯', color: '#FF6B35' },
    { name: '安踏', color: '#FF4D4F' }, { name: '李宁', color: '#FAAD14' },
    { name: '优衣库', color: '#52C41A' }, { name: 'ZARA', color: '#1890FF' },
    { name: 'H&M', color: '#722ED1' }, { name: 'GAP', color: '#13C2C2' },
  ],
  '运动服饰': [
    { name: '耐克', color: '#4158D0' }, { name: '阿迪达斯', color: '#FF6B35' },
    { name: '安踏', color: '#FF4D4F' }, { name: '李宁', color: '#FAAD14' },
    { name: '彪马', color: '#52C41A' }, { name: 'Under Armour', color: '#1890FF' },
    { name: '特步', color: '#722ED1' }, { name: '361度', color: '#13C2C2' },
  ],
  '户外服饰': [
    { name: '北面', color: '#4158D0' }, { name: '哥伦比亚', color: '#FF6B35' },
    { name: '始祖鸟', color: '#FF4D4F' }, { name: '探路者', color: '#FAAD14' },
    { name: '凯乐石', color: '#52C41A' }, { name: '骆驼', color: '#1890FF' },
    { name: '狼爪', color: '#722ED1' }, { name: '土拨鼠', color: '#13C2C2' },
  ],
  '鞋包': [
    { name: '耐克', color: '#4158D0' }, { name: '阿迪达斯', color: '#FF6B35' },
    { name: '新百伦', color: '#FF4D4F' }, { name: '百丽', color: '#FAAD14' },
    { name: 'Coach', color: '#52C41A' }, { name: 'MK', color: '#1890FF' },
    { name: '匡威', color: '#722ED1' }, { name: 'Vans', color: '#13C2C2' },
  ],
};

const PRESET_SHOP_NAMES: Record<string, string[]> = {
  '数码产品': ['vivo官方旗舰店', 'iQOO官方旗舰店', '华为官方旗舰店', '小米官方旗舰店', 'OPPO官方旗舰店', '荣耀官方旗舰店', 'Apple产品京东自营', 'realme真我官方旗舰店'],
  '大家电': ['海尔官方旗舰店', '美的官方旗舰店', '格力官方旗舰店', '海信官方旗舰店', 'TCL官方旗舰店', '松下官方旗舰店', '奥克斯旗舰店', '志高旗舰店'],
  '生活电器': ['美的官方旗舰店', '九阳官方旗舰店', '苏泊尔官方旗舰店', '飞利浦官方旗舰店', '戴森官方旗舰店', '小熊官方旗舰店', '摩飞官方旗舰店', '北鼎官方旗舰店'],
  '护肤': ['雅诗兰黛官方旗舰店', '兰蔻官方旗舰店', '欧莱雅官方旗舰店', '珀莱雅官方旗舰店', '薇诺娜官方旗舰店', '花西子官方旗舰店', 'SK-II官方旗舰店', '资生堂官方旗舰店'],
  '彩妆香水': ['雅诗兰黛官方旗舰店', '兰蔻官方旗舰店', 'MAC官方旗舰店', '圣罗兰官方旗舰店', '迪奥官方旗舰店', '香奈儿官方旗舰店', '纪梵希官方旗舰店', '阿玛尼官方旗舰店'],
  '个护清洁': ['宝洁官方旗舰店', '联合利华官方旗舰店', '舒肤佳官方旗舰店', '力士官方旗舰店', '多芬官方旗舰店', '六神官方旗舰店', '施华蔻官方旗舰店', '清扬官方旗舰店'],
  '饮料冲调': ['蒙牛官方旗舰店', '伊利官方旗舰店', '农夫山泉旗舰店', '可口可乐旗舰店', '三只松鼠旗舰店', '元气森林旗舰店', '统一旗舰店', '康师傅旗舰店'],
  '休闲零食': ['三只松鼠旗舰店', '良品铺子旗舰店', '百草味旗舰店', '来伊份旗舰店', '卫龙旗舰店', '洽洽旗舰店', '盼盼旗舰店', '旺旺旗舰店'],
  '粮油速食': ['金龙鱼旗舰店', '福临门旗舰店', '鲁花旗舰店', '康师傅旗舰店', '统一旗舰店', '白象旗舰店', '今麦郎旗舰店', '海天旗舰店'],
  '服装配饰': ['耐克官方旗舰店', '阿迪达斯官方旗舰店', '安踏官方旗舰店', '李宁官方旗舰店', '优衣库官方旗舰店', 'ZARA官方旗舰店', 'H&M旗舰店', 'GAP旗舰店'],
  '运动服饰': ['耐克官方旗舰店', '阿迪达斯官方旗舰店', '安踏官方旗舰店', '李宁官方旗舰店', '彪马官方旗舰店', '安德玛官方旗舰店', '特步官方旗舰店', '361度官方旗舰店'],
  '户外服饰': ['北面官方旗舰店', '哥伦比亚官方旗舰店', '始祖鸟官方旗舰店', '探路者官方旗舰店', '凯乐石官方旗舰店', '骆驼官方旗舰店', '狼爪官方旗舰店', '土拨鼠官方旗舰店'],
  '鞋包': ['耐克官方旗舰店', '阿迪达斯官方旗舰店', '新百伦官方旗舰店', '百丽官方旗舰店', 'Coach官方旗舰店', 'MK官方旗舰店', '匡威官方旗舰店', 'Vans官方旗舰店'],
};

const PRESET_HOTWORDS: Record<string, { word: string }[]> = {
  '数码产品': [{ word: '5G手机' }, { word: '拍照手机' }, { word: '游戏手机' }, { word: '折叠屏' }, { word: '长续航' }, { word: '快充' }, { word: '旗舰芯片' }, { word: '曲面屏' }, { word: '轻薄机身' }, { word: '大内存' }, { word: '高刷屏幕' }, { word: 'AI手机' }],
  '大家电': [{ word: '智能电视' }, { word: '变频空调' }, { word: '大容量冰箱' }, { word: '洗烘一体' }, { word: '一级能效' }, { word: '静音运行' }, { word: '嵌入式' }, { word: '除菌功能' }, { word: '大屏显示' }, { word: '节能省电' }, { word: '智能互联' }, { word: '自清洁' }],
  '生活电器': [{ word: '破壁机' }, { word: '空气炸锅' }, { word: '电饭煲' }, { word: '吸尘器' }, { word: '加湿器' }, { word: '净化器' }, { word: '电压力锅' }, { word: '榨汁机' }, { word: '电烤箱' }, { word: '挂烫机' }, { word: '电风扇' }, { word: '取暖器' }],
  '护肤': [{ word: '抗老精华' }, { word: '美白面霜' }, { word: '敏感肌' }, { word: '防晒隔离' }, { word: '保湿补水' }, { word: '淡纹眼霜' }, { word: '修护面膜' }, { word: '哑光唇釉' }, { word: '控油洁面' }, { word: '素颜霜' }, { word: '安瓶精华' }, { word: '早C晚A' }],
  '彩妆香水': [{ word: '哑光口红' }, { word: '粉底液' }, { word: '气垫BB' }, { word: '眼影盘' }, { word: '高光修容' }, { word: '眼线笔' }, { word: '睫毛膏' }, { word: '香水' }, { word: '散粉定妆' }, { word: '遮瑕膏' }, { word: '腮红' }, { word: '眉笔' }],
  '个护清洁': [{ word: '洗发水' }, { word: '沐浴露' }, { word: '牙膏' }, { word: '洗手液' }, { word: '香皂' }, { word: '护发素' }, { word: '身体乳' }, { word: '洗面奶' }, { word: '洗衣液' }, { word: '柔顺剂' }, { word: '洗洁精' }, { word: '消毒液' }],
  '饮料冲调': [{ word: '低糖饮料' }, { word: '无添加' }, { word: '高蛋白' }, { word: '益生菌' }, { word: '常温保存' }, { word: '进口零食' }, { word: '有机茶' }, { word: '气泡水' }, { word: '代餐奶昔' }, { word: '冻干咖啡' }, { word: '零卡糖' }, { word: '粗粮谷物' }],
  '休闲零食': [{ word: '坚果大礼包' }, { word: '辣条' }, { word: '薯片' }, { word: '饼干' }, { word: '巧克力' }, { word: '糖果' }, { word: '肉脯' }, { word: '鱼干' }, { word: '蜜饯' }, { word: '果冻' }, { word: '膨化食品' }, { word: '糕点' }],
  '粮油速食': [{ word: '大米' }, { word: '面粉' }, { word: '食用油' }, { word: '方便面' }, { word: '挂面' }, { word: '酱油' }, { word: '醋' }, { word: '料酒' }, { word: '味精' }, { word: '鸡精' }, { word: '白糖' }, { word: '盐' }],
  '服装配饰': [{ word: '运动休闲' }, { word: '透气跑步鞋' }, { word: '修身西装' }, { word: '宽松卫衣' }, { word: '速干面料' }, { word: '老爹鞋' }, { word: '工装裤' }, { word: '连帽衫' }, { word: '马丁靴' }, { word: '棒球服' }, { word: '瑜伽裤' }, { word: '冲锋衣' }],
  '运动服饰': [{ word: '跑步鞋' }, { word: '运动T恤' }, { word: '运动裤' }, { word: '篮球鞋' }, { word: '足球鞋' }, { word: '健身服' }, { word: '瑜伽服' }, { word: '运动内衣' }, { word: '运动外套' }, { word: '运动袜' }, { word: '运动帽' }, { word: '护具' }],
  '户外服饰': [{ word: '冲锋衣' }, { word: '登山鞋' }, { word: '速干衣' }, { word: '抓绒衣' }, { word: '滑雪服' }, { word: '骑行服' }, { word: '防晒衣' }, { word: '雨衣' }, { word: '羽绒服' }, { word: '户外裤' }, { word: '登山杖' }, { word: '背包' }],
  '鞋包': [{ word: '运动鞋' }, { word: '皮鞋' }, { word: '休闲鞋' }, { word: '靴子' }, { word: '凉鞋' }, { word: '拖鞋' }, { word: '单肩包' }, { word: '双肩包' }, { word: '手提包' }, { word: '钱包' }, { word: '腰带' }, { word: '行李箱' }],
};

/* ========== Deterministic helpers for generic industries (无预设数据的行业) ========== */

// 简单字符串哈希，用于确定性生成数据
function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// 通用品牌名池
const GENERIC_BRAND_POOL = [
  '蓝星', '锐途', '优品', '臻选', '悦享', '智选', '优选', '尚品',
  '卓越', '领航', '精英', '经典', '风尚', '潮流', '品质', '精选',
  '高端', '轻奢', '大众', '实惠', '精品', '尚品汇', '优品坊', '臻品堂',
];

const GENERIC_BRAND_SUFFIXES = ['', '集团', '科技', '实业', '贸易', '品牌', '世家', '堂'];

const CHART_COLORS = [
  '#4158D0', '#FF6B35', '#FF4D4F', '#FAAD14', '#52C41A',
  '#1890FF', '#722ED1', '#13C2C2', '#EB2F96', '#A0D911',
];

function getBrandsForIndustry(industry: string): string[] {
  if (PRESET_BRANDS[industry]) {
    return PRESET_BRANDS[industry];
  }
  const hash = hashString(industry);
  const count = 6 + (hash % 5); // 6-10个品牌
  const brands: string[] = ['全部品牌'];
  const used = new Set<number>();
  for (let i = 0; i < count - 1; i++) {
    let idx = (hash + i * 7) % GENERIC_BRAND_POOL.length;
    let attempts = 0;
    while (used.has(idx) && attempts < 20) {
      idx = (idx + 1) % GENERIC_BRAND_POOL.length;
      attempts++;
    }
    used.add(idx);
    const suffix = GENERIC_BRAND_SUFFIXES[(hash + i * 3) % GENERIC_BRAND_SUFFIXES.length];
    brands.push(GENERIC_BRAND_POOL[idx] + suffix);
  }
  return brands;
}

function getBrandColorsForIndustry(industry: string): { name: string; color: string }[] {
  if (PRESET_BRAND_COLORS[industry]) {
    return PRESET_BRAND_COLORS[industry];
  }
  const brands = getBrandsForIndustry(industry).filter(b => b !== '全部品牌');
  return brands.map((name, i) => ({
    name,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));
}

function getShopsForIndustry(industry: string): string[] {
  if (PRESET_SHOP_NAMES[industry]) {
    return PRESET_SHOP_NAMES[industry];
  }
  const brands = getBrandsForIndustry(industry).filter(b => b !== '全部品牌');
  return brands.map(b => `${b}官方旗舰店`);
}

function getHotwordsForIndustry(industry: string, category: string): { word: string }[] {
  const key = industry;
  if (PRESET_HOTWORDS[key]) {
    return PRESET_HOTWORDS[key];
  }
  const hash = hashString(industry + category);
  const words = [
    `${category}推荐`, `${category}排行榜`, `性价比${category}`, `高端${category}`,
    `平价${category}`, `${category}品牌`, `${category}测评`, `${category}对比`,
    `${category}选购`, `新款${category}`, `热销${category}`, `${category}优惠`,
  ];
  // 打乱顺序
  const shuffled = [...words];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (hash + i * 13) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.map(w => ({ word: w }));
}

function getPriceRangesForIndustry(industry: string): string[] {
  const hash = hashString(industry);
  const pattern = hash % 4;
  if (pattern === 0) {
    return ['0-99', '100-299', '300-599', '600-999', '1000-1999', '2000-4999', '5000+'];
  } else if (pattern === 1) {
    return ['0-49', '50-99', '100-199', '200-399', '400-699', '700-1499', '1500+'];
  } else if (pattern === 2) {
    return ['0-199', '200-499', '500-999', '1000-2999', '3000-5999', '6000-9999', '10000+'];
  } else {
    return ['0-19', '20-49', '50-99', '100-199', '200-499', '500-999', '1000+'];
  }
}

/* ========== Mock Data Generators ========== */

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateTrendData(industry: string, category: string) {
  const seed = hashString(industry + category + 'trend');
  const rand = seededRandom(seed);
  const months = [];
  const now = new Date();
  const baseSales = 50000 + (hashString(industry) % 50000);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const sales = Math.floor(baseSales + rand() * 30000 + (11 - i) * 1500);
    const volume = Math.floor(100 + rand() * 80 + (11 - i) * 3);
    months.push({
      month,
      label: `${d.getMonth() + 1}月`,
      sales,
      volume,
    });
  }
  return months;
}

function generateBrandRanking(industry: string, category: string) {
  const seed = hashString(industry + category + 'brand');
  const rand = seededRandom(seed);
  const brandList = getBrandColorsForIndustry(industry);
  let total = 0;
  const data = brandList.map((b, i) => {
    const sales = Math.floor(40000 - i * 3500 + rand() * 5000);
    const avgPrice = Math.floor(500 + rand() * 3000);
    total += sales;
    return { ...b, sales, avgPrice, rank: i + 1 };
  });
  return data.map((d) => ({ ...d, share: ((d.sales / total) * 100).toFixed(1) }));
}

function generatePriceVolumeData(industry: string, category: string) {
  const seed = hashString(industry + category + 'pricevol');
  const rand = seededRandom(seed);
  const ranges = getPriceRangesForIndustry(industry);
  return ranges.map((range) => ({
    range,
    sales: Math.floor(3000 + rand() * 25000),
    volume: Math.floor(500 + rand() * 5000),
  }));
}

function generateShopList(industry: string, category: string) {
  const seed = hashString(industry + category + 'shop');
  const rand = seededRandom(seed);
  const names = getShopsForIndustry(industry);
  return names.map((name, i) => ({
    id: i + 1,
    name,
    platform: ['京东', '天猫', '抖音'][i % 3],
    sales: Math.floor(8000 - i * 600 + rand() * 2000),
    volume: Math.floor(400 - i * 30 + rand() * 100),
    avgPrice: Math.floor(500 + rand() * 3000),
    rating: (4.5 + rand() * 0.5).toFixed(1),
  }));
}

function generateProductList(industry: string, category: string) {
  const seed = hashString(industry + category + 'product');
  const rand = seededRandom(seed);
  const brands = getBrandsForIndustry(industry).filter(b => b !== '全部品牌');
  const productModifiers = ['旗舰款', '经典款', '豪华款', '基础款', '升级款', '新款', 'Pro版', 'Max版', '标准版', '青春版'];
  const products = brands.map((brand, i) => ({
    name: `${brand} ${category}${productModifiers[i % productModifiers.length]}`,
    brand,
  }));
  return products.map((p, i) => ({
    id: i + 1,
    name: p.name,
    price: Math.floor(100 + rand() * 5000),
    sales: Math.floor(4000 - i * 250 + rand() * 1000),
    volume: Math.floor(150 - i * 10 + rand() * 50),
    brand: p.brand,
  }));
}

function generateHotwords(industry: string, category: string) {
  const seed = hashString(industry + category + 'hotwords');
  const rand = seededRandom(seed);
  const words = getHotwordsForIndustry(industry, category);
  return words
    .map((item, i) => ({
      word: item.word,
      count: Math.floor(4000 - i * 250 + rand() * 500),
      trend: (rand() - 0.4) * 100,
    }))
    .sort((a, b) => b.count - a.count);
}

function generatePriceCrossData(industry: string, category: string) {
  const seed = hashString(industry + category + 'pricecross');
  const rand = seededRandom(seed);
  const ranges = getPriceRangesForIndustry(industry);
  return ranges.map((range, i) => ({
    range,
    online: Math.floor(2000 + i * 1500 + rand() * 1500),
    offline: Math.floor(1500 + i * 1000 + rand() * 1000),
    total: Math.floor(3500 + i * 2500 + rand() * 2000),
  }));
}

/* ========== KPI Calculation ========== */
function calculateKpi(industry: string, category: string): KpiCard[] {
  const hash = hashString(industry + category);
  const rand = seededRandom(hash);
  const baseScale = 0.3 + (hash % 70) / 100; // 0.3 - 1.0 倍率
  const totalSales = (286.5 * baseScale).toFixed(1);
  const totalVolume = (8.6 * baseScale).toFixed(1);
  const avgPrice = Math.floor(3331 * baseScale);
  const brandCount = Math.floor(128 * baseScale);
  const salesChange = +(5 + rand() * 15).toFixed(1);
  const volumeChange = +(3 + rand() * 10).toFixed(1);
  const priceChange = +((rand() - 0.4) * 8).toFixed(1);
  const brandChange = +(2 + rand() * 8).toFixed(1);
  return [
    { label: '总销售额', value: `¥${totalSales}万`, change: salesChange, icon: <DollarSign className="h-5 w-5" />, color: '#4158D0' },
    { label: '总销量', value: `${totalVolume}万件`, change: volumeChange, icon: <Package className="h-5 w-5" />, color: '#C850C0' },
    { label: '平均价格', value: `¥${avgPrice.toLocaleString()}`, change: priceChange, icon: <Tag className="h-5 w-5" />, color: '#10B981' },
    { label: '品牌数', value: `${brandCount}个`, change: brandChange, icon: <Building2 className="h-5 w-5" />, color: '#F59E0B' },
  ];
}

/* ========== KPI Card Component ========== */
function KpiCardComp({ label, value, change, icon, color }: KpiCard) {
  const isUp = change >= 0;
  return (
    <Card className="bg-card border-border overflow-hidden relative">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <div className={cn(
              'flex items-center gap-1 text-xs font-medium',
              isUp ? 'text-emerald-400' : 'text-red-400',
            )}>
              {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isUp ? '+' : ''}{change.toFixed(1)}%
              <span className="text-muted-foreground ml-1">环比</span>
            </div>
          </div>
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {icon}
          </div>
        </div>
      </CardContent>
      <div
        className="absolute bottom-0 left-0 right-0 h-0.5"
        style={{ background: `linear-gradient(to right, ${color}, ${color}40)` }}
      />
    </Card>
  );
}

/* ========== View Components ========== */
function TrendView({ loading, data }: { loading: boolean; data: any[] }) {
  const chartConfig = {
    sales: { label: '销售额(万)', color: '#4158D0' },
    volume: { label: '销量(万)', color: '#C850C0' },
  };

  if (loading) {
    return (
      <div className="h-[400px] flex items-center justify-center">
        <Skeleton className="h-[350px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="h-[400px]">
      <ChartContainer config={chartConfig} className="h-full">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4158D0" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#4158D0" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#C850C0" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#C850C0" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Area
            type="monotone"
            dataKey="sales"
            name="销售额(万)"
            stroke="#4158D0"
            fill="url(#salesGradient)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="volume"
            name="销量(万)"
            stroke="#C850C0"
            fill="url(#volumeGradient)"
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

function BrandRankingView({ loading, data }: { loading: boolean; data: any[] }) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  const maxSales = Math.max(...data.map((d) => d.sales));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-3">
        {data.map((brand) => (
          <div key={brand.name} className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold',
                brand.rank <= 3
                  ? 'bg-gradient-to-br from-[#4158D0] to-[#C850C0] text-white'
                  : 'bg-secondary text-muted-foreground',
              )}
            >
              {brand.rank}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground">{brand.name}</span>
                <span className="text-sm font-mono text-foreground">
                  {brand.sales.toLocaleString()}万
                </span>
              </div>
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(brand.sales / maxSales) * 100}%`,
                    backgroundColor: brand.color,
                  }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>占比 {brand.share}%</span>
                <span>均价 ¥{brand.avgPrice.toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="h-[350px]">
        <ChartContainer
          config={data.reduce((acc: Record<string, any>, d) => {
            acc[d.name] = { label: d.name, color: d.color };
            return acc;
          }, {})}
          className="h-full"
        >
          <PieChart>
            <Pie
              data={data}
              dataKey="sales"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
          </PieChart>
        </ChartContainer>
      </div>
    </div>
  );
}

function PriceVolumeView({ loading, data }: { loading: boolean; data: any[] }) {
  const chartConfig = {
    sales: { label: '销售额(万)', color: '#4158D0' },
    volume: { label: '销量', color: '#C850C0' },
  };

  if (loading) {
    return <Skeleton className="h-[400px] w-full rounded-lg" />;
  }

  return (
    <div className="h-[400px]">
      <ChartContainer config={chartConfig} className="h-full">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="range" stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="sales" name="销售额(万)" fill="#4158D0" radius={[4, 4, 0, 0]} />
          <Bar dataKey="volume" name="销量" fill="#C850C0" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function DataTableView({
  loading,
  data,
  columns,
}: {
  loading: boolean;
  data: any[];
  columns: { key: string; label: string; align?: 'left' | 'right' }[];
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className={cn(col.align === 'right' && 'text-right')}
              >
                {col.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell
                  key={col.key}
                  className={cn(col.align === 'right' && 'text-right font-mono tabular-nums')}
                >
                  {row[col.key]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function HotwordsView({ loading, data }: { loading: boolean; data: any[] }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {data.map((item, i) => {
          const size = 12 + (item.count / maxCount) * 16;
          const isUp = item.trend >= 0;
          return (
            <Card
              key={item.word}
              className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer"
            >
              <CardContent className="p-4 text-center">
                <div
                  className="font-bold mb-1"
                  style={{
                    fontSize: `${size}px`,
                    background: 'linear-gradient(to right, #4158D0, #C850C0)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {item.word}
                </div>
                <div className="text-xs text-muted-foreground">
                  {item.count.toLocaleString()} 次
                </div>
                <div
                  className={cn(
                    'text-[10px] mt-1 flex items-center justify-center gap-0.5',
                    isUp ? 'text-emerald-400' : 'text-red-400',
                  )}
                >
                  {isUp ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                  {isUp ? '+' : ''}{item.trend.toFixed(1)}%
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DataTableView
        loading={false}
        data={data.map((d, i) => ({
          rank: i + 1,
          word: d.word,
          count: d.count.toLocaleString(),
          trend: `${d.trend >= 0 ? '+' : ''}${d.trend.toFixed(1)}%`,
        }))}
        columns={[
          { key: 'rank', label: '排名' },
          { key: 'word', label: '热词' },
          { key: 'count', label: '搜索频次', align: 'right' },
          { key: 'trend', label: '变化趋势', align: 'right' },
        ]}
      />
    </div>
  );
}

function PriceCrossView({ loading, data }: { loading: boolean; data: any[] }) {
  const chartConfig = {
    online: { label: '线上', color: '#4158D0' },
    offline: { label: '线下', color: '#C850C0' },
  };

  if (loading) return <Skeleton className="h-[400px] w-full rounded-lg" />;

  return (
    <div className="h-[400px]">
      <ChartContainer config={chartConfig} className="h-full">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="range" stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="online" name="线上(万)" fill="#4158D0" stackId="a" />
          <Bar dataKey="offline" name="线下(万)" fill="#C850C0" stackId="a" />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

/* ========== Main Component ========== */
export default function EcommercePage() {
  const [activeView, setActiveView] = useState('大盘趋势');
  const [loading, setLoading] = useState(true);
  const [viewData, setViewData] = useState<any[]>([]);
  const [categoryTree, setCategoryTree] = useState<CategoryTree>({});
  const [treeLoading, setTreeLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    industry: '',
    category: '',
    brand: '',
    timeRange: '近90天',
  });

  // AbortController ref for cancelling stale requests
  const abortControllerRef = useRef<AbortController | null>(null);

  /* ---------- 1. Load category tree on mount ---------- */
  useEffect(() => {
    let cancelled = false;
    async function loadTree() {
      try {
        const res = await fetch('/api/market-monitor/categories');
        const json = await res.json();
        if (!cancelled && json.success && json.data) {
          const tree = json.data as CategoryTree;
          setCategoryTree(tree);
          const industries = Object.keys(tree);
          const firstIndustry = industries[0] || '';
          const firstCategory = firstIndustry && tree[firstIndustry]
            ? Object.keys(tree[firstIndustry])[0] || ''
            : '';
          const firstBrand = getBrandsForIndustry(firstIndustry)[0] || '';
          setFilters({
            industry: firstIndustry,
            category: firstCategory,
            brand: firstBrand,
            timeRange: '近90天',
          });
        }
      } catch (err) {
        console.error('Failed to load category tree:', err);
      } finally {
        if (!cancelled) setTreeLoading(false);
      }
    }
    loadTree();
    return () => { cancelled = true; };
  }, []);

  /* ---------- 2. Derived data ---------- */
  const industries = useMemo(() => Object.keys(categoryTree), [categoryTree]);

  const categories = useMemo(() => {
    if (!filters.industry || !categoryTree[filters.industry]) return [];
    return Object.keys(categoryTree[filters.industry]);
  }, [filters.industry, categoryTree]);

  const brands = useMemo(() => getBrandsForIndustry(filters.industry), [filters.industry]);

  /* ---------- 3. KPI cards (dynamic based on industry + category) ---------- */
  const kpiCards: KpiCard[] = useMemo(() => {
    if (!filters.industry || !filters.category) return [];
    return calculateKpi(filters.industry, filters.category);
  }, [filters.industry, filters.category]);

  /* ---------- 4. fetchViewData with specific deps + AbortController ---------- */
  const fetchViewData = useCallback(
    async (viewKey: string, industry: string, category: string, brand: string) => {
      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      try {
        const res = await fetch('/api/market-monitor/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `查看${category}类目${viewKey}数据`,
            category: [industry, category],
            brand: brand === '全部品牌' ? '' : brand,
          }),
          signal: controller.signal,
        });
        const json = await res.json();

        if (controller.signal.aborted) return;

        // If API returns valid array data, use it; otherwise fall back to mock
        if (json.success && json.data?.data && Array.isArray(json.data.data)) {
          setViewData(json.data.data);
        } else {
          // Generate mock data based on view type + industry + category
          generateMockData(viewKey, industry, category);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        // Fallback to mock on error
        generateMockData(viewKey, industry, category);
      } finally {
        if (!controller.signal.aborted) {
          setTimeout(() => setLoading(false), 300);
        }
      }
    },
    [], // 无依赖，所有变量通过参数传入
  );

  // Helper: generate mock data (pure function, no closure dependency on filters)
  const generateMockData = useCallback((viewKey: string, industry: string, category: string) => {
    setTimeout(() => {
      switch (viewKey) {
        case '大盘趋势':
          setViewData(generateTrendData(industry, category));
          break;
        case '品牌排行':
          setViewData(generateBrandRanking(industry, category));
          break;
        case '销售价量':
          setViewData(generatePriceVolumeData(industry, category));
          break;
        case '店铺列表':
          setViewData(generateShopList(industry, category));
          break;
        case '商品列表':
          setViewData(generateProductList(industry, category));
          break;
        case '价格区间':
          setViewData(generatePriceVolumeData(industry, category));
          break;
        case '价格交叉':
          setViewData(generatePriceCrossData(industry, category));
          break;
        case '热词频次':
          setViewData(generateHotwords(industry, category));
          break;
        default:
          setViewData([]);
      }
    }, 300);
  }, []);

  /* ---------- 5. Single useEffect for data fetching ---------- */
  useEffect(() => {
    if (!filters.industry || !filters.category) return;
    fetchViewData(activeView, filters.industry, filters.category, filters.brand);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [activeView, filters.industry, filters.category, filters.brand, fetchViewData]);

  /* ---------- 6. Event handlers (functional updates) ---------- */
  const handleIndustryChange = useCallback((v: string) => {
    setFilters((prev) => {
      const cats = categoryTree[v] ? Object.keys(categoryTree[v]) : [];
      const brandList = getBrandsForIndustry(v);
      return {
        ...prev,
        industry: v,
        category: cats[0] || '',
        brand: brandList[0] || '',
      };
    });
  }, [categoryTree]);

  const handleCategoryChange = useCallback((v: string) => {
    setFilters((prev) => ({ ...prev, category: v }));
  }, []);

  const handleBrandChange = useCallback((v: string) => {
    setFilters((prev) => ({ ...prev, brand: v }));
  }, []);

  const handleTimeRangeChange = useCallback((v: string) => {
    setFilters((prev) => ({ ...prev, timeRange: v }));
  }, []);

  const handleViewChange = (key: string) => {
    setActiveView(key);
  };

  const handleRefresh = () => {
    if (filters.industry && filters.category) {
      fetchViewData(activeView, filters.industry, filters.category, filters.brand);
    }
  };

  /* ---------- 7. View content renderer ---------- */
  const renderViewContent = () => {
    switch (activeView) {
      case '大盘趋势':
        return <TrendView loading={loading} data={viewData} />;
      case '品牌排行':
        return <BrandRankingView loading={loading} data={viewData} />;
      case '销售价量':
        return <PriceVolumeView loading={loading} data={viewData} />;
      case '店铺列表':
        return (
          <DataTableView
            loading={loading}
            data={viewData.map((d) => ({
              rank: d.id,
              name: d.name,
              platform: d.platform,
              sales: d.sales.toLocaleString() + '万',
              volume: d.volume.toLocaleString(),
              avgPrice: '¥' + d.avgPrice.toLocaleString(),
              rating: d.rating,
            }))}
            columns={[
              { key: 'rank', label: '排名' },
              { key: 'name', label: '店铺名称' },
              { key: 'platform', label: '平台' },
              { key: 'sales', label: '销售额', align: 'right' },
              { key: 'volume', label: '销量', align: 'right' },
              { key: 'avgPrice', label: '均价', align: 'right' },
              { key: 'rating', label: '评分', align: 'right' },
            ]}
          />
        );
      case '商品列表':
        return (
          <DataTableView
            loading={loading}
            data={viewData.map((d) => ({
              rank: d.id,
              name: d.name,
              brand: d.brand,
              price: '¥' + d.price.toLocaleString(),
              sales: d.sales.toLocaleString() + '万',
              volume: d.volume.toLocaleString(),
            }))}
            columns={[
              { key: 'rank', label: '排名' },
              { key: 'name', label: '商品名称' },
              { key: 'brand', label: '品牌' },
              { key: 'price', label: '价格', align: 'right' },
              { key: 'sales', label: '销售额', align: 'right' },
              { key: 'volume', label: '销量', align: 'right' },
            ]}
          />
        );
      case '价格区间':
        return <PriceVolumeView loading={loading} data={viewData} />;
      case '价格交叉':
        return <PriceCrossView loading={loading} data={viewData} />;
      case '热词频次':
        return <HotwordsView loading={loading} data={viewData} />;
      default:
        return <div className="text-center py-12 text-muted-foreground">暂无数据</div>;
    }
  };

  /* ---------- 8. Render ---------- */
  if (treeLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[400px] w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Industry */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">行业</span>
              <Select
                value={filters.industry}
                onValueChange={handleIndustryChange}
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {industries.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">品类</span>
              <Select
                value={filters.category}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Brand */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">品牌</span>
              <Select
                value={filters.brand}
                onValueChange={handleBrandChange}
              >
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Time Range */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">时间</span>
              <Select
                value={filters.timeRange}
                onValueChange={handleTimeRangeChange}
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIME_RANGES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1" />

            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
              刷新数据
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, i) => (
          <KpiCardComp key={i} {...card} />
        ))}
      </div>

      {/* Data Views */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              数据视角
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {/* View Tabs */}
          <div className="flex flex-wrap gap-1.5 mb-6 pb-4 border-b border-border">
            {VIEWS.map((view) => (
              <Button
                key={view.key}
                variant={activeView === view.key ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewChange(view.key)}
                className={cn(
                  activeView === view.key &&
                    'bg-gradient-to-r from-[#4158D0] to-[#C850C0] text-white border-0',
                )}
              >
                {view.label}
              </Button>
            ))}
          </div>

          {/* View Content */}
          {renderViewContent()}
        </CardContent>
      </Card>
    </div>
  );
}
