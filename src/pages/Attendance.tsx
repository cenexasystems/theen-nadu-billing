import React, { useState, useEffect } from 'react'
import { Plus, Users, Calendar, Download, Trash2, Edit2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

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
}

export default function Attendance() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [attendance, setAttendance] = useState<Record<string, string>>({})
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [selectedDate])

  const fetchData = async () => {
    setLoading(true)
    const { data: s } = await supabase.from('staff').select('*').eq('is_active', true)
    if (s) setStaff(s)

    const { data: a } = await supabase.from('attendance').select('*').eq('date', selectedDate)
    if (a) {
      const attMap: Record<string, string> = {}
      a.forEach(r => attMap[r.staff_id] = r.status)
      setAttendance(attMap)
    } else {
      setAttendance({})
    }
    setLoading(false)
  }

  const markAttendance = async (staffId: string, status: string) => {
    setAttendance(prev => ({ ...prev, [staffId]: status }))
    
    await supabase.from('attendance').upsert({
      staff_id: staffId,
      date: selectedDate,
      status
    }, { onConflict: 'staff_id, date' })
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-black text-[#111111] flex items-center gap-2"><Calendar size={24} className="text-[#E87020]" /> Attendance & Staff</h1>
        <div className="flex gap-2">
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="border border-[#FDDBB4]/60 p-2 rounded-xl text-sm font-bold bg-white" />
          <button className="bg-white border border-[#FDDBB4]/60 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 text-[#374151] hover:bg-gray-50">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#FDDBB4]/60 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-[#FAFAFA] border-b border-[#FDDBB4]/60">
            <tr>
              <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Staff Member</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Role</th>
              <th className="px-4 py-3 text-[11px] font-black uppercase text-[#374151]">Attendance Status ({selectedDate})</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="text-center p-8 text-gray-500">Loading...</td></tr>
            ) : staff.length === 0 ? (
              <tr><td colSpan={3} className="text-center p-8 text-gray-500 font-bold">No staff members found. Add staff first.</td></tr>
            ) : staff.map(member => (
              <tr key={member.id} className="border-b border-[#FDDBB4]/30 hover:bg-[#FAFAFA]">
                <td className="px-4 py-3 font-semibold text-[#111111] flex items-center gap-2"><div className="w-8 h-8 rounded-full bg-[#FFF8F2] text-[#E87020] flex items-center justify-center font-black">{member.name.charAt(0)}</div> {member.name}</td>
                <td className="px-4 py-3 text-sm text-[#374151] font-medium">{member.role}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {['present', 'absent', 'half-day', 'leave'].map(status => (
                      <button key={status} onClick={() => markAttendance(member.id, status)}
                        className={`px-3 py-1 rounded text-[11px] font-black uppercase tracking-wider transition-colors 
                          ${attendance[member.id] === status ? (status === 'present' ? 'bg-green-100 text-green-700' : status === 'absent' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700') : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {status.replace('-', ' ')}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
