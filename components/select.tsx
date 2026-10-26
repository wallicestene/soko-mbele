// Native, because the phone's own picker is the best one on a phone.
export function Select({ className = "", chevron = "text-subtle", ...props }: React.ComponentProps<"select"> & { chevron?: string }) {
  return (
    <span className="relative block min-w-0">
      <select {...props} className={`w-full appearance-none pr-10 ${className}`} />
      <svg aria-hidden viewBox="0 0 16 16" className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 ${chevron}`}>
        <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
