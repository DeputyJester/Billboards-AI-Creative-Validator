// pages/upload-specs.tsx
import { useState, useEffect } from "react";
import axios from "axios";
import { FaCloudUploadAlt } from "react-icons/fa";
import { toast } from "sonner";
import supabase from "@/lib/supabaseclient";

interface RowData {
  [key: string]: any;
}

interface UserProfile {
  organization_id: string;
}

// Convert "15' 9\"" ➜ 15.75
function feetInchesToDecimal(value: string): number | null {
  try {
    if (!value || typeof value !== "string") return null;
    const match = value.match(/(\d+)'(?:\s*(\d+))?("|”)?/);
    if (!match) return null;
    const feet = parseInt(match[1], 10);
    const inches = match[2] ? parseInt(match[2], 10) : 0;
    return parseFloat((feet + inches / 12).toFixed(2));
  } catch (e) {
    console.error("Failed to parse feet/inches:", value, e);
    return null;
  }
}

// --- helpers ---
function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).trim());
  return Number.isFinite(n) ? n : null;
}
function normalizeState(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toUpperCase();
  return s.length <= 2 ? s : s.slice(0, 2);
}
function normalizeZip(v: any): string | null {
  if (v === null || v === undefined) return null;
  const raw = String(v).trim();
  const digits = raw.replace(/[^\d-]/g, "");
  return digits || null;
}
function normalizeFaceDirection(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toUpperCase();
  const allowed = new Set(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);
  return allowed.has(s) ? s : s || null;
}
function normalizeFaceRead(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toUpperCase();
  if (s === "LHR" || s === "LEFT" || s === "LEFT HAND READ") return "LHR";
  if (s === "RHR" || s === "RIGHT" || s === "RIGHT HAND READ") return "RHR";
  return s || null;
}
function isValidLat(n: number | null): boolean {
  return typeof n === "number" && n >= -90 && n <= 90;
}
function isValidLng(n: number | null): boolean {
  return typeof n === "number" && n >= -180 && n <= 180;
}

