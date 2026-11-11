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
import type { EvaluatedProduct } from '../shared/types.ts';
import { isComputingCategory } from '../shared/categories.ts';
import { ShieldCheck, ShieldAlert, AlertTriangle, Info, ArrowUpRight, Globe, Database, FileText } from 'lucide-react';

// Register AG Grid Community and Validation modules
ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

interface Props {
  products: EvaluatedProduct[];
  onSelectProduct: (product: EvaluatedProduct) => void;
  onInspectRules: (product: EvaluatedProduct) => void;
  onViewPassport?: (product: EvaluatedProduct) => void;
}

export const ProductGrid: React.FC<Props> = ({
  products,
  onSelectProduct,
  onInspectRules,
  onViewPassport,
}) => {
  const columnDefs = useMemo<ColDef<EvaluatedProduct>[]>(() => [
    {
      headerName: 'Source',
      width: 140,
      pinned: 'left',
      cellRenderer: (params: ICellRendererParams<EvaluatedProduct>) => {
        const isLive = params.data?.dataSource === 'channel3_live';
        return (
          <div className="flex items-center h-full">
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                <Globe className="w-3.5 h-3.5 text-blue-600" /> Channel3 Live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                <Database className="w-3.5 h-3.5 text-slate-400" /> Demo Fixture
              </span>
            )}
          </div>
        );
      },
    },
    {
      headerName: 'Policy Status',
      field: 'evaluation.overallStatus',
      width: 145,
      pinned: 'left',
      cellRenderer: (params: ICellRendererParams<EvaluatedProduct>) => {
        const status = params.data?.evaluation.overallStatus;
        if (status === 'PASS') {
          return (
            <div className="flex items-center h-full">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" /> PASS
              </span>
            </div>
          );
        }
        if (status === 'BLOCKED') {
          return (
            <div className="flex items-center h-full">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-900 border border-rose-300">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-700" /> BLOCKED
              </span>
            </div>
          );
        }
        return (
          <div className="flex items-center h-full">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" /> REVIEW
            </span>
          </div>
        );
      },
    },
    {
      headerName: 'Product & Merchant',
      field: 'title',
      minWidth: 260,
      flex: 3,
      cellRenderer: (params: ICellRendererParams<EvaluatedProduct>) => {
        const p = params.data;
        if (!p) return null;
        return (
          <div className="flex flex-col justify-center h-full py-1">
            <div className="font-semibold text-slate-900 text-xs leading-snug truncate" title={p.title}>
              {p.title}
            </div>
            <div className="text-[11px] text-slate-500 flex items-center gap-2">
              <span className="font-medium text-slate-700">{p.merchant}</span>
              <span>&bull;</span>
              <span className="font-mono text-slate-400">SKU: {p.sku}</span>
            </div>
          </div>
        );
      },
    },
    {
      headerName: 'Price & Total',
      field: 'price',
      width: 160,
      cellRenderer: (params: ICellRendererParams<EvaluatedProduct>) => {
        const p = params.data;
        if (!p) return null;
        if (p.price === null) {
          return <span className="text-xs text-amber-600 font-semibold italic">Unspecified</span>;
        }
        const qty = p.quantity && p.quantity > 0 ? p.quantity : 1;
        const lineTotal = p.lineTotal ?? p.price * qty;

        return (
          <div className="flex flex-col justify-center h-full">
            {qty > 1 ? (
              <>
                <span className="text-xs font-black text-slate-900 tracking-tight">
                  Total: {p.currency} {lineTotal.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  {p.currency} {p.price.toFixed(2)} &times; {qty} units
                </span>
              </>
            ) : (
              <span className="text-sm font-bold text-slate-900">
                {p.currency} {p.price.toFixed(2)}
              </span>
            )}
          </div>
        );
      },
    },
    {
      headerName: 'Item Specifications',
      width: 145,
      valueGetter: (params) => {
        const p = params.data;
        if (!p) return '';
        const isComputing = isComputingCategory(p.title);
        const specText = isComputing
          ? p.ramGb !== null
            ? `${p.ramGb} GB RAM`
            : 'RAM Unconstrained'
          : 'Standard Spec';
        return `${specText} | ${p.condition}`;
      },
      cellRenderer: (params: ICellRendererParams<EvaluatedProduct>) => {
        const p = params.data;
        if (!p) return null;
        const isComputing = isComputingCategory(p.title);
        const hasRamRule = p.evaluation?.checks?.some((c) => c.ruleName === 'Minimum RAM Specification');

        return (
          <div className="flex flex-col justify-center h-full text-xs">
            {isComputing ? (
              p.ramGb !== null ? (
                <span className="font-medium text-slate-800">{p.ramGb} GB RAM</span>
              ) : hasRamRule ? (
                <span className="font-semibold text-amber-700">RAM Unverified</span>
              ) : (
                <span className="text-slate-500">RAM Unconstrained</span>
              )
            ) : (
              <span className="text-slate-600 font-medium">Standard Spec</span>
            )}
            <span className="capitalize text-[11px] text-slate-500">
              Condition: {p.condition}
            </span>
          </div>
        );
      },
    },
    {
      headerName: 'Deterministic Policy Evidence',
      field: 'evaluation.summary',
      minWidth: 240,
      flex: 3,
      cellRenderer: (params: ICellRendererParams<EvaluatedProduct>) => {
        const summary = params.value;
        const status = params.data?.evaluation.overallStatus;
        return (
          <div className="flex items-center h-full">
            <span className={`text-xs line-clamp-2 leading-relaxed ${
              status === 'PASS' ? 'text-emerald-800' :
              status === 'BLOCKED' ? 'text-rose-800 font-medium' : 'text-amber-800'
            }`}>
              {summary}
            </span>
          </div>
        );
      },
    },
    {
      headerName: 'Actions',
      width: 210,
      pinned: 'right',
      cellRenderer: (params: ICellRendererParams<EvaluatedProduct>) => {
        const p = params.data;
        if (!p) return null;
        const canApprove = p.evaluation.overallStatus === 'PASS';

        return (
          <div className="flex items-center gap-1.5 h-full">
            {/* Inspect Rules Modal Trigger */}
            <button
              onClick={() => onInspectRules(p)}
              className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition cursor-pointer"
              title="Inspect individual rule evidence"
            >
              <Info className="w-4 h-4" />
            </button>

            {/* Decision Passport Trigger */}
            {onViewPassport && (
              <button
                onClick={() => onViewPassport(p)}
                className="p-1.5 rounded hover:bg-blue-100 text-blue-600 hover:text-blue-800 transition cursor-pointer"
                title="View Procurement Decision Passport"
              >
                <FileText className="w-4 h-4" />
              </button>
            )}

            {/* Authoritative Buy Action */}
            <button
              onClick={() => onSelectProduct(p)}
              disabled={!canApprove}
              className={`px-3 py-1.5 text-xs font-semibold rounded flex items-center gap-1 transition shadow-xs ${
                canApprove
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-95'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
            >
              <span>{canApprove ? 'Review & Buy' : 'Blocked'}</span>
              {canApprove && <ArrowUpRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        );
      },
    },
  ], [onSelectProduct, onInspectRules, onViewPassport]);

  return (
    <div className="w-full h-[410px] rounded-xl shadow-xs border border-slate-200 overflow-hidden bg-white">
      <AgGridReact
        theme={themeAlpine}
        rowData={products}
        columnDefs={columnDefs}
        rowHeight={58}
        headerHeight={42}
        animateRows={true}
        suppressCellFocus={true}
        enableCellTextSelection={true}
      />
    </div>
  );
};
