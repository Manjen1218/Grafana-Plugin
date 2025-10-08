import React from 'react';

type Props = {
  value: string;
  onChange: (val: string) => void;
};

export default function TextInputArea({ value, onChange }: Props) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Paste or type serial numbers here..."
      style={{
        marginTop: 20,
        width: "100%",
        height: 150,
        padding: 10,
        fontSize: 14,
        resize: "vertical",
      }}
    />
  );
}
