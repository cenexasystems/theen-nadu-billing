import React, { useState, useEffect, useCallback } from 'react'
import { Package, Search, AlertTriangle, X, RefreshCw, Edit2, Plus, Trash2, ChevronDown, Download, TrendingUp, PieChart } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/retail'
import { useSound } from '../context/SoundContext'

interface InventoryProduct {
  id: string | number
  name: string
  category: string
  stock_quantity: number
  low_stock_alert: number
  price: number
  purchase_price?: number
  is_active: boolean
  updated_at: string
  image_url?: string
}

interface Category {
  id: string | number
  name_en: string
  name_ta?: string
  is_active: boolean
  sort_order?: number
}

interface AdjustModal {
  product: InventoryProduct
  newQty: string
  adjustType: 'restock' | 'correction' | 'loss' | 'return'
  note: string
}

interface ProductForm {
  name: string
  category: string
  price: string
  purchase_price: string
  stock_quantity: string
  low_stock_alert: string
  is_active: boolean
  item_type: 'product' | 'service'
}

const EMPTY_FORM: ProductForm = {
  name: '',
  category: '',
  price: '',
  purchase_price: '',
  stock_quantity: '0',
  low_stock_alert: '5',
  is_active: true,
  item_type: 'product',
}

const getStatus = (p: InventoryProduct) => {
  if (p.stock_quantity <= 0) return 'out'
  if (p.stock_quantity <= (p.low_stock_alert || 5)) return 'low'
  return 'ok'
}

