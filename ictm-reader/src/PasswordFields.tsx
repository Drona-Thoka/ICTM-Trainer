import { useState } from 'react'

// Shared by the reset page and the signed-in change-password form so both
// enforce the same rules. Supabase's own floor is 6 characters; failing here
// gives a clearer message than a round trip does.
export const MIN_PASSWORD_LENGTH = 8

export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (password !== confirm) return 'Passwords do not match.'
  return null
}

// Theme-aware: --input-bg / --text-h are defined for light, dark and system
// (index.css), so these stay legible whichever theme is active.
export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid var(--border)',
  background: 'var(--input-bg)',
  color: 'var(--text-h)',
  boxSizing: 'border-box',
  marginTop: '4px',
}

const labelStyle: React.CSSProperties = { textAlign: 'left', fontWeight: 600 }

type Props = {
  password: string
  confirm: string
  onPasswordChange: (v: string) => void
  onConfirmChange: (v: string) => void
  disabled?: boolean
  newLabel?: string
}

/** New-password + confirm pair. Validation lives in passwordProblem(). */
export default function PasswordFields({
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  disabled,
  newLabel = 'New password',
}: Props) {
  // Only complain once the user has actually typed a confirmation, so the
  // message appears on a real mistake rather than on every empty form.
  const [touched, setTouched] = useState(false)
  const problem = touched && confirm ? passwordProblem(password, confirm) : null

  return (
    <>
      <label style={labelStyle}>
        {newLabel}
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          disabled={disabled}
          onChange={(e) => onPasswordChange(e.target.value)}
          style={inputStyle}
        />
      </label>
      <label style={labelStyle}>
        Confirm password
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          disabled={disabled}
          onBlur={() => setTouched(true)}
          onChange={(e) => {
            setTouched(true)
            onConfirmChange(e.target.value)
          }}
          style={inputStyle}
        />
      </label>
      {problem && <p className="error" style={{ margin: 0 }}>{problem}</p>}
    </>
  )
}
