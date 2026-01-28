
import { Student, Teacher, SchoolConfig } from './types';

// URL DEPLOYMENT GOOGLE APPS SCRIPT
export const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzmIpXPDygHF3Du_1vpWmh4xKeqSOjBrxqDqT5LoaWBKP4JE8EfyuestY_GY6CSLY8WTQ/exec"; 

export const INITIAL_CONFIG: SchoolConfig = {
  academicYear: '2025/2026',
  semester: 'GANJIL'
};

// DATA SISWA DEFAULT (Hanya digunakan jika Spreadsheet Kosong saat pertama kali load)
export const INITIAL_STUDENTS: Student[] = [
  { id: '1129', className: 'IX A', name: 'ABEL AULIA PASA RAMADANI', gender: 'P' },
  { id: '1132', className: 'IX A', name: 'ADITYA FIRMANSYAH', gender: 'L' }
];

export const INITIAL_TEACHERS: Teacher[] = [
  { id: 't1', name: "Dra. Sri Hayati" },
  { id: 't2', name: "Bakhtiar Rifai, SE" }
];

export const STORAGE_KEYS = {
  AUTH: 'smpn3pacet_auth_session', // Auth tetap di local storage agar user tidak logout saat refresh
};
