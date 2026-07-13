"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { DollarSign, Users, UserCheck, ShoppingCart, TrendingUp } from "lucide-react";

interface CostData {
  month: string;
  brand: string;
  dimensions: {
    anchor: { total: number; details: Array<{ name: string; hours: number; rate: number; cost: number }> };
    control: { total: number; details: Array<{ name: string; hours: number; cost: number; mode: string }> };
    fulltime: { total: number; details: Array<{ name: string; base: number; subsidy: number; cost: number; role: string }> };
    purchase: { total: number; details: Array<{ date: string; amount: number }> };
  };
  totalCost: number;
  byBrand: Record<string, number>;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const BRAND_COLORS: Record<string, string> = {
  vivo: "#415FFF",
  iQOO: "#FF6B35",
  IOT: "#00C9A7",
};

const DIMENSION_COLORS = {
  anchor: "#EC4899", // 玫红
  control: "#F59E0B", // 琥珀
  fulltime: "#3B82F6", // 蓝
  purchase: "#10B981", // 绿
};

export function CostOverview() {
  const [month, setMonth] = useState<string>("");
  const [brand, setBrand] = useState<string>("all");
  const [data, setData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize month to current month
  useEffect(() => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setMonth(currentMonth);
  }, []);

  // Fetch data when month or brand changes
  useEffect(() => {
    if (!month) return;
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/cost-overview?month=${month}&brand=${brand}`);
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error || "获取数据失败");
        }
      } catch (err) {
        setError("网络请求失败");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [month, brand]);

  // Generate month options (last 12 months)
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });

  if (!month) return null;

  const pieData = data?.byBrand 
    ? Object.entries(data.byBrand).map(([name, value]) => ({ name, value }))
    : [];

  const barData = data ? [
    { name: "兼职主播", value: data.dimensions.anchor.total, color: DIMENSION_COLORS.anchor },
    { name: "兼职中控", value: data.dimensions.control.total, color: DIMENSION_COLORS.control },
    { name: "全职员工", value: data.dimensions.fulltime.total, color: DIMENSION_COLORS.fulltime },
    { name: "日常采买", value: data.dimensions.purchase.total, color: DIMENSION_COLORS.purchase },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card className="bg-zinc-900/80 border-zinc-700/50">
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-zinc-400">月份</label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[140px] bg-zinc-800 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-zinc-400">品牌</label>
              <Tabs value={brand} onValueChange={setBrand}>
                <TabsList className="bg-zinc-800">
                  <TabsTrigger value="all">全部</TabsTrigger>
                  <TabsTrigger value="vivo">vivo</TabsTrigger>
                  <TabsTrigger value="iQOO">iQOO</TabsTrigger>
                  <TabsTrigger value="IOT">IOT</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {error && (
        <Card className="bg-red-900/20 border-red-700/50">
          <CardContent className="pt-6">
            <p className="text-red-400">{error}</p>
          </CardContent>
        </Card>
      )}

      {data && !loading && (
        <>
          {/* Dimension Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-zinc-900/80 border-zinc-700/50 hover:scale-[1.01] transition-transform">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">兼职主播</CardTitle>
                <Users className="h-4 w-4" style={{ color: DIMENSION_COLORS.anchor }} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ color: DIMENSION_COLORS.anchor }}>
                  {formatCurrency(data.dimensions.anchor.total)}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  占比 {data.totalCost > 0 ? ((data.dimensions.anchor.total / data.totalCost) * 100).toFixed(1) : 0}%
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/80 border-zinc-700/50 hover:scale-[1.01] transition-transform">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">兼职中控</CardTitle>
                <UserCheck className="h-4 w-4" style={{ color: DIMENSION_COLORS.control }} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ color: DIMENSION_COLORS.control }}>
                  {formatCurrency(data.dimensions.control.total)}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  占比 {data.totalCost > 0 ? ((data.dimensions.control.total / data.totalCost) * 100).toFixed(1) : 0}%
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/80 border-zinc-700/50 hover:scale-[1.01] transition-transform">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">全职员工</CardTitle>
                <Users className="h-4 w-4" style={{ color: DIMENSION_COLORS.fulltime }} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ color: DIMENSION_COLORS.fulltime }}>
                  {formatCurrency(data.dimensions.fulltime.total)}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  占比 {data.totalCost > 0 ? ((data.dimensions.fulltime.total / data.totalCost) * 100).toFixed(1) : 0}%
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/80 border-zinc-700/50 hover:scale-[1.01] transition-transform">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-zinc-400">日常采买</CardTitle>
                <ShoppingCart className="h-4 w-4" style={{ color: DIMENSION_COLORS.purchase }} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" style={{ color: DIMENSION_COLORS.purchase }}>
                  {formatCurrency(data.dimensions.purchase.total)}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  占比 {data.totalCost > 0 ? ((data.dimensions.purchase.total / data.totalCost) * 100).toFixed(1) : 0}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Total Cost & Brand Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-zinc-900/80 border-zinc-700/50">
              <CardHeader>
                <CardTitle className="text-base text-zinc-200 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  总成本
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">{formatCurrency(data.totalCost)}</div>
                {Object.keys(data.byBrand).length > 0 && (
                  <div className="mt-4 space-y-2">
                    {Object.entries(data.byBrand).map(([brandName, cost]) => (
                      <div key={brandName} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: BRAND_COLORS[brandName] }} />
                          <span className="text-sm text-zinc-400">{brandName}</span>
                        </div>
                        <span className="text-sm font-medium text-zinc-200">{formatCurrency(cost)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/80 border-zinc-700/50">
              <CardHeader>
                <CardTitle className="text-base text-zinc-200 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  品牌占比
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={BRAND_COLORS[entry.name] || "#666"} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-zinc-500">
                    暂无品牌分布数据
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Dimension Bar Chart */}
          <Card className="bg-zinc-900/80 border-zinc-700/50">
            <CardHeader>
              <CardTitle className="text-base text-zinc-200">维度成本对比</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" stroke="#888" />
                  <YAxis stroke="#888" tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="value" name="成本">
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
