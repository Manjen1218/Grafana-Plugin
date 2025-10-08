import React from "react";
import Select from "react-select";
import { useTheme2 } from '@grafana/ui';
import type { StylesConfig } from "react-select";

type Props = {
  inputType: string;
  setInputType: (val: string) => void;
};

const options = [
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "XLSX" },
  { value: "string", label: "Plain Text" },
];

export default function InputTypeSelector({ inputType, setInputType }: Props) {
  const theme = useTheme2();

  const customStyles: StylesConfig<{ value: string; label: string }, false> = {
    control: (base, state) => ({
      ...base,
      fontSize: 14,
      padding: 2,
      backgroundColor: theme.colors.background.secondary,
      borderColor: state.isFocused ? theme.colors.primary.main : theme.colors.border.medium,
      boxShadow: state.isFocused ? `0 0 0 1px ${theme.colors.primary.main}` : 'none',
      '&:hover': {
        borderColor: theme.colors.primary.main,
      },
      color: theme.colors.text.primary,
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: theme.colors.background.secondary,
      color: theme.colors.text.primary,
      zIndex: 9999, // Ensure dropdown is above other UI elements
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused
        ? theme.colors.primary.main
        : theme.colors.background.secondary,
      color: state.isFocused
        ? theme.colors.background.primary
        : theme.colors.text.primary,
      cursor: "pointer",
    }),
    singleValue: (base) => ({
      ...base,
      color: theme.colors.text.primary,
    }),
    placeholder: (base) => ({
      ...base,
      color: theme.colors.text.secondary,
    }),
    indicatorSeparator: () => ({ display: 'none' }), // Removes the separator line
    dropdownIndicator: (base, state) => ({
      ...base,
      color: state.isFocused ? theme.colors.primary.main : theme.colors.text.secondary,
      '&:hover': {
        color: theme.colors.primary.main,
      },
    }),
  };

  const selectedOption = options.find((o) => o.value === inputType) || null;

  const handleChange = (selected: { value: string; label: string } | null) => {
    setInputType(selected?.value || "");
  };

  return (
    <div style={{ marginTop: 20 }}>
      <label htmlFor="input-type-select" style={{ display: "block", marginBottom: 5, color: theme.colors.text.primary }}>
        Select Input Type:
      </label>
      <Select
        id="input-type-select"
        value={selectedOption}
        onChange={handleChange}
        options={options}
        isClearable={false}
        styles={customStyles}
        theme={(selectTheme) => ({
          ...selectTheme,
          colors: {
            ...selectTheme.colors,
            primary: theme.colors.primary.main,
            neutral0: theme.colors.background.secondary, // background of menu
            neutral80: theme.colors.text.primary, // text color
          },
        })}
      />
    </div>
  );
}
