
import React, { useState, useMemo } from 'react';
import { UserCheck, Search, Zap, Droplets, Loader2, Trash2, CheckSquare, Check, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { Student, AttendanceRecord, UserRole } from '../types';
import { addAttendanceRecordToSheet, deleteAttendanceRecord } from '../services/storageService';

interface ScannerTabProps {
  students: Student[];
  records: AttendanceRecord[];
  onRecordUpdate: () => void;
  currentUser: string;
  userRole: UserRole;
  // NEW PROPS untuk update state Global (App.tsx)
  onLocalAdd: (record: AttendanceRecord | AttendanceRecord[]) => void;
  onLocalDelete: (id: string) => void;
}

const ScannerTab: React.FC<ScannerTabProps> = ({ students, records, onRecordUpdate, currentUser, userRole, onLocalAdd, onLocalDelete }) => {
  const [autoSendWA, setAutoSendWA] = useState(false);
  const [isProcessingBulk, setIsProcessingBulk] = useState(false);
  
  // KITA HAPUS STATE 'tempRecords' KARENA SEKARANG SUDAH MENGGUNAKAN 'records' GLOBAL DARI APP.TSX
  // Ini membuat data konsisten antar tab (Dashboard/Riwayat langsung dapat update)

  const [searchQuery, setSearchQuery] = useState('');
  const [manualClassFilter, setManualClassFilter] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isHaidMode, setIsHaidMode] = useState(false);
  
  const [showAttended, setShowAttended] = useState(false);
  const [lastMessage, setLastMessage] = useState<{ text: string; type: 'success' | 'error'; student?: Student } | null>(null);
  
  const uniqueClasses = useMemo(() => {
    const classes = new Set(students.map(s => s.className));
    return Array.from(classes).sort();
  }, [students]);

  // MAP DATA ABSENSI HARI INI
  const todayAttendanceMap = useMemo(() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;
      
      const map = new Map<string, AttendanceRecord>();
      
      // Karena 'records' sekarang diupdate secara real-time di App.tsx melalui onLocalAdd,
      // Kita cukup memfilter records yang masuk prop.
      records.filter(r => r.date === todayStr).forEach(r => {
          map.set(r.studentId, r);
      });

      return map;
  }, [records]);

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const isAttended = todayAttendanceMap.has(s.id);
      
      // LOGIKA UTAMA: Sembunyikan jika sudah absen dan toggle mati
      if (!showAttended && isAttended) return false;

      if (isHaidMode && s.gender !== 'P') return false;
      
      const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            s.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesClass = manualClassFilter === 'ALL' || s.className === manualClassFilter;
      
      return matchesSearch && matchesClass;
    }).sort((a, b) => {
        const classComp = (a.className || '').localeCompare(b.className || '');
        if (classComp !== 0) return classComp;
        return a.name.localeCompare(b.name);
    });
  }, [students, searchQuery, manualClassFilter, todayAttendanceMap, isHaidMode, showAttended]);

  // --- LOGIKA ABSENSI CEPAT (GLOBAL OPTIMISTIC) ---

  const handleAttendance = (student: Student) => {
    // 1. Cek Duplikasi Client-Side
    if (todayAttendanceMap.has(student.id)) return;

    // 2. Buat Record Sementara
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const status = isHaidMode ? 'HAID' : 'PRESENT';

    const optimisticRecord: AttendanceRecord = {
        id: tempId,
        studentId: student.id,
        studentName: student.name,
        className: student.className,
        date: todayStr,
        timestamp: Date.now(),
        operatorName: currentUser,
        status: status
    };

    // 3. UPDATE GLOBAL STATE (App.tsx)
    // Ini akan men-trigger re-render di Scanner, Dashboard, dan Reports sekaligus!
    onLocalAdd(optimisticRecord);
    
    // Feedback visual
    setLastMessage({
      text: `${student.name} ${status === 'HAID' ? 'HAID' : 'HADIR'}`,
      type: 'success',
      student: student
    });
    setTimeout(() => setLastMessage(null), 2000);
    if (navigator.vibrate) navigator.vibrate(50);

    // 4. KIRIM DATA KE SERVER DI BACKGROUND
    addAttendanceRecordToSheet(student, currentUser, status).then(result => {
        if (result.success) {
            if (autoSendWA && student.parentPhone) {
                sendWhatsappMessage(student, status);
            }
            // Optional: Fetch ulang untuk memastikan ID sinkron dengan server
            // onRecordUpdate(); 
        } else {
            // JIKA GAGAL: Revert (Hapus dari global state)
            onLocalDelete(tempId);
            alert(`Gagal menyimpan absen untuk ${student.name}. Cek koneksi.`);
        }
    });
  };

  const handleManualClick = (student: Student) => {
    if (isProcessingBulk) return;

    const existingRecord = todayAttendanceMap.get(student.id);

    // Jika sudah absen -> Hapus Absensi (Undo)
    if (existingRecord) {
        if (confirm(`Batalkan absensi untuk ${student.name}?`)) {
            // 1. UPDATE GLOBAL STATE (Hapus Seketika)
            onLocalDelete(existingRecord.id);

            setLastMessage({ text: 'Absensi dibatalkan', type: 'success' });
            setTimeout(() => setLastMessage(null), 1500);

            // 2. KIRIM REQUEST DELETE DI BACKGROUND
            deleteAttendanceRecord(existingRecord.id).then(success => {
                if (!success) {
                    // JIKA GAGAL: Kembalikan data (Re-add)
                    onLocalAdd(existingRecord);
                    alert("Gagal menghapus data dari server.");
                } else {
                    // Sync untuk kebersihan data
                    // onRecordUpdate(); 
                }
            });
        }
    } else {
        handleAttendance(student);
    }
  };

  const handleBulkAttendance = async () => {
    if (selectedIds.size === 0 || isProcessingBulk) return;
    setIsProcessingBulk(true); 
    
    const targets = Array.from(selectedIds).map(id => students.find(s => s.id === id)).filter(Boolean) as Student[];
    const status = isHaidMode ? 'HAID' : 'PRESENT';
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    // 1. Optimistic Update Massal ke Global State
    const bulkOptimisticRecords: AttendanceRecord[] = targets.map(student => ({
        id: `temp_bulk_${student.id}_${Date.now()}`,
        studentId: student.id,
        studentName: student.name,
        className: student.className,
        date: todayStr,
        timestamp: Date.now(),
        operatorName: currentUser,
        status: status
    }));

    onLocalAdd(bulkOptimisticRecords);
    setSelectedIds(new Set()); 
    setLastMessage({ text: `Menyimpan ${targets.length} data...`, type: 'success' });

    // 2. Proses API background
    let successCount = 0;
    for (const student of targets) {
      const result = await addAttendanceRecordToSheet(student, currentUser, status);
      if (result.success) successCount++;
    }

    setIsProcessingBulk(false);
    setLastMessage({
        text: `Selesai! ${successCount}/${targets.length} tersimpan.`,
        type: 'success'
    });
    setTimeout(() => setLastMessage(null), 3000);
  };

  const sendWhatsappMessage = (student: Student, status: 'PRESENT' | 'HAID' = 'PRESENT') => {
    if (!student.parentPhone) return;
    let phone = student.parentPhone.replace(/\D/g, '');
    if (phone.startsWith('08')) phone = '62' + phone.substring(1);
    const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    let text = status === 'HAID' 
      ? `Assalamualaikum. Diberitahukan bahwa ananda *${student.name}* (Kelas ${student.className}) telah melapor *BERHALANGAN (HAID)* pada hari ini ${today}. Terima kasih.` 
      : `Assalamualaikum. Diberitahukan bahwa ananda *${student.name}* (Kelas ${student.className}) telah melaksanakan sholat Dhuhur berjamaah di sekolah pada hari ini ${today}. Petugas: ${currentUser}. Terima kasih.`;
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  };

  const remainingCount = useMemo(() => {
    if (manualClassFilter === 'ALL') return students.length - todayAttendanceMap.size;
    const classStudents = students.filter(s => s.className === manualClassFilter);
    const classAttended = classStudents.filter(s => todayAttendanceMap.has(s.id)).length;
    return classStudents.length - classAttended;
  }, [students, todayAttendanceMap, manualClassFilter]);

  return (
    <div className="space-y-4 pb-20">
      {/* Title Header */}
      <div className="flex items-center justify-between mb-2 px-2">
        <h2 className="text-xl font-bold text-amber-400 font-gaming flex items-center gap-2">
           <UserCheck className="text-cyan-400" /> INPUT ABSENSI
        </h2>
        <div className="flex gap-2">
            <button onClick={() => setAutoSendWA(!autoSendWA)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border flex items-center gap-2 transition-all ${autoSendWA ? 'bg-green-600/20 border-green-500 text-green-400' : 'bg-slate-900 border-slate-700 text-slate-500'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${autoSendWA ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`}></div>
                WA OTOMATIS
            </button>
        </div>
      </div>

      {lastMessage && (
        <div className={`fixed top-24 left-4 right-4 z-[100] p-4 rounded-xl text-center shadow-2xl animate-bounce border ${lastMessage.type === 'success' ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-red-600 text-white border-red-400'}`}>
          <div className="flex flex-col items-center justify-center gap-1">
            <div className="flex items-center gap-2 font-bold text-lg uppercase font-gaming">
                {lastMessage.type === 'success' ? <CheckCircle2 size={24} className="text-white" /> : <Zap size={24} className="text-yellow-300" />}
                {lastMessage.text}
            </div>
            {lastMessage.student && (
                <div className="text-sm font-mono bg-black/20 px-3 py-1 rounded-full">
                    {lastMessage.student.name} | {lastMessage.student.className}
                </div>
            )}
          </div>
        </div>
      )}

      {/* MANUAL MODE UI */}
      <div className="relative">
          <div className={`bg-slate-900/80 backdrop-blur-md rounded-2xl shadow-xl border overflow-hidden pb-4 transition-colors duration-500 ${isHaidMode ? 'border-pink-500/30' : 'border-white/10'}`}>
          <div className="p-4 border-b border-white/5 bg-slate-950/50 sticky top-0 z-20 flex flex-col gap-3">
              <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative group flex-grow">
                      <Search className={`absolute left-4 top-3.5 ${isHaidMode ? 'text-pink-400' : 'text-slate-500'}`} size={20} />
                      <input type="text" placeholder={isHaidMode ? "Cari Siswi Putri..." : "Cari Siswa..."} className="w-full pl-12 pr-10 py-3 bg-slate-900 border border-slate-700 rounded-xl outline-none text-slate-200" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <select value={manualClassFilter} onChange={(e) => setManualClassFilter(e.target.value)} className="pl-4 pr-8 py-3 bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-sm appearance-none cursor-pointer flex-1 md:flex-none">
                        <option value="ALL">Semua Kelas</option>
                        {uniqueClasses.map((cls) => (<option key={cls} value={cls}>{cls}</option>))}
                    </select>
                    <button onClick={() => { setIsHaidMode(!isHaidMode); setSelectedIds(new Set()); }} className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-2 transition-all ${isHaidMode ? 'bg-pink-900/40 border-pink-500 text-pink-400 shadow-[0_0_15px_rgba(236,72,153,0.3)]' : 'bg-slate-900 border-slate-700 text-slate-500'}`}>
                        <Droplets size={16} /> {isHaidMode ? 'MODE HAID' : 'MODE HADIR'}
                    </button>
                  </div>
              </div>
              
              {/* Info Sisa */}
              <div className="flex justify-between items-center px-1">
                 <div className="text-xs text-slate-400 font-mono">
                    Sisa: <span className="text-white font-bold">{remainingCount}</span> siswa belum absen
                 </div>
                 <div className="flex gap-2">
                    <button onClick={() => setShowAttended(!showAttended)} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border flex items-center gap-2 transition-all ${showAttended ? 'bg-amber-600/20 border-amber-500 text-amber-400' : 'bg-slate-900 border-slate-700 text-slate-500'}`}>
                        {showAttended ? <Eye size={14} /> : <EyeOff size={14} />}
                        {showAttended ? ' SEMBUNYIKAN SUDAH ABSEN' : ' LIHAT SUDAH ABSEN'}
                    </button>
                    {selectedIds.size > 0 && (
                            <button onClick={handleBulkAttendance} disabled={isProcessingBulk} className={`text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all border ${isHaidMode ? 'bg-pink-600 hover:bg-pink-500' : 'bg-emerald-600 hover:bg-emerald-500'} disabled:opacity-50`}>
                                {isProcessingBulk ? <Loader2 className="animate-spin" size={14} /> : <CheckSquare size={14} />}
                                SIMPAN ({selectedIds.size})
                            </button>
                    )}
                 </div>
              </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto p-2 no-scrollbar">
              <ul className="space-y-2">
                  {filteredStudents.length === 0 ? (
                      <li className="text-center p-8 text-slate-500 italic flex flex-col items-center gap-2">
                          <CheckCircle2 size={32} className="opacity-20" />
                          <span>{showAttended ? 'Tidak ada data siswa.' : 'Semua siswa (sesuai filter) sudah diabsen!'}</span>
                          {!showAttended && todayAttendanceMap.size > 0 && (
                             <button onClick={() => setShowAttended(true)} className="text-xs text-cyan-500 hover:underline mt-2">
                                Lihat yang sudah absen
                             </button>
                          )}
                      </li>
                  ) : (
                      filteredStudents.map((student) => {
                          const isSelected = selectedIds.has(student.id);
                          const existingRecord = todayAttendanceMap.get(student.id);
                          const isAttended = !!existingRecord;
                          const isHaid = existingRecord?.status === 'HAID';

                          return (
                              <li key={student.id} 
                                  onClick={() => handleManualClick(student)} 
                                  className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between group animate-fade-in
                                      ${isAttended 
                                          ? (isHaid ? 'bg-pink-900/40 border-pink-600' : 'bg-emerald-900/40 border-emerald-600') 
                                          : 'bg-slate-800/50 border-transparent hover:bg-slate-800 hover:border-slate-600 active:scale-[0.98]'
                                      }`}
                              >
                                  <div className="flex items-center gap-4">
                                      <div className={`w-8 h-8 rounded flex items-center justify-center border transition-all
                                          ${isAttended 
                                              ? (isHaid ? 'bg-pink-500 border-pink-400 text-white' : 'bg-emerald-500 border-emerald-400 text-white') 
                                              : 'bg-slate-900 border-slate-700 text-transparent group-hover:bg-slate-800'
                                          }`}>
                                          {isAttended ? <Check size={20} strokeWidth={4} /> : null}
                                      </div>
                                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 ${student.gender === 'L' ? 'bg-blue-900/30 border-blue-500 text-blue-400' : 'bg-pink-900/30 border-pink-500 text-pink-400'}`}>
                                          {student.gender || '?'}
                                      </div>
                                      <div>
                                          <p className={`font-bold font-gaming tracking-wide ${isAttended ? 'text-white' : (student.gender === 'P' ? 'text-pink-200' : 'text-slate-200')}`}>{student.name}</p>
                                          <div className="flex gap-2 text-[10px] text-slate-500 font-mono mt-0.5 uppercase tracking-tighter">
                                              ID: {student.id} | {student.className}
                                              {isAttended && <span className="text-white bg-slate-800 px-1 rounded ml-2">{isHaid ? 'SEDANG HAID' : 'HADIR'}</span>}
                                          </div>
                                      </div>
                                  </div>
                                  {isAttended && (
                                      <div className="opacity-60 group-hover:opacity-100 bg-red-900/50 p-2 rounded-lg text-red-400 border border-red-500/30">
                                          <Trash2 size={18} />
                                      </div>
                                  )}
                              </li>
                          );
                      })
                  )}
              </ul>
          </div>
          </div>
      </div>
    </div>
  );
};

export default ScannerTab;
