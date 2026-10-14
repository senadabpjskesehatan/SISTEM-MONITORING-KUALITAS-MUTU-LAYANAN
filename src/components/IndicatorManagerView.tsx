import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Indicator } from '../types';
import {
  Sliders,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Scale,
  Sparkles,
  Info,
  X,
  Save,
} from 'lucide-react';

export const IndicatorManagerView: React.FC = () => {
  const {
    indicators,
    addIndicator,
    updateIndicator,
    deleteIndicator,
    resetIndicators,
    totalIndicatorWeight,
  } = useApp();

  const [editingIndicator, setEditingIndicator] = useState<Indicator | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // New indicator form state
  const [newNama, setNewNama] = useState('');
  const [newBobot, setNewBobot] = useState<number>(20);
  const [newDeskripsi, setNewDeskripsi] = useState('');
  const [formError, setFormError] = useState('');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const handleStartEdit = (ind: Indicator) => {
    setEditingIndicator(ind);
    setIsCreating(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingIndicator) return;

    if (!editingIndicator.nama.trim()) {
      setFormError('Nama indikator tidak boleh kosong.');
      return;
    }

    updateIndicator(editingIndicator.id, {
      nama: editingIndicator.nama.trim(),
      bobot: Number(editingIndicator.bobot) || 0,
      deskripsi: editingIndicator.deskripsi.trim(),
    });

    setEditingIndicator(null);
    setSuccessToast(`Indikator "${editingIndicator.nama}" berhasil diperbarui.`);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newNama.trim()) {
      setFormError('Nama indikator harus diisi.');
      return;
    }

    if (newBobot <= 0) {
      setFormError('Bobot nilai harus lebih besar dari 0%.');
      return;
    }

    addIndicator({
      nama: newNama.trim(),
      bobot: Number(newBobot),
      deskripsi: newDeskripsi.trim() || 'Evaluasi kepatuhan terhadap indikator mutu layanan.',
      skalaMin: 0,
      skalaMax: 100,
    });

    setNewNama('');
    setNewBobot(15);
    setNewDeskripsi('');
    setIsCreating(false);
    setSuccessToast(`Indikator baru berhasil ditambahkan.`);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const handleDelete = (ind: Indicator) => {
    if (indicators.length <= 1) {
      alert('Minimal harus ada 1 indikator dalam sistem penilaian mutu.');
      return;
    }
    if (confirm(`Apakah Anda yakin ingin menghapus indikator "${ind.nama}"?`)) {
      deleteIndicator(ind.id);
      setSuccessToast(`Indikator "${ind.nama}" berhasil dihapus.`);
      setTimeout(() => setSuccessToast(null), 4000);
    }
  };

  const handleResetToStandard = () => {
    if (confirm('Reset seluruh indikator kembali ke standar baku SOP Penanganan Keluhan (5 Indikator Mutu)?')) {
      resetIndicators();
      setSuccessToast('Indikator berhasil direset ke standar SOP resmi.');
      setTimeout(() => setSuccessToast(null), 4000);
    }
  };

  const isWeightValid = totalIndicatorWeight === 100;

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {successToast && (
        <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 shadow-sm flex items-center gap-3 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
          <p className="text-xs font-semibold">{successToast}</p>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-teal-50 text-teal-700">
              <Sliders className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-base font-bold text-slate-900">
                Konfigurasi Indikator & Bobot Penilaian Mutu
              </h1>
              <p className="text-xs text-slate-500">
                Atur rubrik penilaian otomatis AI dan manual: tambah, edit, hapus indikator serta modifikasi bobot persentase
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsCreating(true);
                setEditingIndicator(null);
              }}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              Tambah Indikator Baru
            </button>
            <button
              onClick={handleResetToStandard}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
              title="Reset ke indikator standar SOP"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset SOP
            </button>
          </div>
        </div>

        {/* Total Weight Status Bar */}
        <div className={`mt-5 p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
          isWeightValid
            ? 'bg-teal-50/70 border-teal-200 text-teal-900'
            : 'bg-amber-50 border-amber-300 text-amber-900'
        }`}>
          <div className="flex items-center gap-2.5">
            {isWeightValid ? (
              <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            )}
            <div>
              <span className="font-bold">Total Akumulasi Bobot: {totalIndicatorWeight}%</span>
              <p className="text-[11px] opacity-80 mt-0.5">
                {isWeightValid
                  ? 'Total bobot telah tepat 100%. Penilaian AI dan manual terkalibrasi secara optimal.'
                  : `Peringatan: Total bobot saat ini ${totalIndicatorWeight}%. Idealnya total seluruh bobot bernilai tepat 100%.`}
              </p>
            </div>
          </div>

          <div className="text-[11px] font-semibold bg-white/80 px-2.5 py-1 rounded-lg border border-slate-200/80 shrink-0">
            {indicators.length} Indikator Aktif
          </div>
        </div>
      </div>

      {/* Form Tambah Indikator Baru Modal/Section */}
      {isCreating && (
        <div className="bg-white rounded-xl border border-teal-300 p-5 shadow-sm space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-teal-700" />
              Formulir Tambah Indikator Mutu Baru
            </h3>
            <button
              onClick={() => setIsCreating(false)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateNew} className="space-y-4 text-xs">
            {formError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-3">
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Indikator Mutu *
                </label>
                <input
                  type="text"
                  required
                  value={newNama}
                  onChange={(e) => setNewNama(e.target.value)}
                  placeholder="Contoh: Kecepatan Respon & Ketepatan Istilah Teknis"
                  className="w-full p-2.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Bobot Nilai (%) *
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={newBobot}
                  onChange={(e) => setNewBobot(Number(e.target.value))}
                  className="w-full p-2.5 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Deskripsi & Panduan Penilaian bagi Asesor/AI *
              </label>
              <textarea
                rows={3}
                required
                value={newDeskripsi}
                onChange={(e) => setNewDeskripsi(e.target.value)}
                placeholder="Jelaskan kriteria jawaban yang dinilai, poin penting, dan parameter pembeda nilai tinggi vs rendah..."
                className="w-full p-3 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition"
              >
                <Save className="w-3.5 h-3.5" />
                Simpan Indikator
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Modal */}
      {editingIndicator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden my-6">
            <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-bold">Edit Indikator: {editingIndicator.id}</h3>
              </div>
              <button
                onClick={() => setEditingIndicator(null)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Indikator Mutu
                </label>
                <input
                  type="text"
                  required
                  value={editingIndicator.nama}
                  onChange={(e) =>
                    setEditingIndicator({ ...editingIndicator, nama: e.target.value })
                  }
                  className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-medium focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Bobot Nilai (%)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={editingIndicator.bobot}
                  onChange={(e) =>
                    setEditingIndicator({ ...editingIndicator, bobot: Number(e.target.value) })
                  }
                  className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-bold focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Deskripsi & Kriteria Penilaian
                </label>
                <textarea
                  rows={4}
                  required
                  value={editingIndicator.deskripsi}
                  onChange={(e) =>
                    setEditingIndicator({ ...editingIndicator, deskripsi: e.target.value })
                  }
                  className="w-full p-3 rounded-lg border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingIndicator(null)}
                  className="px-4 py-2 border border-slate-300 rounded-lg text-slate-700 font-semibold hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  Perbarui Indikator
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Indicator Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {indicators.map((ind, idx) => (
          <div
            key={ind.id}
            className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs hover:border-teal-300 transition flex flex-col justify-between space-y-4"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-teal-700 text-white font-bold text-xs flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 leading-snug">
                      {ind.nama}
                    </h3>
                    <span className="font-mono text-[10px] text-slate-400">
                      {ind.id}
                    </span>
                  </div>
                </div>

                <div className="bg-teal-50 text-teal-800 font-extrabold text-xs px-2.5 py-1 rounded-lg border border-teal-200 shrink-0">
                  Bobot {ind.bobot}%
                </div>
              </div>

              <p className="text-xs text-slate-600 mt-3 leading-relaxed">
                {ind.deskripsi}
              </p>

              {ind.kriteriaContoh && ind.kriteriaContoh.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Contoh Parameter Pengukuran:
                  </span>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-500">
                    {ind.kriteriaContoh.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-400 text-[11px]">
                Skala: 0 - 100 Poin
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleStartEdit(ind)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium flex items-center gap-1 transition"
                >
                  <Edit2 className="w-3 h-3 text-slate-500" />
                  Edit & Ubah Bobot
                </button>
                <button
                  onClick={() => handleDelete(ind)}
                  className="p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition"
                  title="Hapus Indikator"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
