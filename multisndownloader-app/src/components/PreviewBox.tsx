import React from 'react';
import { useTheme2 } from '@grafana/ui';

type Props = {
  serialNumbersStr: string;
  textInput: string;
  fileContent: string | ArrayBuffer | null;
};

export default function PreviewBox({ serialNumbersStr, textInput, fileContent }: Props) {
  const theme = useTheme2();

  const snSource = serialNumbersStr || textInput;

  const count = snSource
    ? snSource.split(/[\n,\s]+/).filter((sn) => sn.trim() !== "").length
    : 0;

  const content = serialNumbersStr
    ? serialNumbersStr
    : textInput
    ? textInput
    : typeof fileContent === "string"
    ? fileContent
    : "(Binary file content)";

  return (
    <div
      style={{
        marginTop: 20,
        padding: 12,
        backgroundColor: theme.colors.background.primary,
        border: `1px solid ${theme.colors.background.canvas}`,
        borderRadius: 4,
        maxHeight: 200,
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        color: theme.colors.text.primary,
      }}
    >
      <h4 style={{ marginTop: 0, marginBottom: 8 }}>
        Preview: {count} SN{count !== 1 ? "s" : ""} to download
      </h4>
      <pre style={{ margin: 0 }}>{content || "(No serial numbers found)"}</pre>
    </div>
  );
}
