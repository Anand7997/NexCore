'use client';

import { useState } from 'react';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

export default function DemoFormPage() {
  const [state, setState] = useState<FormState>('idle');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState({
    username: '',
    email: '',
    role: '',
    message: '',
    agree: false,
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!values.username.trim()) e.username = 'Username is required';
    if (!values.email.includes('@')) e.email = 'Valid email required';
    if (!values.role) e.role = 'Please select a role';
    if (!values.agree) e.agree = 'You must agree to continue';
    return e;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setErrors({});
    setState('submitting');
    // Simulate async submission
    await new Promise((r) => setTimeout(r, 400));
    setState(values.username === 'fail' ? 'error' : 'success');
  }

  function reset() {
    setState('idle');
    setErrors({});
    setValues({ username: '', email: '', role: '', message: '', agree: false });
  }

  return (
    <main
      data-testid="form-main"
      className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center justify-start p-10 gap-6"
    >
      <h1 data-testid="form-heading" className="text-2xl font-bold">
        Form Fixture
      </h1>
      <p data-testid="form-description" className="text-gray-400 text-sm">
        Stable form for Playwright fill, select, and assertion tests.
      </p>

      {state === 'success' && (
        <div data-testid="form-success" className="text-emerald-400 font-semibold" role="status">
          Submission successful
        </div>
      )}
      {state === 'error' && (
        <div data-testid="form-error" className="text-red-400 font-semibold" role="alert">
          Submission failed
        </div>
      )}

      {state !== 'success' && (
        <form
          data-testid="demo-form"
          onSubmit={handleSubmit}
          className="w-full max-w-md flex flex-col gap-4"
          noValidate
        >
          {/* Username */}
          <div className="flex flex-col gap-1">
            <label htmlFor="username" className="text-sm font-medium">
              Username
            </label>
            <input
              id="username"
              data-testid="input-username"
              type="text"
              autoComplete="username"
              value={values.username}
              onChange={(e) => setValues((v) => ({ ...v, username: e.target.value }))}
              className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              aria-describedby={errors.username ? 'username-error' : undefined}
            />
            {errors.username && (
              <span id="username-error" data-testid="error-username" className="text-red-400 text-xs">
                {errors.username}
              </span>
            )}
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              data-testid="input-email"
              type="email"
              autoComplete="email"
              value={values.email}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <span id="email-error" data-testid="error-email" className="text-red-400 text-xs">
                {errors.email}
              </span>
            )}
          </div>

          {/* Role select */}
          <div className="flex flex-col gap-1">
            <label htmlFor="role" className="text-sm font-medium">
              Role
            </label>
            <select
              id="role"
              data-testid="select-role"
              value={values.role}
              onChange={(e) => setValues((v) => ({ ...v, role: e.target.value }))}
              className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm"
              aria-describedby={errors.role ? 'role-error' : undefined}
            >
              <option value="">-- Select role --</option>
              <option value="admin">Admin</option>
              <option value="engineer">Engineer</option>
              <option value="viewer">Viewer</option>
            </select>
            {errors.role && (
              <span id="role-error" data-testid="error-role" className="text-red-400 text-xs">
                {errors.role}
              </span>
            )}
          </div>

          {/* Message textarea */}
          <div className="flex flex-col gap-1">
            <label htmlFor="message" className="text-sm font-medium">
              Message (optional)
            </label>
            <textarea
              id="message"
              data-testid="textarea-message"
              rows={3}
              value={values.message}
              onChange={(e) => setValues((v) => ({ ...v, message: e.target.value }))}
              className="rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm resize-none"
            />
          </div>

          {/* Checkbox */}
          <div className="flex items-center gap-2">
            <input
              id="agree"
              data-testid="checkbox-agree"
              type="checkbox"
              checked={values.agree}
              onChange={(e) => setValues((v) => ({ ...v, agree: e.target.checked }))}
            />
            <label htmlFor="agree" className="text-sm">
              I agree to the terms
            </label>
            {errors.agree && (
              <span data-testid="error-agree" className="text-red-400 text-xs">
                {errors.agree}
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-2">
            <button
              type="submit"
              data-testid="btn-submit"
              disabled={state === 'submitting'}
              className="px-5 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-semibold"
            >
              {state === 'submitting' ? 'Submitting…' : 'Submit'}
            </button>
            <button
              type="button"
              data-testid="btn-reset"
              onClick={reset}
              className="px-5 py-2 rounded border border-gray-700 hover:border-gray-500 text-sm"
            >
              Reset
            </button>
          </div>
        </form>
      )}

      {state === 'success' && (
        <button
          data-testid="btn-reset-after-success"
          onClick={reset}
          className="px-5 py-2 rounded border border-gray-700 hover:border-gray-500 text-sm"
        >
          Fill again
        </button>
      )}
    </main>
  );
}
