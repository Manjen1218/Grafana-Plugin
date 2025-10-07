import React, { useEffect, useState, useMemo } from "react";
import { useTheme2, Button } from '@grafana/ui';
import FileUploader from "./components/FileUpLoader";
import TextInputArea from "./components/TextInputArea";
import SkuSelector from "./components/SkuSelector";
import PreviewBox from "./components/PreviewBox";
import ErrorMessage from "./components/ErrorMessage";
import ConfirmDownloadButton from "./components/ConfirmDownloadButton";
import SnFileSelector from "./components/FileSelector";


export default function FileDropZone() {
  const [sku, setSku] = useState("");
  const [skuList, setSkuList] = useState<string[]>([]);
  const [fileContent, setFileContent] = useState<string | ArrayBuffer | null>(null);
  const [serialNumbersStr, setSerialNumbersStr] = useState<string>("");
  const [textInput, setTextInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedSnFiles, setSelectedSnFiles] = useState<Record<string, string[]>>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const theme = useTheme2();

  const goNext = () => setCurrentStep((s) => Math.min(s + 1, 2));
  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 0));

  useEffect(() => {
    fetch("http://192.168.50.206:3001/databases")
      .then((res) => res.json())
      .then((data) => setSkuList(Array.isArray(data.skus) ? data.skus : []))
      .catch(() => setSkuList([]));
  }, []);

  const sendFileToBackend = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("http://192.168.50.206:3001/upload-file", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unknown error");
      setSerialNumbersStr(result.serialNumbers);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to send file");
      setSerialNumbersStr("");
    }
  };

  const snList = useMemo(() => {
    if (serialNumbersStr) return serialNumbersStr;
    return textInput
      .split(/[\s,]+/)
      .map((sn) => sn.trim())
      .filter(Boolean)
      .join(",");
  }, [serialNumbersStr, textInput]);

  const readFile = (file: File) => {
    const reader = new FileReader();
    const fileName = file.name.toLowerCase();
    reader.onload = (e) => {
      const text = e.target?.result;
      setFileContent(text ?? null);
      setError(null);
      setSerialNumbersStr("");
      if (fileName.endsWith(".csv") || fileName.endsWith(".xlsx") || fileName.endsWith(".txt")) {
        sendFileToBackend(file);
      } sendFileToBackend(file);
    };
    reader.onerror = () => {
      setError("Failed to read file");
      setFileContent(null);
      setSerialNumbersStr("");
    };
    if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) reader.readAsText(file);
    else if (fileName.endsWith(".xlsx")) reader.readAsArrayBuffer(file);
    else {
      setError("Unsupported file type");
    }
  };

  const handleSelectionChange = React.useCallback((selection: Record<string, string[]>) => {
    setSelectedSnFiles(selection);
  }, []);

  const startDownload = async () => {
    if (!sku) return;
  
    setIsDownloading(true);
    setDownloadProgress(0);
  
    try {
      const snList = Object.keys(selectedSnFiles);
      const totalSNs = snList.length;

      if (totalSNs > 600) {
        throw new Error("Too many files to download at once. Please split up the SNs into batches.");
      }
  
      const response = await fetch("http://192.168.50.201:3001/download_multi_sn_stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          db: sku, 
          files: selectedSnFiles
        }),
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Download failed");
      }
  
      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
  
      let receivedLength = 0;
      const chunks = [];
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
  
        chunks.push(value);
        receivedLength += value.length;
        
        // Update progress (rough estimate)
        setDownloadProgress(Math.min(95, Math.round((receivedLength / (1024 * 1024 * 100)) * 100)));
      }
  
      // Complete download
      setDownloadProgress(100);
      
      const blob = new Blob(chunks, { type: 'application/gzip' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${sku}_download_${Date.now()}.tar.gz`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
  
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert("Download error: " + err.message);
      } else {
        alert("Download error: Unknown error");
      }
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const hasSNs = serialNumbersStr || textInput;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100%",
        width: "100%",
        backgroundColor: theme.colors.background.primary
      }}
    >
      <div style={{ padding: 20, width: "100%", maxWidth: 600 }}>
        {currentStep === 0 && (
          <>
            <FileUploader readFile={readFile} />
            <TextInputArea value={textInput} onChange={setTextInput} />
          </>
        )}

        {currentStep === 1 && (
          <>
            <SkuSelector sku={sku} setSku={setSku} skuList={skuList} />
            {(hasSNs || fileContent) && (
              <PreviewBox
                serialNumbersStr={serialNumbersStr}
                textInput={textInput}
                fileContent={fileContent}
              />
            )}
          </>
        )}

        {currentStep === 2 && (
          <SnFileSelector
            db={sku}
            snList={snList}
            onSelectionChange={handleSelectionChange}
          />
        )}

        <ErrorMessage error={error} />

        {/* Unified Navigation Buttons */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
          <Button variant="secondary" onClick={goBack} disabled={currentStep === 0}>
            Back
          </Button>

          {currentStep < 2 ? (
            <Button
              variant="primary"
              onClick={goNext}
              disabled={(currentStep === 1 && !hasSNs) || (currentStep === 2 && !sku)}
            >
              Next
            </Button>
          ) : (
            isDownloading ? (
              <p>Downloading, please wait...</p>
            ) : (
              <ConfirmDownloadButton onClick={startDownload} />
            )
          )}
        </div>
      </div>
    </div>
  );
}
