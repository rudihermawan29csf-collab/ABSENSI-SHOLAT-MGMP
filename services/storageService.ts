
import { Student, AttendanceRecord, Teacher, SchoolConfig, Holiday } from '../types';
import { GOOGLE_SCRIPT_URL, INITIAL_CONFIG, INITIAL_STUDENTS, INITIAL_TEACHERS } from '../constants';

// --- API HELPER ---

const callApi = async (action: string, payload?: any, method: 'GET' | 'POST' = 'POST') => {
  try {
    // Tambahkan timestamp (_t) untuk mencegah caching pada GET request
    let url = `${GOOGLE_SCRIPT_URL}?action=${action}&_t=${Date.now()}`;
    
    // Konfigurasi Request
    let options: RequestInit = {
      method: method,
      mode: 'cors', // Pastikan mode CORS aktif
      redirect: 'follow', // Ikuti redirect dari Google Script
      cache: 'no-store', // WAJIB: Paksa browser tidak menggunakan cache lama
    };

    if (method === 'GET' && payload) {
      const params = new URLSearchParams(payload).toString();
      url += `&${params}`;
    }

    if (method === 'POST' && payload) {
      // PENTING: Gunakan text/plain untuk menghindari "Preflight OPTIONS request" 
      options.headers = {
        'Content-Type': 'text/plain;charset=utf-8',
      };
      options.body = JSON.stringify(payload);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error(`API Error [${action}]:`, error);
    return null;
  }
};

// --- DATA NORMALIZER ---

const normalizeDate = (dateStr: string): string => {
  if (!dateStr) return '';
  
  // Jika format sudah YYYY-MM-DD (2025-02-25)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // Jika format ISO (2025-02-25T14:00:00.000Z)
  if (dateStr.includes('T')) {
    return dateStr.split('T')[0];
  }

  // Jika format Slash (25/02/2025 atau 2/25/2025)
  // Asumsi format Indonesia DD/MM/YYYY jika ada slash
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      // Cek apakah part pertama adalah tahun (YYYY/MM/DD)
      if (parts[0].length === 4) {
         return `${parts[0]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
      }
      // Asumsi DD/MM/YYYY
      return `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    }
  }

  return dateStr;
};

// --- DATA LOADER (INIT) ---

export const fetchAllData = async () => {
  const result = await callApi('GET_ALL_DATA', null, 'GET');
  if (result) {
    // NORMALISASI DATA ATTENDANCE
    // Pastikan tanggal konsisten YYYY-MM-DD agar terbaca di Dashboard/Scanner
    const rawAttendance = result.attendance || [];
    const normalizedAttendance = rawAttendance.map((r: any) => ({
      ...r,
      date: normalizeDate(r.date)
    }));

    return {
      students: result.students || [],
      teachers: result.teachers || [],
      attendance: normalizedAttendance,
      config: result.config || INITIAL_CONFIG,
      holidays: result.holidays || []
    };
  }
  return null;
};

// --- HOLIDAY SERVICE ---

export const getHolidays = async (): Promise<Holiday[]> => {
  const result = await callApi('GET_ALL_DATA', null, 'GET');
  return result?.holidays || [];
};

export const saveHolidays = async (holidays: Holiday[]): Promise<boolean> => {
  const result = await callApi('SAVE_HOLIDAYS', holidays);
  return result?.success || false;
};

export const deleteHoliday = async (id: string): Promise<boolean> => {
  // Frontend update state, backend overwrite full list via saveHolidays usually safer/easier
  return true; 
};

// --- CONFIG SERVICE ---

export const getSchoolConfig = async (): Promise<SchoolConfig> => {
  const result = await callApi('GET_ALL_DATA', null, 'GET');
  return result?.config || INITIAL_CONFIG;
};

export const saveSchoolConfig = async (config: SchoolConfig): Promise<boolean> => {
  const result = await callApi('SAVE_CONFIG', config);
  return result?.success || false;
};

// --- STUDENTS SERVICE ---

export const getStudents = async (): Promise<Student[]> => {
  const result = await callApi('GET_ALL_DATA', null, 'GET');
  return result?.students || INITIAL_STUDENTS;
};

export const saveStudents = async (students: Student[]): Promise<boolean> => {
  const result = await callApi('SAVE_STUDENTS', students);
  return result?.success || false;
};

// --- TEACHERS SERVICE ---

export const getTeachers = async (): Promise<Teacher[]> => {
  const result = await callApi('GET_ALL_DATA', null, 'GET');
  return result?.teachers || INITIAL_TEACHERS;
};

export const saveTeachers = async (teachers: Teacher[]): Promise<boolean> => {
  const result = await callApi('SAVE_TEACHERS', teachers);
  return result?.success || false;
};

export const deleteTeacher = async (id: string): Promise<boolean> => {
  return true;
};

// --- ATTENDANCE SERVICE ---

export const getAttendance = async (): Promise<AttendanceRecord[]> => {
  const result = await callApi('GET_ALL_DATA', null, 'GET');
  return result?.attendance || [];
};

export const deleteAttendanceRecord = async (id: string): Promise<boolean> => {
  const result = await callApi('DELETE_ATTENDANCE', { id: id }, 'GET');
  return result?.success || false;
};

export const updateAttendanceStatus = async (id: string, newStatus: 'PRESENT' | 'HAID'): Promise<boolean> => {
  const result = await callApi('UPDATE_ATTENDANCE_STATUS', { id: id, status: newStatus });
  return result?.success || false;
};

export const addAttendanceRecordToSheet = async (
  student: Student, 
  operatorName: string, 
  status: 'PRESENT' | 'HAID' = 'PRESENT'
): Promise<{ success: boolean; message: string; record?: AttendanceRecord }> => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;
  
  // ID dibuat di client
  const localId = `rec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  const newRecord: AttendanceRecord = {
    id: localId,
    studentId: student.id || 'N/A',
    studentName: student.name || 'Unknown',
    className: student.className || 'Unknown',
    date: today,
    timestamp: Date.now(),
    operatorName: operatorName || 'System',
    status: status || 'PRESENT'
  };

  const result = await callApi('ADD_ATTENDANCE', newRecord);

  if (result?.success) {
    return { 
      success: true, 
      message: `${newRecord.studentName} berhasil ABSEN.`,
      record: newRecord 
    };
  } else {
    // Fallback jika API gagal, tetap return false agar UI tau
    return { success: false, message: "Gagal koneksi ke Cloud Spreadsheet." };
  }
};
