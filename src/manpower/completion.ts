/**
 * Job Completion Report — daftar, edit, dan cetak A4.
 */

import { manpowerApi, parseManpowerLines } from './api';
import { createManpowerPage } from './page';
import type { JobCompletion } from './types';
import { esc, print, icon } from '../ui';

const SEARCH_ID = 'mc-search';
const COUNT_ID = 'mc-count';
const TABLE_ID = 'mc-tbody';

const state = { items: [] as JobCompletion[] };

function splitDateTime(value: string): { date: string; time: string } {
  const match = /^(.*?)\s+(\d{1,2}:\d{2}(?::\d{2})?)$/.exec(value.trim());
  return match ? { date: match[1] ?? value.trim(), time: match[2] ?? '' } : { date: value.trim(), time: '' };
}

function firstLogLine(item: JobCompletion): string {
  return parseManpowerLines(item.jobDescriptionLog)[0] ?? '';
}



export const jobCompletionPage = createManpowerPage<JobCompletion>({
  title: 'Job Completion',
  icon: 'check',
  description: 'Laporan penyelesaian pekerjaan dari Google Form.',
  searchPlaceholder: 'Cari job, lokasi, pelapor, end user, atau pekerjaan...',
  searchId: SEARCH_ID,
  countId: COUNT_ID,
  tableId: TABLE_ID,
  columns: [
    { label: 'Date & Time' },
    { label: 'Job Name' },
    { label: 'Location' },
    { label: 'Reported By' },
    { label: 'End User' },
    { label: 'Aksi', className: 'px-4 py-3.5 text-right whitespace-nowrap' },
  ],
  list: () => manpowerApi.listCompletions({ pageSize: 100 }).then((r) => r.items),
  get: (rowId) => manpowerApi.getCompletion(rowId),
  save: (rowId, sig, patch) => manpowerApi.saveCompletion(rowId, sig, patch),
  remove: (rowId, sig) => manpowerApi.deleteCompletion(rowId, sig),
  distribute: (items) => { state.items = items; },

  renderRow(item) {
    const dt = splitDateTime(item.dateTime);
    return `<tr class="border-t border-surface-100 align-top hover:bg-surface-50/60">
      <td class="px-4 py-3 text-sm whitespace-nowrap"><div>${esc(dt.date || '-')}</div><div class="text-[11px] text-surface-400">${esc(dt.time)}</div></td>
      <td class="px-4 py-3 text-sm"><div class="font-semibold">${esc(item.jobName || '-')}</div><div class="text-[11px] text-surface-400">${esc(item.jobNo || '')}</div></td>
      <td class="px-4 py-3 text-sm">${esc(item.location || '-')}</td>
      <td class="px-4 py-3 text-sm">${esc(item.reportedBy || '-')}</td>
      <td class="px-4 py-3 text-sm"><div>${esc(item.endUserName || '-')}</div><div class="text-[11px] text-surface-400">${esc(item.endUserPosition || '')}</div></td>
      <td class="px-4 py-3 text-right whitespace-nowrap"><button class="btn-amber" data-action="mr-completion-open" data-id="${item.rowId}">${icon('edit', 'h-3.5 w-3.5')} Detail</button></td>
    </tr>`;
  },
  renderCard(item) {
    const dt = splitDateTime(item.dateTime);
    return `<div class="card p-4">
      <div class="flex items-start justify-between gap-2"><div><div class="text-xs font-bold uppercase text-primary-700">${esc(dt.date || '-')}${dt.time ? ` · ${esc(dt.time)}` : ''}</div><h4 class="mt-1 font-bold">${esc(item.jobName || '-')}</h4><p class="text-xs text-surface-500">${esc(item.location || '-')}</p></div><button class="btn-amber" data-action="mr-completion-open" data-id="${item.rowId}">Detail</button></div>
      <div class="mt-3 text-xs text-surface-600"><span class="font-bold">Reported:</span> ${esc(item.reportedBy || '-')}<br><span class="font-bold">End User:</span> ${esc(item.endUserName || '-')}</div>
      <div class="mt-2 text-xs text-surface-500">${esc(firstLogLine(item))}</div>
    </div>`;
  },

  drawerTitle(item) { return `Job Completion — ${item.jobName || `Baris ${item.rowId}`}`; },
  drawerBody(item) {
    const input = (id: string, label: string, value: string, type = 'text') => `<div><label class="field-label" for="${id}">${esc(label)}</label><input id="${id}" type="${type}" class="field" value="${esc(value)}"></div>`;
    const textarea = (id: string, label: string, value: string, rows: number, help: string) => `<div><label class="field-label" for="${id}">${esc(label)}</label><textarea id="${id}" class="field font-mono text-xs" rows="${rows}">${esc(value)}</textarea><p class="mt-1 text-[11px] text-surface-400">${esc(help)}</p></div>`;

    return `<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      ${input('mc-dateTime', 'Date & Time', item.dateTime)}
      ${input('mc-timestamp', 'Timestamp', item.timestamp)}
      ${input('mc-jobName', 'Job Name', item.jobName)}
      ${input('mc-jobNo', 'Job No.', item.jobNo)}
      ${input('mc-reportedBy', 'Reported By', item.reportedBy)}
      ${input('mc-submittedByEmail', 'Submitted By (Email)', item.submittedByEmail, 'email')}
      ${input('mc-location', 'Location', item.location)}
      ${input('mc-endUserName', 'End User Name', item.endUserName)}
      ${input('mc-endUserPosition', 'End User Position', item.endUserPosition)}
    </div>
    <div class="mt-4 space-y-4">
      ${textarea('mc-manpower', 'Manpower', item.manpower, 5, 'Satu manpower per baris, contoh: 1. Andi | Electrical')}
      ${textarea('mc-jobDescriptionLog', 'Job Description Log', item.jobDescriptionLog, 10, 'Satu pekerjaan per baris, contoh: 1. 03/11/2026 08:00 | Instalasi kabel')}
    </div>`;
  },
  patchFromDrawer() {
    const value = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value.trim() ?? '';
    return {
      dateTime: value('mc-dateTime'),
      timestamp: value('mc-timestamp'),
      jobName: value('mc-jobName'),
      jobNo: value('mc-jobNo'),
      reportedBy: value('mc-reportedBy'),
      submittedByEmail: value('mc-submittedByEmail'),
      location: value('mc-location'),
      endUserName: value('mc-endUserName'),
      endUserPosition: value('mc-endUserPosition'),
      manpower: value('mc-manpower'),
      jobDescriptionLog: value('mc-jobDescriptionLog'),
    };
  },
  drawerFooter(item) {
    return `<button class="btn-slate px-4 py-2 text-red-600" data-action="mr-completion-delete" data-id="${item.rowId}">Hapus</button>
      <div class="flex flex-wrap gap-2">
        <button class="btn-slate px-4 py-2" data-action="mr-completion-print" data-id="${item.rowId}">Cetak A4</button>
        <button class="btn-primary" data-action="mr-completion-save" data-id="${item.rowId}">Simpan Perubahan</button>
      </div>`;
  },

  signatureSlots(item) {
    return [
      { key: 'reported', label: 'Reported by', role: 'Reporter', prefillName: item.reportedBy, required: true },
      { key: 'endUser', label: 'End User', role: 'End User', prefillName: item.endUserName, required: true },
    ];
  },
  signatureTitle: 'Tanda Tangan Job Completion',
  print(item, signatures) {
    print.show('job-completion');
    print.set('jc-reportedBy', signatures.reported?.name || item.reportedBy);
    print.set('jc-jobName', item.jobName);
    print.set('jc-jobNo', item.jobNo || '-');
    print.set('jc-location', item.location);
    print.set('jc-dateTime', item.dateTime);
    print.set('jc-endUserName', signatures.endUser?.name || item.endUserName);
    print.set('jc-endUserPosition', item.endUserPosition);
    print.setHtml('jc-reported-ttd', signatures.reported?.image ? `<img src="${signatures.reported.image}" alt="" style="height:48px">` : '');
    print.setHtml('jc-endUser-ttd', signatures.endUser?.image ? `<img src="${signatures.endUser.image}" alt="" style="height:48px">` : '');

    const mpLines = parseManpowerLines(item.manpower);
    for (let i = 1; i <= 4; i++) {
      const line = mpLines[i - 1] ?? '';
      const match = /^(?:\d+\.\s*)?(.*?)(?:\s*\||\s*\/|\s+-\s+)\s*(.*)$/.exec(line);
      print.set(`jc-mp-name-${i}`, match?.[1]?.trim() ?? line);
      print.set(`jc-mp-class-${i}`, match?.[2]?.trim() ?? '');
    }

    const lines = parseManpowerLines(item.jobDescriptionLog);
    const rowCount = Math.max(17, lines.length);
    const tbody = document.getElementById('jc-jobRows');
    if (tbody) {
      tbody.innerHTML = Array.from({ length: rowCount }, (_, index) => {
        const raw = lines[index] ?? '';
        const clean = raw.replace(/^\s*\d+\.\s*/, '');
        const parts = clean.split('|').map((part) => part.trim());
        const dateTime = parts.length > 1 ? parts[0] : '';
        const description = parts.length > 1 ? parts.slice(1).join(' | ') : clean;
        return `<tr><td class="no">${index + 1}</td><td>${esc(dateTime)}</td><td>${esc(description)}</td></tr>`;
      }).join('');
    }
    print.run();
  },
});

export const jobCompletionPageTitle = jobCompletionPage.title;
