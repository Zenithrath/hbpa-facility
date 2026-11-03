/**
 * Manpower Requisition — daftar, edit, dan cetak A5.
 */

import { manpowerApi, parseManpowerLines } from './api';
import { createManpowerPage } from './page';
import type { ManpowerRequest } from './types';
import { esc, print, icon } from '../ui';

const SEARCH_ID = 'mr-search';
const COUNT_ID = 'mr-count';
const TABLE_ID = 'mr-tbody';

const state = { items: [] as ManpowerRequest[] };

function requiredClass(item: ManpowerRequest): string {
  return item.requiredManpower || '-';
}

function outlineSummary(item: ManpowerRequest): string {
  const first = parseManpowerLines(item.jobOutline)[0] ?? '';
  return first || '-';
}

export const manpowerRequisitionPage = createManpowerPage<ManpowerRequest>({
  title: 'Manpower Requisition',
  icon: 'file',
  description: 'Permintaan manpower dari Google Form, dikelola oleh admin.',
  searchPlaceholder: 'Cari nama, departemen, divisi, manpower, atau pekerjaan...',
  searchId: SEARCH_ID,
  countId: COUNT_ID,
  tableId: TABLE_ID,
  columns: [
    { label: 'Tanggal' },
    { label: 'Requester' },
    { label: 'Department / Division' },
    { label: 'Manpower' },
    { label: 'Job Outline' },
    { label: 'Aksi', className: 'px-4 py-3.5 text-right whitespace-nowrap' },
  ],
  list: () => manpowerApi.listRequests({ pageSize: 100 }).then((r) => r.items),
  get: (rowId) => manpowerApi.getRequest(rowId),
  save: (rowId, sig, patch) => manpowerApi.saveRequest(rowId, sig, patch),
  remove: (rowId, sig) => manpowerApi.deleteRequest(rowId, sig),
  distribute: (items) => { state.items = items; },

  renderRow(item) {
    return `<tr class="border-t border-surface-100 align-top hover:bg-surface-50/60">
      <td class="px-4 py-3 text-sm whitespace-nowrap">${esc(item.requestedDate || item.timestamp || '-')}</td>
      <td class="px-4 py-3 text-sm"><div class="font-semibold">${esc(item.requesterName || '-')}</div><div class="text-[11px] text-surface-400">${esc(item.requesterEmail || '')}</div></td>
      <td class="px-4 py-3 text-sm"><div>${esc(item.department || '-')}</div><div class="text-[11px] text-surface-400">${esc(item.division || '')}</div></td>
      <td class="px-4 py-3 text-sm">${esc(requiredClass(item))}</td>
      <td class="px-4 py-3 text-sm max-w-xs"><div class="line-clamp-2">${esc(outlineSummary(item))}</div></td>
      <td class="px-4 py-3 text-right whitespace-nowrap"><button class="btn-amber" data-action="mr-request-open" data-id="${item.rowId}">${icon('edit', 'h-3.5 w-3.5')} Detail</button></td>
    </tr>`;
  },
  renderCard(item) {
    return `<div class="card p-4">
      <div class="flex items-start justify-between gap-2"><div><div class="text-xs font-bold uppercase text-primary-700">${esc(item.requestedDate || '-')}</div><h4 class="mt-1 font-bold">${esc(item.requesterName || '-')}</h4><p class="text-xs text-surface-500">${esc(item.department || '-')}${item.division ? ` · ${esc(item.division)}` : ''}</p></div><button class="btn-amber" data-action="mr-request-open" data-id="${item.rowId}">Detail</button></div>
      <div class="mt-3 text-xs"><span class="font-bold">Manpower:</span> ${esc(requiredClass(item))}</div>
      <div class="mt-2 text-xs text-surface-600">${esc(outlineSummary(item))}</div>
    </div>`;
  },

  drawerTitle(item) { return `Manpower Requisition — ${item.requesterName || `Baris ${item.rowId}`}`; },
  drawerBody(item) {
    const outlineHtml = Array.from({ length: 10 }, (_, i) => `<div style="display:grid;grid-template-columns:9mm 1fr;gap:0;align-items:end;margin-bottom:2.4mm"><span style="text-align:right;padding-right:1.5mm;font-weight:600">${i + 1}.</span><div contenteditable data-ol="${i}" style="min-height:5mm;display:flex;align-items:flex-end;border-bottom:1px dotted #000;padding-bottom:.4mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc((item.jobOutline.split('\n')[i] ?? '').replace(/^\d+\.\s*/, ''))}</div></div>`).join('');

    const chosen = (item.requiredManpower || '').split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    const optHtml = ['Electrical', 'Civil', 'Mechanical'].map(m =>
      `<span class="opt ${chosen.includes(m) ? 'sel' : ''}" data-opt="${m}" tabindex="0" role="checkbox" aria-checked="${chosen.includes(m)}" style="display:inline-block;padding:0.4mm 2.6mm;border:1.4px solid transparent;border-radius:10mm;cursor:pointer;user-select:none;${chosen.includes(m) ? 'border-color:#000' : ''}">${m}</span>`
    ).join('/');

    return `<div style="font-family:Calibri,Carlito,'Segoe UI',Arial,sans-serif;font-size:10.5pt;color:#000;background:#fff;padding:10mm 12mm;border:1.4px solid #000;border-radius:4px">
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:18mm;margin-bottom:8mm">
        <div style="display:flex;align-items:center"><img src="https://hidup-baru.com/wp-content/uploads/2023/04/cropped-HBPA.png" alt="" style="height:16mm;width:auto;max-width:44mm;object-fit:contain" onerror="this.style.display='none'"></div>
        <div style="text-align:center;white-space:nowrap;font-size:16pt;font-weight:800;text-decoration:underline;text-underline-offset:1.2mm">MANPOWER REQUISITION FORM</div>
        <div></div>
      </div>
      <div style="display:grid;grid-template-columns:56mm 3mm 1fr;row-gap:4.2mm;margin:0 8mm 0 8mm;padding-right:4mm;align-items:end">
        <div style="font-weight:800;font-size:10pt;text-transform:uppercase">* Department</div><div>:</div><div contenteditable data-f="department" style="display:block;min-height:1.3em;padding:0 1mm;border-bottom:1px dotted #000">${esc(item.department)}</div>
        <div style="font-weight:800;font-size:10pt;text-transform:uppercase">* Division</div><div>:</div><div contenteditable data-f="division" style="display:block;min-height:1.3em;padding:0 1mm;border-bottom:1px dotted #000">${esc(item.division)}</div>
        <div style="font-weight:800;font-size:10pt;text-transform:uppercase">* Requested Date</div><div>:</div><div contenteditable data-f="requestedDate" style="display:block;min-height:1.3em;padding:0 1mm;border-bottom:1px dotted #000">${esc(item.requestedDate)}</div>
        <div style="font-weight:800;font-size:10pt;text-transform:uppercase">* Required Manpower</div><div>:</div>
        <div style="font-style:italic;font-weight:700;text-transform:uppercase;font-size:10pt;display:flex;align-items:center;gap:1mm">${optHtml}</div>
      </div>
      <div style="margin:6mm 0 2mm 8mm;font-weight:800;font-size:10pt;text-transform:uppercase">* Job Out Line / Short Description</div>
      <div style="display:grid;grid-template-columns:9mm 1fr;row-gap:2.4mm;margin:0 0 0 4mm;padding-right:2mm;align-items:end" id="mr-drawer-outline">${outlineHtml}</div>
      <div style="margin-top:8mm;display:grid;grid-template-columns:repeat(3,1fr);border-top:1.4px solid #000">
        <div style="border-right:1.4px solid #000;display:flex;flex-direction:column">
          <div style="text-align:center;font-weight:700;height:7.5mm;line-height:7.5mm;border-bottom:1.4px solid #000">Approved by:</div>
          <div style="height:31mm"></div>
          <div style="border-top:1.4px solid #000;padding:1mm 2mm 1.5mm;line-height:6.5mm">Name : <span style="display:inline-block;min-width:0;width:70%;border-bottom:1px dotted #000;padding:0 .5mm" contenteditable data-f="approvedName"></span><br>Date : <span style="display:inline-block;min-width:0;width:70%;border-bottom:1px dotted #000;padding:0 .5mm" contenteditable data-f="approvedDate"></span></div>
        </div>
        <div style="border-right:1.4px solid #000;display:flex;flex-direction:column">
          <div style="text-align:center;font-weight:700;height:7.5mm;line-height:7.5mm;border-bottom:1.4px solid #000">Acknowledged by:</div>
          <div style="height:31mm"></div>
          <div style="border-top:1.4px solid #000;padding:1mm 2mm 1.5mm;line-height:6.5mm">Name : <span style="display:inline-block;min-width:0;width:70%;border-bottom:1px dotted #000;padding:0 .5mm" contenteditable data-f="ackName"></span><br>Date : <span style="display:inline-block;min-width:0;width:70%;border-bottom:1px dotted #000;padding:0 .5mm" contenteditable data-f="ackDate"></span></div>
        </div>
        <div style="display:flex;flex-direction:column">
          <div style="text-align:center;font-weight:700;height:7.5mm;line-height:7.5mm;border-bottom:1.4px solid #000">Requested by:</div>
          <div style="height:31mm"></div>
          <div style="border-top:1.4px solid #000;padding:1mm 2mm 1.5mm;line-height:6.5mm">Name : <span style="display:inline-block;min-width:0;width:70%;border-bottom:1px dotted #000;padding:0 .5mm" contenteditable data-f="requesterName">${esc(item.requesterName)}</span><br>Date : <span style="display:inline-block;min-width:0;width:70%;border-bottom:1px dotted #000;padding:0 .5mm" contenteditable data-f="requesterDate">${esc(item.requestedDate)}</span></div>
        </div>
      </div>
      <script>
        setTimeout(function(){
          document.querySelectorAll('.opt').forEach(function(el){
            el.addEventListener('click',function(){ el.classList.toggle('sel'); el.setAttribute('aria-checked', el.classList.contains('sel')?'true':'false'); });
          });
        },0);
      </script>
    </div>`;
  },
  patchFromDrawer() {
    const value = (name: string) => {
      const el = document.querySelector('[data-f="' + name + '"]');
      return el ? (el.textContent || '').trim() : '';
    };
    const olCells = Array.from(document.querySelectorAll('#mr-drawer-outline .line'));
    const jobOutline = olCells.map((c, i) => {
      const t = (c.textContent || '').trim();
      return t ? (i + 1) + '. ' + t : '';
    }).filter(Boolean).join('\n');
    const manpower = Array.from(document.querySelectorAll('.opt.sel')).map(el => el.getAttribute('data-opt')).filter(Boolean).join(', ');
    return {
      department: value('department'),
      division: value('division'),
      requestedDate: value('requestedDate'),
      requiredManpower: manpower,
      jobOutline: jobOutline,
      requesterName: value('requesterName'),
      requesterEmail: '',
      timestamp: '',
    };
  },
  drawerFooter(item) {
    return `<button class="btn-slate px-4 py-2 text-red-600" data-action="mr-request-delete" data-id="${item.rowId}">Hapus</button>
      <div class="flex flex-wrap gap-2">
        <button class="btn-slate px-4 py-2" data-action="mr-request-print" data-id="${item.rowId}">Cetak A5</button>
        <button class="btn-primary" data-action="mr-request-save" data-id="${item.rowId}">Simpan Perubahan</button>
      </div>`;
  },

  signatureSlots(item) {
    return [
      { key: 'approved', label: 'Approved by', role: 'Approver', required: true },
      { key: 'acknowledged', label: 'Acknowledged by', role: 'Acknowledger' },
      { key: 'requested', label: 'Requested by', role: 'Requester', prefillName: item.requesterName, required: true },
    ];
  },
  signatureTitle: 'Tanda Tangan Manpower Requisition',
  print(item, signatures) {
    print.show('manpower-requisition');
    print.set('mpr-requestedDate', item.requestedDate);
    print.set('mpr-department', item.department);
    print.set('mpr-division', item.division);
    print.set('mpr-requiredManpower', item.requiredManpower);
    print.set('mpr-requestedName', signatures.requested?.name || item.requesterName);
    print.set('mpr-approvedName', signatures.approved?.name || '');
    print.set('mpr-ackName', signatures.acknowledged?.name || '');
    print.set('mpr-approvedDate', item.requestedDate);
    print.set('mpr-ackDate', item.requestedDate);
    print.set('mpr-requestedDate2', item.requestedDate);
    print.setHtml('mpr-approved-ttd', signatures.approved?.image ? `<img src="${signatures.approved.image}" alt="" style="height:42px">` : '');
    print.setHtml('mpr-ack-ttd', signatures.acknowledged?.image ? `<img src="${signatures.acknowledged.image}" alt="" style="height:42px">` : '');
    print.setHtml('mpr-requested-ttd', signatures.requested?.image ? `<img src="${signatures.requested.image}" alt="" style="height:42px">` : '');

    const outline = parseManpowerLines(item.jobOutline);
    for (let i = 1; i <= 10; i++) print.set(`mpr-outline-${i}`, outline[i - 1] ?? '');
    print.run();
  },
});

export const manpowerRequisitionPageTitle = manpowerRequisitionPage.title;
