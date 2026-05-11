'use client';

import { useState } from 'react';

export default function DemoCounterWidget() {
  const [count, setCount] = useState(0);
  return (
    <section data-testid="demo-counter-section" className="w-full max-w-2xl">
      <p data-testid="counter-label" className="text-sm text-gray-400 mb-2">
        Click counter (JS interaction test)
      </p>
      <div data-testid="counter-value" className="text-2xl font-mono">
        {count}
      </div>
      <button
        data-testid="counter-increment"
        className="mt-2 px-4 py-2 rounded bg-indigo-700 hover:bg-indigo-600"
        onClick={() => setCount((n) => n + 1)}
      >
        Increment
      </button>
    </section>
  );
}
