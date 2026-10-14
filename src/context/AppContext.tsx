import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import {
  User,
  UserRole,
  Indicator,
  Ticket,
  SamplingEvaluation,
  FilterState,
  GoogleSheetConfig,
  IndicatorScore,
  SanggahanData,
  KeputusanAkhirData,
  CalibrationRecord,
  CalibrationFilterState,
} from '../types';
import {
  INITIAL_USERS,
  INITIAL_INDICATORS,
  INITIAL_TICKETS,
  INITIAL_EVALUATIONS,
  INITIAL_CALIBRATIONS,
  DEFAULT_NILAI_OPTIONS,
} from '../data/mockData';
import { parseCSV, parseExcelFile, generateSampleGoogleSheetCSV } from '../utils/csvParser';
import {
  collection,
  getDocs,
  setDoc,
  deleteDoc,
  doc,
  query,
  where,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface AppContextType {
  currentUser: User;
  setCurrentUser: (user: User) => void;
  switchRole: (role: User['role']) => void;
  users: User[];
  addUser: (user: Omit<User, 'id'>) => void;
  updateUser: (id: string, updated: Partial<User>) => void;
  deleteUser: (id: string) => void;
  resetUsersToDefault: () => void;
  changePassword: (oldPass: string, newPass: string) => { success: boolean; message: string };

  // Indicators management
  indicators: Indicator[];
  addIndicator: (indicator: Omit<Indicator, 'id'>) => void;
  updateIndicator: (id: string, updated: Partial<Indicator>) => void;
  deleteIndicator: (id: string) => void;
  resetIndicators: () => void;
  totalIndicatorWeight: number;

  // Tickets & Sheet Sync
  tickets: Ticket[];
  sheetConfig: GoogleSheetConfig;
  syncGoogleSheet: (
    customUrl?: string,
    onProgress?: (percent: number, stepText: string) => void
  ) => Promise<{ success: boolean; message: string; count?: number; error?: string }>;
  importExcelFile: (
    file: File,
    onProgress?: (percent: number, stepText: string) => void
  ) => Promise<{ success: boolean; message: string; count?: number; error?: string }>;
  loadSampleSheetData: (
    onProgress?: (percent: number, stepText: string) => void
  ) => Promise<{ success: boolean; message: string; count: number }>;
  importCSVText: (
    csvText: string,
    onProgress?: (percent: number, stepText: string) => void
  ) => { success: boolean; count: number; error?: string };

  // Sampling Evaluations & Workflow
  evaluations: SamplingEvaluation[];
  createSamplingEvaluation: (params: {
    ticket: Ticket;
    scores: IndicatorScore[];
    catatanAwalQA: string;
    isAiEvaluated?: boolean;
    aiAnalysis?: SamplingEvaluation['aiAnalysis'];
  }) => SamplingEvaluation;
  evaluateTicketWithAI: (ticket: Ticket) => Promise<{
    success: boolean;
    scores: IndicatorScore[];
    totalScore: number;
    aiAnalysis: any;
    isAi: boolean;
    error?: string;
  }>;
  submitPetugasAcceptance: (evaluationId: string) => void;
  submitPetugasSanggahan: (evaluationId: string, sanggahan: SanggahanData) => void;
  submitQaKeputusanAkhir: (evaluationId: string, keputusan: KeputusanAkhirData) => void;

  // Calibration module
  calibrations: CalibrationRecord[];
  createCalibration: (params: {
    samplingEvaluation: SamplingEvaluation;
    scores: IndicatorScore[];
    catatanKalibrasi: string;
  }) => CalibrationRecord;
  uncalibratedEvaluations: SamplingEvaluation[];
  calibrationFilters: CalibrationFilterState;
  setCalibrationFilters: React.Dispatch<React.SetStateAction<CalibrationFilterState>>;
  filteredCalibrations: CalibrationRecord[];

  // Filtering
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  filteredTickets: Ticket[];
  filteredEvaluations: SamplingEvaluation[];

  // Counters
  pendingPetugasCount: number;
  pendingQaRebuttalCount: number;

  clearAllData: () => void;

  // Active view
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  USER: 'senada_user_v8_flow',
  USERS_LIST: 'senada_users_list_v8_flow',
  INDICATORS: 'senada_indicators_v8_flow',
  TICKETS: 'senada_tickets_v8_flow',
  EVALUATIONS: 'senada_evaluations_v8_flow',
  CALIBRATIONS: 'senada_calibrations_v8_flow',
  SHEET: 'senada_sheet_v8_flow',
};

// Safe storage wrapper to prevent QuotaExceededError or restricted environments from crashing React
const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(key, value);
    } catch (err) {
      console.warn(`[SENADA Storage] QuotaExceededError on key "${key}". Cleaning non-essential keys...`, err);
      try {
        const allowed = Object.values(STORAGE_KEYS);
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const k = window.localStorage.key(i);
          if (k && !allowed.includes(k)) {
            window.localStorage.removeItem(k);
          }
        }
        window.localStorage.setItem(key, value);
      } catch (retryErr) {
        console.warn(`[SENADA Storage] Could not persist "${key}". Operating in memory.`, retryErr);
      }
    }
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  },
};

