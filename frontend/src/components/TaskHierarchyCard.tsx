interface TaskHierarchyCardProps {
  status: string;
  actions: string;
  nextStep: string;
  className?: string;
}

export default function TaskHierarchyCard({ status, actions, nextStep, className = "" }: TaskHierarchyCardProps) {
  return (
    <div className={`rounded-md border border-white/20 bg-white/5 p-3 text-xs text-mist/85 ${className}`.trim()}>
      <p className="font-semibold text-offwhite">Current Status</p>
      <p>{status}</p>
      <p className="mt-2 font-semibold text-offwhite">Available Actions</p>
      <p>{actions}</p>
      <p className="mt-2 font-semibold text-offwhite">Next Step</p>
      <p>{nextStep}</p>
    </div>
  );
}
