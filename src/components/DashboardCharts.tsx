import React from 'react';
import { motion } from 'motion/react';
import { DashboardCharts as ChartsType, FilterState } from '../types';

interface DashboardChartsProps {
  charts: ChartsType;
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  activeTab: 'ops' | 'performance' | 'loss';
  filteredCancelledC2dCount: number;
}

export default function DashboardCharts({
  charts,
  filters,
  setFilters,
  setCurrentPage,
  activeTab,
  filteredCancelledC2dCount
}: DashboardChartsProps) {
  
  const renderSvgBarChart = (
    title: string, 
    dataObj: Record<string, number> | undefined | null, 
    colorClass: string = "bg-brand-orange",
    filterKey?: keyof FilterState,
    colorOverrides?: Record<string, string>
  ) => {
    const includeBlank = !!colorOverrides;
    const entries = Object.entries(dataObj || {}).filter(([k]) => (includeBlank || (k !== 'Blank')) && k !== 'All' && k !== '');
    if (!entries.length) {
      return (
        <div className="flex h-36 items-center justify-center text-xs text-slate-400 font-medium">
          No data available for {title}
        </div>
      );
    }
    
    const maxVal = Math.max(...entries.map(([, v]) => v)) || 1;
    
    return (
      <div className="space-y-1.5 mt-2 select-none">
        {entries.slice(0, 8).map(([label, val]) => {
          const pct = Math.min(100, Math.max(4, (val / maxVal) * 100));
          const isCurrentFilter = filterKey && filters[filterKey] === label;
          const barColor = colorOverrides?.[label] ?? colorClass;
          
          return (
            <div 
              key={label} 
              className={`text-xs p-1.5 px-2 rounded-xl transition-all ${
                filterKey ? 'cursor-pointer hover:bg-slate-50 active:scale-[0.99]' : ''
              } ${isCurrentFilter ? 'bg-orange-50/50 border border-brand-orange/40 shadow-xs' : 'border border-transparent'}`}
              onClick={() => {
                if (filterKey) {
                  setFilters(prev => {
                    const currentVal = prev[filterKey];
                    const newVal = currentVal === label ? 'All' : label;
                    return { ...prev, [filterKey]: newVal };
                  });
                  setCurrentPage(1);
                }
              }}
            >
              <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-1">
                <span className="truncate max-w-[140px] flex items-center gap-1.5">
                  {label}
                  {isCurrentFilter && (
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-orange inline-block animate-pulse" />
                  )}
                </span>
                <span className={isCurrentFilter ? 'text-brand-orange font-bold' : ''}>{val} cases</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <motion.div 
                  className={`h-full rounded-full ${isCurrentFilter ? 'bg-brand-orange' : barColor}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (activeTab === 'ops') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Lead Stage Split */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
            Lead Stage Split
          </h4>
          {renderSvgBarChart('Lead Stage', charts.leadStage, "bg-brand-orange", "leadStage")}
        </div>

        {/* Task Bucket Split */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
            Task Bucket Distribution
          </h4>
          {renderSvgBarChart('Task Bucket', charts.taskBucket, "bg-brand-blue", "taskBucket")}
        </div>

        {/* EDD Distribution */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
            EDD Distribution
          </h4>
          {renderSvgBarChart('EDD Distribution', charts.eddDistribution, "bg-rose-500", "eddStatus")}
        </div>

        {/* Total Listing Days */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
            Total Listing Days
          </h4>
          {renderSvgBarChart('Total Listing Days', charts.listingDaysDistribution, "bg-emerald-500", "listingDaysBucket")}
        </div>
      </div>
    );
  }

  if (activeTab === 'performance') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        {/* City Split */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
            City Distribution
          </h4>
          {renderSvgBarChart('City', charts.city, "bg-brand-blue", "city")}
        </div>

        {/* Hub Split */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
            Top Hubs (Volume)
          </h4>
          {renderSvgBarChart('Hub', charts.hub, "bg-violet-500", "hubName")}
        </div>

        {/* On Demand Status Split */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
            On Demand Status
          </h4>
          {renderSvgBarChart('On Demand Status', charts.onDemandStatusDistribution, "bg-emerald-500", "onDemandStatus", {
            'Blank': 'bg-slate-400',
          })}
        </div>

        {/* Ready to Deliver Split */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
            Ready to Deliver?
          </h4>
          {renderSvgBarChart('Ready to Deliver', charts.readyToDeliver, "bg-teal-500", "readyToDeliver", {
            'Blank': 'bg-slate-400',
            'Yes': 'bg-emerald-500',
            'No': 'bg-rose-500',
          })}
        </div>

        {/* Total Expected Amount Split */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
            Total Expected Amount
          </h4>
          {renderSvgBarChart('Total Expected Amount', charts.totalExpectedAmountDistribution, "bg-amber-500")}
        </div>
      </div>
    );
  }

  // activeTab === 'loss'
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Cancellation Reason Split */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
          Cancellation Reasons
        </h4>
        {renderSvgBarChart('Cancellation Reason', charts.cancellationReason, "bg-rose-500", "cancelReason")}
      </div>

      {/* Payment Type Split */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
          Payment Type Split
        </h4>
        {renderSvgBarChart('Payment Type', charts.paymentType, "bg-brand-orange", "paymentType")}
      </div>

      {/* Token Type Split */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
          Token Type Split
        </h4>
        {renderSvgBarChart('Token Type', charts.tokenType, "bg-indigo-500", "tokenType")}
      </div>

      {/* DS Channel Distribution */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <h4 className="text-xs font-sans font-bold tracking-tight text-slate-700 uppercase mb-3 border-b border-slate-50 pb-2">
          DS Channel Distribution
        </h4>
        {renderSvgBarChart('DS Channel', charts.leadDsChannel || {}, "bg-brand-blue", "leadDsChannel")}
      </div>
    </div>
  );
}
