// pages/upload-specs.tsx
import { useState, useEffect } from "react";
import axios from "axios";
import { FaCloudUploadAlt } from "react-icons/fa";
import { toast } from "sonner";
// ⛔ removed: import Header from "../components/header";

import supabase from "@/lib/supabaseclient";

interface RowData {
  [key: string]: any;
}

interface UserProfile {
  organization_id: string;
}

// 🔧 Convert string like "15' 9"" to decimal (e.g. 15.75)
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

  const requiredFields = [
    "board_name",
    "location",
    "width_px",
    "height_px",
    "width_ft",
    "height_ft",
    "color_mode",
    "pixel_aspect_ratio",
    "preferred_file_format",
    "supported_file_format",
    "max_file_size_mb",
    "dpi_min",
    "dpi_max",
  ];

  const optionalFields = [
    "spec_group",
    "notes",
    "supported_animated_file_format",
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

      const errors: string[] = [];
      data.forEach((row, i) => {
        requiredFields.forEach((field) => {
          if (!row[field] || row[field].toString().trim() === "") {
            errors.push(`Row ${i + 2}: Missing "${field}"`);
          }
        });
      });

      setValidationErrors(errors);
      setPreviewData(data);
      setUploadStatus(
        errors.length === 0
          ? `✅ Parsed ${data.length} rows successfully.`
          : "⚠️ Some rows have missing required fields."
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
    link.href = "/templates/billboard-spec-template-full.xlsx";
    link.download = "Billboard Spec Template.xlsx";
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

      const rowsToInsert = previewData.map((row) => {
        const widthDisplay = row.width_ft || "";
        const heightDisplay = row.height_ft || "";

        return {
          ...row,
          organization_id: orgId,
          width_ft: feetInchesToDecimal(row.width_ft),
          height_ft: feetInchesToDecimal(row.height_ft),
          width_display: widthDisplay,
          height_display: heightDisplay,
        };
      });

      console.log("Submitting rows:", rowsToInsert);

      const { error } = await supabase.from("boards").insert(rowsToInsert);

      if (error) {
        console.error("Supabase insert error:", error);
        toast.error("Submission failed. Please try again.");
        return;
      }

      toast.success("✅ Specs submitted successfully.");
      setPreviewData([]);
      setValidationErrors([]);
      setUploadStatus(null);
      setSelectedFile(null);
    } catch (err) {
      console.error("Submission error:", err);
      toast.error("Error submitting specs. Please try again.");
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
                              className={`${
                                rowErrors.length > 0
                                  ? "bg-red-100"
                                  : gIdx % 2 === 0
                                  ? "bg-white"
                                  : "bg-gray-50"
                              }`}
                            >
                              {Object.values(row).map((value, i) => (
                                <td key={i} className="border px-3 py-2 text-gray-800">
                                  {value as string}
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
                disabled={!userProfile}
                className={`${
                  !userProfile ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
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
