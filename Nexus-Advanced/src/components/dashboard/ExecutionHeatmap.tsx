'use client';
import { motion } from 'framer-motion';
import type { HeatmapCell } from '@/types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getColor(value: number): string {
  if (value === 0) return 'rgba(255,255,255,0.03)';
  if (value < 20) return 'rgba(99,102,241,0.15)';
  if (value < 40) return 'rgba(99,102,241,0.35)';
  if (value < 60) return 'rgba(99,102,241,0.55)';
  if (value < 80) return 'rgba(99,102,241,0.75)';
  return 'rgba(139,92,246,0.9)';
}

interface ExecutionHeatmapProps {
  data: HeatmapCell[];
}

export default function ExecutionHeatmap({ data }: ExecutionHeatmapProps) {
  const cellMap = new Map<string, number>();
  data.forEach((cell) => cellMap.set(`${cell.day}-${cell.hour}`, cell.value));

  return (
    <div className="space-y-2">
      {/* Hour labels */}
      <div className="flex gap-0.5 pl-8">
        {HOURS.filter((h) => h % 4 === 0).map((h) => (
          <div key={h} className="flex-1 text-[9px] text-slate-600 font-mono text-center">
            {h.toString().padStart(2, '0')}h
          </div>
        ))}
      </div>

      {/* Grid */}
      {DAYS.map((day, dayIdx) => (
        <div key={day} className="flex items-center gap-0.5">
          <span className="w-7 text-[9px] text-slate-600 font-mono">{day}</span>
          <div className="flex gap-0.5 flex-1">
            {HOURS.map((hour) => {
              const value = cellMap.get(`${dayIdx}-${hour}`) ?? 0;
              return (
                <motion.div
                  key={hour}
                  className="flex-1 h-3.5 rounded-sm cursor-pointer transition-all duration-200 hover:scale-110 hover:z-10 relative group"
                  style={{ backgroundColor: getColor(value) }}
                  whileHover={{ scale: 1.2 }}
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 rounded text-[9px] text-white font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-white/10">
                    {day} {hour.toString().padStart(2, '0')}:00 — {value} execs
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Legend */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[9px] text-slate-600 font-mono">Less</span>
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <div key={v} className="w-3 h-3 rounded-sm" style={{ backgroundColor: getColor(v) }} />
        ))}
        <span className="text-[9px] text-slate-600 font-mono">More</span>
      </div>
    </div>
  );
}
