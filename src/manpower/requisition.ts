/**
 * Manpower Requisition — daftar, edit, dan cetak A5.
 */

import { manpowerApi, parseManpowerLines } from "./api";
import { createManpowerPage } from "./page";
import type { ManpowerRequest } from "./types";
import { actionBtn, actionCell, cardActions, esc, print, toast } from "../ui";
import "../styles/manpower.css";

const SEARCH_ID = "mr-search";
const COUNT_ID = "mr-count";
const TABLE_ID = "mr-tbody";

const state = { items: [] as ManpowerRequest[] };

function requiredClass(item: ManpowerRequest): string {
  return item.requiredManpower || "-";
}

function outlineSummary(item: ManpowerRequest): string {
  const first = parseManpowerLines(item.jobOutline)[0] ?? "";
  return first || "-";
}

let fullSheetAt = 0;

function caretToEnd(el: HTMLElement): void {
  try {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  } catch {
    // Selection tidak tersedia (mis. jsdom); posisi kursor tidak penting.
  }
}

/**
 * Kunci editor ke tinggi A5. Kalau ketikan membuat isi melewati area yang
 * tersedia, karakter terakhir dibatalkan supaya lembar tidak pernah meluber
 * (dan tidak pernah jadi halaman kedua saat dicetak).
 */
function lockSheetToA5(): void {
  const content = document.querySelector<HTMLElement>('#drawer .mpr-drawer .content-pad');
  if (!content) return;

  // Data lama bisa saja sudah melebihi A5. Simpan besar luberannya supaya
  // user tetap bisa menghapus teks, tapi tidak bisa menambah lagi.
  let lastOverflow = Math.max(0, content.scrollHeight - content.clientHeight);

  document.querySelectorAll<HTMLElement>('#drawer .mpr-drawer .sheet-a5 [contenteditable]').forEach((el) => {
    let lastValid = el.innerHTML;

    el.addEventListener('input', () => {
      const overflow = content.scrollHeight - content.clientHeight;
      // Toleransi 2px untuk pembulatan mm ke px.
      if (overflow > 2 && overflow > lastOverflow + 1) {
        el.innerHTML = lastValid;
        caretToEnd(el);
        const now = Date.now();
        if (now - fullSheetAt > 1500) {
          fullSheetAt = now;
          toast('Lembar A5 sudah penuh. Hapus atau pendekkan teks dulu.', 'error');
        }
        return;
      }
      lastValid = el.innerHTML;
      lastOverflow = Math.max(0, overflow);
    });
  });
}

