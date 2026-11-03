/**
 * Manpower Requisition — daftar, edit, dan cetak A5.
 */

import { manpowerApi, parseManpowerLines } from "./api";
import { createManpowerPage } from "./page";
import type { ManpowerRequest } from "./types";
import { esc, print, icon } from "../ui";

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
    return `<tr class="border-t border-surface-100 align-top hover:bg-surface-50/60">
      <td class="px-4 py-3 text-sm whitespace-nowrap">${esc(item.requestedDate || item.timestamp || "-")}</td>
      <td class="px-4 py-3 text-sm"><div class="font-semibold">${esc(item.requesterName || "-")}</div><div class="text-[11px] text-surface-400">${esc(item.requesterEmail || "")}</div></td>
      <td class="px-4 py-3 text-sm"><div>${esc(item.department || "-")}</div><div class="text-[11px] text-surface-400">${esc(item.division || "")}</div></td>
      <td class="px-4 py-3 text-sm">${esc(requiredClass(item))}</td>
      <td class="px-4 py-3 text-sm max-w-xs"><div class="line-clamp-2">${esc(outlineSummary(item))}</div></td>
      <td class="px-4 py-3 text-right whitespace-nowrap"><button class="btn-amber" data-action="mr-request-open" data-id="${item.rowId}">${icon("edit", "h-3.5 w-3.5")} Detail</button></td>
    </tr>`;
  },
  renderCard(item) {
    return `<div class="card p-4">
      <div class="flex items-start justify-between gap-2"><div><div class="text-xs font-bold uppercase text-primary-700">${esc(item.requestedDate || "-")}</div><h4 class="mt-1 font-bold">${esc(item.requesterName || "-")}</h4><p class="text-xs text-surface-500">${esc(item.department || "-")}${item.division ? ` · ${esc(item.division)}` : ""}</p></div><button class="btn-amber" data-action="mr-request-open" data-id="${item.rowId}">Detail</button></div>
      <div class="mt-3 text-xs"><span class="font-bold">Manpower:</span> ${esc(requiredClass(item))}</div>
      <div class="mt-2 text-xs text-surface-600">${esc(outlineSummary(item))}</div>
    </div>`;
  },

  drawerTitle(item) {
    return `Manpower Requisition — ${item.requesterName || `Baris ${item.rowId}`}`;
  },
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

    return `<style>
      .mpr-drawer{font-family:Calibri,Carlito,"Segoe UI",Arial,sans-serif;font-size:8.5pt;color:#000;display:flex;justify-content:center}
      .mpr-drawer .sheet-a5{width:148mm;min-height:205mm;background:#fff;padding:6mm 0 0 0;border:1.2px solid #000;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden}
      .mpr-drawer .content-pad{padding:0 7mm}
      
      /* Header & Logo diperkecil */
      .mpr-drawer .head{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:9mm;margin-bottom:7mm}
      .mpr-drawer .logo img{height:8.5mm;width:auto;max-width:26mm;object-fit:contain}
      .mpr-drawer .title{text-align:center;white-space:nowrap;font-size:11pt;font-weight:800;text-decoration:underline;text-underline-offset:0.8mm}
      
      .mpr-edit-line{min-height:1.35em;border-bottom:1px dotted #000;padding:0 1mm;line-height:1.3;outline:none}
      .mpr-edit-inline{display:inline-block;min-width:22mm;border-bottom:1px dotted #000;padding:0 1mm;line-height:1.3;outline:none}
      
      /* Jarak isi dari header (margin ditingkatkan) */
       .mpr-drawer .info{display:grid;grid-template-columns:36mm 2mm 1fr;row-gap:2.4mm;margin:2mm 0 0 2mm;align-items:end}
      .mpr-drawer .lbl{font-weight:800;font-size:8pt;text-transform:uppercase}
      .mpr-drawer .opts{font-style:italic;font-weight:700;text-transform:uppercase;font-size:8pt;display:flex;align-items:center;gap:0.6mm;flex-wrap:wrap}
      .mpr-drawer .opt{display:inline-block;padding:0.2mm 1.6mm;border:1.2px solid transparent;border-radius:10mm;cursor:pointer;user-select:none}
      .mpr-drawer .opt.sel{border-color:#000}
      
      /* Jarak antar bagian disesuaikan agar lebih lega */
      .mpr-drawer .ol-title{margin:4mm 0 1.6mm 2mm;font-weight:800;font-size:8pt;text-transform:uppercase}
      .mpr-drawer .ol{display:grid;grid-template-columns:6mm 1fr;row-gap:1.4mm;margin:0 0 0 1mm;align-items:start}
      .mpr-drawer .ol .n{text-align:right;padding-right:1mm;font-weight:600;user-select:none;align-self:start;margin-top:0.1mm}
      .mpr-drawer .mpr-outline-cell{min-height:3.4mm;line-height:1.16;white-space:normal;word-break:break-word;overflow-wrap:anywhere;border-bottom:1px dotted #000;padding:0 1mm 0.05mm 1mm;outline:none;align-self:start}
      
      /* Kolom Tanda Tangan */
      .mpr-drawer .approval{margin-top:auto;width:100%;display:grid;grid-template-columns:repeat(3,1fr);border-top:1.2px solid #000}
      .mpr-drawer .approval .col{border-right:1.2px solid #000;display:flex;flex-direction:column}
      .mpr-drawer .approval .col:last-child{border-right:0}
      .mpr-drawer .approval .hd{text-align:center;font-weight:700;height:5.6mm;line-height:5.6mm;border-bottom:1.2px solid #000;font-size:8pt}
      .mpr-drawer .approval .box{height:16mm}
      .mpr-drawer .approval .nm{border-top:1.2px solid #000;padding:0.6mm 1.2mm 0.8mm;line-height:4.6mm;font-size:7.6pt}
      .mpr-drawer [contenteditable]:focus{outline:1.5px solid #2563eb;outline-offset:1px;background:#fffbe6}
    </style>
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
              <span class="opt ${isSel("Electrical")}" data-opt="Electrical" tabindex="0">Electrical</span>/
              <span class="opt ${isSel("Civil")}" data-opt="Civil" tabindex="0">Civil</span>/
              <span class="opt ${isSel("Mechanical")}" data-opt="Mechanical" tabindex="0">Mechanical</span>
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
    return `<button class="btn-slate px-4 py-2 text-red-600" data-action="mr-request-delete" data-id="${item.rowId}">Hapus</button>
      <div class="flex flex-wrap gap-2">
        <button class="btn-slate px-4 py-2" data-action="mr-request-print" data-id="${item.rowId}">Cetak A5</button>
        <button class="btn-primary" data-action="mr-request-save" data-id="${item.rowId}">Simpan Perubahan</button>
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
