import React, { useState, useEffect } from 'react'
import { Plus, Receipt, Trash2, Edit2, Calendar, FileText } from 'lucide-react'
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
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ category_id: '', amount: '', description: '', expense_date: new Date().toISOString().split('T')[0] })
  const [submitting, setSubmitting] = useState(false)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    const { data: cats } = await supabase.from('expense_categories').select('*').eq('is_active', true)
    if (cats) setCategories(cats)

    const { data: exps } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false })
    if (exps) setExpenses(exps)
    setLoading(false)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.category_id || !form.amount) return
    setSubmitting(true)
    
    try {
      let receipt_url = null
      if (receiptFile) {
        const fileExt = receiptFile.name.split('.').pop()
        const fileName = `${Math.random()}.${fileExt}`
        const { error: uploadError, data } = await supabase.storage.from('receipts').upload(fileName, receiptFile)
        if (data) {
          receipt_url = supabase.storage.from('receipts').getPublicUrl(fileName).data.publicUrl
        }
      }

      await supabase.from('expenses').insert({
        category_id: parseInt(form.category_id),
        amount: parseFloat(form.amount),
        description: form.description || null,
        expense_date: form.expense_date,
        receipt_url
      })
      setShowModal(false)
      setForm({ category_id: '', amount: '', description: '', expense_date: new Date().toISOString().split('T')[0] })
      setReceiptFile(null)
      fetchData()
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', id)
    fetchData()
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-black text-[#111111] flex items-center gap-2"><Receipt size={24} className="text-[#E87020]" /> Expense Tracker</h1>
        <button onClick={() => setShowModal(true)} className="bg-[#E87020] text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-[#C85C10]">
          <Plus size={16} /> Record Expense
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/60 overflow-hidden">
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
              <tr><td colSpan={5} className="text-center p-8 text-gray-500">Loading...</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={5} className="text-center p-8 text-gray-500 font-bold">No expenses recorded yet.</td></tr>
            ) : expenses.map(exp => {
              const cat = categories.find(c => c.id === exp.category_id)
              return (
                <tr key={exp.id} className="border-b border-[#FDDBB4]/30 hover:bg-[#FAFAFA]">
                  <td className="px-4 py-3 text-sm font-semibold text-[#111111]">{exp.expense_date}</td>
                  <td className="px-4 py-3"><span className="bg-[#FFF8F2] text-[#E87020] border border-[#FDDBB4] px-2 py-1 rounded text-[10px] font-black uppercase">{cat?.name || 'Unknown'}</span></td>
                  <td className="px-4 py-3 text-sm text-[#374151]">{exp.description || '-'}</td>
                  <td className="px-4 py-3 text-sm font-black text-red-600">{formatCurrency(exp.amount)}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(exp.id)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-black mb-4">Record New Expense</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1">Date</label>
                <input type="date" value={form.expense_date} onChange={e => setForm({...form, expense_date: e.target.value})} className="w-full border border-[#FDDBB4]/60 p-2 rounded-lg" required />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1">Category</label>
                <select value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})} className="w-full border border-[#FDDBB4]/60 p-2 rounded-lg" required>
                  <option value="">Select Category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1">Amount (RM)</label>
                <input type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full border border-[#FDDBB4]/60 p-2 rounded-lg" required />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1">Description</label>
                <input type="text" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full border border-[#FDDBB4]/60 p-2 rounded-lg" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-[#374151] mb-1">Receipt (Optional)</label>
                <input type="file" onChange={e => setReceiptFile(e.target.files?.[0] || null)} className="w-full border border-[#FDDBB4]/60 p-2 rounded-lg text-sm" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 p-3 rounded-xl font-bold">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-[#E87020] text-white p-3 rounded-xl font-bold">{submitting ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
