import React from 'react';
import { useTheme2 } from '@grafana/ui';

type Props = {
  error: string | null;
};

export default function ErrorMessage({ error }: Props) {
  const theme = useTheme2();

  if (!error) return null;

  return (
    <p
      style={{
        color: theme.colors.error.text,      // Grafana error color
        padding: '8px 12px',
        borderRadius: 4,
        marginTop: 10,
        fontWeight: 'bold',
        userSelect: 'text',
      }}
      role="alert"
      aria-live="assertive"
    >
      {error}
    </p>
  );
}
