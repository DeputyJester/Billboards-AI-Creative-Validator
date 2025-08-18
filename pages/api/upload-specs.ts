// pages/api/upload-specs.ts
import { NextApiRequest, NextApiResponse } from "next";
import formidable from "formidable";
import * as XLSX from "xlsx";
import fs from "fs";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const form = new formidable.IncomingForm({
    keepExtensions: true,
    maxFileSize: 10 * 1024 * 1024, // 10MB limit
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parsing error:", err);
      return res.status(500).json({ message: "Error parsing form" });
    }

    const uploadedFile = files.file?.[0] || files.file;

    if (!uploadedFile || !uploadedFile.filepath) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    try {
      const workbook = XLSX.readFile(uploadedFile.filepath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      // Sample structure validation (feel free to adjust column names as needed)
      const requiredFields = [
        "Board Name",
        "Artwork Width (px)",
        "Artwork Height (px)",
        "Min DPI",
        "Accepted File Types",
        "Billboard Size (ft)",
        "Facing",
        "Location Notes",
        "Customer Facing Notes",
        "Spec Group Name",
      ];

      const missingColumns = requiredFields.filter(
        (field) => !Object.keys(json[0] || {}).includes(field)
      );

      if (missingColumns.length > 0) {
        return res.status(400).json({
          message: `Missing required columns: ${missingColumns.join(", ")}`,
        });
      }

      console.log("✅ Parsed Excel Data:", json);

      // Eventually: save to Supabase
      // const processedData = json.map((row) => ({}))

      return res.status(200).json({ message: "Parsed successfully", data: json });
    } catch (error) {
      console.error("Excel parsing error:", error);
      return res.status(500).json({ message: "Error processing Excel file" });
    } finally {
      // Cleanup temp file
      fs.unlink(uploadedFile.filepath, () => {});
    }
  });
}
