
import React, { useState, useEffect } from 'react';
import { Shield as ShieldIcon, Users as UsersIcon, ClipboardCheck as ClipboardCheckIcon, Trophy as TrophyIcon, LogOut as LogOutIcon, User as UserIcon, Home as HomeIcon, Loader2 as LoaderIcon, RefreshCwIcon, Database } from 'lucide-react';
import ScannerTab from './components/ScannerTab';
import StudentList from './components/StudentList';
import TeacherList from './components/TeacherList';
import SettingsTab from './components/SettingsTab';
import Reports from './components/Reports';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import { Student, AttendanceRecord, TabView, UserRole, Teacher, SchoolConfig, Holiday } from './types';
import { fetchAllData } from './services/storageService'; 
import { STORAGE_KEYS, INITIAL_CONFIG } from './constants';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('TEACHER');
  const [parentStudentData, setParentStudentData] = useState<Student | null>(null);

  const [activeTab, setActiveTab] = useState<TabView>('dashboard');
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig>(INITIAL_CONFIG);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Inisialisasi Auth dari Local Storage (Session browser)
  useEffect(() => {
    // Cek Session Login
    const sessionAuth = localStorage.getItem(STORAGE_KEYS.AUTH);
    if (sessionAuth) {
      try {
        const parsedAuth = JSON.parse(sessionAuth);
        setCurrentUser(parsedAuth.username);
        setUserRole(parsedAuth.role);
        if (parsedAuth.role === 'PARENT' && parsedAuth.studentData) {
            setParentStudentData(parsedAuth.studentData);
            setActiveTab('reports');
        }
        setIsAuthenticated(true);
      } catch (e) {
        localStorage.removeItem(STORAGE_KEYS.AUTH);
      }
    }
    
    // Load Data Online
    loadCloudData(false); // false = silent mode for initial load
  }, []);

  const loadCloudData = async (showFeedback = true) => {
    if (isLoadingData) return;
    setIsLoadingData(true);
    try {
      // Fetch semua data dari spreadsheet dalam 1 request agar cepat
      const data = await fetchAllData();
      if (data) {
        setStudents(data.students);
        setTeachers(data.teachers);
        
        // --- SMART MERGE LOGIC (PERBAIKAN V2) ---
        // Masalah: Data yang dihapus di spreadsheet tetap muncul karena dianggap data lokal 'pending'.
        // Solusi: Saat Sync, Server adalah "Single Source of Truth".
        // Kita HANYA mempertahankan data lokal (temp_) jika data tersebut BARU SAJA dibuat (misal < 10 detik lalu)
        // Hal ini untuk mencegah hilangnya data jika user melakukan scan TEPAT saat proses sync berjalan.
        // Jika data temp_ sudah berumur > 10 detik dan tidak ada di server, berarti data itu sudah dihapus manual di sheet.

        setRecords(prevLocalRecords => {
            const serverRecords = data.attendance || [];
            
            const NOW = Date.now();
            const THRESHOLD = 10000; // 10 Detik toleransi

            // Hanya ambil data lokal 'temp_' yang SANGAT BARU
            const recentPendingRecords = prevLocalRecords.filter(localR => 
                localR.id.startsWith('temp_') && 
                (NOW - localR.timestamp) < THRESHOLD
            );

            // Filter duplikat: Jangan masukkan pending record jika di server sudah ada (berdasarkan Student ID & Tanggal)
            const serverKeys = new Set(serverRecords.map(r => `${r.studentId}_${r.date}`));
            
            const uniquePending = recentPendingRecords.filter(r => 
                !serverKeys.has(`${r.studentId}_${r.date}`)
            );
            
            return [...serverRecords, ...uniquePending];
        });
        
        setSchoolConfig(data.config);
        setHolidays(data.holidays);

        if (showFeedback) {
            alert(`Sinkronisasi Berhasil!\nData terbaru dari Cloud telah dimuat.`);
        }
      }
    } catch (error) {
      console.error("Error loading cloud data:", error);
      if (showFeedback) alert("Gagal memuat data dari Spreadsheet. Cek koneksi internet.");
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleRecordUpdate = () => {
    // Reload data absensi di background
    loadCloudData(false);
  };

  // --- STATE MODIFIERS GLOBAL (OPTIMISTIC UI) ---
  // Fungsi ini dipanggil oleh ScannerTab untuk update Dashboard & Riwayat seketika
  const handleLocalAdd = (newRecord: AttendanceRecord | AttendanceRecord[]) => {
      setRecords(prev => {
          const newData = Array.isArray(newRecord) ? newRecord : [newRecord];
          // Filter duplikat berdasarkan ID jika ada
          const existingIds = new Set(prev.map(r => r.id));
          const filteredNew = newData.filter(r => !existingIds.has(r.id));
          return [...prev, ...filteredNew];
      });
  };

  const handleLocalDelete = (recordId: string) => {
      setRecords(prev => prev.filter(r => r.id !== recordId));
  };

  const handleLogin = (username: string, role: UserRole, studentData?: Student) => {
    const authData = { username, role, studentData };
    localStorage.setItem(STORAGE_KEYS.AUTH, JSON.stringify(authData));
    setCurrentUser(username);
    setUserRole(role);
    setParentStudentData(studentData || null);
    setIsAuthenticated(true);
    if (role === 'PARENT') setActiveTab('reports');
    else setActiveTab('dashboard');
    
    // Load data jika belum diload
    if (students.length === 0) loadCloudData(true);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEYS.AUTH);
    setIsAuthenticated(false);
    setCurrentUser('');
    setUserRole('TEACHER');
    setParentStudentData(null);
    setActiveTab('dashboard');
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} students={students} teachers={teachers} />;
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden text-slate-200">
      <div className="fixed inset-0 z-0 bg-[#0f172a]">
        <div className="absolute top-0 left-0 w-full h-96 bg-blue-900/20 blur-[100px] rounded-full mix-blend-screen"></div>
        <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(#6366f1 1px, transparent 1px), linear-gradient(to right, #6366f1 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
      </div>

      <header className="relative z-50 pt-6 px-4 pb-4">
        <div className="max-w-5xl mx-auto flex items-center gap-6 border-b border-white/10 pb-6 bg-gradient-to-r from-slate-900/80 via-slate-800/80 to-slate-900/80 backdrop-blur-md rounded-2xl shadow-xl px-6 py-4 border-t border-white/5 relative">
          <div className="relative group shrink-0">
             <div className="absolute -inset-4 bg-gradient-to-r from-amber-600 to-amber-600 rounded-full blur-xl opacity-40 group-hover:opacity-80 transition duration-1000"></div>
             <div className="relative w-20 h-20 rounded-full p-1 bg-gradient-to-b from-amber-400 to-amber-700 shadow-2xl">
                <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center overflow-hidden">
                   <img src="https://upload.wikimedia.org/wikipedia/commons/e/e9/Lambang_Kabupaten_Mojokerto.png" alt="Logo" className="w-full h-full object-contain p-2" />
                </div>
             </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
                <h1 className="text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500 font-gaming truncate">
                MGMP PENDIDIKAN AGAMA ISLAM
                </h1>
                <span className="bg-emerald-900 border border-emerald-600 text-[10px] text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                    <Database size={10} /> CLOUD SPREADSHEET
                </span>
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
               <button 
                  onClick={() => loadCloudData(true)}
                  disabled={isLoadingData}
                  className="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase border border-cyan-500/30 px-2 py-1 rounded bg-cyan-950/30 text-cyan-400 hover:bg-cyan-500/20 transition-all active:scale-95"
               >
                 {isLoadingData ? <LoaderIcon size={10} className="animate-spin" /> : <RefreshCwIcon size={10} />}
                 {isLoadingData ? 'SYNCING...' : 'SYNC DATA'}
               </button>
            </div>
          </div>

          <button onClick={handleLogout} className="p-2 text-red-400 bg-red-900/20 rounded-lg border border-red-500/20 active:scale-90 transition-transform">
              <LogOutIcon size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6 relative z-10">
        <div className="animate-fade-in">
          {activeTab === 'dashboard' && userRole !== 'PARENT' && <Dashboard students={students} records={records} config={schoolConfig} />}
          
          {/* TAB GURU: Manual Absen */}
          {activeTab === 'scan' && userRole === 'TEACHER' && (
            <ScannerTab 
                students={students} 
                records={records} 
                onRecordUpdate={handleRecordUpdate} 
                currentUser={currentUser} 
                userRole={userRole} 
                onLocalAdd={handleLocalAdd}
                onLocalDelete={handleLocalDelete}
            />
          )}
          
          {/* TAB ADMIN: Data Siswa */}
          {activeTab === 'students' && userRole === 'ADMIN' && <StudentList students={students} setStudents={setStudents} />}
          
          {/* TAB ADMIN: Data Guru */}
          {activeTab === 'teachers' && userRole === 'ADMIN' && <TeacherList teachers={teachers} setTeachers={setTeachers} />}

          {/* TAB ADMIN: Settings */}
          {activeTab === 'settings' && userRole === 'ADMIN' && <SettingsTab config={schoolConfig} setConfig={setSchoolConfig} holidays={holidays} setHolidays={setHolidays} />}
          
          {activeTab === 'reports' && <Reports records={records} students={students} onRecordUpdate={handleRecordUpdate} viewOnlyStudent={parentStudentData} holidays={holidays} />}
        </div>
      </main>

      {userRole !== 'PARENT' && (
        <nav className="fixed bottom-0 left-0 right-0 z-40">
          <div className="max-w-xl mx-auto flex justify-center items-end pb-4 gap-2 md:gap-6">
             <button onClick={() => setActiveTab('dashboard')} className={`group flex flex-col items-center transition-all w-16 ${activeTab === 'dashboard' ? '-translate-y-2 scale-110' : 'opacity-70'}`}>
                <div className={`w-12 h-12 flex items-center justify-center rounded-xl transform rotate-45 border-2 ${activeTab === 'dashboard' ? 'bg-slate-800 border-amber-400' : 'bg-slate-900 border-slate-700'}`}>
                  <HomeIcon size={22} className={`transform -rotate-45 ${activeTab === 'dashboard' ? 'text-amber-400' : 'text-slate-400'}`} />
                </div>
             </button>
             
             {userRole === 'TEACHER' && (
                <button onClick={() => setActiveTab('scan')} className={`group flex flex-col items-center transition-all w-16 ${activeTab === 'scan' ? '-translate-y-2 scale-110' : 'opacity-70'}`}>
                    <div className={`w-12 h-12 flex items-center justify-center rounded-xl transform rotate-45 border-2 ${activeTab === 'scan' ? 'bg-slate-800 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)]' : 'bg-slate-900 border-slate-700'}`}>
                      <ClipboardCheckIcon size={22} className={`transform -rotate-45 ${activeTab === 'scan' ? 'text-cyan-400' : 'text-slate-400'}`} />
                    </div>
                </button>
             )}

             {userRole === 'ADMIN' && (
               <>
               <button onClick={() => setActiveTab('students')} className={`group flex flex-col items-center transition-all w-16 ${activeTab === 'students' ? '-translate-y-2 scale-110' : 'opacity-70'}`}>
                  <div className={`w-12 h-12 flex items-center justify-center rounded-xl transform rotate-45 border-2 ${activeTab === 'students' ? 'bg-slate-800 border-amber-400' : 'bg-slate-900 border-slate-700'}`}>
                    <UsersIcon size={22} className={`transform -rotate-45 ${activeTab === 'students' ? 'text-amber-400' : 'text-slate-400'}`} />
                  </div>
               </button>
               <button onClick={() => setActiveTab('teachers')} className={`group flex flex-col items-center transition-all w-16 ${activeTab === 'teachers' ? '-translate-y-2 scale-110' : 'opacity-70'}`}>
                  <div className={`w-12 h-12 flex items-center justify-center rounded-xl transform rotate-45 border-2 ${activeTab === 'teachers' ? 'bg-slate-800 border-cyan-400' : 'bg-slate-900 border-slate-700'}`}>
                    <ShieldIcon size={22} className={`transform -rotate-45 ${activeTab === 'teachers' ? 'text-cyan-400' : 'text-slate-400'}`} />
                  </div>
               </button>
               <button onClick={() => setActiveTab('settings')} className={`group flex flex-col items-center transition-all w-16 ${activeTab === 'settings' ? '-translate-y-2 scale-110' : 'opacity-70'}`}>
                  <div className={`w-12 h-12 flex items-center justify-center rounded-xl transform rotate-45 border-2 ${activeTab === 'settings' ? 'bg-slate-800 border-pink-400' : 'bg-slate-900 border-slate-700'}`}>
                    <UsersIcon size={22} className={`transform -rotate-45 ${activeTab === 'settings' ? 'text-pink-400' : 'text-slate-400'}`} />
                  </div>
               </button>
               </>
             )}
             
             <button onClick={() => setActiveTab('reports')} className={`group flex flex-col items-center transition-all w-16 ${activeTab === 'reports' ? '-translate-y-2 scale-110' : 'opacity-70'}`}>
                <div className={`w-12 h-12 flex items-center justify-center rounded-xl transform rotate-45 border-2 ${activeTab === 'reports' ? 'bg-slate-800 border-amber-400' : 'bg-slate-900 border-slate-700'}`}>
                  <TrophyIcon size={22} className={`transform -rotate-45 ${activeTab === 'reports' ? 'text-amber-400' : 'text-slate-400'}`} />
                </div>
             </button>
          </div>
        </nav>
      )}
    </div>
  );
}

export default App;
