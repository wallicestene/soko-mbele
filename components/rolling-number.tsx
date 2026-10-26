// Digits roll like a price board; the 0-9 strips are drawn in CSS, and screen readers get the plain value.
const DIGITS = "0123456789";

export function RollingNumber({ value, rollIn = false, delay = 0, className = "" }: { value: string; rollIn?: boolean; delay?: number; className?: string }) {
  const chars = value.split("");
  let digitIndex = 0;
  return (
    <span className={`roll num ${className}`}>
      <span className="sr-only">{value}</span>
      <span aria-hidden>
        {chars.map((ch, i) => {
          const key = chars.length - i; // from the right, so units stay units when the figure grows
          if (!DIGITS.includes(ch)) {
            return <span key={`c${key}`}>{ch === " " ? "\u00a0" : ch}</span>;
          }
          const d = Number(ch);
          const order = digitIndex++;
          return (
            <span key={`d${key}`} className="roll-window">
              {/* Holds the width and the baseline. */}
              <span className="invisible">{ch}</span>
              <span
                className={`roll-strip ${rollIn ? "roll-in" : ""}`}
                style={{ "--to": `${-d * 10}%`, "--delay": `${delay + order * 70}ms` } as React.CSSProperties}
              />
            </span>
          );
        })}
      </span>
    </span>
  );
}
