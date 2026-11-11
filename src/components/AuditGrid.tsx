import React, { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ColDef,
  ICellRendererParams,
  ModuleRegistry,
  AllCommunityModule,
  ValidationModule,
  themeAlpine,
} from 'ag-grid-community';
import type { AuditRecord } from '../shared/types.ts';
import { Shield, Download, RefreshCw, CheckCircle, Clock, AlertTriangle, FileText } from 'lucide-react';

ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

interface Props {
  records: AuditRecord[];
  onRefresh: () => void;
  isRefreshing: boolean;
  onViewPassportRecord?: (record: AuditRecord) => void;
}

export const AuditGrid: React.FC<Props> = ({ records, onRefresh, isRefreshing, onViewPassportRecord }) => {
  const columnDefs = useMemo<ColDef<AuditRecord>[]>(() => [
    {
      headerName: 'Timestamp',
      field: 'timestamp',
      width: 165,
      pinned: 'left',
      valueFormatter: (p) => {
        if (!p.value) return '';
        const d = new Date(p.value);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString();
      },
    },
    {
      headerName: 'Item / Transaction Reference',
      field: 'productTitle',
      minWidth: 260,
      flex: 3,
      cellRenderer: (p: ICellRendererParams<AuditRecord>) => {
        const item = p.data;
        if (!item) return null;
        return (
          <div className="flex flex-col justify-center h-full py-1">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-semibold text-xs text-slate-900 truncate" title={item.productTitle}>
                {item.productTitle}
              </span>
              {item.subcategory && (
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded border border-slate-200 shrink-0 font-medium">
                  {item.subcategory}
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-mono">
              Req ID: {item.requirementId}
              {item.quantity && item.quantity > 1 ? ` &bull; Qty: ${item.quantity}` : ''}
            </span>
          </div>
        );
      },
    },
    {
      headerName: 'Amount',
      field: 'amount',
      width: 140,
      cellRenderer: (p: ICellRendererParams<AuditRecord>) => {
        const item = p.data;
        if (!item) return null;
        const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
        return (
          <div className="flex flex-col justify-center h-full">
            <span className="font-bold text-xs text-slate-900">
              {item.currency} {item.amount.toFixed(2)}
            </span>
            {qty > 1 && item.unitPrice && (
              <span className="text-[10px] text-slate-400">
                {qty} @ {item.currency} {item.unitPrice.toFixed(2)}
              </span>
            )}
          </div>
        );
      },
    },
    {
      headerName: 'Policy Decision',
      field: 'policyStatus',
      width: 125,
      cellRenderer: (p: ICellRendererParams<AuditRecord>) => {
        const status = p.value;
        const isPass = status === 'PASS';
        return (
          <div className="flex items-center h-full">
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                isPass
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-rose-50 text-rose-800 border-rose-300'
              }`}
            >
              {status}
            </span>
          </div>
        );
      },
    },
    {
      headerName: 'Ledger State',
      field: 'status',
      width: 140,
      cellRenderer: (p: ICellRendererParams<AuditRecord>) => {
        const st = p.value;
        if (st === 'CAPTURED') {
          return (
            <div className="flex items-center gap-1.5 h-full text-xs font-semibold text-emerald-700">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>CAPTURED</span>
            </div>
          );
        }
        if (st === 'ORDER_CREATED') {
          return (
            <div className="flex items-center gap-1.5 h-full text-xs font-semibold text-blue-700">
              <Clock className="w-3.5 h-3.5 text-blue-500 animate-spin" />
              <span>ORDER_CREATED</span>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-1.5 h-full text-xs font-medium text-slate-500">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{st}</span>
          </div>
        );
      },
    },
    {
      headerName: 'PayPal Order ID',
      field: 'paypalOrderId',
      width: 180,
      cellRenderer: (p: ICellRendererParams<AuditRecord>) => {
        const val = p.value;
        if (!val) return <span className="text-slate-400 text-xs italic">N/A</span>;
        return (
          <div className="flex items-center h-full">
            <code className="text-[11px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
              {val}
            </code>
          </div>
        );
      },
    },
    {
      headerName: 'Capture ID',
      field: 'paypalCaptureId',
      width: 180,
      cellRenderer: (p: ICellRendererParams<AuditRecord>) => {
        const val = p.value;
        if (!val) return <span className="text-slate-400 text-xs italic">—</span>;
        return (
          <div className="flex items-center h-full">
            <code className="text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
              {val}
            </code>
          </div>
        );
      },
    },
    {
      headerName: 'Verification Hash (SHA-256)',
      field: 'verificationHash',
      minWidth: 190,
      flex: 2,
      cellRenderer: (p: ICellRendererParams<AuditRecord>) => {
        const hash = p.value;
        if (!hash) return null;
        return (
          <div className="flex items-center h-full">
            <span className="font-mono text-[10px] text-slate-500 truncate" title={hash}>
              {hash}
            </span>
          </div>
        );
      },
    },
    {
      headerName: 'Passport',
      width: 105,
      pinned: 'right',
      cellRenderer: (p: ICellRendererParams<AuditRecord>) => {
        const item = p.data;
        if (!item || !onViewPassportRecord) return null;
        return (
          <div className="flex items-center h-full">
            <button
              onClick={() => onViewPassportRecord(item)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition cursor-pointer shadow-2xs"
              title="View Procurement Decision Passport"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              <span>Passport</span>
            </button>
          </div>
        );
      },
    },
  ], [onViewPassportRecord]);

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(records, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `tehlaypay_audit_ledger_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-slate-700" />
          <span className="text-xs font-semibold text-slate-700">
            Immutable Audit Trail &bull; {records.length} Recorded Transactions
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-md transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportJson}
            disabled={records.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-md transition cursor-pointer disabled:opacity-40"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export JSON Ledger</span>
          </button>
        </div>
      </div>

      <div className="w-full h-[280px] rounded-xl shadow-xs border border-slate-200 overflow-hidden bg-white">
        <AgGridReact
          theme={themeAlpine}
          rowData={records}
          columnDefs={columnDefs}
          rowHeight={48}
          headerHeight={38}
          animateRows={true}
          suppressCellFocus={true}
          enableCellTextSelection={true}
        />
      </div>
    </div>
  );
};
