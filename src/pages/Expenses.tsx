import React, { useState, useEffect, useCallback } from 'react'
import { Receipt, Plus, Trash2, X, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/retail'

interface ExpenseCategory {
  id: number
  name: string
  is_active: boolean
}

interface Expense {
  id: string
  category_id: number
  amount: number
  expense_date: string
  description: string | null
  receipt_url: string | null
  created_at: string
  expense_categories?: { name: string } | null
}

export default function Expenses() {
  const [tab, setTab] = useState<'expenses'|'categories'>('expenses')
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ category_id: '', amount: '', description: '', expense_date: new Date().toISOString().split('T')[0] })
  const [submitting, setSubmitting] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [dbError, setDbError] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setDbError(false)
    try {
      const { data: cats, error: errCats } = await supabase.from('expense_categories').select('*').order('name')
      if (errCats && (errCats.message.includes('does not exist') || errCats.code === '42P01')) {
        setDbError(true)
      } else if (cats) {
        setCategories(cats)
      }

      const { data: exps, error: errExps } = await supabase.from('expenses').select('id, category_id, amount, expense_date, description, receipt_url, created_at, expense_categories(name)').order('expense_date', { ascending: false })
      if (errExps && (errExps.message.includes('does not exist') || errExps.code === '42P01')) {
        setDbError(true)
      } else if (exps) {
        setExpenses(exps as unknown as Expense[])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchData() }, [fetchData])

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.category_id || !form.amount) return
    setSubmitting(true)
    
    try {
      await supabase.from('expenses').insert({
        category_id: parseInt(form.category_id),
        amount: parseFloat(form.amount),
        description: form.description || null,
        expense_date: form.expense_date
      })
      setShowModal(false)
      setForm({ category_id: '', amount: '', description: '', expense_date: new Date().toISOString().split('T')[0] })
      void fetchData()
    } catch (err) {
      console.error(err)
      alert('Failed to save expense')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', id)
    void fetchData()
  }

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newCatName.trim()) return
    await supabase.from('expense_categories').insert({ name: newCatName.trim() })
    setNewCatName('')
    void fetchData()
  }

  const toggleCategory = async (cat: ExpenseCategory) => {
    await supabase.from('expense_categories').update({ is_active: !cat.is_active }).eq('id', cat.id)
    void fetchData()
  }

  const totalMonth = expenses.filter(e => new Date(e.expense_date).getMonth() === new Date().getMonth()).reduce((s, e) => s + e.amount, 0)
  const totalYear = expenses.filter(e => new Date(e.expense_date).getFullYear() === new Date().getFullYear()).reduce((s, e) => s + e.amount, 0)

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-2xl font-black text-[#111111] flex items-center gap-2"><Receipt size={24} className="text-[#E87020]" /> Expense Tracker</h1>
      </div>

      {dbError && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded-xl flex items-center gap-3">
          <AlertTriangle size={24} className="shrink-0" />
          <div>
            <p className="font-black text-sm">Database tables not set up yet!</p>
            <p className="text-[13px]">Please run the SQL migration script in your Supabase SQL Editor to create the expenses tables.</p>
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b border-[#FDDBB4]/60 pb-2">
        <button onClick={() => setTab('expenses')} className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${tab === 'expenses' ? 'bg-[#E87020] text-white' : 'bg-white border border-[#FDDBB4]/60 text-[#374151] hover:bg-orange-50'}`}>Expenses</button>
        <button onClick={() => setTab('categories')} className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${tab === 'categories' ? 'bg-[#E87020] text-white' : 'bg-white border border-[#FDDBB4]/60 text-[#374151] hover:bg-orange-50'}`}>Categories</button>
      </div>

      {tab === 'expenses' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: 'Total This Month', value: formatCurrency(totalMonth), color: 'text-red-600' },
              { label: 'Total This Year', value: formatCurrency(totalYear), color: 'text-red-600' },
              { label: 'Total Expenses', value: expenses.length, color: 'text-[#111111]' },
            ].map((c, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#FDDBB4]/60 p-4 shadow-sm">
                <p className="text-[10px] font-black uppercase tracking-wider text-[#6B7280] mb-1">{c.label}</p>
                <p className={`text-2xl font-black ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button onClick={() => setShowModal(true)} disabled={dbError} className="bg-[#E87020] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-[#C85C10] disabled:opacity-50">
              <Plus size={16} /> Record Expense
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#FAFAFA] border-b border-[#FDDBB4]/60">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Date</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Category</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Description</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Amount</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="text-center p-8 text-[#6B7280] font-bold">Loading...</td></tr>
                  ) : expenses.length === 0 ? (
                    <tr><td colSpan={5} className="text-center p-8 text-[#6B7280] font-bold">No expenses recorded yet.</td></tr>
                  ) : expenses.map(exp => (
                    <tr key={exp.id} className="border-b border-[#FDDBB4]/30 hover:bg-[#FAFAFA]">
                      <td className="px-4 py-3 text-sm font-semibold text-[#111111]">{new Date(exp.expense_date).toLocaleDateString('en-MY')}</td>
                      <td className="px-4 py-3">
                        <span className="bg-[#FFF8F2] text-[#E87020] border border-[#FDDBB4] px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider">
                          {exp.expense_categories?.name || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#374151]">{exp.description || '—'}</td>
                      <td className="px-4 py-3 text-sm font-black text-red-600">{formatCurrency(exp.amount)}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => handleDeleteExpense(exp.id)} className="text-red-400 hover:text-red-600 p-1.5 bg-red-50 rounded-lg"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/60 p-5">
            <h3 className="text-base font-black text-[#111111] mb-4">Add Category</h3>
            <form onSubmit={handleAddCategory} className="flex gap-2">
              <input type="text" value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="e.g. Utility Bills" className="flex-1 border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" required disabled={dbError} />
              <button type="submit" disabled={dbError} className="bg-[#E87020] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#C85C10] disabled:opacity-50">Add</button>
            </form>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/60 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-[#FAFAFA] border-b border-[#FDDBB4]/60">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Category Name</th>
                  <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151] text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr><td colSpan={2} className="text-center p-6 text-[#6B7280] text-sm font-bold">No categories added.</td></tr>
                ) : categories.map(cat => (
                  <tr key={cat.id} className="border-b border-[#FDDBB4]/30">
                    <td className="px-4 py-3 font-bold text-[#111111] text-sm">{cat.name}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => toggleCategory(cat)} className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border ${cat.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                        {cat.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-black text-[#111111]">Record Expense</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-gray-100"><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveExpense} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">Date</label>
                <input type="date" value={form.expense_date} onChange={e => setForm({...form, expense_date: e.target.value})} className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" required />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">Category</label>
                <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020] bg-white" required>
                  <option value="">Select Category</option>
                  {categories.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">Amount (RM)</label>
                <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" required placeholder="0.00" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1.5">Description / Note</label>
                <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full border border-[#FDDBB4]/60 p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" placeholder="Optional details..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 p-3 rounded-xl font-bold text-sm hover:bg-gray-200">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-[#E87020] text-white p-3 rounded-xl font-bold text-sm hover:bg-[#C85C10] disabled:opacity-50">{submitting ? 'Saving...' : 'Save Expense'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
