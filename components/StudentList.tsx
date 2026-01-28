
import React, { useState, useRef, useMemo } from 'react';
import { Student } from '../types';
import { UserPlus, Trash2, Users, QrCode, Save, Upload, Edit, X, Loader2, Phone, User as UserIcon, FileSpreadsheet, Filter } from 'lucide-react';
import { saveStudents } from '../services/storageService';
import CardGenerator from './CardGenerator';
import * as XLSX from 'xlsx';

interface StudentListProps {
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
}

const StudentList: React.FC<StudentListProps> = ({ students, setStudents }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [showCardGenerator, setShowCardGenerator] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedClassFilter, setSelectedClassFilter] = useState('ALL');
  
  const [newStudent, setNewStudent] = useState<Partial<Student>>({ className: 'IX A', gender: 'L', parentPhone: '', name: '', id: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Student | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const uniqueClasses = useMemo(() => {
    const classes = new Set(students.map(s => s.className));
    return Array.from(classes).sort();
  }, [students]);

  const filteredStudents = useMemo(() => {
    const list = selectedClassFilter === 'ALL' 
      ? [...students] 
      : students.filter(s => s.className === selectedClassFilter);
    
    // Sort by Name (A-Z) as requested
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [students, selectedClassFilter]);

  const performSync = async (updatedList: Student[]) => {
    setIsSaving(true);
    setStudents(updatedList);
    await saveStudents(updatedList);
    setIsSaving(false);
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudent.name || !newStudent.id || isSaving) return;

    const updatedStudents = [...students, newStudent as Student];
    updatedStudents.sort((a, b) => (a.className || '').localeCompare(b.className || '') || (a.name || '').localeCompare(b.name || ''));
    
    await performSync(updatedStudents);
    setIsAdding(false);
    setNewStudent({ className: 'IX A', gender: 'L', name: '', id: '', parentPhone: '' });
  };

  const startEditing = (student: Student) => {
    setEditingId(student.id);
    setEditForm({ ...student });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm || !editForm.name || !editForm.id || isSaving) return;

    const finalList = students.map(s => s.id === editForm.id ? editForm : s);
    await performSync(finalList);
    cancelEditing();
  };

  const handleDelete = async (id: string) => {
    if (confirm('Konfirmasi Hapus: Apakah Anda yakin?')) {
      const updatedStudents = students.filter(s => s.id !== id);
      await performSync(updatedStudents);
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [
      { NIS: '1001', 'Nama Lengkap': 'CONTOH SISWA 1', Kelas: 'IX A', Gender: 'L', 'No WA Ortu': '08123456789' },
      { NIS: '1002', 'Nama Lengkap': 'CONTOH SISWA 2', Kelas: 'IX A', Gender: 'P', 'No WA Ortu': '08123456788' },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "Template_Siswa_SMPN3Pacet.xlsx");
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = e.target?.result;
      if (!data) return;

      try {
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

        const newStudents: Student[] = [];
        jsonData.forEach((row) => {
          const id = row['NIS'] || row['ID'];
          const nameRaw = row['Nama Lengkap'] || row['Nama'];
          if (id && nameRaw) {
            newStudents.push({
              id: String(id).trim(),
              name: String(nameRaw).toUpperCase().trim(),
              className: String(row['Kelas'] || 'IX A').trim(),
              gender: (String(row['Gender'] || 'L').toUpperCase().startsWith('P')) ? 'P' : 'L',
              parentPhone: String(row['No WA Ortu'] || row['WA'] || '').replace(/\D/g, '')
            });
          }
        });

        if (newStudents.length > 0) {
            const mergedStudents = [...students];
            newStudents.forEach(newS => {
              const index = mergedStudents.findIndex(s => s.id === newS.id);
              if (index >= 0) mergedStudents[index] = newS;
              else mergedStudents.push(newS);
            });
            mergedStudents.sort((a, b) => (a.className || '').localeCompare(b.className || '') || (a.name || '').localeCompare(b.name || ''));
            await performSync(mergedStudents);
            alert(`Impor Sukses! ${newStudents.length} data disinkronkan ke Cloud.`);
        }
      } catch (error) {
        alert("Gagal membaca file Excel.");
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      <div className="space-y-6 pb-20">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-900/50 p-4 rounded-2xl border border-white/5 backdrop-blur-sm relative">
          {isSaving && (
            <div className="absolute inset-0 bg-slate-900/60 z-20 flex items-center justify-center rounded-2xl">
               <Loader2 className="animate-spin text-amber-500 mr-2" />
               <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">Sinkronisasi Cloud...</span>
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-amber-500 flex items-center gap-3 font-gaming">
              <Users className="text-cyan-400" />
              HERO ROSTER
            </h2>
            <p className="text-[10px] text-slate-500 font-mono mt-1 uppercase tracking-wider">
              {selectedClassFilter === 'ALL' 
                ? `Total Siswa: ${students.length}` 
                : `Siswa Kelas ${selectedClassFilter}: ${filteredStudents.length} / ${students.length}`}
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2 w-full xl:w-auto">
             {/* Filter Dropdown */}
             <div className="relative flex-1 sm:flex-none">
                <Filter className="absolute left-3 top-2.5 text-slate-500" size={14} />
                <select 
                  value={selectedClassFilter} 
                  onChange={(e) => setSelectedClassFilter(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 text-slate-200 pl-9 pr-8 py-2 rounded-lg text-xs font-bold appearance-none outline-none focus:border-amber-500 transition-all cursor-pointer"
                >
                  <option value="ALL">SEMUA KELAS</option>
                  {uniqueClasses.map(cls => (
                    <option key={cls} value={cls}>KELAS {cls}</option>
                  ))}
                </select>
             </div>

             <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="hidden" />
             <button onClick={handleDownloadTemplate} className="flex-1 sm:flex-none bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-lg text-xs font-bold hover:bg-emerald-900/60 transition-all flex items-center justify-center gap-2">
                <FileSpreadsheet size={16} /> Template
             </button>
             <button onClick={() => fileInputRef.current?.click()} className="flex-1 sm:flex-none bg-slate-800 text-blue-400 border border-blue-500/30 px-3 py-2 rounded-lg text-xs font-bold hover:bg-blue-900/30 transition-all flex items-center justify-center gap-2">
                <Upload size={16} /> Import
             </button>
             <button onClick={() => setShowCardGenerator(true)} className="flex-1 sm:flex-none bg-slate-800 text-cyan-400 border border-cyan-500/50 px-3 py-2 rounded-lg text-xs font-bold hover:bg-cyan-900/50 transition-all flex items-center justify-center gap-2">
                <QrCode size={16} /> Cards
             </button>
             <button onClick={() => setIsAdding(!isAdding)} className="flex-1 sm:flex-none bg-amber-600 text-slate-900 px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-500 transition-all flex items-center justify-center gap-2 uppercase tracking-wide">
                {isAdding ? <X size={16} /> : <UserPlus size={16} />} {isAdding ? 'Cancel' : 'Add Hero'}
             </button>
          </div>
        </div>

        {isAdding && (
          <div className="bg-slate-900/90 p-6 rounded-xl border border-amber-500/30 animate-fade-in shadow-2xl">
            <h3 className="font-bold mb-6 text-amber-400 font-gaming text-lg border-b border-white/10 pb-2">Registrasi Hero Baru</h3>
            <form onSubmit={handleAddStudent} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-xs font-medium text-cyan-400 uppercase tracking-widest">NIS / ID</label>
                <input type="text" required className="w-full p-3 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-amber-500" value={newStudent.id || ''} onChange={e => setNewStudent({...newStudent, id: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-cyan-400 uppercase tracking-widest">Nama Lengkap</label>
                <input type="text" required className="w-full p-3 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-amber-500" value={newStudent.name || ''} onChange={e => setNewStudent({...newStudent, name: e.target.value.toUpperCase()})} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-cyan-400 uppercase tracking-widest">Kelas</label>
                <input type="text" required className="w-full p-3 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-amber-500" value={newStudent.className || ''} onChange={e => setNewStudent({...newStudent, className: e.target.value})} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-cyan-400 uppercase tracking-widest">Gender</label>
                <select className="w-full p-3 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-amber-500" value={newStudent.gender || ''} onChange={e => setNewStudent({...newStudent, gender: e.target.value as 'L'|'P'})}>
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              </div>
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-medium text-green-400 uppercase tracking-widest">No WA Orang Tua (Contoh: 08123...)</label>
                <input type="text" className="w-full p-3 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 outline-none focus:border-green-500" value={newStudent.parentPhone || ''} onChange={e => setNewStudent({...newStudent, parentPhone: e.target.value})} />
              </div>
              <div className="md:col-span-2 mt-4">
                <button type="submit" disabled={isSaving} className="w-full bg-cyan-600 text-white py-3 rounded-lg hover:bg-cyan-500 font-bold uppercase tracking-widest shadow-lg flex items-center justify-center gap-2">
                  {isSaving ? <Loader2 className="animate-spin" /> : <Save size={18} />} Simpan Hero ke Cloud
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {filteredStudents.length === 0 ? (
            <div className="text-center py-20 bg-slate-900/30 rounded-2xl border border-dashed border-slate-800">
               <Users size={48} className="mx-auto text-slate-700 mb-4" />
               <p className="text-slate-500 italic">Tidak ada data siswa ditemukan untuk filter ini.</p>
            </div>
          ) : (
            filteredStudents.map((student) => {
              const isEditing = editingId === student.id;
              
              if (isEditing && editForm) {
                return (
                  <div key={student.id} className="bg-slate-900 border-2 border-amber-500 rounded-xl p-6 shadow-2xl animate-fade-in">
                    <form onSubmit={handleUpdateStudent} className="space-y-4">
                      <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-4">
                        <h3 className="text-amber-400 font-bold font-gaming">EDITING: {student.name}</h3>
                        <button type="button" onClick={cancelEditing} className="text-slate-500 hover:text-white"><X size={20} /></button>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">NIS / ID (Fixed)</label>
                            <input disabled className="w-full p-2.5 bg-slate-950/50 border border-slate-800 rounded-lg text-slate-500 font-mono" value={editForm.id} />
                         </div>
                         <div className="space-y-1">
                            <label className="text-[10px] font-bold text-cyan-400 uppercase">Nama Lengkap</label>
                            <input type="text" required className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:border-amber-500" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value.toUpperCase()})} />
                         </div>
                         <div className="space-y-1">
                            <label className="text-[10px] font-bold text-cyan-400 uppercase">Kelas</label>
                            <input type="text" required className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:border-amber-500" value={editForm.className} onChange={e => setEditForm({...editForm, className: e.target.value})} />
                         </div>
                         <div className="space-y-1">
                            <label className="text-[10px] font-bold text-cyan-400 uppercase">Gender</label>
                            <select className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:border-amber-500" value={editForm.gender || ''} onChange={e => setEditForm({...editForm, gender: e.target.value as 'L'|'P'})}>
                                <option value="L">Laki-laki</option>
                                <option value="P">Perempuan</option>
                            </select>
                         </div>
                         <div className="md:col-span-2 space-y-1">
                            <label className="text-[10px] font-bold text-green-400 uppercase">No WA Orang Tua</label>
                            <input type="text" className="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-200 focus:border-green-500" value={editForm.parentPhone || ''} onChange={e => setEditForm({...editForm, parentPhone: e.target.value})} />
                         </div>
                      </div>
                      
                      <div className="flex gap-3 pt-2">
                        <button type="button" onClick={cancelEditing} className="flex-1 bg-slate-800 text-slate-300 py-3 rounded-lg font-bold">Batal</button>
                        <button type="submit" disabled={isSaving} className="flex-2 bg-amber-600 text-slate-900 py-3 rounded-lg font-bold shadow-lg flex items-center justify-center gap-2 px-8">
                          {isSaving ? <Loader2 className="animate-spin" /> : <Save size={18} />} Update Data
                        </button>
                      </div>
                    </form>
                  </div>
                );
              }

              return (
                <div key={student.id} className="group relative bg-slate-800/40 border border-slate-700 hover:border-amber-500/50 rounded-xl p-4 transition-all duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center border-2 shrink-0 ${student.gender === 'L' ? 'bg-blue-950 border-blue-600 text-blue-400 shadow-[0_0_10px_rgba(37,99,235,0.2)]' : 'bg-pink-950 border-pink-600 text-pink-400 shadow-[0_0_10px_rgba(219,39,119,0.2)]'}`}>
                        <UserIcon size={24} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-200 group-hover:text-amber-400 text-lg leading-tight truncate">{student.name}</h4>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mt-1 font-mono uppercase">
                          <span className="text-cyan-500 font-bold">ID: {student.id}</span>
                          <span>KELAS: {student.className}</span>
                          {student.parentPhone && (
                            <span className="text-green-500 flex items-center gap-1">
                              <Phone size={10} /> {student.parentPhone}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 self-end sm:self-center">
                        <button 
                          onClick={() => startEditing(student)} 
                          className="flex items-center gap-2 bg-slate-900 border border-slate-700 px-4 py-2 rounded-lg text-xs font-bold text-amber-500 hover:bg-amber-500/10 hover:border-amber-500 transition-all"
                        >
                          <Edit size={14} /> EDIT
                        </button>
                        <button 
                          onClick={() => handleDelete(student.id)} 
                          className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                        >
                          <Trash2 size={18} />
                        </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      {showCardGenerator && <CardGenerator students={students} onClose={() => setShowCardGenerator(false)} />}
    </>
  );
};

export default StudentList;
