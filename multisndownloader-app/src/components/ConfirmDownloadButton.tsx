import React from 'react';
import { Button } from '@grafana/ui';

type Props = {
  onClick: () => void;
};

export default function ConfirmDownloadButton({ onClick }: Props) {
  return (
    <Button variant="primary" onClick={onClick}>
      Confirm & Start Download
    </Button>
  );
}
