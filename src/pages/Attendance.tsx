import React, { useState, useEffect, useCallback } from 'react'
import { Users, Calendar, AlertTriangle, Plus, X, Edit2, LogIn, LogOut, Trash2, Download, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/retail'

interface Staff {
  id: string
  name: string
  role: string
  phone: string | null
  base_salary: number
  is_active: boolean
}

interface AttendanceRecord {
  id: string
  staff_id: string
  date: string
  status: string
  clock_in: string | null
  clock_out: string | null
}

function formatTime(ts: string | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true })
}

export default function Attendance() {
  const [tab, setTab] = useState<'today'|'staff'|'report'>('today')
  const [staff, setStaff] = useState<Staff[]>([])
  const [attendanceMap, setAttendanceMap] = useState<Record<string, string>>({})
  const [clockMap, setClockMap] = useState<Record<string, { clock_in: string|null; clock_out: string|null }>>({})
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)
  const [dbError, setDbError] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null)

  const [form, setForm] = useState({ name: '', role: '', phone: '', base_salary: '' })
  const [submitting, setSubmitting] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setDbError(false)
    try {
      const { data: s, error: errS } = await supabase.from('staff').select('*').order('name')
      if (errS && (errS.message.includes('does not exist') || errS.code === '42P01')) {
        setDbError(true); setLoading(false); return
      }
      if (s) setStaff(s as Staff[])

      const { data: a, error: errA } = await supabase.from('attendance').select('*').eq('date', selectedDate)
      if (errA && (errA.message.includes('does not exist') || errA.code === '42P01')) {
        setDbError(true)
      } else if (a) {
        const statusMap: Record<string, string> = {}
        const clkMap: Record<string, { clock_in: string|null; clock_out: string|null }> = {}
        a.forEach((r: AttendanceRecord) => {
          statusMap[r.staff_id] = r.status
          clkMap[r.staff_id] = { clock_in: r.clock_in, clock_out: r.clock_out }
        })
        setAttendanceMap(statusMap)
        setClockMap(clkMap)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  type DateFilter = 'all' | 'daily' | 'weekly' | 'monthly' | 'custom'
  const [dateFilter, setDateFilter] = useState<DateFilter>('monthly')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [selectedStaffFilter, setSelectedStaffFilter] = useState<string>('all')
  const [analyticsData, setAnalyticsData] = useState<AttendanceRecord[]>([])
  const [reportLoading, setReportLoading] = useState(false)

  useEffect(() => { void fetchData() }, [fetchData])

  useEffect(() => {
    if (tab !== 'report') return
    const fetchReport = async () => {
      setReportLoading(true)
      try {
        let query = supabase.from('attendance').select('*')
        
        const today = new Date()
        let fromDate = ''
        let toDate = ''

        if (dateFilter === 'daily') {
          // Adjust for local timezone
          const localToday = new Date(today.getTime() - (today.getTimezoneOffset() * 60000))
          fromDate = localToday.toISOString().split('T')[0]
          toDate = fromDate
        } else if (dateFilter === 'weekly') {
          const curr = new Date(today)
          const first = curr.getDate() - curr.getDay() + 1
          const firstDay = new Date(curr.setDate(first))
          const lastDay = new Date(curr.setDate(first + 6))
          fromDate = new Date(firstDay.getTime() - (firstDay.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
          toDate = new Date(lastDay.getTime() - (lastDay.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
        } else if (dateFilter === 'monthly') {
          const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
          const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
          fromDate = new Date(firstDay.getTime() - (firstDay.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
          toDate = new Date(lastDay.getTime() - (lastDay.getTimezoneOffset() * 60000)).toISOString().split('T')[0]
        } else if (dateFilter === 'custom') {
          fromDate = customFrom
          toDate = customTo
        }

        if (fromDate) query = query.gte('date', fromDate)
        if (toDate) query = query.lte('date', toDate)
        if (selectedStaffFilter !== 'all') query = query.eq('staff_id', selectedStaffFilter)

        const { data } = await query
        if (data) {
          setAnalyticsData(data as AttendanceRecord[])
        }
      } catch (e) { console.error(e) }
      finally { setReportLoading(false) }
    }
    void fetchReport()
  }, [tab, dateFilter, customFrom, customTo, selectedStaffFilter])

  const markAttendance = async (staffId: string, status: string) => {
    setAttendanceMap(p => ({ ...p, [staffId]: status }))
    await supabase.from('attendance').upsert({ staff_id: staffId, date: selectedDate, status }, { onConflict: 'staff_id,date' })
  }

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.role.trim()) return
    setSubmitting(true)
    try {
      const payload = { name: form.name.trim(), role: form.role.trim(), phone: form.phone.trim() || null, base_salary: parseFloat(form.base_salary) || 0 }
      if (editingStaff) {
        await supabase.from('staff').update(payload).eq('id', editingStaff.id)
      } else {
        await supabase.from('staff').insert({ ...payload, is_active: true })
      }
      setShowModal(false); setEditingStaff(null); void fetchData()
    } catch (err) { console.error(err); alert('Failed to save staff member') }
    finally { setSubmitting(false) }
  }

  const toggleStaffActive = async (member: Staff) => {
    await supabase.from('staff').update({ is_active: !member.is_active }).eq('id', member.id)
    void fetchData()
  }

  const handleDeleteStaff = async (member: Staff) => {
    if (!window.confirm(`Are you sure you want to delete ${member.name}?\n\nThis will permanently remove their records.`)) return
    
    try {
      const { error } = await supabase.from('staff').delete().eq('id', member.id)
      if (error) {
        // If there's a foreign key constraint violation (e.g. attendance records exist)
        if (error.code === '23503') {
          alert(`Cannot delete ${member.name} because they have attendance records.\n\nPlease deactivate them instead.`)
        } else {
          throw error
        }
      } else {
        void fetchData()
      }
    } catch (err: any) {
      alert(`Error deleting staff: ${err.message}`)
    }
  }


  const activeStaff = staff.filter(s => s.is_active)
  const presentCount = activeStaff.filter(s => attendanceMap[s.id] === 'present').length
  const absentCount = activeStaff.filter(s => attendanceMap[s.id] === 'absent').length
  const leaveCount = activeStaff.filter(s => ['half-day', 'leave'].includes(attendanceMap[s.id])).length

  // -- Analytics Calculations --
  // Hours Logged
  const totalHoursLogged = analyticsData.reduce((total, r) => {
    if (r.clock_in && r.clock_out) {
      const inTime = new Date(r.clock_in).getTime()
      const outTime = new Date(r.clock_out).getTime()
      if (outTime > inTime) {
        return total + (outTime - inTime) / (1000 * 60 * 60)
      }
    }
    return total
  }, 0)

  // Avg Attendance
  const totalPresent = analyticsData.filter(r => r.status === 'present').length
  const totalHalf = analyticsData.filter(r => r.status === 'half-day').length
  const totalRecordedDays = analyticsData.length
  const avgAttendanceScore = totalRecordedDays > 0 
    ? Math.round(((totalPresent + (totalHalf * 0.5)) / totalRecordedDays) * 100) 
    : 0

  // Per-staff stats for the table
  const staffStats = activeStaff.map(member => {
    const records = analyticsData.filter(r => r.staff_id === member.id)
    return {
      ...member,
      present: records.filter(r => r.status === 'present').length,
      half: records.filter(r => r.status === 'half-day').length,
      absent: records.filter(r => r.status === 'absent').length,
      leave: records.filter(r => r.status === 'leave').length,
    }
  }).filter(member => selectedStaffFilter === 'all' || member.id === selectedStaffFilter)

  const handleExportCsv = () => {
    if (staffStats.length === 0) return
    const headers = ['Staff Member', 'Role', 'Present', 'Half Day', 'Absent', 'Leave']
    const rows = staffStats.map(s => [
      `"${s.name}"`, 
      `"${s.role}"`, 
      s.present, 
      s.half, 
      s.absent, 
      s.leave
    ])
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `staff_analytics_${dateFilter}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-xl md:text-2xl font-black text-[#111111] flex items-center gap-2"><Users size={24} className="text-[#E87020]" /> Attendance & Staff</h1>
      </div>

      {dbError && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 md:p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-sm">Database tables not set up yet!</p>
            <p className="text-[13px]">Please run the SQL migration script in your Supabase SQL Editor.</p>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {(['today', 'report', 'staff'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`shrink-0 px-3 py-1.5 md:px-4 md:py-2 rounded-xl font-bold text-[11px] md:text-sm transition-colors ${tab === t ? 'bg-[#E87020] text-white' : 'bg-white border border-[#FDDBB4]/60 text-[#374151] hover:bg-orange-50'}`}>
            {t === 'today' ? "Today's Attendance" : t === 'report' ? 'Staff Reports & Analytics' : 'Staff Management'}
          </button>
        ))}
      </div>

      {/* TODAY TAB */}
      {tab === 'today' && (
        <div className="space-y-3 md:space-y-5">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center justify-between gap-3 md:gap-4 bg-white p-3 md:p-4 rounded-2xl border border-[#FDDBB4]/40 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="bg-orange-100 p-2 md:p-2.5 rounded-xl text-orange-600"><Calendar size={20} /></div>
              <div>
                <p className="text-[10px] md:text-[11px] font-black uppercase tracking-wider text-[#6B7280]">Select Date</p>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="font-black text-[#111111] bg-transparent outline-none h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:flex gap-3 md:gap-6 w-full sm:w-auto">
              <div className="text-center bg-gray-50 sm:bg-transparent rounded-lg p-2 sm:p-0"><p className="text-[10px] md:text-[11px] font-black uppercase text-[#6B7280]">Total</p><p className="text-lg md:text-xl font-black">{activeStaff.length}</p></div>
              <div className="text-center bg-green-50 sm:bg-transparent rounded-lg p-2 sm:p-0"><p className="text-[10px] md:text-[11px] font-black uppercase text-[#6B7280]">Present</p><p className="text-lg md:text-xl font-black text-green-600">{presentCount}</p></div>
              <div className="text-center bg-red-50 sm:bg-transparent rounded-lg p-2 sm:p-0"><p className="text-[10px] md:text-[11px] font-black uppercase text-[#6B7280]">Absent</p><p className="text-lg md:text-xl font-black text-red-600">{absentCount}</p></div>
              <div className="text-center bg-orange-50 sm:bg-transparent rounded-lg p-2 sm:p-0"><p className="text-[10px] md:text-[11px] font-black uppercase text-[#6B7280]">Leave/Half</p><p className="text-lg md:text-xl font-black text-orange-600">{leaveCount}</p></div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#FAFAFA] border-b border-[#FDDBB4]/60">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Staff Member</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Role</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-green-700">Clock In</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-red-600">Clock Out</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Override Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="text-center p-8 text-[#6B7280] font-bold">Loading...</td></tr>
                  ) : activeStaff.length === 0 ? (
                    <tr><td colSpan={5} className="text-center p-8 text-[#6B7280] font-bold">No active staff. Add staff in Staff Management tab.</td></tr>
                  ) : activeStaff.map(member => {
                    const clk = clockMap[member.id]
                    const status = attendanceMap[member.id]
                    return (
                      <tr key={member.id} className="border-b border-[#FDDBB4]/30 hover:bg-[#FAFAFA]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#FFF8F2] text-[#E87020] border border-[#FDDBB4] flex items-center justify-center font-black text-sm shrink-0 uppercase">{member.name.charAt(0)}</div>
                            <span className="font-bold text-[#111111] text-sm">{member.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-[#374151]">{member.role}</td>
                        <td className="px-4 py-3">
                          {clk?.clock_in ? (
                            <span className="flex items-center gap-1 text-sm font-black text-green-700">
                              <LogIn size={13} />{formatTime(clk.clock_in)}
                            </span>
                          ) : <span className="text-[#9BAB9A] text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {clk?.clock_out ? (
                            <span className="flex items-center gap-1 text-sm font-black text-red-600">
                              <LogOut size={13} />{formatTime(clk.clock_out)}
                            </span>
                          ) : <span className="text-[#9BAB9A] text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5 flex-wrap">
                            {['present', 'absent', 'half-day', 'leave'].map(s => {
                              const isSelected = status === s
                              let colorClass = 'bg-gray-50 text-[#6B7280] border-gray-200 hover:bg-gray-100'
                              if (isSelected) {
                                if (s === 'present') colorClass = 'bg-green-100 text-green-700 border-green-200 shadow-sm'
                                else if (s === 'absent') colorClass = 'bg-red-100 text-red-700 border-red-200 shadow-sm'
                                else colorClass = 'bg-orange-100 text-orange-700 border-orange-200 shadow-sm'
                              }
                              return (
                                <button key={s} onClick={() => void markAttendance(member.id, s)} disabled={dbError}
                                  className={`px-2 py-1 rounded-lg border text-[11px] font-black uppercase tracking-wider transition-all disabled:opacity-50 ${colorClass}`}>
                                  {s.replace('-', ' ')}
                                </button>
                              )
                            })}
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

      {/* STAFF TAB */}
      {tab === 'staff' && (
        <div className="space-y-3 md:space-y-5">
          <div className="flex justify-end">
            <button onClick={() => { setEditingStaff(null); setForm({ name: '', role: '', phone: '', base_salary: '' }); setShowModal(true) }} disabled={dbError}
              className="bg-[#E87020] text-white px-3 py-2 md:px-4 md:py-2 rounded-xl text-[11px] md:text-sm font-bold flex items-center gap-2 hover:bg-[#C85C10] disabled:opacity-50">
              <Plus size={16} /> Add Staff
            </button>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#FAFAFA] border-b border-[#FDDBB4]/60">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Name</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Role</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Phone</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Base Salary</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151] text-center">Status</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.length === 0 ? (
                    <tr><td colSpan={6} className="text-center p-8 text-[#6B7280] font-bold">No staff added yet.</td></tr>
                  ) : staff.map(member => (
                    <tr key={member.id} className="border-b border-[#FDDBB4]/30 hover:bg-[#FAFAFA]">
                      <td className="px-4 py-3 font-bold text-[#111111] text-sm">{member.name}</td>
                      <td className="px-4 py-3 text-sm text-[#374151]">{member.role}</td>
                      <td className="px-4 py-3 text-sm text-[#374151]">{member.phone || '—'}</td>
                      <td className="px-4 py-3 text-sm font-black text-[#111111]">{formatCurrency(member.base_salary)}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleStaffActive(member)}
                          className={`px-3 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg border ${member.is_active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                          {member.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setEditingStaff(member); setForm({ name: member.name, role: member.role, phone: member.phone || '', base_salary: String(member.base_salary) }); setShowModal(true) }}
                            className="text-[#374151] hover:text-[#E87020] p-1.5 bg-gray-50 hover:bg-[#FFF8F2] rounded-lg border border-transparent hover:border-[#FDDBB4] transition-colors">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => void handleDeleteStaff(member)}
                            className="text-red-500 hover:text-red-700 p-1.5 bg-gray-50 hover:bg-red-50 rounded-lg border border-transparent hover:border-red-200 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STAFF REPORTS & ANALYTICS TAB */}
      {tab === 'report' && (
        <div className="space-y-3 md:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 md:gap-4">
            <div>
              <h2 className="text-lg md:text-xl font-black text-[#111111] flex items-center gap-2">
                <span className="text-yellow-500">🏆</span> STAFF REPORTS & ANALYTICS
              </h2>
              <p className="text-xs md:text-sm text-[#6B7280] font-bold mt-1">
                Comprehensive performance tracking, attendance analysis, and service revenue contributions.
              </p>
            </div>
            <button onClick={handleExportCsv} className="bg-[#00875A] text-white px-3 py-2 md:px-4 md:py-2.5 rounded-xl text-[11px] md:text-sm font-black flex items-center gap-2 hover:bg-[#006e49] shrink-0">
              <Download size={16} /> EXCEL DOWNLOAD
            </button>
          </div>

          {/* Filters */}
          <div className="bg-white p-3 md:p-4 rounded-2xl border border-[#FDDBB4]/40 shadow-sm flex flex-col md:flex-row gap-3 md:gap-8 md:items-end">
            <div>
              <label className="block text-[10px] md:text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-2">Date Range Filter</label>
              <div className="flex flex-wrap bg-gray-100 rounded-xl p-1 gap-1">
                {(['all', 'daily', 'weekly', 'monthly', 'custom'] as const).map(f => (
                  <button key={f} onClick={() => setDateFilter(f)}
                    className={`px-2 py-1.5 sm:px-3 md:px-4 md:py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase transition-colors ${dateFilter === f ? 'bg-[#111111] text-white' : 'text-[#6B7280] hover:text-[#111111]'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className={`flex flex-col sm:flex-row gap-3 md:gap-4 transition-opacity ${dateFilter === 'custom' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div>
                <label className="block text-[10px] md:text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-2">Custom From Date</label>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} disabled={dateFilter !== 'custom'}
                  className="w-full border border-[#FDDBB4]/40 bg-white p-2 h-10 rounded-xl text-xs md:text-sm font-bold outline-none focus:border-[#E87020]" />
              </div>
              <div>
                <label className="block text-[10px] md:text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-2">Custom To Date</label>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} disabled={dateFilter !== 'custom'}
                  className="w-full border border-[#FDDBB4]/40 bg-white p-2 h-10 rounded-xl text-xs md:text-sm font-bold outline-none focus:border-[#E87020]" />
              </div>
            </div>

            <div className="flex-1 w-full md:w-auto md:min-w-[200px]">
              <label className="block text-[10px] md:text-[11px] font-black uppercase tracking-wider text-[#6B7280] mb-2">Selected Staff</label>
              <select value={selectedStaffFilter} onChange={e => setSelectedStaffFilter(e.target.value)}
                className="w-full h-10 border border-[#FDDBB4]/40 bg-white p-2 rounded-xl text-xs md:text-sm font-bold outline-none focus:border-[#E87020] appearance-none">
                <option value="all">-- All Staff Members --</option>
                {activeStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white p-3 md:p-5 rounded-2xl border border-[#FDDBB4]/40 shadow-sm">
              <div className="flex items-center gap-2 text-purple-600 mb-2">
                <Clock size={16} /> <span className="text-[11px] font-black uppercase tracking-wider">Hours Logged</span>
              </div>
              <p className="text-2xl md:text-3xl font-black text-[#111111]">{Math.round(totalHoursLogged)}H</p>
              <p className="text-[10px] md:text-xs font-bold text-[#6B7280] mt-1">Cumulative duration</p>
            </div>
            
            <div className="bg-white p-3 md:p-5 rounded-2xl border border-[#FDDBB4]/40 shadow-sm">
              <div className="flex items-center gap-2 text-green-600 mb-2">
                <Users size={16} /> <span className="text-[11px] font-black uppercase tracking-wider">Avg Attendance</span>
              </div>
              <p className="text-2xl md:text-3xl font-black text-[#111111]">{avgAttendanceScore}%</p>
              <p className="text-[10px] md:text-xs font-bold text-[#6B7280] mt-1">Present score</p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#FAFAFA] border-b border-[#FDDBB4]/60">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Staff Member</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Role</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-green-600 text-center">Present</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-orange-500 text-center">Half Day</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-red-600 text-center">Absent</th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase text-blue-600 text-center">Leave</th>
                  </tr>
                </thead>
                <tbody>
                  {reportLoading ? (
                    <tr><td colSpan={6} className="text-center p-8 text-[#6B7280] font-bold">Loading analytics...</td></tr>
                  ) : staffStats.length === 0 ? (
                    <tr><td colSpan={6} className="text-center p-8 text-[#6B7280] font-bold">No active staff members match the filters.</td></tr>
                  ) : staffStats.map(member => (
                    <tr key={member.id} className="border-b border-[#FDDBB4]/30 hover:bg-[#FAFAFA]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#FFF8F2] text-[#E87020] border border-[#FDDBB4] flex items-center justify-center font-black text-sm shrink-0 uppercase">{member.name.charAt(0)}</div>
                          <span className="font-bold text-[#111111] text-sm">{member.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-[#374151]">{member.role}</td>
                      <td className="px-4 py-3 text-center font-bold text-green-700">{member.present}</td>
                      <td className="px-4 py-3 text-center font-bold text-orange-600">{member.half}</td>
                      <td className="px-4 py-3 text-center font-bold text-red-700">{member.absent}</td>
                      <td className="px-4 py-3 text-center font-bold text-blue-700">{member.leave}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 md:p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-sm md:max-w-md p-4 md:p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 md:mb-5">
              <h2 className="text-lg md:text-xl font-black text-[#111111]">{editingStaff ? 'Edit Staff' : 'Add Staff'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-gray-100"><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveStaff} className="space-y-3 md:space-y-4">
              <div>
                <label className="block text-[10px] md:text-[11px] font-black uppercase text-[#374151] mb-1.5">Full Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="w-full h-10 border border-[#FDDBB4]/40 p-2 md:p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" required />
              </div>
              <div>
                <label className="block text-[10px] md:text-[11px] font-black uppercase text-[#374151] mb-1.5">Role / Job Title *</label>
                <input type="text" value={form.role} onChange={e => setForm({...form, role: e.target.value})} placeholder="e.g. Tailor, Manager" className="w-full h-10 border border-[#FDDBB4]/40 p-2 md:p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" required />
              </div>
              <div>
                <label className="block text-[10px] md:text-[11px] font-black uppercase text-[#374151] mb-1.5">Phone Number</label>
                <input type="tel" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+60" className="w-full h-10 border border-[#FDDBB4]/40 p-2 md:p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" />
              </div>
              <div>
                <label className="block text-[10px] md:text-[11px] font-black uppercase text-[#374151] mb-1.5">Base Salary (RM)</label>
                <input type="number" step="0.01" min="0" value={form.base_salary} onChange={e => setForm({...form, base_salary: e.target.value})} className="w-full h-10 border border-[#FDDBB4]/40 p-2 md:p-2.5 rounded-xl text-sm font-bold outline-none focus:border-[#E87020]" placeholder="0.00" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 bg-gray-100 p-2 md:p-3 rounded-xl font-bold text-[11px] md:text-sm hover:bg-gray-200 h-10">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-[#E87020] text-white p-2 md:p-3 rounded-xl font-bold text-[11px] md:text-sm hover:bg-[#C85C10] disabled:opacity-50 h-10">{submitting ? 'Saving...' : 'Save Staff'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
