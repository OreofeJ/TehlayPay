import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AnalyticsOverview } from '../../shared/types.ts';
import { AnalyticsKpiCards } from './AnalyticsKpiCards.tsx';
import { AnalyticsVisualizations } from './AnalyticsVisualizations.tsx';
import { ComplianceInsights } from './ComplianceInsights.tsx';
import { AnalyticsRecentActivityGrid } from './AnalyticsRecentActivityGrid.tsx';
import {
  BarChart3,
  RefreshCw,
  Download,
  Calendar,
  AlertCircle,
  Filter,
  DollarSign,
  Layers,
  Sparkles,
} from 'lucide-react';

interface Props {
  onNavigateToProcurement?: () => void;
}

export const AnalyticsDashboard: React.FC<Props> = ({ onNavigateToProcurement }) => {
  const [period, setPeriod] = useState<'all' | 'today' | '7d' | '30d' | '90d' | 'custom'>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [decisionFilter, setDecisionFilter] = useState<'ALL' | 'PASS' | 'BLOCKED' | 'REVIEW'>('ALL');

  const [loading, setLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsOverview | null>(null);

  const recentActivityRef = useRef<HTMLDivElement>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('period', period);
      if (period === 'custom' && customStart && customEnd) {
        params.set('startDate', customStart);
        params.set('endDate', customEnd);
      }
      if (currencyFilter !== 'ALL') {
        params.set('currency', currencyFilter);
      }
      if (categoryFilter !== 'ALL') {
        params.set('category', categoryFilter);
      }

      const res = await fetch(`/api/analytics/overview?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to fetch analytics.');
      }

      const json: AnalyticsOverview = await res.json();
      setData(json);
    } catch (err: any) {
      console.error('Analytics fetch error:', err);
      setError(err.message || 'Could not load procurement analytics.');
    } finally {
      setLoading(false);
    }
  }, [period, customStart, customEnd, currencyFilter, categoryFilter]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('period', period);
      if (period === 'custom' && customStart && customEnd) {
        params.set('startDate', customStart);
        params.set('endDate', customEnd);
      }
      if (currencyFilter !== 'ALL') params.set('currency', currencyFilter);
      if (categoryFilter !== 'ALL') params.set('category', categoryFilter);

      const res = await fetch(`/api/analytics/export?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to export CSV.');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tehlaypay_procurement_analytics_${period}_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Export error.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleSelectDecision = (decision: 'PASS' | 'BLOCKED' | 'REVIEW' | 'ALL') => {
    setDecisionFilter(decision);
    recentActivityRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSelectCategory = (cat: string) => {
    setCategoryFilter(cat);
    recentActivityRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Dashboard Top Header & Toolbar */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Procurement Analytics &amp; Spend Intelligence
                </h1>
                <span className="text-[10px] font-bold tracking-wider uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded">
                  Authoritative Server Engine
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Authoritative monitoring of purchasing activity, budget utilisation, policy compliance and verified transactions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAnalytics}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition cursor-pointer"
              title="Refresh analytics from server audit store"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-500'}`} />
              <span>Refresh</span>
            </button>

            <button
              onClick={handleExportCsv}
              disabled={isExporting}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-blue-200" />
              <span>{isExporting ? 'Generating...' : 'Export Filtered CSV'}</span>
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          {/* Period selector */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400 font-medium mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Reporting Period:</span>
            </span>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: '7d', label: 'Last 7 Days' },
              { id: '30d', label: 'Last 30 Days' },
              { id: '90d', label: 'Last 90 Days' },
              { id: 'custom', label: 'Custom' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id as any)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                  period === p.id
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}

            {period === 'custom' && (
              <div className="flex items-center gap-1.5 ml-2">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2 py-0.5 rounded border border-slate-300 text-xs bg-slate-50"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-2 py-0.5 rounded border border-slate-300 text-xs bg-slate-50"
                />
              </div>
            )}
          </div>

          {/* Currency & Category Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Currency Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md">
              <DollarSign className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={currencyFilter}
                onChange={(e) => setCurrencyFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Currencies</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="NGN">NGN (₦)</option>
              </select>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Categories</option>
                <option value="computing">Computing &amp; IT</option>
                <option value="office_supplies">Office Supplies</option>
                <option value="printer_consumables">Printer Consumables</option>
                <option value="cleaning_supplies">Cleaning Supplies</option>
                <option value="tools_hardware">Tools &amp; Hardware</option>
                <option value="furniture">Office Furniture</option>
                <option value="general">General / Other</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Error / Data Quality Banners */}
      {/* ------------------------------------------------------------------ */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {data && data.dataQuality.warnings.length > 0 && (
        <div className="space-y-2">
          {data.dataQuality.warnings.map((warning, idx) => (
            <div
              key={idx}
              className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center justify-between gap-3 shadow-2xs"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{warning}</span>
              </div>
              {warning.includes('Submit a procurement request') && onNavigateToProcurement && (
                <button
                  onClick={onNavigateToProcurement}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-[11px] shrink-0 cursor-pointer"
                >
                  Create Request &rarr;
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Top Key Performance Indicators */}
      {/* ------------------------------------------------------------------ */}
      {data && (
        <AnalyticsKpiCards
          kpis={data.kpis}
          onSelectDecisionFilter={handleSelectDecision}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Visual Analytics Section */}
      {/* ------------------------------------------------------------------ */}
      {data && (
        <AnalyticsVisualizations
          categories={data.categories}
          decisionDistribution={data.decisionDistribution}
          timeSeries={data.timeSeries}
          budgetUtilisations={data.budgetUtilisations}
          onSelectCategory={handleSelectCategory}
          onSelectDecision={handleSelectDecision}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Procurement Compliance Insights */}
      {/* ------------------------------------------------------------------ */}
      {data && (
        <ComplianceInsights
          insights={data.complianceInsights}
          totalEvaluations={data.kpis.totalEvaluationsCount}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Recent Activity Ledger (AG Grid) */}
      {/* ------------------------------------------------------------------ */}
      {data && (
        <div ref={recentActivityRef}>
          <AnalyticsRecentActivityGrid
            activity={data.recentActivity}
            selectedDecisionFilter={decisionFilter}
            onFilterChange={setDecisionFilter}
            onExportCsv={handleExportCsv}
            isExporting={isExporting}
          />
        </div>
      )}
    </div>
  );
};
