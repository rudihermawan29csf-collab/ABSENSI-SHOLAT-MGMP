
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { AttendanceRecord, ReportPeriod, Student, Holiday } from '../types';
import { Calendar, Crown, Medal, TrendingUp, CheckCircle2, List, FileText, Loader2, UserCircle, XCircle, Edit, Trash2, Droplets, CalendarOff, Search, X } from 'lucide-react';
import { format, subDays, eachDayOfInterval, parseISO } from 'date-fns';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { deleteAttendanceRecord, updateAttendanceStatus } from '../services/storageService';

interface ReportsProps {
  records: AttendanceRecord[];
  students: Student[];
  onRecordUpdate: () => void;
  viewOnlyStudent?: Student | null;
  holidays?: Holiday[];
}

const Reports: React.FC<ReportsProps> = ({ records = [], students = [], onRecordUpdate, viewOnlyStudent, holidays = [] }) => {
  const [period, setPeriod] = useState<ReportPeriod>(ReportPeriod.DAILY);
  const [isExporting, setIsExporting] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  // Filters
  const [dailyFilter, setDailyFilter] = useState<'ALL' | 'PRESENT' | 'ABSENT' | 'HAID'>('ALL');
  const [dailyClassFilter, setDailyClassFilter] = useState('ALL');
  const [dailyDate, setDailyDate] = useState(format(new Date(), 'yyyy-MM-dd')); // State tanggal harian
  
  // NEW: Filter for Weekly & Monthly
  const [periodStatusFilter, setPeriodStatusFilter] = useState<'ALL' | 'PRESENT' | 'HAID' | 'ABSENT'>('ALL');

  // Student Search Filter
  const [studentSearchText, setStudentSearchText] = useState('');
  const [studentFilter, setStudentFilter] = useState<string | null>(null); // Stores Student ID
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Date Filters (Weekly/Matrix)
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedClass, setSelectedClass] = useState('ALL');

  // Monthly Filters
  const [historyMonth, setHistoryMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [historyFilterClass, setHistoryFilterClass] = useState('ALL');
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<Student | null>(null);

  useEffect(() => {
    if (viewOnlyStudent) setSelectedStudentDetail(viewOnlyStudent);
  }, [viewOnlyStudent]);

  // Reset student filter when switching tabs
  useEffect(() => {
    setStudentSearchText('');
    setStudentFilter(null);
    setShowSuggestions(false);
    setPeriodStatusFilter('ALL'); // Reset period filter
  }, [period]);

  const handleDelete = async (recordId: string, studentName: string) => {
    if (window.confirm(`Hapus data absensi untuk ${studentName}? Data ini akan dihapus permanen.`)) {
      await deleteAttendanceRecord(recordId);
      onRecordUpdate();
    }
  };

  const handleToggleStatus = async (recordId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'PRESENT' ? 'HAID' : 'PRESENT';
    await updateAttendanceStatus(recordId, newStatus);
    onRecordUpdate();
  };

  const classList = useMemo(() => {
      if (!students || students.length === 0) return [];
      const classes = new Set(students.map(s => s.className).filter(Boolean));
      return Array.from(classes).sort();
  }, [students]);

  // Filter Suggestions Logic
  const searchSuggestions = useMemo(() => {
      if (!studentSearchText) return [];
      return students.filter(s => 
          s.name.toLowerCase().includes(studentSearchText.toLowerCase()) || 
          s.id.includes(studentSearchText)
      ).slice(0, 5); // Limit 5 suggestions
  }, [students, studentSearchText]);

  const selectStudentFilter = (student: Student) => {
      setStudentFilter(student.id);
      setStudentSearchText(student.name);
      setShowSuggestions(false);
  };

  const clearStudentFilter = () => {
      setStudentFilter(null);
      setStudentSearchText('');
      setShowSuggestions(false);
  };

  // Helper untuk Cek Hari Libur
  const getDayStatus = (dateStr: string) => {
      const date = parseISO(dateStr);
      const isSunday = date.getDay() === 0;
      const manualHoliday = holidays.find(h => h.date === dateStr);
      
      return {
          isHoliday: isSunday || !!manualHoliday,
          holidayReason: manualHoliday ? manualHoliday.description : (isSunday ? 'Hari Minggu' : '')
      };
  };

  // --- DATA PROCESSING START ---

  const dailyStatusInfo = useMemo(() => {
     return getDayStatus(dailyDate);
  }, [holidays, dailyDate]);

  const dailyMasterList = useMemo(() => {
    if (!students) return [];
    // Menggunakan dailyDate yang dipilih user
    const todayRecords = records.filter(r => r.date === dailyDate);
    const targetStudents = viewOnlyStudent ? [viewOnlyStudent] : students;

    return targetStudents.map(student => {
        const record = todayRecords.find(r => r.studentId === student.id);
        const statusRaw = record?.status || 'ABSENT'; 
        
        // FIX: Ensure timestamp is parsed as number before formatting
        let timeDisplay = '-';
        if (record && record.timestamp) {
            try {
                // Konversi ke number untuk berjaga-jaga jika dari JSON/Spreadsheet berupa string
                const timestampNum = Number(record.timestamp);
                if (!isNaN(timestampNum) && timestampNum > 0) {
                    timeDisplay = format(new Date(timestampNum), 'HH:mm');
                }
            } catch (e) {
                console.error("Error formatting time", e);
            }
        }

        return {
            ...student,
            recordId: record?.id,
            isPresent: !!record,
            isHaid: statusRaw === 'HAID',
            statusRaw: statusRaw,
            time: timeDisplay,
            operator: record?.operatorName || '-'
        };
    }).sort((a, b) => (a.className || '').localeCompare(b.className || '') || (a.name || '').localeCompare(b.name || ''));
  }, [records, students, viewOnlyStudent, dailyDate]);

  const filteredDailyList = useMemo(() => {
    let list = dailyMasterList;
    
    // Apply Class Filter
    if (dailyClassFilter !== 'ALL' && !viewOnlyStudent) list = list.filter(s => s.className === dailyClassFilter);
    
    // Apply Student Search Filter
    if (studentFilter && !viewOnlyStudent) list = list.filter(s => s.id === studentFilter);

    // Apply Status Filter
    if (dailyFilter === 'ALL') return list;
    if (dailyFilter === 'PRESENT') return list.filter(s => s.statusRaw === 'PRESENT');
    if (dailyFilter === 'HAID') return list.filter(s => s.statusRaw === 'HAID');
    return list.filter(s => s.statusRaw === 'ABSENT');
  }, [dailyMasterList, dailyFilter, dailyClassFilter, viewOnlyStudent, studentFilter]);

  const weeklyMatrixData = useMemo(() => {
    if (!students || students.length === 0) return { daysInRange: [], matrix: [] };
    
    try {
        const start = parseISO(startDate);
        const end = parseISO(endDate);
        let daysInRange = eachDayOfInterval({ start, end });
        let targetStudents = viewOnlyStudent ? [viewOnlyStudent] : students;
        
        if (!viewOnlyStudent) {
            if (selectedClass !== 'ALL') targetStudents = targetStudents.filter(s => s.className === selectedClass);
            if (studentFilter) targetStudents = targetStudents.filter(s => s.id === studentFilter);
        }

        const matrix = targetStudents.map(student => {
            let presentCount = 0;
            let haidCount = 0;
            const attendanceMap = daysInRange.map(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayStatus = getDayStatus(dateStr);

                const record = records.find(r => r.studentId === student.id && r.date === dateStr);
                if (record) {
                    if (record.status === 'HAID') haidCount++;
                    else presentCount++;
                }
                return { 
                    date: dateStr, 
                    isPresent: !!record, 
                    isHaid: record?.status === 'HAID', 
                    recordId: record?.id,
                    isHoliday: dayStatus.isHoliday,
                    holidayReason: dayStatus.holidayReason
                };
            });
            return { ...student, attendanceMap, presentCount, haidCount };
        }).sort((a, b) => (a.className || '').localeCompare(b.className || '') || (a.name || '').localeCompare(b.name || ''));

        // Apply Status Filter for Weekly Matrix
        const filteredMatrix = matrix.filter(s => {
             if (periodStatusFilter === 'ALL') return true;
             if (periodStatusFilter === 'PRESENT') return s.presentCount > 0;
             if (periodStatusFilter === 'HAID') return s.haidCount > 0;
             if (periodStatusFilter === 'ABSENT') {
                 // Absent logic: Has at least one day that is NOT holiday and NOT present
                 return s.attendanceMap.some(d => !d.isHoliday && !d.isPresent);
             }
             return true;
        });

        return { daysInRange, matrix: filteredMatrix };

    } catch (e) {
        console.error("Date parsing error", e);
        return { daysInRange: [], matrix: [] };
    }
  }, [records, students, startDate, endDate, selectedClass, viewOnlyStudent, holidays, studentFilter, periodStatusFilter]);

  const monthlyStats = useMemo(() => {
    if (!students || students.length === 0) return [];
    let targetStudents = viewOnlyStudent ? [viewOnlyStudent] : students;
    
    if (!viewOnlyStudent) {
        if (historyFilterClass !== 'ALL') targetStudents = targetStudents.filter(s => s.className === historyFilterClass);
        if (studentFilter) targetStudents = targetStudents.filter(s => s.id === studentFilter);
    }

    const stats = targetStudents.map(student => {
        const monthRecords = records.filter(r => r.studentId === student.id && r.date.startsWith(historyMonth));
        const presentCount = monthRecords.filter(r => r.status === 'PRESENT').length;
        const haidCount = monthRecords.filter(r => r.status === 'HAID').length;
        return { ...student, presentCount, haidCount }; 
    }).sort((a, b) => (a.className || '').localeCompare(b.className || '') || (a.name || '').localeCompare(b.name || ''));

    // Apply Status Filter for Monthly
    return stats.filter(s => {
        if (periodStatusFilter === 'ALL') return true;
        if (periodStatusFilter === 'PRESENT') return s.presentCount > 0;
        if (periodStatusFilter === 'HAID') return s.haidCount > 0;
        if (periodStatusFilter === 'ABSENT') return (s.presentCount + s.haidCount) === 0; // Totally absent this month
        return true;
    });
  }, [records, students, historyMonth, historyFilterClass, viewOnlyStudent, studentFilter, periodStatusFilter]);

  const semesterData = useMemo(() => {
    const counts: Record<string, { id: string, name: string, count: number, className: string }> = {};
    records.forEach(r => {
      if (!counts[r.studentId]) {
        counts[r.studentId] = { id: r.studentId, name: r.studentName, count: 0, className: r.className };
      }
      if (r.status === 'PRESENT' || r.status === 'HAID') {
        counts[r.studentId].count++;
      }
    });
    
    let result = Object.values(counts);
    if (studentFilter) {
        result = result.filter(item => item.id === studentFilter);
    }
    
    return result.sort((a, b) => b.count - a.count);
  }, [records, studentFilter]);

  // --- EXPORT FUNCTION ---

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setIsExporting(true);
    await new Promise(r => setTimeout(r, 500));
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#0f172a' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Laporan_${period}.pdf`);
    } catch(e) {
        alert("Gagal export PDF");
    } finally {
      setIsExporting(false);
    }
  };

  // --- RENDER HELPERS ---

  const renderStudentSearchInput = () => {
    if (viewOnlyStudent) return null;

    return (
        <div className="relative group min-w-[200px] z-20">
            <div className="relative">
                <input 
                    type="text" 
                    placeholder="Cari Siswa..." 
                    value={studentSearchText}
                    onChange={(e) => {
                        setStudentSearchText(e.target.value);
                        if (!e.target.value) setStudentFilter(null);
                        setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded-lg p-1.5 pl-8 text-xs outline-none focus:border-cyan-500"
                />
                <Search size={14} className="absolute left-2 top-2 text-slate-500" />
                {studentFilter && (
                    <button 
                        onClick={clearStudentFilter} 
                        className="absolute right-2 top-2 text-slate-500 hover:text-red-400"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
            
            {/* Suggestions Dropdown */}
            {showSuggestions && studentSearchText && !studentFilter && searchSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
                    {searchSuggestions.map(s => (
                        <div 
                            key={s.id} 
                            onClick={() => selectStudentFilter(s)}
                            className="p-2 hover:bg-slate-800 cursor-pointer text-xs border-b border-slate-800/50 last:border-0"
                        >
                            <div className="font-bold text-slate-200">{s.name}</div>
                            <div className="text-[10px] text-slate-500">{s.className}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
  };

  const StatusFilterButtons = () => (
      <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
        {[
            { id: 'ALL', label: 'SEMUA' },
            { id: 'PRESENT', label: 'HADIR' },
            { id: 'HAID', label: 'HAID' },
            { id: 'ABSENT', label: 'ALPHA' }
        ].map(f => (
            <button 
                key={f.id} 
                onClick={() => setPeriodStatusFilter(f.id as any)} 
                className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${
                    periodStatusFilter === f.id 
                    ? (f.id === 'PRESENT' ? 'bg-green-600 text-white' : f.id === 'HAID' ? 'bg-pink-600 text-white' : f.id === 'ABSENT' ? 'bg-red-600 text-white' : 'bg-slate-700 text-white')
                    : 'text-slate-500 hover:text-slate-300'
                }`}
            >
                {f.label}
            </button>
        ))}
      </div>
  );

  // --- RENDER ---
  
  if (!students || students.length === 0) {
      return (
          <div className="text-center p-10 text-slate-500">
              <UserCircle size={48} className="mx-auto mb-4 opacity-50" />
              <p>Belum ada data siswa. Silakan hubungi Admin untuk impor data.</p>
          </div>
      );
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex bg-slate-900 p-1.5 rounded-xl border border-white/10 w-full mx-auto mb-8 shadow-xl overflow-x-auto no-scrollbar">
        {[
          { id: ReportPeriod.DAILY, label: 'Harian', icon: <List size={16} /> },
          { id: ReportPeriod.WEEKLY, label: 'Mingguan', icon: <TrendingUp size={16} /> },
          { id: ReportPeriod.MONTHLY, label: 'Bulanan', icon: <Calendar size={16} /> },
          { id: ReportPeriod.SEMESTER, label: 'Top Rajin', icon: <Crown size={16} /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setPeriod(tab.id); if (!viewOnlyStudent) setSelectedStudentDetail(null); }}
            className={`flex-1 min-w-[100px] py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 uppercase tracking-wide whitespace-nowrap ${period === tab.id ? 'bg-gradient-to-br from-amber-500 to-amber-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {tab.icon} <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl shadow-2xl border border-white/5 relative min-h-[400px]">
        {!selectedStudentDetail && (
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h3 className="text-lg font-bold text-amber-400 font-gaming flex items-center gap-2">
                    {period === ReportPeriod.DAILY && <><CheckCircle2 className="text-cyan-400" /> REKAP HARIAN</>}
                    {period === ReportPeriod.WEEKLY && <><TrendingUp className="text-amber-500" /> MATRIKS KEHADIRAN</>}
                    {period === ReportPeriod.MONTHLY && <><Calendar className="text-cyan-400" /> REKAP BULANAN</>}
                    {period === ReportPeriod.SEMESTER && <><Crown className="text-amber-500" /> LEADERBOARD</>}
                </h3>
                <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto no-print items-end md:items-center">
                    {/* Add Search Here for Semester/Monthly/Weekly if needed, or inside tabs */}
                    <button onClick={handleDownloadPDF} disabled={isExporting} className="bg-red-900/40 text-red-400 border border-red-500/30 hover:bg-red-900/60 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2">
                        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <FileText size={16} />} PDF
                    </button>
                </div>
            </div>
        )}
        
        <div ref={reportRef} className="p-2 -m-2 rounded-xl bg-slate-900/50">
            {period === ReportPeriod.DAILY && (
                <div className="space-y-4">
                    {dailyStatusInfo.isHoliday && (
                        <div className="bg-pink-900/30 border border-pink-500/50 p-3 rounded-lg flex items-center gap-3 text-pink-300 text-sm font-bold mb-2">
                             <CalendarOff />
                             <span>LIBUR: {dailyStatusInfo.holidayReason}</span>
                        </div>
                    )}

                    <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 px-2">
                        <div className="flex gap-3 text-[11px] md:text-xs text-slate-400 order-2 xl:order-1">
                           <span>Total: <b className="text-white">{dailyMasterList.length}</b></span>
                           <span>Hadir: <b className="text-green-400">{dailyMasterList.filter(s=>s.isPresent && !s.isHaid).length}</b></span>
                           <span>Haid: <b className="text-pink-400">{dailyMasterList.filter(s=>s.isHaid).length}</b></span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center justify-end w-full xl:w-auto order-1 xl:order-2">
                            {/* NEW: Date Picker for Daily Report */}
                            <input 
                                type="date" 
                                value={dailyDate} 
                                onChange={(e) => setDailyDate(e.target.value)} 
                                className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg text-[10px] p-2 uppercase outline-none focus:border-cyan-500"
                            />

                            {renderStudentSearchInput()}
                            
                            {!viewOnlyStudent && (
                                <select value={dailyClassFilter} onChange={(e) => setDailyClassFilter(e.target.value)} className="bg-slate-950 border border-slate-800 text-slate-200 rounded-lg text-[10px] p-2 uppercase outline-none">
                                    <option value="ALL">SEMUA KELAS</option>
                                    {classList.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                                </select>
                            )}
                            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                                {['ALL', 'PRESENT', 'HAID', 'ABSENT'].map(f => (
                                    <button key={f} onClick={() => setDailyFilter(f as any)} className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${dailyFilter === f ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>{f}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-700">
                        <table className="w-full text-left">
                            <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-bold">
                                <tr>
                                    <th className="p-3 border-b border-slate-800 text-center">No</th>
                                    <th className="p-3 border-b border-slate-800">Kelas</th>
                                    <th className="p-3 border-b border-slate-800">Nama Siswa</th>
                                    <th className="p-3 border-b border-slate-800 text-center">Waktu</th>
                                    {!viewOnlyStudent && <th className="p-3 border-b border-slate-800 text-center">Aksi</th>}
                                </tr>
                            </thead>
                            <tbody className="text-xs font-mono">
                                {filteredDailyList.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-4 text-center text-slate-500 italic">Tidak ada data siswa untuk filter ini.</td>
                                    </tr>
                                ) : (
                                    filteredDailyList.map((student, idx) => (
                                        <tr key={idx} className={`border-b border-slate-800/50 ${student.statusRaw === 'ABSENT' ? 'bg-red-900/10' : ''}`}>
                                            <td className="p-3 text-center opacity-60">{idx + 1}</td>
                                            <td className="p-3 font-bold text-cyan-500">{student.className}</td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    {student.statusRaw === 'PRESENT' && <CheckCircle2 size={12} className="text-green-500" />}
                                                    {student.statusRaw === 'HAID' && <Droplets size={12} className="text-pink-500" />}
                                                    {student.statusRaw === 'ABSENT' && <XCircle size={12} className="text-red-500" />}
                                                    {student.name}
                                                </div>
                                            </td>
                                            <td className="p-3 text-center text-slate-400">{student.time}</td>
                                            {!viewOnlyStudent && (
                                                <td className="p-3 text-center">
                                                    {student.isPresent && student.recordId && (
                                                        <div className="flex justify-center gap-2">
                                                            <button onClick={() => handleToggleStatus(student.recordId!, student.statusRaw)} className="p-1.5 text-amber-500 hover:bg-amber-500/10 rounded transition-all" title="Ubah Status (Hadir/Haid)">
                                                                <Edit size={14} />
                                                            </button>
                                                            <button onClick={() => handleDelete(student.recordId!, student.name)} className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-all" title="Hapus Absensi">
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {period === ReportPeriod.WEEKLY && (
                <div className="space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 items-end no-print flex-wrap">
                        {renderStudentSearchInput()}
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-slate-500 uppercase font-bold">Dari</label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-900 border border-slate-700 text-slate-200 rounded p-1.5 text-xs outline-none" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] text-slate-500 uppercase font-bold">Sampai</label>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-900 border border-slate-700 text-slate-200 rounded p-1.5 text-xs outline-none" />
                        </div>
                        <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="bg-slate-900 border border-slate-700 text-slate-200 rounded p-1.5 text-xs outline-none">
                            <option value="ALL">SEMUA KELAS</option>
                            {classList.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                        </select>
                        <StatusFilterButtons />
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-700">
                        <table className="w-full text-left">
                            <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-bold">
                                <tr>
                                    <th className="p-3 sticky left-0 bg-slate-950">No</th>
                                    <th className="p-3">Kelas</th>
                                    <th className="p-3 min-w-[150px]">Nama</th>
                                    {weeklyMatrixData.daysInRange.map((d, i) => (
                                        <th key={i} className={`p-1 text-center min-w-[30px] ${d.getDay() === 0 ? 'text-red-500' : ''}`}>{format(d, 'dd')}</th>
                                    ))}
                                    <th className="p-3 text-center text-green-400">V</th>
                                    <th className="p-3 text-center text-pink-400">H</th>
                                </tr>
                            </thead>
                            <tbody className="text-[10px] font-mono">
                                {weeklyMatrixData.matrix.length === 0 ? (
                                    <tr><td colSpan={10} className="p-4 text-center italic text-slate-500">Data tidak ditemukan</td></tr>
                                ) : (
                                    weeklyMatrixData.matrix.map((s, idx) => (
                                        <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                            <td className="p-3 sticky left-0 bg-slate-900 opacity-60">{idx + 1}</td>
                                            <td className="p-3 font-bold text-cyan-500">{s.className}</td>
                                            <td className="p-3">{s.name}</td>
                                            {s.attendanceMap.map((d, di) => (
                                                <td key={di} className={`p-1 text-center border-l border-slate-800/30 ${d.isHoliday ? 'bg-slate-800/50' : ''}`}>
                                                    <div className="flex flex-col items-center">
                                                        {d.isHoliday ? (
                                                           <div className="w-full h-full flex items-center justify-center text-slate-600 font-bold transform -rotate-90 text-[8px] whitespace-nowrap" title={d.holidayReason}>
                                                              LIBUR
                                                           </div>
                                                        ) : (
                                                            d.isPresent ? (
                                                                <div className="group relative flex flex-col items-center">
                                                                    <span className={d.isHaid ? 'text-pink-500' : 'text-green-500'}>{d.isHaid ? 'H' : 'V'}</span>
                                                                    {!viewOnlyStudent && (
                                                                        <button onClick={() => handleDelete(d.recordId!, s.name)} className="absolute -top-4 opacity-0 group-hover:opacity-100 bg-red-600 rounded p-1 text-[8px] z-50">DEL</button>
                                                                    )}
                                                                </div>
                                                            ) : '-'
                                                        )}
                                                    </div>
                                                </td>
                                            ))}
                                            <td className="p-3 text-center text-green-400 font-bold">{s.presentCount}</td>
                                            <td className="p-3 text-center text-pink-400 font-bold">{s.haidCount}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {period === ReportPeriod.MONTHLY && (
                <div className="space-y-4">
                    {!selectedStudentDetail && (
                        <div className="flex gap-4 items-end no-print flex-wrap">
                            {renderStudentSearchInput()}
                            <input type="month" value={historyMonth} onChange={e => setHistoryMonth(e.target.value)} className="bg-slate-900 border border-slate-700 text-slate-200 rounded p-1.5 text-xs outline-none" />
                            <select value={historyFilterClass} onChange={e => setHistoryFilterClass(e.target.value)} className="bg-slate-900 border border-slate-700 text-slate-200 rounded p-1.5 text-xs outline-none">
                                <option value="ALL">SEMUA KELAS</option>
                                {classList.map(cls => <option key={cls} value={cls}>{cls}</option>)}
                            </select>
                            <StatusFilterButtons />
                        </div>
                    )}
                    <div className="overflow-x-auto rounded-xl border border-slate-700">
                        <table className="w-full text-left">
                            <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-bold">
                                <tr>
                                    <th className="p-3">No</th>
                                    <th className="p-3 text-center">NIS</th>
                                    <th className="p-3">Nama Siswa</th>
                                    <th className="p-3 text-center">Sholat</th>
                                    <th className="p-3 text-center">Haid</th>
                                </tr>
                            </thead>
                            <tbody className="text-xs font-mono">
                                {monthlyStats.length === 0 ? (
                                    <tr><td colSpan={5} className="p-4 text-center italic text-slate-500">Data tidak ditemukan.</td></tr>
                                ) : (
                                    monthlyStats.map((s, idx) => (
                                        <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                                            <td className="p-3 opacity-60">{idx + 1}</td>
                                            <td className="p-3 text-center text-slate-500">{s.id}</td>
                                            <td className="p-3">
                                                <button onClick={() => setSelectedStudentDetail(s as Student)} className="text-left hover:text-amber-400 transition-all">{s.name}</button>
                                            </td>
                                            <td className="p-3 text-center font-bold text-green-400">{s.presentCount}</td>
                                            <td className="p-3 text-center font-bold text-pink-400">{s.haidCount}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {period === ReportPeriod.SEMESTER && (
                <div className="space-y-4">
                     <div className="no-print">
                        {renderStudentSearchInput()}
                     </div>
                     <div className="overflow-hidden border border-slate-800 rounded-lg">
                        <table className="w-full text-left">
                            <thead className="bg-slate-950">
                                <tr>
                                    <th className="p-3 text-[10px] font-bold text-slate-500 uppercase text-center">Rank</th>
                                    <th className="p-3 text-[10px] font-bold text-slate-500 uppercase">Hero Name</th>
                                    <th className="p-3 text-[10px] font-bold text-slate-500 uppercase text-right">Kehadiran (S+H)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {semesterData.length === 0 ? (
                                    <tr><td colSpan={3} className="p-4 text-center text-slate-500">Belum ada data absensi.</td></tr>
                                ) : (
                                    semesterData.map((s, idx) => (
                                        <tr key={idx} className={`hover:bg-slate-800/50 transition-colors ${idx < 3 ? 'bg-amber-500/5' : ''}`}>
                                            <td className="p-3 text-center">
                                                {idx === 0 ? <Medal size={20} className="text-yellow-400 mx-auto" /> : idx === 1 ? <Medal size={20} className="text-slate-300 mx-auto" /> : idx === 2 ? <Medal size={20} className="text-amber-700 mx-auto" /> : <span className="text-slate-500 font-bold">#{idx+1}</span>}
                                            </td>
                                            <td className="p-3">
                                                <div className="text-sm font-bold text-slate-200">{s.name}</div>
                                                <div className="text-[10px] text-slate-500">{s.className}</div>
                                            </td>
                                            <td className="p-3 text-sm font-bold text-cyan-400 text-right font-mono">{s.count}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default Reports;
