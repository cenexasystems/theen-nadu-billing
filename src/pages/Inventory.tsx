import React, { useState, useEffect, useCallback } from 'react'
import { Package, Search, AlertTriangle, X, RefreshCw, Edit2 } from 'lucide-react'
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
  is_active: boolean
  updated_at: string
}

interface AdjustModal {
  product: InventoryProduct
  newQty: string
  adjustType: 'restock' | 'correction' | 'loss' | 'return'
  note: string
}

const getStatus = (p: InventoryProduct) => {
  if (p.stock_quantity <= 0) return 'out'
  if (p.stock_quantity <= (p.low_stock_alert || 5)) return 'low'
  return 'ok'
}

export default function Inventory() {
  const { play } = useSound()
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all')
  const [adjustModal, setAdjustModal] = useState<AdjustModal | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('products')
      .select('id, name, category, stock_quantity, low_stock_alert, price, is_active, updated_at')
      .order('name')
    if (!error && data) setProducts(data as InventoryProduct[])
    setLoading(false)
  }, [])

  useEffect(() => { void fetchProducts() }, [fetchProducts])

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
        reason: adjustType,
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

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black text-[#111111] flex items-center gap-2">
          <Package size={24} className="text-[#E87020]" /> Inventory Management
        </h1>
        <button onClick={() => void fetchProducts()} className="flex items-center gap-2 bg-white border border-[#FDDBB4]/60 px-4 py-2 rounded-xl text-sm font-bold text-[#374151] hover:bg-orange-50">
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Products', value: products.length, color: 'text-[#111111]', bg: 'bg-white' },
          { label: 'Low Stock', value: lowCount, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-100' },
          { label: 'Out of Stock', value: outCount, color: 'text-red-600', bg: 'bg-red-50 border-red-100' },
          { label: 'Stock Value', value: formatCurrency(stockValue), color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
        ].map((card, i) => (
          <div key={i} className={`rounded-2xl border border-[#FDDBB4]/60 p-4 shadow-sm ${card.bg}`}>
            <p className="text-[10px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{card.label}</p>
            <p className={`text-2xl font-black ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#FDDBB4]/60 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'low', 'out'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-black uppercase tracking-wider transition-colors ${filter === f ? 'bg-[#E87020] text-white' : 'bg-white border border-[#FDDBB4]/60 text-[#374151] hover:bg-orange-50'}`}>
              {f === 'all' ? 'All' : f === 'low' ? 'Low Stock' : 'Out of Stock'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#FDDBB4]/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#FAFAFA] border-b border-[#FDDBB4]/60">
              <tr>
                {['Product', 'Category', 'Stock Qty', 'Min Threshold', 'Status', 'Last Updated', 'Actions'].map(h => (
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
                  <tr key={String(p.id)} className="border-b border-[#FDDBB4]/20 hover:bg-[#FAFAFA] transition-colors">
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
                        <span className="bg-red-100 text-red-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">Out of Stock</span>
                      ) : status === 'low' ? (
                        <span className="bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 w-fit">
                          <AlertTriangle size={10} /> Low Stock
                        </span>
                      ) : (
                        <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">In Stock</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-[#6B7280]">
                      {p.updated_at ? new Date(p.updated_at).toLocaleDateString('en-MY') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openAdjust(p)}
                        className="flex items-center gap-1.5 bg-[#FFF8F2] text-[#E87020] border border-[#FDDBB4] px-3 py-1.5 rounded-lg text-[11px] font-black hover:bg-orange-100 transition-colors">
                        <Edit2 size={12} /> Adjust
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-[#111111]">Adjust Stock</h2>
              <button onClick={() => setAdjustModal(null)} className="p-2 rounded-xl hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            <div className="bg-[#FAFAFA] rounded-xl p-3 mb-4 flex justify-between items-center border border-[#FDDBB4]/60">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-[#6B7280]">Product</p>
                <p className="font-black text-[#111111]">{adjustModal.product.name}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-black uppercase tracking-wider text-[#6B7280]">Current Stock</p>
                <p className={`text-2xl font-black ${getStatus(adjustModal.product) === 'out' ? 'text-red-600' : getStatus(adjustModal.product) === 'low' ? 'text-orange-600' : 'text-[#111111]'}`}>
                  {adjustModal.product.stock_quantity}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">Adjustment Type</label>
                <select value={adjustModal.adjustType}
                  onChange={e => setAdjustModal(m => m ? { ...m, adjustType: e.target.value as AdjustModal['adjustType'] } : m)}
                  className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020] bg-white">
                  <option value="restock">Restock (received new stock)</option>
                  <option value="correction">Correction (fix count)</option>
                  <option value="loss">Loss / Damaged</option>
                  <option value="return">Return / Refund</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">New Quantity</label>
                <input type="number" min="0" value={adjustModal.newQty}
                  onChange={e => setAdjustModal(m => m ? { ...m, newQty: e.target.value } : m)}
                  className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020] text-right"
                  placeholder="0" />
                {adjustModal.newQty !== '' && !isNaN(parseFloat(adjustModal.newQty)) && (
                  <p className="text-[11px] text-[#6B7280] mt-1 text-right">
                    Change: <span className={parseFloat(adjustModal.newQty) >= adjustModal.product.stock_quantity ? 'text-green-600 font-black' : 'text-red-600 font-black'}>
                      {parseFloat(adjustModal.newQty) >= adjustModal.product.stock_quantity ? '+' : ''}{parseFloat(adjustModal.newQty) - adjustModal.product.stock_quantity}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-[#374151] mb-1.5">Note / Reason</label>
                <input type="text" value={adjustModal.note}
                  onChange={e => setAdjustModal(m => m ? { ...m, note: e.target.value } : m)}
                  className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]"
                  placeholder="Optional note..." />
              </div>
              {notice && <p className="text-sm text-red-600 font-bold bg-red-50 p-3 rounded-xl">{notice}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setAdjustModal(null); setNotice('') }}
                  className="flex-1 bg-gray-100 p-3 rounded-xl font-bold text-sm hover:bg-gray-200">
                  Cancel
                </button>
                <button onClick={() => void saveAdjust()} disabled={saving}
                  className="flex-1 bg-[#E87020] text-white p-3 rounded-xl font-bold text-sm hover:bg-[#C85C10] disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Adjustment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
