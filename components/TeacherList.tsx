
import React, { useState } from 'react';
import { Teacher } from '../types';
import { UserPlus, Trash2, Briefcase, Save, Loader2, User as UserIcon } from 'lucide-react';
import { saveTeachers, deleteTeacher } from '../services/storageService';

interface TeacherListProps {
  teachers: Teacher[];
  setTeachers: React.Dispatch<React.SetStateAction<Teacher[]>>;
}

const TeacherList: React.FC<TeacherListProps> = ({ teachers, setTeachers }) => {
  const [newTeacherName, setNewTeacherName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeacherName.trim() || isSaving) return;

    setIsSaving(true);
    const newTeacher: Teacher = {
        id: `t_${Date.now()}`,
        name: newTeacherName.trim()
    };
    
    const updatedTeachers = [...teachers, newTeacher].sort((a, b) => a.name.localeCompare(b.name));
    setTeachers(updatedTeachers);
    await saveTeachers(updatedTeachers);
    
    setNewTeacherName('');
    setIsSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Yakin ingin menghapus data guru ini?')) {
      const updated = teachers.filter(t => t.id !== id);
      setTeachers(updated);
      await deleteTeacher(id);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5 backdrop-blur-sm">
        <h2 className="text-xl font-bold text-amber-500 flex items-center gap-3 font-gaming mb-6">
           <Briefcase className="text-cyan-400" />
           DATA GURU & STAFF <span className="text-slate-500 text-sm font-sans font-normal">({teachers.length})</span>
        </h2>
        
        {/* ADD FORM */}
        <form onSubmit={handleAddTeacher} className="flex flex-col md:flex-row gap-4 mb-8 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
             <div className="flex-grow">
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Nama Lengkap Guru / Staff</label>
                <input 
                    type="text" 
                    value={newTeacherName}
                    onChange={(e) => setNewTeacherName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-200 outline-none focus:border-amber-500"
                    placeholder="Contoh: Budi Santoso, S.Pd."
                    required
                />
             </div>
             <div className="flex items-end">
                <button type="submit" disabled={isSaving} className="w-full md:w-auto bg-cyan-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-cyan-500 transition-all flex items-center justify-center gap-2">
                    {isSaving ? <Loader2 className="animate-spin" /> : <UserPlus size={18} />} Tambah Guru
                </button>
             </div>
        </form>

        {/* LIST */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {teachers.map((teacher, index) => (
                <div key={teacher.id} className="bg-slate-800/40 border border-slate-700 hover:border-amber-500/30 rounded-xl p-4 flex items-center justify-between group transition-all">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-600 flex items-center justify-center text-slate-400">
                            <UserIcon size={20} />
                        </div>
                        <div>
                            <h4 className="font-bold text-slate-200">{teacher.name}</h4>
                            <span className="text-[10px] text-slate-500 font-mono">ID: {teacher.id}</span>
                        </div>
                    </div>
                    <button 
                        onClick={() => handleDelete(teacher.id)}
                        className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default TeacherList;