// Cleanup old legacy storage with default dummy data & previous user caches
['v1', 'v2', 'v3', 'v4', 'v4_clean', 'v5', 'v6', 'v7', 'v7_complete'].forEach((ver) => {
  safeStorage.removeItem(`senada_tickets_${ver}`);
  safeStorage.removeItem(`senada_evaluations_${ver}`);
  safeStorage.removeItem(`senada_calibrations_${ver}`);
  safeStorage.removeItem(`senada_sheet_${ver}`);
  safeStorage.removeItem(`senada_user_${ver}`);
  safeStorage.removeItem(`senada_users_list_${ver}`);
});

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // 1. Current User (Default to Administrator Senada so all menus including Manajemen User are immediately accessible)
  const [currentUser, setCurrentUser] = useState<User>(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.USER);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.id) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    // Default to Administrator Senada (Admin role)
    return INITIAL_USERS[0];
  });

  // 2. Users list (ensures all users are included)
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'users'));
        const usersList: User[] = [];
        querySnapshot.forEach((doc) => {
          usersList.push(doc.data() as User);
        });
        if (usersList.length > 0) {
          setUsers(usersList);
        } else {
          setUsers(INITIAL_USERS);
          // Optionally push initial users to Firestore
        }
      } catch (e) {
        console.error('Error fetching users:', e);
      }
    };
    fetchUsers();
  }, []);

  // 3. Active Tab
  const [activeTab, setActiveTab] = useState<string>('dashboard');

  // 4. Indicators
  const [indicators, setIndicators] = useState<Indicator[]>(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.INDICATORS);
    if (saved) {
      try {
        const parsed: Indicator[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((ind) => {
            if (ind.pilihanNilai && ind.pilihanNilai.length > 0) return ind;
            const initial = INITIAL_INDICATORS.find((i) => i.id === ind.id);
            return {
              ...ind,
              pilihanNilai: initial?.pilihanNilai || DEFAULT_NILAI_OPTIONS,
            };
          });
        }
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_INDICATORS;
  });

  // 5. Tickets
  const [tickets, setTickets] = useState<Ticket[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'tickets'), (snapshot) => {
      const ticketsList: Ticket[] = [];
      snapshot.forEach((doc) => {
        ticketsList.push(doc.data() as Ticket);
      });
      setTickets(ticketsList.length > 0 ? ticketsList : INITIAL_TICKETS);
    });
    return () => unsubscribe();
  }, []);

  // 6. Sampling Evaluations (Starts empty)
  const [evaluations, setEvaluations] = useState<SamplingEvaluation[]>(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.EVALUATIONS);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_EVALUATIONS;
  });

  // 7. Calibrations (Starts empty)
  const [calibrations, setCalibrations] = useState<CalibrationRecord[]>(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.CALIBRATIONS);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_CALIBRATIONS;
  });

  // 8. Google Sheet Config (Clean initial state)
  const [sheetConfig, setSheetConfig] = useState<GoogleSheetConfig>(() => {
    const saved = safeStorage.getItem(STORAGE_KEYS.SHEET);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return {
      url: '',
      autoSync: false,
      totalSyncedRows: 0,
      status: 'idle',
    };
  });

  // 9. Filters
  const [filters, setFilters] = useState<FilterState>({
    periode: 'all',
    namaPetugas: 'all',
    kategori: 'all',
    status: 'all',
  });

  const [calibrationFilters, setCalibrationFilters] = useState<CalibrationFilterState>({
    periode: 'all',
    namaPetugas: 'all',
    namaQA: 'all',
    kategori: 'all',
    pokokMasalah: 'all',
    topikMasalah: 'all',
  });

  // Sync to LocalStorage with safeStorage
  useEffect(() => {
    safeStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    safeStorage.setItem(STORAGE_KEYS.USERS_LIST, JSON.stringify(users));
  }, [users]);

  useEffect(() => {
    safeStorage.setItem(STORAGE_KEYS.INDICATORS, JSON.stringify(indicators));
  }, [indicators]);

  useEffect(() => {
    safeStorage.setItem(STORAGE_KEYS.TICKETS, JSON.stringify(tickets));
  }, [tickets]);

  useEffect(() => {
    safeStorage.setItem(STORAGE_KEYS.EVALUATIONS, JSON.stringify(evaluations));
  }, [evaluations]);

  useEffect(() => {
    safeStorage.setItem(STORAGE_KEYS.CALIBRATIONS, JSON.stringify(calibrations));
  }, [calibrations]);

  useEffect(() => {
    safeStorage.setItem(STORAGE_KEYS.SHEET, JSON.stringify(sheetConfig));
  }, [sheetConfig]);

  // Total Indicator Weight
  const totalIndicatorWeight = useMemo(() => {
    return indicators.reduce((acc, ind) => acc + (Number(ind.bobot) || 0), 0);
  }, [indicators]);

  // User Management Handlers (for QA and Admin)
  const addUser = (newUser: Omit<User, 'id'>) => {
    const id = `USR-${Date.now().toString().slice(-6)}`;
    const avatar = newUser.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80';
    setUsers((prev) => [...prev, { ...newUser, id, avatar }]);
  };

  const updateUser = (id: string, updated: Partial<User>) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === id) {
          const merged = { ...u, ...updated };
          if (currentUser.id === id) {
            setCurrentUser(merged);
          }
          return merged;
        }
        return u;
      })
    );
  };

  const deleteUser = (id: string) => {
    if (id === currentUser.id) {
      alert('Tidak dapat menghapus akun yang sedang aktif digunakan.');
      return;
    }
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const resetUsersToDefault = () => {
    setUsers(INITIAL_USERS);
    safeStorage.setItem(STORAGE_KEYS.USERS_LIST, JSON.stringify(INITIAL_USERS));
  };

  const changePassword = (oldPass: string, newPass: string): { success: boolean; message: string } => {
    const expectedPass = currentUser.password || (currentUser.role === 'admin' || currentUser.role === 'pusat' ? '150bisa' : 'kualitas99');
    if (oldPass !== expectedPass) {
      return { success: false, message: 'Password lama yang Anda masukkan tidak sesuai.' };
    }
    if (!newPass || newPass.trim().length < 6) {
      return { success: false, message: 'Password baru minimal harus terdiri dari 6 karakter.' };
    }
    if (newPass === oldPass) {
      return { success: false, message: 'Password baru tidak boleh sama persis dengan password lama.' };
    }

    updateUser(currentUser.id, { password: newPass });
    return { success: true, message: 'Password Anda berhasil diperbarui.' };
  };

  // Switch role convenience with active tab guard
  const switchRole = (role: User['role']) => {
    const targetUser = users.find((u) => u.role === role);
    if (targetUser) {
      setCurrentUser(targetUser);
      const roleAllowedTabs: Record<UserRole, string[]> = {
        admin: ['dashboard', 'kalibrasi', 'users-management'],
        pusat: ['dashboard', 'kalibrasi'],
        team_leader: ['dashboard', 'inbox-petugas', 'history'],
        petugas: ['dashboard', 'inbox-petugas', 'history'],
        qa: ['dashboard', 'sampling', 'inbox-sanggah-qa', 'history', 'kalibrasi', 'indicators', 'google-sheet'],
      };
      if (!roleAllowedTabs[role]?.includes(activeTab)) {
        setActiveTab('dashboard');
      }
    }
  };

  // Indicator Management Handlers
  const addIndicator = (newInd: Omit<Indicator, 'id'>) => {
    const id = `IND-${String(indicators.length + 1).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
    setIndicators((prev) => [...prev, { ...newInd, id }]);
  };

  const updateIndicator = (id: string, updated: Partial<Indicator>) => {
    setIndicators((prev) =>
      prev.map((ind) => (ind.id === id ? { ...ind, ...updated } : ind))
    );
  };

  const deleteIndicator = (id: string) => {
    setIndicators((prev) => prev.filter((ind) => ind.id !== id));
  };

  const resetIndicators = () => {
    setIndicators(INITIAL_INDICATORS);
  };

  // Google Sheet & CSV Sync Handlers
  // Google Sheet & CSV/Excel Sync Handlers
  const syncGoogleSheet = async (
    customUrl?: string,
    onProgress?: (percent: number, stepText: string) => void
  ): Promise<{ success: boolean; message: string; count?: number; error?: string }> => {
    const targetUrl = customUrl || sheetConfig.url;
    if (!targetUrl || !targetUrl.trim()) {
      return { success: false, message: 'URL Google Sheet tidak boleh kosong' };
    }

    setSheetConfig((prev) => ({ ...prev, status: 'syncing', errorMessage: undefined }));
    onProgress?.(15, 'Menghubungkan ke Google Sheet...');

    try {
      await new Promise((r) => setTimeout(r, 100));
      onProgress?.(35, 'Mengunduh data spreadsheet melalui proxy...');

      const res = await fetch('/api/proxy-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal sinkronisasi dari Google Sheet');
      }

      onProgress?.(65, 'Menganalisis baris data & memetakan 9 kolom standar...');
      await new Promise((r) => setTimeout(r, 100));

      const parsed = parseCSV(json.csv);
      if (parsed.data.length === 0) {
        throw new Error('Tidak ada baris data tiket valid yang dapat diimpor dari file tersebut.');
      }

      onProgress?.(85, `Memvalidasi & menyimpan ${parsed.data.length} tiket ke sistem...`);
      await new Promise((r) => setTimeout(r, 100));

      let addedCount = 0;
      let totalCount = 0;
      setTickets((prev) => {
        const existingMap = new Map(prev.map((t) => [t.nomorTiket, t]));
        parsed.data.forEach((newT) => {
          if (!existingMap.has(newT.nomorTiket)) {
            existingMap.set(newT.nomorTiket, newT);
            addedCount++;
          }
        });
        totalCount = existingMap.size;
        return Array.from(existingMap.values());
      });

      const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
      setSheetConfig({
        url: targetUrl,
        lastSyncedAt: now,
        autoSync: true,
        totalSyncedRows: totalCount,
        status: 'success',
      });

      onProgress?.(100, `Sinkronisasi selesai! ${addedCount} data baru ditambahkan (Total: ${totalCount} tiket).`);

      return {
        success: true,
        message: `Sinkronisasi berhasil. ${addedCount} data baru ditambahkan, catatan data sebelumnya tetap aman.`,
        count: totalCount,
      };
    } catch (err: any) {
      const errorMsg = err?.message || 'Terjadi kesalahan jaringan saat sinkronisasi.';
      setSheetConfig((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: errorMsg,
      }));
      return { success: false, message: errorMsg, error: errorMsg };
    }
  };

  const importExcelFile = async (
    file: File,
    onProgress?: (percent: number, stepText: string) => void
  ): Promise<{ success: boolean; message: string; count?: number; error?: string }> => {
    setSheetConfig((prev) => ({ ...prev, status: 'syncing', errorMessage: undefined }));

    try {
      const parsed = await parseExcelFile(file, onProgress);
      if (parsed.data.length === 0) {
        throw new Error('Tidak ditemukan data baris tiket yang valid dalam berkas Excel ini.');
      }

      onProgress?.(90, `Menyimpan ${parsed.data.length} tiket ke dalam sistem...`);
      await new Promise((r) => setTimeout(r, 120));

      let addedCount = 0;
      let totalCount = 0;
      setTickets((prev) => {
        const existingMap = new Map(prev.map((t) => [t.nomorTiket, t]));
        parsed.data.forEach((newT) => {
          if (!existingMap.has(newT.nomorTiket)) {
            existingMap.set(newT.nomorTiket, newT);
            addedCount++;
          }
        });
        totalCount = existingMap.size;
        return Array.from(existingMap.values());
      });

      const now = new Date().toISOString().replace('T', ' ').slice(0, 16);
      setSheetConfig({
        url: `Berkas Excel: ${file.name}`,
        lastSyncedAt: now,
        autoSync: false,
        totalSyncedRows: totalCount,
        status: 'success',
      });

      onProgress?.(100, `Impor selesai! ${addedCount} data baru ditambahkan (Total: ${totalCount} tiket).`);

      return {
        success: true,
        message: `Impor Excel berhasil. ${addedCount} data baru ditambahkan, catatan data sebelumnya tetap aman.`,
        count: totalCount,
      };
    } catch (err: any) {
      const errorMsg = err?.message || 'Gagal memproses berkas Excel.';
      setSheetConfig((prev) => ({
        ...prev,
        status: 'error',
        errorMessage: errorMsg,
      }));
      return { success: false, message: errorMsg, error: errorMsg };
    }
  };

  const loadSampleSheetData = async (
    onProgress?: (percent: number, stepText: string) => void
  ): Promise<{ success: boolean; message: string; count: number }> => {
    onProgress?.(25, 'Menyiapkan dataset simulasi BPJS Kesehatan...');
    await new Promise((r) => setTimeout(r, 100));

    onProgress?.(60, 'Mengekstrak baris tiket & memetakan indikator...');
    const sampleCSV = generateSampleGoogleSheetCSV();
    const parsed = parseCSV(sampleCSV);

    await new Promise((r) => setTimeout(r, 100));
    onProgress?.(90, 'Memuat tiket ke sistem...');

    setTickets((prev) => {
      const existingMap = new Map(prev.map((t) => [t.nomorTiket, t]));
      parsed.data.forEach((t) => {
        if (!existingMap.has(t.nomorTiket)) {
          existingMap.set(t.nomorTiket, t);
        }
      });
      return Array.from(existingMap.values());
    });

    setSheetConfig((prev) => ({
      ...prev,
      url: 'Simulasi Dataset Resmi BPJS',
      lastSyncedAt: new Date().toISOString().replace('T', ' ').slice(0, 16),
      totalSyncedRows: parsed.data.length,
      status: 'success',
      errorMessage: undefined,
    }));

    onProgress?.(100, `Dataset sampel berhasil dimuat (${parsed.data.length} tiket).`);

    return {
      success: true,
      message: `Berhasil memuat dataset simulasi resmi BPJS (${parsed.data.length} tiket).`,
      count: parsed.data.length,
    };
  };

  const importCSVText = (
    csvText: string,
    onProgress?: (percent: number, stepText: string) => void
  ): { success: boolean; count: number; error?: string } => {
    try {
      onProgress?.(30, 'Menganalisis teks CSV & mendeteksi pemisah...');
      const parsed = parseCSV(csvText);
      if (parsed.data.length === 0) {
        return { success: false, count: 0, error: 'Format CSV tidak valid atau baris kosong.' };
      }
      onProgress?.(80, `Memvalidasi ${parsed.data.length} baris tiket...`);

      setTickets((prev) => {
        const existingMap = new Map(prev.map((t) => [t.nomorTiket, t]));
        parsed.data.forEach((t) => {
          existingMap.set(t.nomorTiket, t);
        });
        return Array.from(existingMap.values());
      });

      onProgress?.(100, `Berhasil mengimpor ${parsed.data.length} tiket.`);
      return { success: true, count: parsed.data.length };
    } catch (e: any) {
      return { success: false, count: 0, error: e?.message || 'Gagal memproses data CSV' };
    }
  };

  // AI Automated Evaluation Caller
  const evaluateTicketWithAI = async (ticket: Ticket) => {
    try {
      const res = await fetch('/api/evaluate-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket,
          indicators,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Gagal melakukan penilaian otomatis AI');
      }

      return {
        success: true,
        scores: json.scores as IndicatorScore[],
        totalScore: json.totalScore as number,
        aiAnalysis: json.aiAnalysis,
        isAi: json.isAi,
      };
    } catch (err: any) {
      console.error('AI Eval Error:', err);
      const fallbackScores: IndicatorScore[] = indicators.map((ind) => ({
        indicatorId: ind.id,
        score: 82,
        notes: `Penilaian standar indikator ${ind.nama}`,
      }));
      return {
        success: true,
        scores: fallbackScores,
        totalScore: 82,
        aiAnalysis: {
          ringkasan: 'Penilaian standar sistem berdasarkan kriteria responsifitas.',
          kelebihan: ['Penyampaian sopan dan jelas'],
          kekurangan: ['Perlu penegasan kembali batas waktu tindak lanjut'],
          saran: 'Lengkapi dengan nomor kanal layanan resmi.',
        },
        isAi: false,
        error: err?.message,
      };
    }
  };

  // Create Sampling by QA
  const createSamplingEvaluation = ({
    ticket,
    scores,
    catatanAwalQA,
    isAiEvaluated = false,
    aiAnalysis,
  }: {
    ticket: Ticket;
    scores: IndicatorScore[];
    catatanAwalQA: string;
    isAiEvaluated?: boolean;
    aiAnalysis?: SamplingEvaluation['aiAnalysis'];
  }): SamplingEvaluation => {
    const totalBobot = indicators.reduce((acc, i) => acc + (Number(i.bobot) || 0), 0) || 100;
    const weightedSum = scores.reduce((acc, s) => {
      const ind = indicators.find((i) => i.id === s.indicatorId);
      return acc + (s.score * (ind?.bobot || 0));
    }, 0);
    const nilaiAwal = Math.round((weightedSum / totalBobot) * 10) / 10;

    const samplingId = `SMP-${Date.now().toString().slice(-6)}`;
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Resolve petugas team from users list
    const petugasObj = users.find(
      (u) => u.name.toLowerCase() === ticket.namaPetugas.toLowerCase()
    );
    const petugasTeam = petugasObj?.team || 'TIM 1';

    const newEvaluation: SamplingEvaluation = {
      id: samplingId,
      nomorTiket: ticket.nomorTiket,
      ticket: { ...ticket, sampled: true, samplingId },
      qaId: currentUser.id,
      qaName: currentUser.name,
      petugasTeam,
      tanggalSampling: nowStr.slice(0, 10),
      scores,
      nilaiAwal,
      catatanAwalQA,
      isAiEvaluated,
      aiAnalysis,
      status: 'MENUNGGU_REVIEW_PETUGAS',
      nilaiFinal: nilaiAwal,
      isCalibrated: false,
      history: [
        {
          timestamp: nowStr,
          actor: currentUser.name,
          role: 'Quality Assurance',
          action: 'Sampling jawaban dan penilaian awal',
          note: `Nilai Awal QA: ${nilaiAwal}. Hasil diteruskan ke Petugas (${ticket.namaPetugas}) dan Team Leader (${petugasTeam}).`,
        },
      ],
    };

    setTickets((prev) =>
      prev.map((t) =>
        t.nomorTiket === ticket.nomorTiket
          ? { ...t, sampled: true, samplingId }
          : t
      )
    );

    setEvaluations((prev) => [newEvaluation, ...prev]);

    return newEvaluation;
  };

  // Petugas Action: Accept Score
  const submitPetugasAcceptance = (evaluationId: string) => {
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    setEvaluations((prev) =>
      prev.map((item) => {
        if (item.id === evaluationId) {
          return {
            ...item,
            status: 'SELESAI_DITERIMA',
            history: [
              ...item.history,
              {
                timestamp: nowStr,
                actor: currentUser.name,
                role: 'Petugas',
                action: 'Menerima dan menyetujui hasil sampling',
                note: `Petugas menyetujui nilai akhir ${item.nilaiFinal} tanpa sanggahan. Tercatat ke Team Leader (${item.petugasTeam || 'TIM'}).`,
              },
            ],
          };
        }
        return item;
      })
    );
  };

  // Petugas Action: Submit Rebuttal
  const submitPetugasSanggahan = (evaluationId: string, sanggahan: SanggahanData) => {
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    setEvaluations((prev) =>
      prev.map((item) => {
        if (item.id === evaluationId) {
          return {
            ...item,
            status: 'PROSES_SANGGAHAN',
            sanggahan,
            history: [
              ...item.history,
              {
                timestamp: nowStr,
                actor: currentUser.name,
                role: 'Petugas',
                action: 'Mengajukan sanggahan penilaian mutu',
                note: `Alasan: "${sanggahan.alasanSanggahan}". Usulan nilai: ${sanggahan.usulanNilai || '-'}. Diteruskan kembali ke QA Penilai (${item.qaName}).`,
              },
            ],
          };
        }
        return item;
      })
    );
  };

  // QA Action: Final Decision
  const submitQaKeputusanAkhir = (evaluationId: string, keputusan: KeputusanAkhirData) => {
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    setEvaluations((prev) =>
      prev.map((item) => {
        if (item.id === evaluationId) {
          return {
            ...item,
            status: 'KEPUTUSAN_AKHIR',
            keputusanAkhir: keputusan,
            nilaiFinal: keputusan.nilaiAkhir,
            scores: keputusan.finalScores.length > 0 ? keputusan.finalScores : item.scores,
            history: [
              ...item.history,
              {
                timestamp: nowStr,
                actor: currentUser.name,
                role: 'Quality Assurance',
                action: `Keputusan akhir sanggahan: ${keputusan.statusPutusan.replace('_', ' ')}`,
                note: `Nilai akhir resmi: ${keputusan.nilaiAkhir}. Catatan QA: "${keputusan.catatanPutusanQA}". Nilai masuk ke Petugas (${item.ticket.namaPetugas}) dan Team Leader (${item.petugasTeam || 'TIM'}).`,
              },
            ],
          };
        }
        return item;
      })
    );
  };

  // CALIBRATION MODULE HANDLERS (Admin & Pusat)
  // Tickets sampled by QA that have NOT been calibrated yet (only 1 calibration per sample allowed)
  const uncalibratedEvaluations = useMemo(() => {
    return evaluations.filter((e) => !e.isCalibrated);
  }, [evaluations]);

  const createCalibration = ({
    samplingEvaluation,
    scores,
    catatanKalibrasi,
  }: {
    samplingEvaluation: SamplingEvaluation;
    scores: IndicatorScore[];
    catatanKalibrasi: string;
  }): CalibrationRecord => {
    const totalBobot = indicators.reduce((acc, i) => acc + (Number(i.bobot) || 0), 0) || 100;
    const weightedSum = scores.reduce((acc, s) => {
      const ind = indicators.find((i) => i.id === s.indicatorId);
      return acc + (s.score * (ind?.bobot || 0));
    }, 0);
    const nilaiKalibrasi = Math.round((weightedSum / totalBobot) * 10) / 10;

    const nilaiQA = samplingEvaluation.nilaiAwal; // perbandingan terhadap nilai sampling QA
    const selisihNilai = Math.round(Math.abs(nilaiQA - nilaiKalibrasi) * 10) / 10;
    
    // Persentase kesesuaian / perbandingan nilai QA terhadap nilai Kalibrator:
    // formula: 100 - (|nilaiQA - nilaiKalibrasi| / max(nilaiKalibrasi, 1) * 100)
    const persentase = Math.max(0, Math.min(100, Math.round((1 - selisihNilai / Math.max(nilaiKalibrasi, 1)) * 1000) / 10));

    const calId = `CAL-${Date.now().toString().slice(-6)}`;
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 10);

    const newCalibration: CalibrationRecord = {
      id: calId,
      samplingEvaluationId: samplingEvaluation.id,
      nomorTiket: samplingEvaluation.nomorTiket,
      ticket: samplingEvaluation.ticket,
      qaId: samplingEvaluation.qaId,
      qaName: samplingEvaluation.qaName,
      nilaiSamplingQA: nilaiQA,
      scoresQA: samplingEvaluation.scores,
      calibratorId: currentUser.id,
      calibratorName: currentUser.name,
      calibratorRole: currentUser.role as 'admin' | 'pusat',
      tanggalKalibrasi: nowStr,
      scoresKalibrasi: scores,
      nilaiKalibrasi,
      persentaseKesesuaian: persentase,
      selisihNilai,
      catatanKalibrasi,
    };

    // Mark evaluation as calibrated and store calibratedBy (only 1 calibration allowed!)
    setEvaluations((prev) =>
      prev.map((e) =>
        e.id === samplingEvaluation.id
          ? {
              ...e,
              isCalibrated: true,
              calibrationId: calId,
              calibratedBy: {
                id: currentUser.id,
                name: currentUser.name,
                role: currentUser.role as 'admin' | 'pusat',
                tanggal: nowStr,
                nilaiKalibrasi,
                kesesuaian: persentase,
              },
              history: [
                ...e.history,
                {
                  timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19),
                  actor: currentUser.name,
                  role: currentUser.role === 'admin' ? 'Administrator' : 'Pimpinan Pusat',
                  action: 'Melakukan uji sampling kalibrasi mutu',
                  note: `Nilai Kalibrasi: ${nilaiKalibrasi}. Kesesuaian mutu: ${persentase}%. Terkunci maksimal 1 kali kalibrasi dan masuk ke history kalibrasi.`,
                },
              ],
            }
          : e
      )
    );

    // Save calibration record
    setCalibrations((prev) => [newCalibration, ...prev]);

    return newCalibration;
  };

  // Filtered Calibrations
  const filteredCalibrations = useMemo(() => {
    return calibrations.filter((c) => {
      if (calibrationFilters.namaPetugas !== 'all') {
        const matchesPetugas = c.ticket.namaPetugas === calibrationFilters.namaPetugas;
        const matchesQA = c.qaName === calibrationFilters.namaPetugas;
        if (!matchesPetugas && !matchesQA) return false;
      }
      if (calibrationFilters.kategori !== 'all' && c.ticket.kategori !== calibrationFilters.kategori) {
        return false;
      }
      if (calibrationFilters.pokokMasalah !== 'all' && c.ticket.pokokMasalah !== calibrationFilters.pokokMasalah) {
        return false;
      }
      if (calibrationFilters.topikMasalah !== 'all' && c.ticket.topikMasalah !== calibrationFilters.topikMasalah) {
        return false;
      }
      if (calibrationFilters.periode !== 'all') {
        const calDate = new Date(c.tanggalKalibrasi);
        const today = new Date();
        if (calibrationFilters.periode === 'today') {
          const cDay = calDate.toISOString().slice(0, 10);
          const nowDay = today.toISOString().slice(0, 10);
          if (cDay !== nowDay) return false;
        } else if (calibrationFilters.periode === '7days') {
          const diffDays = (today.getTime() - calDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 7 || diffDays < 0) return false;
        } else if (calibrationFilters.periode === '30days') {
          const diffDays = (today.getTime() - calDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 30 || diffDays < 0) return false;
        }
      }
      return true;
    });
  }, [calibrations, calibrationFilters]);

  // Counters for UI Badges
  const pendingPetugasCount = useMemo(() => {
    return evaluations.filter((e) => {
      if (e.status !== 'MENUNGGU_REVIEW_PETUGAS') return false;
      if (currentUser.role === 'petugas') {
        return e.ticket.namaPetugas.toLowerCase() === currentUser.name.toLowerCase();
      }
      if (currentUser.role === 'team_leader') {
        return currentUser.team ? e.petugasTeam === currentUser.team : true;
      }
      return true;
    }).length;
  }, [evaluations, currentUser]);

  const pendingQaRebuttalCount = useMemo(() => {
    return evaluations.filter((e) => {
      if (e.status !== 'PROSES_SANGGAHAN') return false;
      if (currentUser.role === 'qa') {
        return e.qaId === currentUser.id || e.qaName.toLowerCase() === currentUser.name.toLowerCase();
      }
      return true;
    }).length;
  }, [evaluations, currentUser]);

  // Filtered Tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (filters.namaPetugas !== 'all' && t.namaPetugas !== filters.namaPetugas) {
        return false;
      }
      if (filters.kategori !== 'all' && t.kategori !== filters.kategori) {
        return false;
      }
      if (filters.periode !== 'all') {
        const ticketDate = new Date(t.tanggalTiket);
        const today = new Date();
        if (filters.periode === 'today') {
          const tDay = ticketDate.toISOString().slice(0, 10);
          const nowDay = today.toISOString().slice(0, 10);
          if (tDay !== nowDay) return false;
        } else if (filters.periode === '7days') {
          const diffDays = (today.getTime() - ticketDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 7 || diffDays < 0) return false;
        } else if (filters.periode === '30days') {
          const diffDays = (today.getTime() - ticketDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 30 || diffDays < 0) return false;
        }
      }
      return true;
    });
  }, [tickets, filters]);

  // Filtered Evaluations
  const filteredEvaluations = useMemo(() => {
    return evaluations.filter((e) => {
      if (filters.namaPetugas !== 'all' && e.ticket.namaPetugas !== filters.namaPetugas) {
        return false;
      }
      if (filters.kategori !== 'all' && e.ticket.kategori !== filters.kategori) {
        return false;
      }
      if (filters.status !== 'all' && e.status !== filters.status) {
        return false;
      }
      if (filters.periode !== 'all') {
        const evalDate = new Date(e.tanggalSampling);
        const today = new Date();
        if (filters.periode === 'today') {
          const eDay = evalDate.toISOString().slice(0, 10);
          const nowDay = today.toISOString().slice(0, 10);
          if (eDay !== nowDay) return false;
        } else if (filters.periode === '7days') {
          const diffDays = (today.getTime() - evalDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 7 || diffDays < 0) return false;
        } else if (filters.periode === '30days') {
          const diffDays = (today.getTime() - evalDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 30 || diffDays < 0) return false;
        }
      }
      return true;
    });
  }, [evaluations, filters]);

  // Clear all default/stored tickets, evaluations, and calibrations
  const clearAllData = () => {
    setTickets([]);
    setEvaluations([]);
    setCalibrations([]);
    setSheetConfig({
      url: '',
      autoSync: false,
      totalSyncedRows: 0,
      status: 'idle',
    });
    safeStorage.removeItem(STORAGE_KEYS.TICKETS);
    safeStorage.removeItem(STORAGE_KEYS.EVALUATIONS);
    safeStorage.removeItem(STORAGE_KEYS.CALIBRATIONS);
    safeStorage.removeItem(STORAGE_KEYS.SHEET);
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        switchRole,
        users,
        addUser,
        updateUser,
        deleteUser,
        resetUsersToDefault,
        changePassword,
        indicators,
        addIndicator,
        updateIndicator,
        deleteIndicator,
        resetIndicators,
        totalIndicatorWeight,
        tickets,
        sheetConfig,
        syncGoogleSheet,
        importExcelFile,
        loadSampleSheetData,
        importCSVText,
        clearAllData,
        evaluations,
        createSamplingEvaluation,
        evaluateTicketWithAI,
        submitPetugasAcceptance,
        submitPetugasSanggahan,
        submitQaKeputusanAkhir,
        calibrations,
        createCalibration,
        uncalibratedEvaluations,
        calibrationFilters,
        setCalibrationFilters,
        filteredCalibrations,
        filters,
        setFilters,
        filteredTickets,
        filteredEvaluations,
        pendingPetugasCount,
        pendingQaRebuttalCount,
        activeTab,
        setActiveTab,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