export default function Inventory() {
  const { play } = useSound()
  const [activeTab, setActiveTab] = useState<'stock' | 'products' | 'categories' | 'analytics'>('stock')

  // Stock state
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all')
  const [adjustModal, setAdjustModal] = useState<AdjustModal | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  // Product form state
  const [productForm, setProductForm] = useState<ProductForm>(EMPTY_FORM)
  const [editingProduct, setEditingProduct] = useState<InventoryProduct | null>(null)
  const [savingProduct, setSavingProduct] = useState(false)
  const [productNotice, setProductNotice] = useState('')

  // Category state
  const [categories, setCategories] = useState<Category[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [editingCatName, setEditingCatName] = useState('')
  const [savingCat, setSavingCat] = useState(false)
  const [catNotice, setCatNotice] = useState('')

  const downloadCSV = () => {
    const headers = ['ID', 'Product Name', 'Category', 'Stock Quantity', 'Low Stock Alert', 'Price (RM)', 'Purchase Price (RM)', 'Status', 'Last Updated']
    const rows = products.map(p => {
      const status = p.stock_quantity <= 0 ? 'Out of Stock' : p.stock_quantity <= p.low_stock_alert ? 'Low Stock' : 'In Stock'
      return [
        p.id,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${(p.category || '').replace(/"/g, '""')}"`,
        p.stock_quantity,
        p.low_stock_alert,
        p.price,
        p.purchase_price || 0,
        status,
        new Date(p.updated_at).toLocaleString('en-MY')
      ].join(',')
    })
    
    const csvContent = [headers.join(','), ...rows].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `inventory_report_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('id, name, category, stock_quantity, low_stock_alert, price, purchase_price, is_active, updated_at, image_url, item_type')
      .order('name')
    if (!error && data) setProducts(data as InventoryProduct[])
    setLoading(false)
  }, [])

  const fetchCategories = useCallback(async () => {
    const { data } = await supabase.from('categories').select('*').order('sort_order').order('name_en')
    if (data) setCategories(data as Category[])
  }, [])

  useEffect(() => {
    void fetchProducts()
    void fetchCategories()
  }, [fetchProducts, fetchCategories])

  // ── Stock Management ──────────────────────────────────────────────
  const filtered = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase())
    const status = getStatus(p)
    if (filter === 'low') return matchSearch && status === 'low'
    if (filter === 'out') return matchSearch && status === 'out'
    return matchSearch
  })

  const lowCount = products.filter(p => getStatus(p) === 'low').length
  const outCount = products.filter(p => getStatus(p) === 'out').length
  const stockValue = products.reduce((s, p) => s + (p.stock_quantity * p.price), 0)

  const openAdjust = (product: InventoryProduct) => {
    const status = getStatus(product)
    if (status === 'low' || status === 'out') play('alert')
    setAdjustModal({ product, newQty: String(product.stock_quantity), adjustType: 'restock', note: '' })
  }

  const saveAdjust = async () => {
    if (!adjustModal) return
    const { product, newQty, adjustType, note } = adjustModal
    const newQtyNum = parseFloat(newQty)
    if (isNaN(newQtyNum) || newQtyNum < 0) { setNotice('Please enter a valid quantity.'); return }
    setSaving(true)
    try {
      const { error: updateErr } = await supabase
        .from('products')
        .update({ stock_quantity: newQtyNum, updated_at: new Date().toISOString() })
        .eq('id', product.id)
      if (updateErr) throw updateErr

      await supabase.from('inventory_logs').insert({
        product_id: product.id,
        old_quantity: product.stock_quantity,
        new_quantity: newQtyNum,
        adjustment: newQtyNum - product.stock_quantity,
        reason: adjustType === 'restock' ? 'restock' : adjustType === 'loss' ? 'loss' : adjustType === 'return' ? 'return' : 'manual_adjustment',
        reference_id: note || null,
      }).then(() => {})

      play('success')
      setAdjustModal(null)
      void fetchProducts()
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Failed to update stock')
      play('error')
    } finally {
      setSaving(false)
    }
  }

  // ── Product Management ──────────────────────────────────────────────
  const startEditProduct = (p: InventoryProduct) => {
    setEditingProduct(p)
    setProductForm({
      name: p.name,
      category: p.category || '',
      price: String(p.price),
      purchase_price: String(p.purchase_price || ''),
      stock_quantity: String(p.stock_quantity),
      low_stock_alert: String(p.low_stock_alert || 5),
      is_active: p.is_active,
      item_type: ((p as any).item_type === 'service' ? 'service' : 'product') as 'product' | 'service',
    })
    setProductNotice('')
    setActiveTab('products')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const resetProductForm = () => {
    setEditingProduct(null)
    setProductForm(EMPTY_FORM)
    setProductNotice('')
  }

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!productForm.name.trim() || !productForm.price) {
      setProductNotice('Product name and price are required.')
      return
    }
    setSavingProduct(true)
    setProductNotice('')
    try {
      const payload = {
        name: productForm.name.trim(),
        category: productForm.category.trim() || null,
        price: parseFloat(productForm.price) || 0,
        purchase_price: productForm.purchase_price ? parseFloat(productForm.purchase_price) : 0,
        stock_quantity: parseFloat(productForm.stock_quantity) || 0,
        low_stock_alert: parseInt(productForm.low_stock_alert) || 5,
        is_active: productForm.is_active,
        item_type: productForm.item_type,
        updated_at: new Date().toISOString(),
      }
      if (editingProduct) {
        const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id)
        if (error) throw error
        setProductNotice('Product updated successfully!')
      } else {
        const { error } = await supabase.from('products').insert(payload)
        if (error) throw error
        setProductNotice('Product added successfully!')
        setProductForm(EMPTY_FORM)
      }
      play('success')
      void fetchProducts()
    } catch (err: any) {
      console.error('Save product error:', err)
      setProductNotice(`Failed to save: ${err.message || JSON.stringify(err)}`)
      play('error')
    } finally {
      setSavingProduct(false)
    }
  }

  const handleDeleteProduct = async (p: InventoryProduct) => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return
    await supabase.from('products').delete().eq('id', p.id)
    void fetchProducts()
    if (editingProduct?.id === p.id) resetProductForm()
  }

  // ── Category Management ──────────────────────────────────────────────
  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    setSavingCat(true)
    try {
      const maxOrder = categories.reduce((m, c) => Math.max(m, c.sort_order || 0), 0)
      await supabase.from('categories').insert({ name_en: newCatName.trim(), name_ta: '', is_active: true, sort_order: maxOrder + 1 })
      setNewCatName('')
      setCatNotice('Category added!')
      void fetchCategories()
      play('success')
    } catch (err: unknown) {
      setCatNotice(err instanceof Error ? err.message : 'Failed to add category')
    } finally {
      setSavingCat(false)
      setTimeout(() => setCatNotice(''), 3000)
    }
  }

  const handleSaveEditCat = async (cat: Category) => {
    if (!editingCatName.trim()) return
    await supabase.from('categories').update({ name_en: editingCatName.trim() }).eq('id', cat.id)
    setEditingCat(null)
    void fetchCategories()
  }

  const handleDeleteCat = async (cat: Category) => {
    if (!confirm(`Delete category "${cat.name_en}"?`)) return
    await supabase.from('categories').delete().eq('id', cat.id)
    void fetchCategories()
  }

  const handleToggleCat = async (cat: Category) => {
    await supabase.from('categories').update({ is_active: !cat.is_active }).eq('id', cat.id)
    void fetchCategories()
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-[#111111] flex items-center gap-2">
          <Package size={24} className="text-[#E87020]" /> Inventory & Products
        </h1>
        <button onClick={() => { void fetchProducts(); void fetchCategories() }} className="flex items-center gap-2 bg-white border border-[#FDDBB4]/60 px-4 py-2 rounded-xl text-sm font-bold text-[#374151] hover:bg-orange-50">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[#FDDBB4]/60 pb-2 overflow-x-auto">
        {([['stock', 'Stock Management'], ['products', 'Add / Edit Products'], ['categories', 'Categories'], ['analytics', 'Analytics & Reports']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors whitespace-nowrap ${activeTab === key ? 'bg-[#E87020] text-white' : 'bg-white border border-[#FDDBB4]/60 text-[#374151] hover:bg-orange-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── STOCK MANAGEMENT TAB ── */}
      {activeTab === 'stock' && (
        <div className="space-y-5">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Products', value: products.length, color: 'text-[#111111]', bg: 'bg-white' },
              { label: 'Low Stock', value: lowCount, color: 'text-orange-600', bg: 'bg-orange-50' },
              { label: 'Out of Stock', value: outCount, color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'Stock Value', value: formatCurrency(stockValue), color: 'text-emerald-600', bg: 'bg-emerald-50' },
            ].map((card, i) => (
              <div key={i} className={`rounded-2xl border border-[#FDDBB4]/60 p-4 shadow-sm ${card.bg}`}>
                <p className="text-[10px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{card.label}</p>
                <p className={`text-2xl font-black ${card.color}`}>{card.value}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#FDDBB4]/60 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" />
            </div>
            <div className="flex gap-2">
              {(['all', 'low', 'out'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wider ${filter === f ? 'bg-[#E87020] text-white' : 'bg-white border border-[#FDDBB4]/60 text-[#374151] hover:bg-orange-50'}`}>
                  {f === 'all' ? 'All' : f === 'low' ? 'Low' : 'Out'}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-[#FDDBB4]/60 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#FAFAFA] border-b border-[#FDDBB4]/60">
                  <tr>
                    {['Product', 'Category', 'Stock', 'Alert At', 'Status', 'Price', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-[#374151] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="text-center py-12 text-[#6B7280] font-bold">Loading inventory...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-[#6B7280] font-bold">No products found.</td></tr>
                  ) : filtered.map(p => {
                    const status = getStatus(p)
                    return (
                      <tr key={String(p.id)} className="border-b border-[#FDDBB4]/20 hover:bg-[#FAFAFA]">
                        <td className="px-4 py-3 font-bold text-[#111111] text-sm">{p.name}</td>
                        <td className="px-4 py-3 text-sm text-[#374151]">{p.category || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-black ${status === 'out' ? 'text-red-600' : status === 'low' ? 'text-orange-600' : 'text-[#111111]'}`}>
                            {p.stock_quantity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#374151] font-semibold">{p.low_stock_alert || 5}</td>
                        <td className="px-4 py-3">
                          {status === 'out' ? (
                            <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase">Out of Stock</span>
                          ) : status === 'low' ? (
                            <span className="bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 w-fit">
                              <AlertTriangle size={10} /> Low Stock
                            </span>
                          ) : (
                            <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase">In Stock</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-black text-[#111111]">{formatCurrency(p.price)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => openAdjust(p)}
                              className="flex items-center gap-1 bg-[#FFF8F2] text-[#E87020] border border-[#FDDBB4] px-2.5 py-1.5 rounded-lg text-[11px] font-black hover:bg-orange-100">
                              <RefreshCw size={11} /> Adjust
                            </button>
                            <button onClick={() => startEditProduct(p)}
                              className="p-1.5 bg-gray-50 text-gray-500 hover:text-[#E87020] hover:bg-[#FFF8F2] rounded-lg border border-transparent hover:border-[#FDDBB4]">
                              <Edit2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD / EDIT PRODUCTS TAB ── */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* Form */}
          <div className="xl:col-span-2">
            <form onSubmit={handleSaveProduct} className="bg-white rounded-2xl border border-[#FDDBB4]/60 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-[#111111]">{editingProduct ? 'Edit Product' : 'Add New Product'}</h3>
                {editingProduct && (
                  <button type="button" onClick={resetProductForm} className="text-sm text-[#6B7280] hover:text-[#111111] font-bold">
                    + New Product
                  </button>
                )}
              </div>

              {productNotice && (
                <div className={`p-3 rounded-xl text-sm font-bold text-center ${productNotice.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {productNotice}
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">Product Name *</label>
                <input type="text" required value={productForm.name} onChange={e => setProductForm(f => ({...f, name: e.target.value}))}
                  className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]"
                  placeholder="e.g. Salwar Kameez Set" />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">Category</label>
                <select value={productForm.category} onChange={e => setProductForm(f => ({...f, category: e.target.value}))}
                  className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020] bg-white">
                  <option value="">— Select Category —</option>
                  {categories.filter(c => c.is_active).map(c => (
                    <option key={String(c.id)} value={c.name_en}>{c.name_en}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">Selling Price (RM) *</label>
                  <input type="number" required step="0.01" min="0" value={productForm.price} onChange={e => setProductForm(f => ({...f, price: e.target.value}))}
                    className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]"
                    placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">Cost Price (RM)</label>
                  <input type="number" step="0.01" min="0" value={productForm.purchase_price} onChange={e => setProductForm(f => ({...f, purchase_price: e.target.value}))}
                    className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]"
                    placeholder="0.00" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">Stock Qty</label>
                  <input type="number" min="0" value={productForm.stock_quantity} onChange={e => setProductForm(f => ({...f, stock_quantity: e.target.value}))}
                    className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">Low Stock Alert</label>
                  <input type="number" min="0" value={productForm.low_stock_alert} onChange={e => setProductForm(f => ({...f, low_stock_alert: e.target.value}))}
                    className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" />
                </div>
              </div>

              {/* Item Type Toggle */}
              <div className="space-y-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-[#6B7280]">Type</label>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => setProductForm(f => ({ ...f, item_type: 'product' }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${productForm.item_type === 'product' ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-[#374151] border-[#FDDBB4]/60 hover:border-blue-300'}`}>
                    📦 Product
                  </button>
                  <button type="button"
                    onClick={() => setProductForm(f => ({ ...f, item_type: 'service' }))}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${productForm.item_type === 'service' ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-[#374151] border-[#FDDBB4]/60 hover:border-purple-300'}`}>
                    ✂️ Service
                  </button>
                </div>
                <p className="text-[10px] text-[#9CA3AF]">Products = physical items sold. Services = tailoring, stitching, alterations.</p>
              </div>

              <div className="flex items-center gap-3 p-3 bg-[#FAFAFA] rounded-xl border border-[#FDDBB4]/60">
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-bold text-[#374151]">
                  <input type="checkbox" checked={productForm.is_active} onChange={e => setProductForm(f => ({...f, is_active: e.target.checked}))}
                    className="w-4 h-4 accent-[#E87020]" />
                  Active (visible in Billing Panel)
                </label>
              </div>

              <div className="flex gap-3">
                <button type="submit" disabled={savingProduct}
                  className="flex-1 bg-[#E87020] text-white p-3 rounded-xl font-bold text-sm hover:bg-[#C85C10] disabled:opacity-50">
                  {savingProduct ? 'Saving...' : editingProduct ? 'Update Product' : 'Add Product'}
                </button>
                {editingProduct && (
                  <button type="button" onClick={() => void handleDeleteProduct(editingProduct)}
                    className="px-4 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl font-bold text-sm hover:bg-red-100">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Product List (right side) */}
          <div className="xl:col-span-3">
            <div className="bg-white rounded-2xl border border-[#FDDBB4]/60 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[#FDDBB4]/60 bg-[#FAFAFA]">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
                    className="w-full pl-8 pr-4 py-2 bg-white border border-[#FDDBB4]/60 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" />
                </div>
              </div>
              <div className="overflow-y-auto max-h-[600px] divide-y divide-[#FDDBB4]/30">
                {products.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map(p => (
                  <div key={String(p.id)} className={`flex items-center justify-between px-4 py-3 hover:bg-[#FAFAFA] ${editingProduct?.id === p.id ? 'bg-orange-50 border-l-4 border-[#E87020]' : ''}`}>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-[#111111] truncate">{p.name}</p>
                      <p className="text-[11px] text-[#6B7280]">{p.category || 'No category'} · {formatCurrency(p.price)} · Stock: <span className={`font-black ${getStatus(p) === 'out' ? 'text-red-600' : getStatus(p) === 'low' ? 'text-orange-600' : 'text-green-600'}`}>{p.stock_quantity}</span></p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {!p.is_active && <span className="text-[10px] font-black uppercase text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Hidden</span>}
                      <button onClick={() => startEditProduct(p)} className="p-1.5 text-[#374151] hover:text-[#E87020] hover:bg-[#FFF8F2] rounded-lg border border-transparent hover:border-[#FDDBB4]">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => void handleDeleteProduct(p)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CATEGORIES TAB ── */}
      {activeTab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Add Category */}
          <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/60 p-5">
            <h3 className="text-base font-black text-[#111111] mb-4 flex items-center gap-2"><Plus size={16} className="text-[#E87020]" /> Add Category</h3>
            <form onSubmit={handleAddCategory} className="flex gap-2">
              <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="e.g. Blouse, Saree, Lehenga"
                className="flex-1 border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" required />
              <button type="submit" disabled={savingCat}
                className="bg-[#E87020] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#C85C10] disabled:opacity-50">
                Add
              </button>
            </form>
            {catNotice && <p className="mt-2 text-sm font-bold text-green-600">{catNotice}</p>}
          </div>

          {/* Category List */}
          <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/60 overflow-hidden">
            <div className="px-4 py-3 bg-[#FAFAFA] border-b border-[#FDDBB4]/60">
              <h3 className="text-[11px] font-black uppercase tracking-wider text-[#374151]">All Categories ({categories.length})</h3>
            </div>
            {categories.length === 0 ? (
              <p className="text-center p-6 text-[#6B7280] text-sm font-bold">No categories yet.</p>
            ) : (
              <div className="divide-y divide-[#FDDBB4]/30">
                {categories.map(cat => (
                  <div key={String(cat.id)} className="flex items-center justify-between px-4 py-3">
                    {editingCat?.id === cat.id ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <input value={editingCatName} onChange={e => setEditingCatName(e.target.value)} autoFocus
                          className="flex-1 border border-[#FDDBB4]/60 p-1.5 rounded-lg text-sm font-bold outline-none focus:border-[#E87020]" />
                        <button onClick={() => void handleSaveEditCat(cat)} className="text-[11px] font-black text-white bg-[#E87020] px-2.5 py-1.5 rounded-lg">Save</button>
                        <button onClick={() => setEditingCat(null)} className="text-[11px] font-black text-[#6B7280] px-2 py-1.5 rounded-lg hover:bg-gray-100">✕</button>
                      </div>
                    ) : (
                      <div>
                        <p className="font-bold text-sm text-[#111111]">{cat.name_en}</p>
                        <span className={`text-[10px] font-black uppercase tracking-wider ${cat.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                          {cat.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    )}
                    {editingCat?.id !== cat.id && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => { setEditingCat(cat); setEditingCatName(cat.name_en) }} className="p-1.5 text-[#374151] hover:text-[#E87020] hover:bg-[#FFF8F2] rounded-lg">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => void handleToggleCat(cat)} className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border ${cat.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          {cat.is_active ? 'Active' : 'Inactive'}
                        </button>
                        <button onClick={() => void handleDeleteCat(cat)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 📊 ANALYTICS & REPORTS TAB 📊 */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-5 rounded-2xl shadow-sm border border-[#FDDBB4]/60 gap-4">
            <div>
              <h3 className="text-lg font-black text-[#111111]">Inventory Reports</h3>
              <p className="text-xs text-[#6B7280]">Download your current stock data for accounting or backup.</p>
            </div>
            <button onClick={downloadCSV} className="flex items-center gap-2 bg-[#E87020] hover:bg-[#C85C10] text-white px-5 py-2.5 rounded-xl font-bold transition-transform active:scale-95 shadow-lg shadow-orange-600/20">
              <Download size={18} />
              Export to CSV
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Highest Stock Value */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-[#FDDBB4]/60">
              <h4 className="font-black text-sm uppercase tracking-wider text-[#374151] mb-4 flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-500" />
                Highest Stock Value
              </h4>
              <div className="space-y-3">
                {products
                  .filter(p => p.stock_quantity > 0)
                  .sort((a, b) => (b.stock_quantity * b.price) - (a.stock_quantity * a.price))
                  .slice(0, 5)
                  .map((p, i) => (
                    <div key={p.id} className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-emerald-200 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-white font-black text-xs text-slate-400 shadow-sm">{i + 1}</span>
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-slate-800 truncate">{p.name}</p>
                          <p className="text-[10px] font-semibold text-slate-500 truncate">{p.stock_quantity} in stock • {formatCurrency(p.price)} each</p>
                        </div>
                      </div>
                      <p className="font-black text-emerald-600 shrink-0 ml-2">{formatCurrency(p.stock_quantity * p.price)}</p>
                    </div>
                ))}
                {products.filter(p => p.stock_quantity > 0).length === 0 && (
                  <p className="text-sm font-bold text-slate-400 text-center py-4">No stock value found.</p>
                )}
              </div>
            </div>

            {/* Category Breakdown */}
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-[#FDDBB4]/60">
              <h4 className="font-black text-sm uppercase tracking-wider text-[#374151] mb-4 flex items-center gap-2">
                <PieChart size={16} className="text-purple-500" />
                Stock by Category
              </h4>
              <div className="space-y-3">
                {Object.entries(
                  products.reduce((acc, p) => {
                    const cat = p.category || 'Uncategorised'
                    acc[cat] = (acc[cat] || 0) + p.stock_quantity;
                    return acc;
                  }, {} as Record<string, number>)
                ).sort((a, b) => b[1] - a[1]).map(([cat, qty], i) => (
                  <div key={cat} className="flex justify-between items-center p-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-purple-200 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`shrink-0 w-3 h-3 rounded-full ${['bg-orange-500', 'bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-pink-500'][i % 5]}`} />
                      <p className="font-bold text-sm text-slate-800">{cat}</p>
                    </div>
                    <p className="font-black text-slate-600 shrink-0"><span className="text-purple-600">{qty}</span> items</p>
                  </div>
                ))}
                {products.length === 0 && (
                  <p className="text-sm font-bold text-slate-400 text-center py-4">No products found.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Adjust Stock Modal ── */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-[#111111]">Adjust Stock</h2>
              <button onClick={() => setAdjustModal(null)} className="p-2 rounded-xl hover:bg-gray-100"><X size={18} /></button>
            </div>

            <div className="bg-[#FAFAFA] rounded-xl p-3 mb-4 flex justify-between items-center border border-[#FDDBB4]/60">
              <div>
                <p className="text-[11px] font-black uppercase text-[#6B7280]">Product</p>
                <p className="font-black text-[#111111]">{adjustModal.product.name}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-black uppercase text-[#6B7280]">Current Stock</p>
                <p className={`text-2xl font-black ${getStatus(adjustModal.product) === 'out' ? 'text-red-600' : getStatus(adjustModal.product) === 'low' ? 'text-orange-600' : 'text-[#111111]'}`}>
                  {adjustModal.product.stock_quantity}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">Reason</label>
                <select value={adjustModal.adjustType} onChange={e => setAdjustModal(m => m ? { ...m, adjustType: e.target.value as AdjustModal['adjustType'] } : m)}
                  className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020] bg-white">
                  <option value="restock">Restock (received new stock)</option>
                  <option value="correction">Correction (fix count)</option>
                  <option value="loss">Loss / Damaged</option>
                  <option value="return">Customer Return</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">New Quantity</label>
                <input type="number" min="0" value={adjustModal.newQty} onChange={e => setAdjustModal(m => m ? { ...m, newQty: e.target.value } : m)}
                  className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020] text-right" />
                {adjustModal.newQty !== '' && !isNaN(parseFloat(adjustModal.newQty)) && (
                  <p className="text-[11px] text-[#6B7280] mt-1 text-right">
                    Change: <span className={parseFloat(adjustModal.newQty) >= adjustModal.product.stock_quantity ? 'text-green-600 font-black' : 'text-red-600 font-black'}>
                      {parseFloat(adjustModal.newQty) >= adjustModal.product.stock_quantity ? '+' : ''}{parseFloat(adjustModal.newQty) - adjustModal.product.stock_quantity}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">Note</label>
                <input type="text" value={adjustModal.note} onChange={e => setAdjustModal(m => m ? { ...m, note: e.target.value } : m)}
                  className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]"
                  placeholder="Optional note..." />
              </div>
              {notice && <p className="text-sm text-red-600 font-bold bg-red-50 p-3 rounded-xl">{notice}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setAdjustModal(null); setNotice('') }} className="flex-1 bg-gray-100 p-3 rounded-xl font-bold text-sm hover:bg-gray-200">Cancel</button>
                <button onClick={() => void saveAdjust()} disabled={saving} className="flex-1 bg-[#E87020] text-white p-3 rounded-xl font-bold text-sm hover:bg-[#C85C10] disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
