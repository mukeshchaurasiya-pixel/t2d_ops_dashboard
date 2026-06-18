import React from 'react';
import { DashboardKpis } from '../types';

interface DashboardKpiCardsProps {
  kpis: DashboardKpis;
  filteredCancelledC2dCount: number;
  filteredCancelledC2aCount: number;
  filteredCancelledCr2dCount: number;
}

export default function DashboardKpiCards({
  kpis,
  filteredCancelledC2dCount,
  filteredCancelledC2aCount,
  filteredCancelledCr2dCount
}: DashboardKpiCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5" id="bento-kpis">
      {/* Total Cases */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:scale-101 hover:shadow-md transition-all">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Total cases</span>
        <h4 className="text-2xl font-sans font-bold text-slate-800 leading-none my-1">
          {kpis.totalCases}
        </h4>
        <span className="text-[10px] text-slate-400">filtered operations</span>
      </div>

      {/* Active Tokens */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:scale-101 hover:shadow-md transition-all">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Active Tokens</span>
        <h4 className="text-2xl font-sans font-bold text-brand-orange leading-none my-1">
          {kpis.activeTokens}
        </h4>
        <span className="text-[10px] text-slate-400">awaiting deliveries</span>
      </div>

      {/* Delivered cases */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:scale-101 hover:shadow-md transition-all">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex justify-between items-center">
          <span>Delivered</span>
          {filteredCancelledCr2dCount > 0 && (
            <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-100 rounded px-1.5 py-0.5 font-bold uppercase tracking-wider select-none shrink-0" title="CR2D: Cancellation request raised but remarks existed and later delivered">
              CR2D: {filteredCancelledCr2dCount}
            </span>
          )}
        </span>
        <h4 className="text-2xl font-sans font-bold text-emerald-600 leading-none my-1">
          {kpis.delivered}
        </h4>
        <span className="text-[10px] text-slate-400">
          completed handovers {filteredCancelledCr2dCount > 0 && `(CR2D: ${filteredCancelledCr2dCount} saved)`}
        </span>
      </div>

      {/* Cancelled cases */}
      <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between hover:scale-101 hover:shadow-md transition-all">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide flex justify-between items-center">
          <span>Cancelled</span>
          <div className="flex gap-1">
            {filteredCancelledC2dCount > 0 && (
              <span className="text-[9px] bg-rose-50 text-rose-600 border border-rose-100 rounded px-1.5 py-0.5 font-bold uppercase tracking-wider select-none shrink-0" title="C2D: Cancelled booking but user converted to delivered on another Booking ID">
                C2D: {filteredCancelledC2dCount}
              </span>
            )}
            {filteredCancelledC2aCount > 0 && (
              <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-100 rounded px-1.5 py-0.5 font-bold uppercase tracking-wider select-none shrink-0" title="C2A: Cancelled booking but user has another active token booking">
                C2A: {filteredCancelledC2aCount}
              </span>
            )}
          </div>
        </span>
        <h4 className="text-2xl font-sans font-bold text-rose-600 leading-none my-1">
          {kpis.cancelled}
        </h4>
        <span className="text-[10px] text-slate-400">
          cancellation records { (filteredCancelledC2dCount > 0 || filteredCancelledC2aCount > 0) && `(${[
            filteredCancelledC2dCount > 0 ? `C2D: ${filteredCancelledC2dCount} recovered` : null,
            filteredCancelledC2aCount > 0 ? `C2A: ${filteredCancelledC2aCount} active` : null
          ].filter(Boolean).join(', ')})` }
        </span>
      </div>
    </div>
  );
}
