import React, { useEffect, useState, useRef } from "react";
import { Tooltip } from "react-tooltip";
import "react-tooltip/dist/react-tooltip.css";
import { useTheme2 } from "@grafana/ui";

type FileInfo = {
  fullpath: string, 
  sku: string;
  bname: string;
  tbeg: string;
  status: string;
  is_y: number;
  table_name: string;
};

type SnFileMap = Record<string, FileInfo[]>;

type Props = {
  db: string;
  snList: string;
  onSelectionChange: (selected: Record<string, string[]>) => void;
};

export default function SnFileSelector({ db, snList, onSelectionChange }: Props) {
  const theme = useTheme2();

  const [snFileMap, setSnFileMap] = useState<SnFileMap>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lastOutputRef = useRef<Record<string, string[]> | null>(null);

  // Filter states
  const [showY, setShowY] = useState(true);
  const [showN, setShowN] = useState(true);
  const [showPass, setShowPass] = useState(true);
  const [showFail, setShowFail] = useState(true);

  // === Helper Functions ===

  const applyFilters = (file: FileInfo) => {
    const passFailMatch =
      (file.status.toLowerCase() === "pass" && showPass) ||
      (file.status.toLowerCase() === "fail" && showFail);
    const yMatch =
      (file.is_y === 1 && showY) ||
      (file.is_y === 0 && showN);
    return passFailMatch && yMatch;
  };

  const toggleFilter = (filterSetter: React.Dispatch<React.SetStateAction<boolean>>, currentValue: boolean, otherValue: boolean) => {
    if (!otherValue && currentValue) return;
    filterSetter(!currentValue);
  };

  const toggleFile = (sn: string, fullpath: string) => {
    setSelectedFiles(prev => {
      const updated = new Set(prev[sn]);
      updated.has(fullpath) ? updated.delete(fullpath) : updated.add(fullpath);
      return { ...prev, [sn]: updated };
    });
  };

  const computeTotalSelected = () => {
    return Object.entries(snFileMap).reduce((sum, [sn, files]) => {
      const selectedSet = selectedFiles[sn] || new Set();
      const filtered = files.filter(applyFilters);
      return sum + filtered.filter(f => selectedSet.has(f.fullpath)).length;
    }, 0);
  };
  

  // === Effects ===

  useEffect(() => { 
    if (!db || snList.length === 0) return; 

    let cancelled = false; 
    setLoading(true); 
    setError(null); 
    
    const fetchPage = async (page: number) => { 
      try { 
        const res = await fetch("http://localhost:3000/sn_filepaths", { 
          method: "POST", 
          headers: { "Content-Type": "application/json" }, 
          body: JSON.stringify({ db, snList, page, limit: 50 }), 
        }); 
        
        if (!res.ok) throw new Error(await res.text()); 
        const { data }: { data: SnFileMap } = await res.json(); 
        
        if (!cancelled) { 
          setSnFileMap(prev => ({ ...prev, ...data })); 
          
          // initialize selection only for new SNs 
          setSelectedFiles(prev => { 
            const next = { ...prev }; 
            
            for (const sn in data) { 
              if (!next[sn]) { 
                next[sn] = new Set(data[sn].map(f => f.fullpath)); 
              } 
            } 
            return next; 
          }); 
        } // if we got results, fetch next page 
        if (Object.keys(data).length > 0) { 
          fetchPage(page + 1); 
        } 
      } catch (err: any) { 
        if (!cancelled) setError(err.message || "Failed to fetch file paths."); 
      } finally {
        if (!cancelled && page === 1) setLoading(false); 
      } 
    }; 
    
    fetchPage(1); 
    return () => { 
      cancelled = true; 
    }; 
  }, [db, JSON.stringify(snList)]);

  useEffect(() => {
    const output: Record<string, string[]> = {};

    for (const sn in selectedFiles) {
      const visibleFiles = snFileMap[sn]?.filter(applyFilters) ?? [];
      const visiblePaths = new Set(visibleFiles.map(f => f.fullpath));
      output[sn] = Array.from(selectedFiles[sn]).filter(fp => visiblePaths.has(fp));
    }

    const deepEqual = (a: Record<string, string[]>, b: Record<string, string[]>) => {
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      for (const key of keysA) {
        if (!b[key] || a[key].length !== b[key].length) return false;
        if (a[key].some((v, i) => v !== b[key][i])) return false;
      }
      return true;
    };

    if (!lastOutputRef.current || !deepEqual(lastOutputRef.current, output)) {
      lastOutputRef.current = output;
      onSelectionChange(output);
    }
  }, [selectedFiles, showY, showN, showPass, showFail, snFileMap, onSelectionChange]);

  // === Render ===

  if (loading) return <div style={{ color: theme.colors.text.secondary }}>Loading file paths...</div>;
  if (error) return <div style={{ color: theme.colors.error.main }}>{error}</div>;
  if (Object.keys(snFileMap).length === 0) return <p style={{ color: theme.colors.text.secondary }}>No files found for serial numbers.</p>;

  const totalSelected = computeTotalSelected();

  return (
    <div style={{ marginTop: theme.spacing(3), width: "100%" }}>
      <h3 style={{ color: theme.colors.text.primary }}>
        Select Files to Include: <span style={{ color: theme.colors.primary.main }}>{totalSelected} Files</span>
      </h3>

      {/* Filters */}
      <div style={{
        marginBottom: theme.spacing(3),
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: 4,
        padding: theme.spacing(2),
        backgroundColor: theme.colors.background.secondary,
      }}>
        <strong style={{ color: theme.colors.text.primary }}>Filters:</strong>
        <div style={{
          marginTop: theme.spacing(1),
          display: "flex",
          flexWrap: "wrap",
          gap: theme.spacing(2),
          color: theme.colors.text.primary,
        }}>
          <label style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showY}
              onChange={() => toggleFilter(setShowY, showY, showN)}
              style={{ marginRight: 6, cursor: "pointer" }}
            />
            Y
          </label>
          <label style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showN}
              onChange={() => toggleFilter(setShowN, showN, showY)}
              style={{ marginRight: 6, cursor: "pointer" }}
            />
            N
          </label>
          <label style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showPass}
              onChange={() => toggleFilter(setShowPass, showPass, showFail)}
              style={{ marginRight: 6, cursor: "pointer" }}
            />
            Pass
          </label>
          <label style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={showFail}
              onChange={() => toggleFilter(setShowFail, showFail, showPass)}
              style={{ marginRight: 6, cursor: "pointer" }}
            />
            Fail
          </label>
        </div>
      </div>

      {/* File list */}
      <div style={{
        maxHeight: "50vh",
        overflowY: "auto",
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: 4,
        padding: `${theme.spacing(2)} ${theme.spacing(3)}`,
        backgroundColor: theme.colors.background.canvas,
      }}>
        {Object.entries(snFileMap).map(([sn, files]) => {
          const visibleFiles = files.filter(applyFilters);

          return (
            <div key={sn} style={{ marginBottom: theme.spacing(3) }}>
              <strong style={{ fontSize: 15, color: theme.colors.text.primary }}>{sn}:</strong>
              <ul style={{
                listStyle: "none",
                paddingLeft: 0,
                marginTop: theme.spacing(1),
              }}>
                {visibleFiles.length === 0 && (
                  <li style={{ fontStyle: "italic", color: theme.colors.text.secondary }}>
                    No files match filter.
                  </li>
                )}
                {visibleFiles.map(file => {
                  const { sku, bname, tbeg, status, is_y, table_name, fullpath } = file;
                  const query = new URLSearchParams({ sku, ts: table_name, date: tbeg, name: bname }).toString();

                  return (
                    <li key={`${sn}-${bname}`} style={{ marginBottom: 6, display: "flex", alignItems: "center" }}>
                      <label style={{
                        display: "flex",
                        alignItems: "center",
                        userSelect: "none",
                        flex: 1,
                        color: theme.colors.text.primary,
                      }}>
                        <input
                          type="checkbox"
                          checked={selectedFiles[sn]?.has(fullpath) || false}
                          onChange={() => toggleFile(sn, fullpath)}
                          style={{ marginRight: 8, cursor: "pointer" }}
                        />
                        <span
                          style={{
                            color: theme.colors.primary.main,
                            textDecoration: "underline",
                            cursor: "pointer",
                            fontSize: 14,
                          }}
                          data-tooltip-id={`tooltip-${sn}-${bname}`}
                        >
                          {bname}
                        </span>
                        <span style={{ marginLeft: 10, fontSize: 12, color: theme.colors.text.secondary }}>
                          [{table_name}] [{status}] {is_y ? "(Y)" : "(N)"}
                        </span>
                      </label>

                      <Tooltip id={`tooltip-${sn}-${bname}`} place="top" clickable>
                        <a
                          href={`/a/logviewer-app/?${query}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            cursor: "pointer",
                            color: theme.colors.primary.contrastText,
                            textDecoration: "underline",
                          }}
                        >
                          Open log viewer
                        </a>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
