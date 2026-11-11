import React, { useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ColDef,
  ICellRendererParams,
  ModuleRegistry,
  AllCommunityModule,
  ValidationModule,
  themeAlpine,
} from 'ag-grid-community';
import type { AnalyticsActivityEvent } from '../../shared/types.ts';
import {
  Search,
  Download,
  Filter,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  CreditCard,
  Building2,
} from 'lucide-react';

ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

interface Props {
  activity: AnalyticsActivityEvent[];
  selectedDecisionFilter?: 'PASS' | 'BLOCKED' | 'REVIEW' | 'ALL';
  onFilterChange?: (filter: 'PASS' | 'BLOCKED' | 'REVIEW' | 'ALL') => void;
  onExportCsv: () => void;
  isExporting?: boolean;
}

export const AnalyticsRecentActivityGrid: React.FC<Props> = ({
  activity,
  selectedDecisionFilter = 'ALL',
  onFilterChange,
  onExportCsv,
  isExporting = false,
}) => {
  const [quickSearch, setQuickSearch] = useState('');

  // Client-side quick filter
  const filteredData = useMemo(() => {
    return activity.filter((item) => {
      // Decision filter
      if (selectedDecisionFilter !== 'ALL') {
        if (item.policyStatus !== selectedDecisionFilter) return false;
      }
      // Quick search filter
      if (quickSearch.trim()) {
        const q = quickSearch.toLowerCase();
        const matchTitle = item.productTitle?.toLowerCase().includes(q);
        const matchReq = item.requirementId?.toLowerCase().includes(q);
        const matchCat = item.category?.toLowerCase().includes(q);
        const matchSub = item.subcategory?.toLowerCase().includes(q);
        const matchMerchant = item.merchant?.toLowerCase().includes(q);
        if (!matchTitle && !matchReq && !matchCat && !matchSub && !matchMerchant) return false;
      }
      return true;
    });
  }, [activity, selectedDecisionFilter, quickSearch]);

  const columnDefs = useMemo<ColDef<AnalyticsActivityEvent>[]>(() => [
    {
      headerName: 'Date & Time',
      field: 'timestamp',
      width: 155,
      pinned: 'left',
      valueFormatter: (p) => {
        if (!p.value) return '—';
        const d = new Date(p.value);
        if (Number.isNaN(d.getTime())) return String(p.value);
        return (
          d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
          ' ' +
          d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
      },
    },
    {
      headerName: 'Event Type',
      field: 'eventType',
      width: 140,
      cellRenderer: (p: ICellRendererParams<AnalyticsActivityEvent>) => {
        const type = p.value;
        const colorClass =
          type === 'PAYMENT_CAPTURED'
            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
            : type === 'ORDER_CREATED'
            ? 'bg-blue-50 text-blue-800 border-blue-300'
            : type === 'ORDER_REJECTED'
            ? 'bg-rose-50 text-rose-800 border-rose-300'
            : type === 'REQUEST_CREATED'
            ? 'bg-purple-50 text-purple-800 border-purple-300'
            : 'bg-slate-100 text-slate-700 border-slate-200';

        return (
          <div className="flex items-center h-full">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${colorClass}`}>
              {type ? type.replace(/_/g, ' ') : 'EVENT'}
            </span>
          </div>
        );
      },
    },
    {
      headerName: 'Product / Procurement Item',
      field: 'productTitle',
      minWidth: 260,
      flex: 3,
      cellRenderer: (p: ICellRendererParams<AnalyticsActivityEvent>) => {
        const item = p.data;
        if (!item) return null;
        return (
          <div className="flex flex-col justify-center h-full py-1">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-semibold text-xs text-slate-900 truncate" title={item.productTitle}>
                {item.productTitle}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
              <span>Req: {item.requirementId}</span>
              {item.merchant && (
                <>
                  <span>&bull;</span>
                  <span className="text-slate-600 font-sans">{item.merchant}</span>
                </>
              )}
            </div>
          </div>
        );
      },
    },
    {
      headerName: 'Category',
      field: 'category',
      width: 160,
      cellRenderer: (p: ICellRendererParams<AnalyticsActivityEvent>) => {
        const item = p.data;
        if (!item) return null;
        return (
          <div className="flex flex-col justify-center h-full">
            <span className="text-xs font-semibold text-slate-800">{item.category}</span>
            {item.subcategory && (
              <span className="text-[10px] text-slate-400 truncate">{item.subcategory}</span>
            )}
          </div>
        );
      },
    },
    {
      headerName: 'Unit Price',
      field: 'unitPrice',
      width: 110,
      cellRenderer: (p: ICellRendererParams<AnalyticsActivityEvent>) => {
        const item = p.data;
        if (!item || item.unitPrice === null || item.unitPrice === undefined) {
          return <span className="text-slate-400 text-xs italic">Unlisted</span>;
        }
        return (
          <div className="flex items-center h-full font-mono text-xs font-semibold text-slate-800">
            {item.currency} {item.unitPrice.toFixed(2)}
          </div>
        );
      },
    },
    {
      headerName: 'Qty',
      field: 'quantity',
      width: 70,
      cellRenderer: (p: ICellRendererParams<AnalyticsActivityEvent>) => (
        <div className="flex items-center h-full font-mono text-xs text-slate-700">
          {p.value || 1}
        </div>
      ),
    },
    {
      headerName: 'Line Total',
      field: 'estimatedTotal',
      width: 125,
      cellRenderer: (p: ICellRendererParams<AnalyticsActivityEvent>) => {
        const item = p.data;
        if (!item || item.estimatedTotal === null || item.estimatedTotal === undefined) {
          return <span className="text-slate-400 text-xs italic">—</span>;
        }
        return (
          <div className="flex items-center h-full font-mono text-xs font-bold text-slate-900">
            {item.currency} {item.estimatedTotal.toFixed(2)}
          </div>
        );
      },
    },
    {
      headerName: 'Policy Result',
      field: 'policyStatus',
      width: 120,
      cellRenderer: (p: ICellRendererParams<AnalyticsActivityEvent>) => {
        const st = p.value;
        const isPass = st === 'PASS';
        const isBlocked = st === 'BLOCKED';

        return (
          <div className="flex items-center h-full">
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded border ${
                isPass
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : isBlocked
                  ? 'bg-rose-50 text-rose-800 border-rose-300'
                  : 'bg-amber-50 text-amber-800 border-amber-300'
              }`}
            >
              {st}
            </span>
          </div>
        );
      },
    },
    {
      headerName: 'Buyer Approval',
      field: 'approvalStatus',
      width: 130,
      cellRenderer: (p: ICellRendererParams<AnalyticsActivityEvent>) => {
        const val = p.value;
        if (val === 'APPROVED') {
          return (
            <div className="flex items-center gap-1.5 h-full text-xs font-semibold text-emerald-700">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span>Approved</span>
            </div>
          );
        }
        if (val === 'REJECTED') {
          return (
            <div className="flex items-center gap-1.5 h-full text-xs font-semibold text-rose-700">
              <XCircle className="w-3.5 h-3.5 text-rose-600" />
              <span>Rejected</span>
            </div>
          );
        }
        if (val === 'PENDING') {
          return (
            <div className="flex items-center gap-1.5 h-full text-xs text-amber-600 font-medium">
              <Clock className="w-3.5 h-3.5" />
              <span>Pending</span>
            </div>
          );
        }
        return <span className="text-slate-400 text-xs italic">N/A (Candidate)</span>;
      },
    },
    {
      headerName: 'Payment Status',
      field: 'paymentStatus',
      width: 140,
      cellRenderer: (p: ICellRendererParams<AnalyticsActivityEvent>) => {
        const val = p.value;
        if (val === 'CAPTURED') {
          return (
            <div className="flex items-center gap-1.5 h-full text-xs font-bold text-emerald-700">
              <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
              <span>CAPTURED</span>
            </div>
          );
        }
        if (val === 'PENDING') {
          return (
            <div className="flex items-center gap-1.5 h-full text-xs font-semibold text-blue-700">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              <span>Pending Order</span>
            </div>
          );
        }
        if (val === 'FAILED' || val === 'CANCELLED') {
          return (
            <div className="flex items-center gap-1.5 h-full text-xs font-medium text-rose-600">
              <XCircle className="w-3.5 h-3.5" />
              <span>{val}</span>
            </div>
          );
        }
        return <span className="text-slate-400 text-xs italic">Not Created</span>;
      },
    },
  ], []);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
      {/* Header with Search, Filter & CSV Export */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Recent Procurement Activity</h3>
          <p className="text-xs text-slate-500">
            Authoritative stream of candidate evaluations, buyer authorizations and verified settlements ({filteredData.length} events)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Quick Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder="Filter items, req ID, merchant..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-600 w-52 bg-slate-50"
            />
          </div>

          {/* Decision Filter Pills */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
            {(['ALL', 'PASS', 'BLOCKED', 'REVIEW'] as const).map((filter) => (
              <button
                key={filter}
                onClick={() => onFilterChange?.(filter)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                  selectedDecisionFilter === filter
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* CSV Export Button */}
          <button
            onClick={onExportCsv}
            disabled={isExporting || filteredData.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer disabled:opacity-40 shadow-2xs"
            title="Download standard RFC 4180 CSV export of filtered records"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>{isExporting ? 'Exporting...' : 'Export Filtered CSV'}</span>
          </button>
        </div>
      </div>

      {/* AG Grid Container */}
      <div className="w-full h-[360px] rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
        <AgGridReact
          theme={themeAlpine}
          rowData={filteredData}
          columnDefs={columnDefs}
          rowHeight={48}
          headerHeight={38}
          animateRows={true}
          pagination={true}
          paginationPageSize={10}
          paginationPageSizeSelector={[10, 25, 50]}
          suppressCellFocus={true}
          enableCellTextSelection={true}
        />
      </div>
    </div>
  );
};
