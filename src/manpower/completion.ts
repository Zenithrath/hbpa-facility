/**
 * Job Completion Report — daftar, edit, dan cetak A4.
 */

import { manpowerApi, parseManpowerLines } from './api';
import { createManpowerPage } from './page';
import type { JobCompletion } from './types';
import { actionBtn, actionCell, cardActions, esc, print } from '../ui';
import {
  JC_JOB_ROWS,
  jcSheetHtml,
  joinJcJobs,
  joinJcManpower,
  parseJcJobs,
  parseJcManpower,
  type JcJobRow,
  type JcManpowerRow,
} from './completion-sheet';

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

/**
 * Baca isi lembar form yang sedang terbuka di drawer.
 * null = drawer tertutup, jadi pemanggil memakai data dari server.
 */
function sheetValues(): Record<string, string> | null {
  if (!document.querySelector('#drawer .jc-paper')) return null;

  const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim();
  const field = (name: string) => clean(document.querySelector<HTMLElement>(`#drawer [data-f="${name}"]`)?.textContent);

  const manpower: JcManpowerRow[] = [1, 2, 3, 4].map((index) => ({
    name: field(`mpName${index}`),
    classification: field(`mpClass${index}`),
  }));

  const jobs: JcJobRow[] = [];
  document.querySelectorAll<HTMLTableRowElement>('#drawer .jc-jobs tbody tr').forEach((tr) => {
    const dateTime = clean(tr.querySelector<HTMLElement>('[data-col="dt"]')?.textContent);
    const description = clean(tr.querySelector<HTMLElement>('[data-col="ds"]')?.textContent);
    if (dateTime || description) jobs.push({ dateTime, description });
  });

  return {
    reportedBy: field('reportedBy'),
    jobName: field('jobName'),
    jobNo: field('jobNo'),
    location: field('location'),
    dateTime: field('dateTime'),
    endUserName: field('endUserName'),
    endUserPosition: field('endUserPosition'),
    manpower: joinJcManpower(manpower),
    jobDescriptionLog: joinJcJobs(jobs),
  };
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
    return `<tr class="cursor-pointer border-t border-surface-100 align-top hover:bg-surface-50/60" data-action="detail" data-id="${item.rowId}">
      <td class="px-4 py-3 text-sm whitespace-nowrap"><div>${esc(dt.date || '-')}</div><div class="text-[11px] text-surface-400">${esc(dt.time)}</div></td>
      <td class="px-4 py-3 text-sm"><div class="font-semibold">${esc(item.jobName || '-')}</div><div class="text-[11px] text-surface-400">${esc(item.jobNo || '')}</div></td>
      <td class="px-4 py-3 text-sm">${esc(item.location || '-')}</td>
      <td class="px-4 py-3 text-sm">${esc(item.reportedBy || '-')}</td>
      <td class="px-4 py-3 text-sm"><div>${esc(item.endUserName || '-')}</div><div class="text-[11px] text-surface-400">${esc(item.endUserPosition || '')}</div></td>
      ${actionCell(
        actionBtn('detail', { id: item.rowId }),
        actionBtn('print', { id: item.rowId }),
        actionBtn('delete', { id: item.rowId }),
      )}
    </tr>`;
  },
  renderCard(item) {
    const dt = splitDateTime(item.dateTime);
    return `<div class="card cursor-pointer p-4" data-action="detail" data-id="${item.rowId}">
      <div class="flex items-start justify-between gap-2"><div><div class="text-xs font-bold uppercase text-primary-700">${esc(dt.date || '-')}${dt.time ? ` · ${esc(dt.time)}` : ''}</div><h4 class="mt-1 font-bold">${esc(item.jobName || '-')}</h4><p class="text-xs text-surface-500">${esc(item.location || '-')}</p></div></div>
      <div class="mt-3 text-xs text-surface-600"><span class="font-bold">Reported:</span> ${esc(item.reportedBy || '-')}<br><span class="font-bold">End User:</span> ${esc(item.endUserName || '-')}</div>
      <div class="mt-2 text-xs text-surface-500">${esc(firstLogLine(item))}</div>
      ${cardActions(
        actionBtn('detail', { id: item.rowId }),
        actionBtn('print', { id: item.rowId }),
        actionBtn('delete', { id: item.rowId }),
      )}
    </div>`;
  },

  drawerTitle(item) { return `Job Completion — ${item.jobName || `Baris ${item.rowId}`}`; },
  drawerSize: 'xl',
  drawerBody(item) {
    return `<div class="jc-fit">${jcSheetHtml({ editable: true, item })}</div>`;
  },
  patchFromDrawer() {
    const sheet = sheetValues();
    return sheet ?? {};
  },
  drawerFooter(item) {
    return `${actionBtn('delete', { id: item.rowId, extra: 'px-4 py-2' })}
      <div class="flex flex-wrap gap-2">
        ${actionBtn('print', { id: item.rowId, extra: 'px-4 py-2' })}
        ${actionBtn('save', { id: item.rowId })}
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
    // Kalau drawer terbuka, cetak apa yang sedang tampil di lembar (termasuk
    // editan yang belum disimpan), bukan data lama.
    const edited = sheetValues();
    const data: JobCompletion = edited ? { ...item, ...edited } : item;

    print.show('job-completion');
    print.set('jc-reportedBy', signatures.reported?.name || data.reportedBy);
    print.set('jc-jobName', data.jobName);
    print.set('jc-jobNo', data.jobNo || '-');
    print.set('jc-location', data.location);
    print.set('jc-dateTime', data.dateTime);
    print.set('jc-endUserName', signatures.endUser?.name || data.endUserName);
    print.set('jc-endUserPosition', data.endUserPosition);
    print.setHtml('jc-reported-ttd', signatures.reported?.image ? `<img src="${signatures.reported.image}" alt="" style="height:48px">` : '');
    print.setHtml('jc-endUser-ttd', signatures.endUser?.image ? `<img src="${signatures.endUser.image}" alt="" style="height:48px">` : '');

    const manpower = parseJcManpower(data.manpower);
    for (let i = 1; i <= 4; i++) {
      print.set(`jc-mp-name-${i}`, manpower[i - 1]?.name ?? '');
      print.set(`jc-mp-class-${i}`, manpower[i - 1]?.classification ?? '');
    }

    const jobs = parseJcJobs(data.jobDescriptionLog);
    const rowCount = Math.max(JC_JOB_ROWS, jobs.length);
    const tbody = document.getElementById('jc-jobRows');
    if (tbody) {
      tbody.innerHTML = Array.from({ length: rowCount }, (_, index) => {
        const row = jobs[index];
        return `<tr><td class="no">${index + 1}</td><td>${esc(row?.dateTime ?? '')}</td><td>${esc(row?.description ?? '')}</td></tr>`;
      }).join('');
    }
    print.run();
  },
});

export const jobCompletionPageTitle = jobCompletionPage.title;