export const manpowerRequisitionPage = createManpowerPage<ManpowerRequest>({
  title: "Manpower Requisition",
  icon: "file",
  description: "Permintaan manpower dari Google Form, dikelola oleh admin.",
  searchPlaceholder: "Cari nama, departemen, divisi, manpower, atau pekerjaan...",
  searchId: SEARCH_ID,
  countId: COUNT_ID,
  tableId: TABLE_ID,
  columns: [{ label: "Tanggal" }, { label: "Requester" }, { label: "Department / Division" }, { label: "Manpower" }, { label: "Job Outline" }, { label: "Aksi", className: "px-4 py-3.5 text-right whitespace-nowrap" }],
  list: () => manpowerApi.listRequests({ pageSize: 100 }).then((r) => r.items),
  get: (rowId) => manpowerApi.getRequest(rowId),
  save: (rowId, sig, patch) => manpowerApi.saveRequest(rowId, sig, patch),
  remove: (rowId, sig) => manpowerApi.deleteRequest(rowId, sig),
  distribute: (items) => {
    state.items = items;
  },

  renderRow(item) {
    return `<tr class="cursor-pointer border-t border-surface-100 align-top hover:bg-surface-50/60" data-action="detail" data-id="${item.rowId}">
      <td class="px-4 py-3 text-sm whitespace-nowrap">${esc(item.requestedDate || item.timestamp || "-")}</td>
      <td class="px-4 py-3 text-sm"><div class="font-semibold">${esc(item.requesterName || "-")}</div><div class="text-[11px] text-surface-400">${esc(item.requesterEmail || "")}</div></td>
      <td class="px-4 py-3 text-sm"><div>${esc(item.department || "-")}</div><div class="text-[11px] text-surface-400">${esc(item.division || "")}</div></td>
      <td class="px-4 py-3 text-sm">${esc(requiredClass(item))}</td>
      <td class="px-4 py-3 text-sm max-w-xs"><div class="line-clamp-2">${esc(outlineSummary(item))}</div></td>
      ${actionCell(
        actionBtn('detail', { id: item.rowId }),
        actionBtn('print', { id: item.rowId }),
        actionBtn('delete', { id: item.rowId }),
      )}
    </tr>`;
  },
  renderCard(item) {
    return `<div class="card cursor-pointer p-4" data-action="detail" data-id="${item.rowId}">
      <div class="flex items-start justify-between gap-2"><div><div class="text-xs font-bold uppercase text-primary-700">${esc(item.requestedDate || "-")}</div><h4 class="mt-1 font-bold">${esc(item.requesterName || "-")}</h4><p class="text-xs text-surface-500">${esc(item.department || "-")}${item.division ? ` · ${esc(item.division)}` : ""}</p></div></div>
      <div class="mt-3 text-xs"><span class="font-bold">Manpower:</span> ${esc(requiredClass(item))}</div>
      <div class="mt-2 text-xs text-surface-600">${esc(outlineSummary(item))}</div>
      ${cardActions(
        actionBtn('detail', { id: item.rowId }),
        actionBtn('print', { id: item.rowId }),
        actionBtn('delete', { id: item.rowId }),
      )}
    </div>`;
  },

  drawerTitle(item) {
    return `Manpower Requisition — ${item.requesterName || `Baris ${item.rowId}`}`;
  },
  // Panel dibuat pas selebar lembar A5; 'md' memotong kolom tanda tangan
  // paling kanan, sedangkan 'xl' menyisakan ruang kosong terlalu banyak.
  drawerSize: 'a5',
  afterOpen: lockSheetToA5,
  drawerBody(item) {
    const chosen = (item.requiredManpower || "")
      .split(/[,/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const isSel = (v: string) => (chosen.includes(v) ? "sel" : "");
    const line = (id: string, val: string) => `<div id="${esc(id)}" class="mpr-edit-line" contenteditable spellcheck="false">${esc(val || "")}</div>`;
    const inline = (id: string, val: string) => `<span id="${esc(id)}" class="mpr-edit-inline" contenteditable spellcheck="false">${esc(val || "")}</span>`;

    // Deklarasi 10 baris outline
    const lines = parseManpowerLines(item.jobOutline);
    let outlineRowsHtml = "";
    for (let i = 1; i <= 10; i++) {
      const val = (lines[i - 1] || "").replace(/^\s*\d+\.\s*/, "");
      outlineRowsHtml += `<div class="n">${i}.</div><div class="mpr-outline-cell" contenteditable spellcheck="false" data-index="${i - 1}">${esc(val)}</div>`;
    }

    return `
    <div class="mpr-drawer">
      <div class="sheet-a5">
        <div class="content-pad">
          <header class="head">
            <div class="logo"><img src="https://hidup-baru.com/wp-content/uploads/2023/04/cropped-HBPA.png" alt="Hidup Baru" referrerpolicy="no-referrer"></div>
            <div class="title">MANPOWER REQUISITION FORM</div>
            <div></div>
          </header>
          <section class="info">
            <div class="lbl">* Department</div><div>:</div>${line("mr-r-department", item.department)}
            <div class="lbl">* Division</div><div>:</div>${line("mr-r-division", item.division)}
            <div class="lbl">* Requested Date</div><div>:</div>${line("mr-r-requestedDate", item.requestedDate)}
            <div class="lbl">* Required Manpower</div><div>:</div>
            <div class="opts">
              <span class="opt ${isSel("Electrical")}" data-opt="Electrical" data-action="opt" tabindex="0">Electrical</span>/
              <span class="opt ${isSel("Civil")}" data-opt="Civil" data-action="opt" tabindex="0">Civil</span>/
              <span class="opt ${isSel("Mechanical")}" data-opt="Mechanical" data-action="opt" tabindex="0">Mechanical</span>
            </div>
          </section>
          <div class="ol-title">* Job Out Line / Short Description</div>
          <section class="ol" id="mr-r-outline">
            ${outlineRowsHtml}
          </section>
        </div>
        
        <footer class="approval">
          <div class="col">
            <div class="hd">Approved by:</div><div class="box"></div>
            <div class="nm">Name : ${inline("mr-r-approvedName", "")}<br>Date : ${inline("mr-r-approvedDate", "")}</div>
          </div>
          <div class="col">
            <div class="hd">Acknowledged by:</div><div class="box"></div>
            <div class="nm">Name : ${inline("mr-r-ackName", "")}<br>Date : ${inline("mr-r-ackDate", "")}</div>
          </div>
          <div class="col">
            <div class="hd">Requested by:</div><div class="box"></div>
            <div class="nm">Name : ${inline("mr-r-requesterName", item.requesterName)}<br>Date : ${inline("mr-r-requesterDate", item.requestedDate || "")}</div>
          </div>
        </footer>
      </div>
      <input type="hidden" id="mr-r-timestamp" value="${esc(item.timestamp || "")}">
      <input type="hidden" id="mr-r-requesterEmail" value="${esc(item.requesterEmail || "")}">
      <input type="hidden" id="mr-r-requiredManpower" value="${esc(item.requiredManpower || "")}">
    </div>`;
  },
  patchFromDrawer() {
    const getText = (id: string) => (document.getElementById(id) as HTMLElement | null)?.textContent ?? "";
    const value = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? "";

    const chosen: string[] = [];
    document.querySelectorAll(".mpr-drawer .opt.sel").forEach((el) => {
      const v = el.getAttribute("data-opt");
      if (v) chosen.push(v);
    });

    const outlineLines: string[] = [];
    document.querySelectorAll(".mpr-outline-cell").forEach((cell) => {
      const t = (cell.textContent || "").replace(/^\s*\d+\.\s*/, "");
      outlineLines.push(t);
    });

    while (outlineLines.length && outlineLines[outlineLines.length - 1] === "") {
      outlineLines.pop();
    }

    return {
      requestedDate: getText("mr-r-requestedDate").trim(),
      timestamp: value("mr-r-timestamp").trim(),
      requesterName: getText("mr-r-requesterName").trim(),
      requesterEmail: value("mr-r-requesterEmail").trim(),
      department: getText("mr-r-department").trim(),
      division: getText("mr-r-division").trim(),
      requiredManpower: chosen.join(", "),
      jobOutline: outlineLines.map((s, idx) => `${idx + 1}. ${s}`).join("\n"),
    };
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
      { key: "approved", label: "Approved by", role: "Approver", required: true },
      { key: "acknowledged", label: "Acknowledged by", role: "Acknowledger" },
      { key: "requested", label: "Requested by", role: "Requester", prefillName: item.requesterName, required: true },
    ];
  },
  signatureTitle: "Tanda Tangan Manpower Requisition",
  print(item, signatures) {
    print.show("manpower-requisition");
    print.set("mpr-requestedDate", item.requestedDate);
    print.set("mpr-department", item.department);
    print.set("mpr-division", item.division);
    print.set("mpr-requiredManpower", item.requiredManpower);
    print.set("mpr-requestedName", signatures.requested?.name || item.requesterName);
    print.set("mpr-approvedName", signatures.approved?.name || "");
    print.set("mpr-ackName", signatures.acknowledged?.name || "");
    print.set("mpr-approvedDate", item.requestedDate);
    print.set("mpr-ackDate", item.requestedDate);
    print.set("mpr-requestedDate2", item.requestedDate);
    print.setHtml("mpr-approved-ttd", signatures.approved?.image ? `<img src="${signatures.approved.image}" alt="" style="height:42px">` : "");
    print.setHtml("mpr-ack-ttd", signatures.acknowledged?.image ? `<img src="${signatures.acknowledged.image}" alt="" style="height:42px">` : "");
    print.setHtml("mpr-requested-ttd", signatures.requested?.image ? `<img src="${signatures.requested.image}" alt="" style="height:42px">` : "");

    const outline = parseManpowerLines(item.jobOutline).map((s) => s.replace(/^\s*\d+\.\s*/, ""));
    for (let i = 1; i <= 10; i++) print.set(`mpr-outline-${i}`, outline[i - 1] ?? "");
    print.run();
  },
});

export const manpowerRequisitionPageTitle = manpowerRequisitionPage.title;
