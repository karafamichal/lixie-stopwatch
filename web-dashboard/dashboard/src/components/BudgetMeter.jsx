import { t, locale } from '../i18n';

// Share of a project's hour budget that has been tracked. Green below 80 %,
// orange from 80 %, red once the budget is used up.
export function budgetShare(project) {
  if (!project?.budget_hours) return null;
  return (project.tracked_seconds || 0) / 3600 / project.budget_hours;
}

export default function BudgetMeter({ project }) {
  const share = budgetShare(project);
  if (share == null) return null;
  const color = share >= 1 ? 'bg-red-400' : share >= 0.8 ? 'bg-amber-500' : 'bg-green-400';
  const num = (v) => v.toLocaleString(locale(), { maximumFractionDigits: 1 });
  return (
    <div className="min-w-[8rem]">
      <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100}
           aria-valuenow={Math.round(share * 100)} aria-label={t('Budget used')}>
        <div className={`h-full ${color}`} style={{ width: `${Math.min(share, 1) * 100}%` }} />
      </div>
      <p className={`text-xs mt-1 ${share >= 1 ? 'text-red-400' : 'text-slate-500'}`}>
        {t('{used} of {budget} h ({pct} %)', {
          used: num((project.tracked_seconds || 0) / 3600),
          budget: num(project.budget_hours),
          pct: Math.round(share * 100),
        })}
      </p>
    </div>
  );
}
