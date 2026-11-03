/**
 * api.ts — client khusus Apps Script MANPOWER.
 *
 * Terpisah dari Facility: endpoint dan deployment-nya bisa berbeda, sehingga
 * PIC/spreadsheet dapat dipisahkan tanpa memengaruhi dashboard Facility.
 */

import type { JobCompletion, ListResponse, ManpowerRequest } from './types';

const MR_URL = (import.meta.env.VITE_MR_GAS_URL as string | undefined) || '';

export class ManpowerApiError extends Error {
  readonly action: string;

  constructor(action: string, message: string) {
    super(message);
    this.action = action;
    this.name = 'ManpowerApiError';
  }
}

export function requireManpowerUrl(): string {
  if (!MR_URL) {
    throw new ManpowerApiError(
      'config',
      'URL Apps Script MANPOWER belum diisi. Tambahkan VITE_MR_GAS_URL di file .env.local atau Environment Vercel.',
    );
  }
  return MR_URL.replace(/\/$/, '');
}

async function parse_(res: Response, action: string): Promise<unknown> {
  const text = await res.text();

  if (!res.ok) {
    throw new ManpowerApiError(action, `Server MANPOWER menjawab HTTP ${res.status}.`);
  }
  if (!text.trim()) {
    throw new ManpowerApiError(action, 'Server MANPOWER tidak mengirim apa pun.');
  }
  if (text.trimStart().startsWith('<')) {
    throw new ManpowerApiError(action, 'Server MANPOWER membalas HTML, bukan JSON. Periksa deployment Web App.');
  }

  let parsed: { success?: boolean; data?: unknown; message?: string };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new ManpowerApiError(action, `Balasan server bukan JSON: ${text.slice(0, 120)}…`);
  }

  if (!parsed.success) {
    throw new ManpowerApiError(action, parsed.message || `Aksi "${action}" gagal.`);
  }
  return parsed.data;
}

async function read<T>(action: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const url = new URL(requireManpowerUrl());
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  const res = await fetch(url.toString(), { method: 'GET', cache: 'no-store' });
  return (await parse_(res, action)) as T;
}

async function write<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(requireManpowerUrl(), {
    method: 'POST',
    // text/plain membuat request sederhana, bukan preflight CORS.
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body }),
    cache: 'no-store',
  });
  return (await parse_(res, action)) as T;
}

export const manpowerApi = {
  listRequests: (params: { q?: string; page?: number; pageSize?: number } = {}) =>
    read<ListResponse<ManpowerRequest>>('getRequests', params),

  listCompletions: (params: { q?: string; page?: number; pageSize?: number } = {}) =>
    read<ListResponse<JobCompletion>>('getCompletions', params),

  getRequest: (rowId: number) =>
    read<ManpowerRequest>('getRequest', { rowId }),

  getCompletion: (rowId: number) =>
    read<JobCompletion>('getCompletion', { rowId }),

  saveRequest: (rowId: number, sig: string, fields: Record<string, string>) =>
    write<ManpowerRequest>('saveRequest', { rowId, sig, fields }),

  saveCompletion: (rowId: number, sig: string, fields: Record<string, string>) =>
    write<JobCompletion>('saveCompletion', { rowId, sig, fields }),

  deleteRequest: (rowId: number, sig: string) =>
    write<{ deleted: boolean }>('deleteRequest', { rowId, sig }),

  deleteCompletion: (rowId: number, sig: string) =>
    write<{ deleted: boolean }>('deleteCompletion', { rowId, sig }),
};

export function manpowerFieldValue(value: unknown): string {
  return String(value ?? '').trim();
}

export function parseManpowerLines(value: unknown): string[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseManpowerPairs(value: unknown, separator: RegExp): Array<{ name: string; classification: string }> {
  return parseManpowerLines(value).map((line) => {
    const clean = line.replace(/^\s*\d+\.\s*/, '');
    const parts = clean.split(separator).map((part) => part.trim()).filter(Boolean);
    return { name: parts[0] ?? '', classification: parts.slice(1).join(' / ') };
  });
}
