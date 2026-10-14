import { User, Indicator, Ticket, SamplingEvaluation, CalibrationRecord } from '../types';

export const INITIAL_USERS: User[] = [
  {
    id: 'USR-ADMIN-SENADA',
    username: 'senada',
    name: 'Administrator Senada',
    role: 'admin',
    email: 'senada@bpjskesehatan.go.id',
    nip: '198704152010121001',
    password: '150bisa',
  },
];
export const INITIAL_INDICATORS: Indicator[] = [];
export const INITIAL_TICKETS: Ticket[] = [];
export const INITIAL_EVALUATIONS: SamplingEvaluation[] = [];
export const INITIAL_CALIBRATIONS: CalibrationRecord[] = [];
export const DEFAULT_NILAI_OPTIONS: import('../types').IndicatorNilaiOption[] = [];