export default function UploadSpecsPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<RowData[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchUserProfile = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        console.error("Failed to get user:", userError);
        return;
      }
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("organization_id")
        .eq("id", userData.user.id)
        .single();

      if (profileError) {
        console.error("Failed to get user profile:", profileError);
        return;
      }
      if (isMounted) setUserProfile(profile);
    };
    fetchUserProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  // Keep existing UX; core fields required + our location fields
  const requiredFields = [
    "board_name",
    "width_px",
    "height_px",
    "width_ft",
    "height_ft",
    "color_mode",
    "preferred_file_format",
    "supported_file_format",
    "max_file_size_mb",
    "dpi_min",
    "dpi_max",
    // location requirements
    "latitude",
    "longitude",
    "city",
    "state",
    "zipcode",
  ];

  const optionalFields = [
    "location",
    "spec_group",
    "notes",
    "supported_animated_file_format",
    "face_direction",
    "face_read",
    "county",
    "geopath_id",
    "board_type",
  ];

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadStatus(null);
      setPreviewData([]);
      setValidationErrors([]);
      parseFile(file);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadStatus(null);
      setPreviewData([]);
      setValidationErrors([]);
      parseFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const parseFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploading(true);
      const response = await axios.post("/api/parse-specs", formData);
      const raw = response.data.data;

      if (!Array.isArray(raw) || raw.length === 0) {
        setUploadStatus("❌ Invalid or empty file.");
        return;
      }

      const [rawHeaders, ...rows] = raw;
      if (!Array.isArray(rawHeaders)) {
        setUploadStatus("❌ Invalid format. First row must contain header labels.");
        return;
      }

      const headers = rawHeaders.map((h: any) => h?.toString().trim());
      const data: RowData[] = [];
      rows.forEach((row: any[]) => {
        const rowData: RowData = {};
        headers.forEach((header, i) => {
          rowData[header] = row[i];
        });
        data.push(rowData);
      });

      // Validation (presence + simple checks)
      const errors: string[] = [];
      data.forEach((row, i) => {
        requiredFields.forEach((field) => {
          if (row[field] === undefined || row[field] === null || String(row[field]).trim() === "") {
            errors.push(`Row ${i + 2}: Missing "${field}"`);
          }
        });

        const lat = toNumberOrNull(row.latitude);
        const lng = toNumberOrNull(row.longitude);
        if (row.latitude !== undefined && !isValidLat(lat)) {
          errors.push(`Row ${i + 2}: "latitude" must be a number between -90 and 90`);
        }
        if (row.longitude !== undefined && !isValidLng(lng)) {
          errors.push(`Row ${i + 2}: "longitude" must be a number between -180 and 180`);
        }
        if (row.state !== undefined && String(row.state).trim().length < 2) {
          errors.push(`Row ${i + 2}: "state" looks too short; use 2-letter code (e.g., NV)`);
        }
        if (row.zipcode !== undefined) {
          const z = normalizeZip(row.zipcode);
          if (!z || !/^\d{5}(-\d{4})?$/.test(z)) {
            errors.push(`Row ${i + 2}: "zipcode" should be 5 digits or ZIP+4 (e.g., 89101 or 89101-1234)`);
          }
        }
      });

      // Preflight duplicate detection within the single sheet upload
      const seenGeo = new Set<string>();
      const seenSizeKey = new Set<string>();
      const dupErrors: string[] = [];
      data.forEach((row, i) => {
        const geo = row.geopath_id ? String(row.geopath_id).trim() : "";
        if (geo) {
          const k = geo.toUpperCase();
          if (seenGeo.has(k)) dupErrors.push(`Row ${i + 2}: Duplicate geopath_id "${geo}" in this upload.`);
          seenGeo.add(k);
        }
        const name = (row.board_name ?? "").toString().trim();
        const w = toNumberOrNull(row.width_px);
        const h = toNumberOrNull(row.height_px);
        if (name && w !== null && h !== null) {
          const k2 = `${name}::${w}x${h}`.toUpperCase();
          if (seenSizeKey.has(k2)) dupErrors.push(`Row ${i + 2}: Duplicate board_name+size "${name} ${w}x${h}" in this upload.`);
          seenSizeKey.add(k2);
        }
      });
      if (dupErrors.length > 0) {
        errors.push(...dupErrors);
      }

      setValidationErrors(errors);
      setPreviewData(data);
      setUploadStatus(
        errors.length === 0
          ? `✅ Parsed ${data.length} rows successfully.`
          : "⚠️ Some rows have missing or invalid fields."
      );
    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus("❌ Failed to parse file.");
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const link = document.createElement("a");
    link.href = "/templates/billboard-spec-template-v2.xlsx";
    link.download = "Billboard Spec Template v2.xlsx";
    link.click();
  };

  const handleSubmit = async () => {
    if (!previewData || previewData.length === 0) return;

    try {
      if (!userProfile) {
        toast.warning("Please wait while your organization is being loaded.");
        return;
      }
      const orgId = userProfile.organization_id;
      if (!orgId) {
        toast.error("Organization not found for your user.");
        return;
      }

      // Final client-side duplicate guard (same logic as parse step)
      const dupSheetErrors: string[] = [];
      const seenGeo = new Set<string>();
      const seenSizeKey = new Set<string>();
      previewData.forEach((row, i) => {
        const geo = row.geopath_id ? String(row.geopath_id).trim() : "";
        if (geo) {
          const k = geo.toUpperCase();
          if (seenGeo.has(k)) dupSheetErrors.push(`Row ${i + 2}: Duplicate geopath_id "${geo}" in this upload.`);
          seenGeo.add(k);
        }
        const name = (row.board_name ?? "").toString().trim();
        const w = toNumberOrNull(row.width_px);
        const h = toNumberOrNull(row.height_px);
        if (name && w !== null && h !== null) {
          const k2 = `${name}::${w}x${h}`.toUpperCase();
          if (seenSizeKey.has(k2)) dupSheetErrors.push(`Row ${i + 2}: Duplicate board_name+size "${name} ${w}x${h}" in this upload.`);
          seenSizeKey.add(k2);
        }
      });
      if (dupSheetErrors.length > 0) {
        toast.error("❌ Duplicate row(s) detected in the upload (same board_name + pixel size, or geopath_id reused on different rows). Please fix your sheet and retry.");
        setValidationErrors((prev) => [...prev, ...dupSheetErrors]);
        return;
      }

      const rowsToInsert = previewData.map((row) => {
        const widthDisplay = row.width_ft || "";
        const heightDisplay = row.height_ft || "";

        // Normalize numerics
        const latitude = toNumberOrNull(row.latitude);
        const longitude = toNumberOrNull(row.longitude);

        // 👇 NEW: force 6-decimal display strings derived from numeric values
        const latitude_display =
          latitude !== null ? latitude.toFixed(6) : null;
        const longitude_display =
          longitude !== null ? longitude.toFixed(6) : null;

        return {
          ...row,
          organization_id: orgId,

          // feet displays + numeric
          width_ft: feetInchesToDecimal(row.width_ft),
          height_ft: feetInchesToDecimal(row.height_ft),
          width_display: widthDisplay,
          height_display: heightDisplay,

          // normalized location/admin fields
          latitude,
          longitude,
          latitude_display,
          longitude_display,
          zipcode: normalizeZip(row.zipcode),
          city: row.city ? String(row.city).trim() : null,
          state: normalizeState(row.state),
          county: row.county ? String(row.county).trim() : null,
          face_direction: normalizeFaceDirection(row.face_direction),
          face_read: normalizeFaceRead(row.face_read),
          geopath_id: row.geopath_id ? String(row.geopath_id).trim() : null,

          // keep spec_group/board_type if present (no transformation here)
          spec_group: row.spec_group ?? null,
          board_type: row.board_type ?? null,
        };
      });

      // Split by presence of geopath_id for upsert
      const rowsWithGeo = rowsToInsert.filter(
        (r) => r.geopath_id && String(r.geopath_id).trim() !== ""
      );
      const rowsWithoutGeo = rowsToInsert.filter(
        (r) => !r.geopath_id || String(r.geopath_id).trim() === ""
      );

      // 1) Upsert when GeoPath is present (organization_id, geopath_id)
      if (rowsWithGeo.length > 0) {
        const { error: geoErr } = await supabase
          .from("boards")
          .upsert(rowsWithGeo, { onConflict: "organization_id,geopath_id" });
        if (geoErr) {
          console.error(geoErr);
          throw geoErr;
        }
      }

      // 2) Otherwise upsert by (organization_id, board_name, width_px, height_px)
      if (rowsWithoutGeo.length > 0) {
        const { error: nameErr } = await supabase
          .from("boards")
          .upsert(rowsWithoutGeo, {
            onConflict: "organization_id,board_name,width_px,height_px",
          });
        if (nameErr) {
          console.error(nameErr);
          throw nameErr;
        }
      }

      toast.success("✅ Specs submitted successfully.");
      setPreviewData([]);
      setValidationErrors([]);
      setUploadStatus(null);
      setSelectedFile(null);
    } catch (err: any) {
      console.error("Submission error:", err);
      if (err?.code === "23505") {
        toast.error(
          "❌ Duplicate row(s) detected in the upload (board_name+size or geopath_id). I deduped, but please check your sheet."
        );
      } else if (err?.message) {
        toast.error(`Submission failed: ${err.message}`);
      } else {
        toast.error("Submission failed. Please try again.");
      }
    }
  };

  const groupedData: Record<string, RowData[]> = previewData.reduce((acc, row) => {
    const groupKey = row["spec_group"] || "Ungrouped";
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(row);
    return acc;
  }, {} as Record<string, RowData[]>);

  return (
    <div className="min-h-screen bg-white">
      {/* header is rendered globally by /pages/_app.js */}
      <div className="py-10 px-6 flex flex-col items-center">
        <h1 className="text-3xl font-bold mb-6">📥 Upload Billboard Specs</h1>

        <button
          onClick={handleDownloadTemplate}
          className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700 transition mb-6"
        >
          📄 Download Template
        </button>

        <div className="w-full max-w-md space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-gray-400 rounded-xl h-48 flex flex-col items-center justify-center text-gray-600 hover:border-blue-500 transition cursor-pointer"
          >
            <FaCloudUploadAlt className="text-4xl mb-2" />
            <p className="font-medium">Drag & Drop Excel file here</p>
            <p className="text-sm text-gray-400">(Only .xlsx files are accepted)</p>
          </div>

          <div className="text-center text-gray-500">— or —</div>

          <div className="relative">
            <input
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 z-10 cursor-pointer"
            />
            <div className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700 transition text-center">
              📁 Choose Excel File
            </div>
          </div>

          {selectedFile && (
            <p className="text-sm text-gray-700 mt-2 text-center">
              Selected: <strong>{selectedFile.name}</strong>
            </p>
          )}

          {uploadStatus && (
            <p className="text-center mt-4 font-medium text-sm text-gray-700">
              {uploadStatus}
            </p>
          )}
        </div>

        {!userProfile && (
          <p className="mt-4 text-sm text-gray-500">🔄 Loading organization information…</p>
        )}

        {validationErrors.length > 0 && (
          <div className="mt-6 bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded max-w-2xl w-full">
            <strong className="block mb-2">⚠️ Validation Issues:</strong>
            <ul className="list-disc list-inside text-sm">
              {validationErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {previewData.length > 0 && (
          <div className="w-full mt-10 max-w-7xl">
            {Object.entries(groupedData).map(([group, rows], gIdx) => (
              <div key={gIdx} className="mb-8 border border-gray-300 rounded shadow-sm">
                <div
                  onClick={() => toggleGroup(group)}
                  className="cursor-pointer bg-gray-100 px-4 py-2 flex justify-between items-center"
                >
                  <span className="font-semibold text-gray-800">
                    📦 {group === "Ungrouped" ? "Ungrouped Boards" : `Group: ${group}`} ({rows.length})
                  </span>
                  <span className="text-sm text-blue-600">
                    {expandedGroups[group] ? "Collapse ▲" : "Expand ▼"}
                  </span>
                </div>
                {expandedGroups[group] && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full table-auto border border-collapse border-gray-200 text-sm">
                      <thead className="bg-gray-200">
                        <tr>
                          {Object.keys(rows[0]).map((header, i) => (
                            <th key={i} className="border px-3 py-2 text-left text-gray-700">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, rowIndex) => {
                          const rowErrors = validationErrors.filter((e) =>
                            e.startsWith(`Row ${previewData.indexOf(row) + 2}`)
                          );
                          return (
                            <tr
                              key={rowIndex}
                              className={`${rowErrors.length > 0
                                ? "bg-red-100"
                                : gIdx % 2 === 0
                                  ? "bg-white"
                                  : "bg-gray-50"
                                }`}
                            >
                              {Object.values(row).map((value, i) => (
                                <td key={i} className="border px-3 py-2 text-gray-800">
                                  {String(value ?? "")}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}

            {/* Submit Button */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500 mb-2">
                ⚠️ Please ensure your data is correct before submitting. If there are any mistakes, you will need to contact support to make changes.
              </p>
              <button
                onClick={handleSubmit}
                disabled={!userProfile || uploading}
                className={`${!userProfile || uploading ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                  } text-white px-6 py-2 rounded shadow transition`}
              >
                ✅ Approve and Submit
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
