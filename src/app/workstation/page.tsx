'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useApp } from '@/contexts/AppContext';
import { BRANDS } from '@/lib/constants';
import {
  getProductList,
  addProductItem,
  updateProductItem,
  deleteProductItem,
  getScriptList,
  addScriptItem,
  updateScriptItem,
  deleteScriptItem,
  genId,
} from '@/lib/store';
import type { ProductItem, ScriptTemplate } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Edit2, Package, FileText, Tag, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

const SCRIPT_CATEGORIES = ['开场', '产品介绍', '互动', '逼单', '收尾'] as const;

export default function WorkstationPage() {
  const { currentBrand, isClient } = useApp();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [scripts, setScripts] = useState<ScriptTemplate[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>(currentBrand !== 'all' ? currentBrand : BRANDS[0].id);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductItem | null>(null);
  const [editingScript, setEditingScript] = useState<ScriptTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [productCardId, setProductCardId] = useState<string | null>(null);

  // Product form
  const [pName, setPName] = useState('');
  const [pCategory, setPCategory] = useState('');
  const [pPrice, setPPrice] = useState('');
  const [pFeatures, setPFeatures] = useState('');
  const [pDesc, setPDesc] = useState('');

  // Script form
  const [sTitle, setSTitle] = useState('');
  const [sCategory, setSCategory] = useState<string>('开场');
  const [sProductId, setSProductId] = useState('');
  const [sContent, setSContent] = useState('');

  useEffect(() => {
    setProducts(getProductList());
    setScripts(getScriptList());
  }, []);

  useEffect(() => {
    if (currentBrand !== 'all') setSelectedBrand(currentBrand);
  }, [currentBrand]);

  const brandProducts = useMemo(() => {
    return products.filter((p) => {
      if (p.brandId !== selectedBrand) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
      }
      return true;
    });
  }, [products, selectedBrand, searchQuery]);

  const brandScripts = useMemo(() => {
    return scripts.filter((s) => s.brandId === selectedBrand);
  }, [scripts, selectedBrand]);

  const currentBrandObj = BRANDS.find((b) => b.id === selectedBrand);

  // ==================== 产品操作 ====================
  const handleOpenProductDialog = useCallback((product?: ProductItem) => {
    if (product) {
      setEditingProduct(product);
      setPName(product.name);
      setPCategory(product.category);
      setPPrice(String(product.price));
      setPFeatures(product.features.join('\n'));
      setPDesc(product.description || '');
    } else {
      setEditingProduct(null);
      setPName('');
      setPCategory('');
      setPPrice('');
      setPFeatures('');
      setPDesc('');
    }
    setProductDialogOpen(true);
  }, []);

  const handleSaveProduct = useCallback(() => {
    if (!pName || !pPrice) return;
    const features = pFeatures.split('\n').filter(Boolean);
    if (editingProduct) {
      updateProductItem({
        ...editingProduct,
        name: pName,
        category: pCategory,
        price: Number(pPrice),
        features,
        description: pDesc || undefined,
      });
    } else {
      addProductItem({
        id: genId(),
        brandId: selectedBrand,
        name: pName,
        category: pCategory,
        price: Number(pPrice),
        features,
        description: pDesc || undefined,
      });
    }
    setProducts(getProductList());
    setProductDialogOpen(false);
  }, [editingProduct, pName, pCategory, pPrice, pFeatures, pDesc, selectedBrand]);

  const handleDeleteProduct = useCallback((id: string) => {
    deleteProductItem(id);
    setProducts(getProductList());
  }, []);

  // ==================== 话术操作 ====================
  const handleOpenScriptDialog = useCallback((script?: ScriptTemplate) => {
    if (script) {
      setEditingScript(script);
      setSTitle(script.title);
      setSCategory(script.category);
      setSProductId(script.productId || '');
      setSContent(script.content);
    } else {
      setEditingScript(null);
      setSTitle('');
      setSCategory('开场');
      setSProductId('');
      setSContent('');
    }
    setScriptDialogOpen(true);
  }, []);

  const handleSaveScript = useCallback(() => {
    if (!sTitle || !sContent) return;
    const now = new Date().toISOString();
    if (editingScript) {
      updateScriptItem({
        ...editingScript,
        title: sTitle,
        category: sCategory,
        productId: sProductId || undefined,
        content: sContent,
        updatedAt: now,
      });
    } else {
      addScriptItem({
        id: genId(),
        brandId: selectedBrand,
        title: sTitle,
        category: sCategory,
        productId: sProductId || undefined,
        content: sContent,
        createdAt: now,
        updatedAt: now,
      });
    }
    setScripts(getScriptList());
    setScriptDialogOpen(false);
  }, [editingScript, sTitle, sCategory, sProductId, sContent, selectedBrand]);

  const handleDeleteScript = useCallback((id: string) => {
    deleteScriptItem(id);
    setScripts(getScriptList());
  }, []);

  if (!isClient) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-5 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const selectedProduct = productCardId ? products.find((p) => p.id === productCardId) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">主播工作台</h1>
          <p className="text-sm text-muted-foreground mt-1">产品信息与话术管理</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedBrand} onValueChange={setSelectedBrand}>
            <SelectTrigger className="w-32 bg-secondary border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRANDS.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList className="bg-secondary">
          <TabsTrigger value="products" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Package className="h-4 w-4 mr-1" /> 产品信息库
          </TabsTrigger>
          <TabsTrigger value="scripts" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FileText className="h-4 w-4 mr-1" /> 话术模板
          </TabsTrigger>
          <TabsTrigger value="product-card" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Tag className="h-4 w-4 mr-1" /> 产品卡
          </TabsTrigger>
        </TabsList>

        {/* 产品信息库 */}
        <TabsContent value="products" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="搜索产品..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-64 bg-secondary border-border"
                />
              </div>
            </div>
            <Button size="sm" onClick={() => handleOpenProductDialog()}>
              <Plus className="h-4 w-4 mr-1" /> 添加产品
            </Button>
          </div>

          {brandProducts.length === 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                暂无产品信息，点击"添加产品"开始录入
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {brandProducts.map((product) => (
                <Card key={product.id} className="border-border bg-card hover:border-primary/30 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-foreground">{product.name}</CardTitle>
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                        {product.category || '未分类'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xl font-bold text-primary mb-2">
                      ¥{product.price.toLocaleString()}
                    </p>
                    {product.features.length > 0 && (
                      <div className="space-y-1 mb-3">
                        {product.features.slice(0, 3).map((f, i) => (
                          <p key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                            <span className="h-1 w-1 rounded-full bg-primary/60" />
                            {f}
                          </p>
                        ))}
                        {product.features.length > 3 && (
                          <p className="text-xs text-muted-foreground">+{product.features.length - 3} 更多卖点</p>
                        )}
                      </div>
                    )}
                    {product.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{product.description}</p>
                    )}
                    <div className="flex items-center gap-1 pt-2 border-t border-border">
                      <Button variant="ghost" size="sm" className="text-xs" onClick={() => setProductCardId(product.id)}>
                        <Tag className="h-3.5 w-3.5 mr-1" /> 产品卡
                      </Button>
                      <div className="flex-1" />
                      <Button variant="ghost" size="sm" onClick={() => handleOpenProductDialog(product)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteProduct(product.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 话术模板 */}
        <TabsContent value="scripts" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {SCRIPT_CATEGORIES.map((cat) => {
                const count = brandScripts.filter((s) => s.category === cat).length;
                return (
                  <Badge key={cat} variant="outline" className="text-xs border-border">
                    {cat} ({count})
                  </Badge>
                );
              })}
            </div>
            <Button size="sm" onClick={() => handleOpenScriptDialog()}>
              <Plus className="h-4 w-4 mr-1" /> 新建话术
            </Button>
          </div>

          {brandScripts.length === 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                暂无话术模板，点击"新建话术"开始编写
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SCRIPT_CATEGORIES.map((cat) => {
                const catScripts = brandScripts.filter((s) => s.category === cat);
                if (catScripts.length === 0) return null;
                return (
                  <div key={cat}>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      <span className={cn('h-2 w-2 rounded-full',
                        cat === '开场' ? 'bg-blue-400' :
                        cat === '产品介绍' ? 'bg-green-400' :
                        cat === '互动' ? 'bg-yellow-400' :
                        cat === '逼单' ? 'bg-red-400' : 'bg-purple-400'
                      )} />
                      {cat}
                    </h3>
                    <div className="space-y-2">
                      {catScripts.map((script) => {
                        const linkedProduct = script.productId ? products.find((p) => p.id === script.productId) : null;
                        return (
                          <Card key={script.id} className="border-border bg-card">
                            <CardContent className="py-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-foreground truncate">{script.title}</p>
                                  {linkedProduct && (
                                    <Badge variant="outline" className="text-[10px] mt-1 border-primary/30 text-primary">
                                      {linkedProduct.name}
                                    </Badge>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{script.content}</p>
                                </div>
                                <div className="flex items-center gap-1 ml-2">
                                  <Button variant="ghost" size="sm" onClick={() => handleOpenScriptDialog(script)}>
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDeleteScript(script.id)}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* 产品卡展示 */}
        <TabsContent value="product-card" className="space-y-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">选择产品</Label>
            <Select value={productCardId || ''} onValueChange={setProductCardId}>
              <SelectTrigger className="w-64 bg-secondary border-border">
                <SelectValue placeholder="选择产品查看产品卡" />
              </SelectTrigger>
              <SelectContent>
                {brandProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedProduct ? (
            <Card className={cn('border-2 bg-card max-w-md mx-auto', `brand-border-${selectedBrand}`)}>
              <div className="h-2 rounded-t-lg" style={{ backgroundColor: currentBrandObj?.color }} />
              <CardHeader className="text-center pb-2">
                <Badge variant="outline" className="text-[10px] mx-auto mb-2 border-primary/30 text-primary">
                  {currentBrandObj?.name}
                </Badge>
                <CardTitle className="text-lg font-bold text-foreground">{selectedProduct.name}</CardTitle>
                <p className="text-2xl font-black text-primary mt-1">¥{selectedProduct.price.toLocaleString()}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedProduct.category && (
                  <div className="text-center">
                    <Badge className="bg-secondary text-foreground">{selectedProduct.category}</Badge>
                  </div>
                )}
                {selectedProduct.features.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">核心卖点</h4>
                    <div className="space-y-1.5">
                      {selectedProduct.features.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-foreground">
                          <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: currentBrandObj?.color }} />
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedProduct.description && (
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-1">产品描述</h4>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{selectedProduct.description}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border bg-card">
              <CardContent className="py-12 text-center text-muted-foreground">
                请选择一个产品查看产品卡
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* 产品表单对话框 */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editingProduct ? '编辑产品' : '添加产品'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-muted-foreground text-xs">产品名称</Label>
              <Input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="例: vivo X100 Pro" className="bg-secondary border-border mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">分类</Label>
                <Input value={pCategory} onChange={(e) => setPCategory(e.target.value)} placeholder="例: 旗舰手机" className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">价格（元）</Label>
                <Input type="number" value={pPrice} onChange={(e) => setPPrice(e.target.value)} placeholder="3999" className="bg-secondary border-border mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">核心卖点（每行一条）</Label>
              <Textarea value={pFeatures} onChange={(e) => setPFeatures(e.target.value)} placeholder={'天玑9300旗舰芯片\n5000万像素蔡司影像\n120W双芯闪充'} rows={4} className="bg-secondary border-border mt-1" />
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">产品描述</Label>
              <Textarea value={pDesc} onChange={(e) => setPDesc(e.target.value)} placeholder="详细产品描述..." rows={3} className="bg-secondary border-border mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveProduct}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 话术表单对话框 */}
      <Dialog open={scriptDialogOpen} onOpenChange={setScriptDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-foreground">{editingScript ? '编辑话术' : '新建话术'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs">话术标题</Label>
                <Input value={sTitle} onChange={(e) => setSTitle(e.target.value)} placeholder="例: X100 Pro开场白" className="bg-secondary border-border mt-1" />
              </div>
              <div>
                <Label className="text-muted-foreground text-xs">话术分类</Label>
                <Select value={sCategory} onValueChange={setSCategory}>
                  <SelectTrigger className="bg-secondary border-border mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCRIPT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">关联产品（可选）</Label>
              <Select value={sProductId} onValueChange={setSProductId}>
                <SelectTrigger className="bg-secondary border-border mt-1">
                  <SelectValue placeholder="不关联" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">不关联</SelectItem>
                  {brandProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">话术内容</Label>
              <Textarea value={sContent} onChange={(e) => setSContent(e.target.value)} placeholder="编写话术内容..." rows={8} className="bg-secondary border-border mt-1 font-mono text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScriptDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveScript}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
