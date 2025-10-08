import React from "react";
import Select from "react-select";
import type { StylesConfig } from "react-select";
import { useTheme2 } from '@grafana/ui';

type Props = {
  sku: string;
  setSku: (sku: string) => void;
  skuList: string[];
};

export default function SkuSelector({ sku, setSku, skuList }: Props) {
  const theme = useTheme2();

  const options = skuList.map((s) => ({
    value: s,
    label: s,
  }));

  const selectedOption = options.find((o) => o.value === sku) || null;

  const handleChange = (selected: { value: string; label: string } | null) => {
    setSku(selected?.value || "");
  };

  // Map Grafana theme colors to react-select styles
const customStyles: StylesConfig<{ value: string; label: string }, false> = {
  control: (base, state) => ({
    ...base,
    backgroundColor: theme.colors.background.secondary, // replaced bg2
    borderColor: state.isFocused ? theme.colors.primary.main : theme.colors.border.medium,
    boxShadow: state.isFocused ? `0 0 0 1px ${theme.colors.primary.main}` : undefined,
    fontSize: 14,
    padding: 2,
    '&:hover': {
      borderColor: theme.colors.primary.main,
    },
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: theme.colors.background.secondary,
    zIndex: 9999,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused
      ? theme.colors.primary.main
    : state.isSelected
    ? theme.colors.primary.main
    : theme.colors.background.secondary,
    color: state.isFocused || state.isSelected ? theme.colors.text.primary : theme.colors.text.secondary,
    cursor: 'pointer',
    '&:active': {
      backgroundColor: theme.colors.primary.main,
      color: theme.colors.text.primary,
    },
  }),
  singleValue: (base) => ({
    ...base,
    color: theme.colors.text.primary,
  }),
  placeholder: (base) => ({
    ...base,
    color: theme.colors.text.secondary,
  }),
  input: (base) => ({
    ...base,
    color: theme.colors.text.primary,
  }),
  dropdownIndicator: (base, state) => ({
    ...base,
    color: state.isFocused ? theme.colors.primary.main : theme.colors.text.secondary,
    '&:hover': {
      color: theme.colors.primary.main,
    },
  }),
  clearIndicator: (base, state) => ({
    ...base,
    color: theme.colors.text.secondary,
    '&:hover': {
      color: theme.colors.error.main,
    },
  }),
};


  return (
    <div style={{ marginTop: 20 }}>
      <label htmlFor="sku-select" style={{ display: "block", marginBottom: 5, color: theme.colors.text.primary }}>
        Select SKU for these SNs:
      </label>
      <Select
        id="sku-select"
        value={selectedOption}
        onChange={handleChange}
        options={options}
        isClearable
        placeholder="Type to search SKU..."
        styles={customStyles}
      />
    </div>
  );
}
