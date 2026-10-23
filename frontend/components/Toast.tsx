"use client";

import { useEffect } from "react";

type Props = {
  message: string;
  onDismiss: () => void;
  duration?: number;
};

export default function Toast({ message, onDismiss, duration = 4200 }: Props) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [message, onDismiss, duration]);
  return (
    <div className="toast" role="alert">
      {message}
      <button className="toast-close" onClick={onDismiss} aria-label="dismiss">
        ×
      </button>
    </div>
  );
}
