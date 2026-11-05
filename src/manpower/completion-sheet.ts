/**
 * Lembar A4 "Job Completion Report" (FM resmi perusahaan).
 *
 * Dipakai di dua tempat:
 * - drawer Job Completion: bisa diketik langsung (data dibaca lewat `data-f`
 *   dan `data-col`, tanpa id supaya tidak bentrok).
 * - area cetak `#print-job-completion`: memakai id `jc-*` yang diisi oleh
 *   print.set() / print().
 */

import { esc } from '../ui';

/** Jumlah baris kosong di kertas asli (kurang lebih 17-18). */
export const JC_JOB_ROWS = 17;

export interface JcJobRow {
  dateTime: string;
  description: string;
}

export interface JcManpowerRow {
  name: string;
  classification: string;
}

/** "1. Andi | Electrical" → { name: 'Andi', classification: 'Electrical' }. */
export function parseJcManpower(value: unknown): JcManpowerRow[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const clean = line.replace(/^\s*\d+\.\s*/, '');
      const match = /^(.*?)(?:\s*\||\s*\/|\s+-\s+)\s*(.*)$/.exec(clean);
      return {
        name: (match?.[1] ?? clean).trim(),
        classification: (match?.[2] ?? '').trim(),
      };
    });
}

/** "1. 03/11/2026 08:00 | Instalasi kabel" → { dateTime, description }. */
export function parseJcJobs(value: unknown): JcJobRow[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\d+\.\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim());
      return parts.length > 1
        ? { dateTime: parts[0] ?? '', description: parts.slice(1).join(' | ') }
        : { dateTime: '', description: parts[0] ?? '' };
    });
}

export function joinJcManpower(rows: JcManpowerRow[]): string {
  return rows
    .filter((row) => row.name || row.classification)
    .map((row, index) => `${index + 1}. ${row.name}${row.classification ? ` | ${row.classification}` : ''}`)
    .join('\n');
}

export function joinJcJobs(rows: JcJobRow[]): string {
  return rows
    .filter((row) => row.dateTime || row.description)
    .map((row, index) => {
      const dateTime = row.dateTime ? `${row.dateTime} | ` : '';
      return `${index + 1}. ${dateTime}${row.description}`;
    })
    .join('\n');
}

export interface JcSheetItem {
  reportedBy?: string;
  jobName?: string;
  jobNo?: string;
  location?: string;
  dateTime?: string;
  manpower?: string;
  jobDescriptionLog?: string;
  endUserName?: string;
  endUserPosition?: string;
}

export interface JcSheetOptions {
  /** true = tiap field bisa diketik (dipakai di drawer). */
  editable?: boolean;
  /** true = pakai id `jc-*` (dipakai area cetak, diisi print.set). */
  withIds?: boolean;
  item?: JcSheetItem;
}

export function jcSheetHtml(options: JcSheetOptions = {}): string {
  const { editable = false, withIds = false, item = {} } = options;

  const id = (name: string) => (withIds ? ` id="jc-${name}"` : '');
  const edit = editable ? ' contenteditable="true" spellcheck="false"' : '';
  const text = (
    name: keyof JcSheetItem & string,
    value: string,
    className = 'jc-line',
    tag: 'div' | 'span' = 'div',
  ) =>
    `<${tag}${id(name)}${editable ? ` data-f="${name}"${edit}` : ''} class="${className}">${editable ? esc(value) : ''}</${tag}>`;

  const manpowerRows = parseJcManpower(item.manpower ?? '');
  const mp = (index: number, key: 'name' | 'classification', className: string) => {
    const field = `mp${key === 'name' ? 'Name' : 'Class'}${index}`;
    const printId = `mp-${key === 'name' ? 'name' : 'class'}-${index}`;
    const value = manpowerRows[index - 1]?.[key] ?? '';
    return `<span${id(printId)}${editable ? ` data-f="${field}"${edit}` : ''} class="${className}">${editable ? esc(value) : ''}</span>`;
  };

  const jobRows = parseJcJobs(item.jobDescriptionLog ?? '');
  const rowCount = Math.max(JC_JOB_ROWS, jobRows.length);
  const bodyRows = editable
    ? Array.from({ length: rowCount }, (_, index) => {
        const row = jobRows[index];
        return (
          `<tr><td class="no">${index + 1}</td>` +
          `<td data-col="dt"${edit}>${esc(row?.dateTime ?? '')}</td>` +
          `<td data-col="ds"${edit}>${esc(row?.description ?? '')}</td></tr>`
        );
      }).join('')
    : '';

  return `<main class="jc-paper${editable ? ' jc-edit' : ''}">
    <header class="jc-head">
      <div class="jc-logo"><img src="https://hidup-baru.com/wp-content/uploads/2023/04/cropped-HBPA.png" alt="Hidup Baru" referrerpolicy="no-referrer"></div>
      <div class="jc-title">JOB COMPLETION REPORT</div>
      <div></div>

      <div class="jc-sign-block">
        <div class="lbl">REPORTED BY</div><div class="lbl">:</div>
        ${text('reportedBy', item.reportedBy ?? '')}
        <div class="lbl">SIGNATURE</div><div class="lbl">:</div>
        <div${id('reported-ttd')} class="jc-sign-box">${editable ? '' : ''}</div>
      </div>
    </header>

    <section class="jc-info">
      <div class="lbl">Job Name</div><div>:</div>${text('jobName', item.jobName ?? '')}
      <div class="lbl">Job No.</div><div>:</div>${text('jobNo', item.jobNo ?? '')}
      <div class="lbl">Location</div><div>:</div>${text('location', item.location ?? '')}
      <div class="lbl">Date &amp; Time</div><div>:</div>${text('dateTime', item.dateTime ?? '')}

      <div class="lbl">Manpower Name / Classification</div><div>:</div>
      <div class="jc-mp"><span class="n">1)</span>${mp(1, 'name', 'line')}<span class="slash">/</span>${mp(1, 'classification', 'line')}</div>
      <div></div><div>:</div>
      <div class="jc-mp"><span class="n">2)</span>${mp(2, 'name', 'line')}<span class="slash">/</span>${mp(2, 'classification', 'line')}</div>
      <div></div><div>:</div>
      <div class="jc-mp"><span class="n">3)</span>${mp(3, 'name', 'line')}<span class="slash">/</span>${mp(3, 'classification', 'line')}</div>
      <div></div><div>:</div>
      <div class="jc-mp"><span class="n">4)</span>${mp(4, 'name', 'line')}<span class="slash">/</span>${mp(4, 'classification', 'line')}</div>
    </section>

    <table class="jc-jobs">
      <colgroup><col style="width:17mm"><col style="width:40mm"><col></colgroup>
      <thead><tr><th>No</th><th>Date &amp; Time</th><th>Job Description</th></tr></thead>
      <tbody${id('jobRows')}>${bodyRows}</tbody>
    </table>

    <section class="jc-enduser">
      <div class="jc-eu-left">
        <div class="jc-eu-title">END USER</div>
        <div class="jc-eu-name">NAME : ${text('endUserName', item.endUserName ?? '', 'jc-inline', 'span')}</div>
        <div class="jc-eu-sign">SIGN :<div${id('endUser-ttd')} class="jc-eu-ttd"></div></div>
        <div class="jc-eu-pos">POSITION : ${text('endUserPosition', item.endUserPosition ?? '', 'jc-inline', 'span')}</div>
      </div>
      <div></div>
    </section>
  </main>`;
}
