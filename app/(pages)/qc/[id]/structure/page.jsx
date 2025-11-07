"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import { useLanguage } from "@/contexts/LanguageContext";
import { ArrowLeft } from "lucide-react";

export default function QCStructurePage({ params }) {
  const { language } = useLanguage();
  const resolvedParams = React.use(params);
  const id = String(resolvedParams?.id || "");

  const [activeTab, setActiveTab] = useState("cut_edge");
  const [header, setHeader] = useState({ remark: "" });
  const [rows, setRows] = useState([{ id: 1 }]);
  const storageKey = `qc_structure_draft_${id}_${activeTab}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (saved) {
        setHeader(saved.header || header);
        setRows(Array.isArray(saved.rows) && saved.rows.length ? saved.rows : rows);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    const payload = { header, rows };
    try { localStorage.setItem(storageKey, JSON.stringify(payload)); } catch {}
  }, [header, rows, storageKey]);

  const addRow = () => setRows(prev => [...prev, { id: Date.now() }]);
  const removeRow = (rid) => setRows(prev => prev.filter(r => r.id !== rid));
  const setRow = (rid, key, value) => setRows(prev => prev.map(r => r.id === rid ? { ...r, [key]: value } : r));

  const tolerance = useMemo(() => ({ width: 2, height: 2, thick: 1 }), []);
  const outTol = (key, val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return false;
    if (key === 'width') return Math.abs(n) > tolerance.width;
    if (key === 'height') return Math.abs(n) > tolerance.height;
    if (key === 'thickness') return Math.abs(n) > tolerance.thick;
    return false;
  };

  const save = async () => {
      const payload = {
      formType: activeTab, 
      header: {
        remark: header.remark
      }, 
      rows 
    };
    const resp = await fetch(`/api/tickets/${encodeURIComponent(id)}/qc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (resp.ok) {
      try { localStorage.removeItem(storageKey); } catch {}
      alert(language === 'th' ? 'บันทึกเรียบร้อย' : 'Saved');
      } else {
      const j = await resp.json().catch(() => ({}));
      alert(`Save failed: ${j?.error || resp.status}`);
    }
  };

  const TabBtn = ({ id: tabId, th, en }) => (
    <button onClick={() => setActiveTab(tabId)} className={`px-3 py-2 rounded-md text-sm ${activeTab === tabId ? 'bg-emerald-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200'}`}>
      {language === 'th' ? th : en}
    </button>
  );

  return (
    <ProtectedRoute>
      <RoleGuard pagePath="/qc">
        <div className="min-h-screen p-4 sm:p-6 md:p-8">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-4 mb-4">
              <Link 
                href={`/qc/${id}`} 
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                {language === 'th' ? 'ย้อนกลับ' : 'Back'}
              </Link>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold mb-4">{language === 'th' ? 'ตรวจสอบโครง - ตั๋ว' : 'Structure Inspection - Ticket'} #{id}</h1>

            <div className="flex gap-2 mb-4">
              <TabBtn id="cut_edge" th="ตัดขอบบาน" en="Cut Edge" />
              <TabBtn id="shoot_frame" th="การยิงโครง" en="Shoot Frame" />
              <TabBtn id="press_glue" th="การอัดกาว" en="Press Glue" />
            </div>


            {activeTab === 'cut_edge' && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 border">เวลา</th>
                      <th className="p-2 border">โครงการ</th>
                      <th className="p-2 border">เลขที่ผลิต</th>
                      <th className="p-2 border">จำนวนสุ่ม</th>
                      <th className="p-2 border">จำนวนจริง</th>
                      <th className="p-2 border">กว้าง ±2mm</th>
                      <th className="p-2 border">สูง ±2mm</th>
                      <th className="p-2 border">หนา ±1mm</th>
                      <th className="p-2 border">คุณภาพการตัด</th>
                      <th className="p-2 border"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td className="p-1 border"><input className="w-full px-2 py-1" value={r.time || ''} onChange={e => setRow(r.id, 'time', e.target.value)} /></td>
                        <td className="p-1 border"><input className="w-full px-2 py-1" value={r.project || ''} onChange={e => setRow(r.id, 'project', e.target.value)} /></td>
                        <td className="p-1 border"><input className="w-full px-2 py-1" value={r.productionNo || ''} onChange={e => setRow(r.id, 'productionNo', e.target.value)} /></td>
                        <td className="p-1 border"><input type="number" className="w-full px-2 py-1" value={r.sampleQty || ''} onChange={e => setRow(r.id, 'sampleQty', e.target.value)} /></td>
                        <td className="p-1 border"><input type="number" className="w-full px-2 py-1" value={r.actualQty || ''} onChange={e => setRow(r.id, 'actualQty', e.target.value)} /></td>
                        <td className={`p-1 border ${outTol('width', r.width) ? 'bg-red-100' : ''}`}><input type="number" className="w-full px-2 py-1" value={r.width || ''} onChange={e => setRow(r.id, 'width', e.target.value)} /></td>
                        <td className={`p-1 border ${outTol('height', r.height) ? 'bg-red-100' : ''}`}><input type="number" className="w-full px-2 py-1" value={r.height || ''} onChange={e => setRow(r.id, 'height', e.target.value)} /></td>
                        <td className={`p-1 border ${outTol('thickness', r.thickness) ? 'bg-red-100' : ''}`}><input type="number" className="w-full px-2 py-1" value={r.thickness || ''} onChange={e => setRow(r.id, 'thickness', e.target.value)} /></td>
                        <td className="p-1 border">
                          <select className="w-full px-2 py-1" value={r.cutQuality || ''} onChange={e => setRow(r.id, 'cutQuality', e.target.value)}>
                            <option value="">-</option>
                            <option value="pass">ผ่าน</option>
                            <option value="fail">ไม่ผ่าน</option>
                          </select>
                        </td>
                        <td className="p-1 border text-right"><button className="px-2 py-1 text-red-600" onClick={() => removeRow(r.id)}>ลบ</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-2 bg-gray-100 rounded" onClick={addRow}>เพิ่มแถว</button>
        </div>
                
                {/* หมายเหตุ */}
                <div className="mt-4">
                  <label className="block text-sm font-medium mb-2">{language === 'th' ? 'หมายเหตุ' : 'Remark'}</label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md" 
                    rows="3"
                    value={header.remark} 
                    onChange={e => setHeader({ ...header, remark: e.target.value })}
                    placeholder={language === 'th' ? 'กรอกหมายเหตุเพิ่มเติม...' : 'Enter additional remarks...'}
                  />
                </div>
                
                {/* ปุ่มบันทึก */}
                <div className="mt-4">
                  <button className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-medium" onClick={save}>
                    {language === 'th' ? 'บันทึก' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'shoot_frame' && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 border">เวลา</th>
                      <th className="p-2 border">โครงการ</th>
                      <th className="p-2 border">เลขที่ผลิต</th>
                      <th className="p-2 border">ช่าง</th>
                      <th className="p-2 border">จำนวนสุ่ม</th>
                      <th className="p-2 border">จำนวนจริง</th>
                      <th className="p-2 border">กว้าง</th>
                      <th className="p-2 border">สูง</th>
                      <th className="p-2 border">ฉาก</th>
                      <th className="p-2 border">ไม้ตั้ง</th>
                      <th className="p-2 border">ไม้นอน</th>
                      <th className="p-2 border">ล็อคบล็อค</th>
                      <th className="p-2 border"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td className="p-1 border"><input className="w-full px-2 py-1" value={r.time || ''} onChange={e => setRow(r.id, 'time', e.target.value)} /></td>
                        <td className="p-1 border"><input className="w-full px-2 py-1" value={r.project || ''} onChange={e => setRow(r.id, 'project', e.target.value)} /></td>
                        <td className="p-1 border"><input className="w-full px-2 py-1" value={r.productionNo || ''} onChange={e => setRow(r.id, 'productionNo', e.target.value)} /></td>
                        <td className="p-1 border"><input className="w-full px-2 py-1" value={r.technician || ''} onChange={e => setRow(r.id, 'technician', e.target.value)} /></td>
                        <td className="p-1 border"><input type="number" className="w-full px-2 py-1" value={r.sampleQty || ''} onChange={e => setRow(r.id, 'sampleQty', e.target.value)} /></td>
                        <td className="p-1 border"><input type="number" className="w-full px-2 py-1" value={r.actualQty || ''} onChange={e => setRow(r.id, 'actualQty', e.target.value)} /></td>
                        <td className="p-1 border"><input type="number" className="w-full px-2 py-1" value={r.width || ''} onChange={e => setRow(r.id, 'width', e.target.value)} /></td>
                        <td className="p-1 border"><input type="number" className="w-full px-2 py-1" value={r.height || ''} onChange={e => setRow(r.id, 'height', e.target.value)} /></td>
                        <td className="p-1 border">
                          <select className="w-full px-2 py-1" value={r.angleOk ?? ''} onChange={e => setRow(r.id, 'angleOk', e.target.value === 'true')}> 
                            <option value="">-</option>
                            <option value="true">ฉาก</option>
                            <option value="false">ไม่ฉาก</option>
                          </select>
                        </td>
                        <td className="p-1 border"><input type="number" className="w-full px-2 py-1" value={r.frameUpright || ''} onChange={e => setRow(r.id, 'frameUpright', e.target.value)} /></td>
                        <td className="p-1 border"><input type="number" className="w-full px-2 py-1" value={r.frameHorizontal || ''} onChange={e => setRow(r.id, 'frameHorizontal', e.target.value)} /></td>
                        <td className="p-1 border"><input type="number" className="w-full px-2 py-1" value={r.lockBlock || ''} onChange={e => setRow(r.id, 'lockBlock', e.target.value)} /></td>
                        <td className="p-1 border text-right"><button className="px-2 py-1 text-red-600" onClick={() => removeRow(r.id)}>ลบ</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-2 bg-gray-100 rounded" onClick={addRow}>เพิ่มแถว</button>
        </div>

                {/* หมายเหตุ */}
                <div className="mt-4">
                  <label className="block text-sm font-medium mb-2">{language === 'th' ? 'หมายเหตุ' : 'Remark'}</label>
                  <textarea 
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md" 
                    rows="3"
                    value={header.remark} 
                    onChange={e => setHeader({ ...header, remark: e.target.value })}
                    placeholder={language === 'th' ? 'กรอกหมายเหตุเพิ่มเติม...' : 'Enter additional remarks...'}
                  />
                </div>
                
                {/* ปุ่มบันทึก */}
                <div className="mt-4">
                  <button className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-medium" onClick={save}>
                    {language === 'th' ? 'บันทึก' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'press_glue' && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm border">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="p-2 border">โครงการ</th>
                      <th className="p-2 border">เลขที่ผลิต</th>
                      <th className="p-2 border">เวลาเริ่มอัด</th>
                      <th className="p-2 border">เวลาหลังอัด</th>
                      <th className="p-2 border">แรงอัด</th>
                      <th className="p-2 border">อุณหภูมิ</th>
                      <th className="p-2 border">ชนิดกาว</th>
                      <th className="p-2 border">หมายเหตุ</th>
                      <th className="p-2 border"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td className="p-1 border"><input className="w-full px-2 py-1" value={r.project || ''} onChange={e => setRow(r.id, 'project', e.target.value)} /></td>
                        <td className="p-1 border"><input className="w-full px-2 py-1" value={r.productionNo || ''} onChange={e => setRow(r.id, 'productionNo', e.target.value)} /></td>
                        <td className="p-1 border"><input className="w-full px-2 py-1" value={r.time || ''} onChange={e => setRow(r.id, 'time', e.target.value)} placeholder="เริ่มอัด" /></td>
                        <td className="p-1 border"><input className="w-full px-2 py-1" value={r.timeAfter || ''} onChange={e => setRow(r.id, 'timeAfter', e.target.value)} placeholder="หลังอัด" /></td>
                        <td className="p-1 border"><input type="number" className="w-full px-2 py-1" value={r.pressForce || ''} onChange={e => setRow(r.id, 'pressForce', e.target.value)} /></td>
                        <td className="p-1 border"><input type="number" className="w-full px-2 py-1" value={r.temperature || ''} onChange={e => setRow(r.id, 'temperature', e.target.value)} /></td>
                        <td className="p-1 border"><input className="w-full px-2 py-1" value={r.glueType || ''} onChange={e => setRow(r.id, 'glueType', e.target.value)} /></td>
                        <td className="p-1 border"><input className="w-full px-2 py-1" value={r.note || ''} onChange={e => setRow(r.id, 'note', e.target.value)} /></td>
                        <td className="p-1 border text-right"><button className="px-2 py-1 text-red-600" onClick={() => removeRow(r.id)}>ลบ</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 flex gap-2">
                  <button className="px-3 py-2 bg-gray-100 rounded" onClick={addRow}>เพิ่มแถว</button>
            </div>
            
                {/* หมายเหตุ */}
                <div className="mt-4">
                  <label className="block text-sm font-medium mb-2">{language === 'th' ? 'หมายเหตุ' : 'Remark'}</label>
              <textarea
                    className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-md" 
                rows="3"
                    value={header.remark} 
                    onChange={e => setHeader({ ...header, remark: e.target.value })}
                    placeholder={language === 'th' ? 'กรอกหมายเหตุเพิ่มเติม...' : 'Enter additional remarks...'}
              />
        </div>

        {/* ปุ่มบันทึก */}
                <div className="mt-4">
                  <button className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-medium" onClick={save}>
                    {language === 'th' ? 'บันทึก' : 'Save'}
          </button>
        </div>
              </div>
            )}
      </div>
    </div>
      </RoleGuard>
    </ProtectedRoute>
  );
}


