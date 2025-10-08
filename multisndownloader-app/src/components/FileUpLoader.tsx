import React, { useState } from "react";
import { useTheme2 } from "@grafana/ui";

type Props = {
  readFile: (file: File) => void;
};

export default function FileUploader({ readFile }: Props) {
  const theme = useTheme2();
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const handleFile = (file: File) => {
    setUploadedFileName(file.name);
    readFile(file);
  };

  return (
    <div style={{ marginTop: theme.spacing(3) }}>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
            e.dataTransfer.clearData();
          }
        }}
        onClick={() => document.getElementById("fileInput")?.click()}
        style={{
          padding: theme.spacing(6),
          border: `2px dashed ${theme.colors.border.weak}`,
          borderRadius: theme.shape.borderRadius(),
          textAlign: "center",
          cursor: "pointer",
          color: theme.colors.text.secondary,
          backgroundColor: theme.colors.background.secondary,
          transition: "background-color 0.2s ease-in-out",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = theme.colors.background.elevated)
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = theme.colors.background.secondary)
        }
      >
        <p>
          Drag & drop your <strong>.csv</strong> or <strong>.xlsx</strong> or <strong>.txt</strong> file here,
          or click to select
        </p>
        <input
          id="fileInput"
          type="file"
          accept={".csv, .xlsx, .txt"}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFile(e.target.files[0]);
            }
          }}
          style={{ display: "none" }}
        />
      </div>

      {uploadedFileName && (
        <div style={{ marginTop: theme.spacing(2), textAlign: "center", color: theme.colors.text.primary }}>
          <strong>Uploaded:</strong> {uploadedFileName}
        </div>
      )}
    </div>
  );
}
