// pages/api/parse-specs.ts
import * as formidable from "formidable";
import fs from "fs";
import { read, utils } from "xlsx";
import { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const form = new formidable.IncomingForm({ keepExtensions: true });

  form.parse(req, async (err, fields, files) => {
    if (err || !files.file) {
      console.error("❌ Error parsing form:", err);
      return res.status(400).json({ error: "Failed to parse file." });
    }

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    const filepath = file.filepath;

    if (!fs.existsSync(filepath)) {
      console.error("❌ File does not exist at:", filepath);
      return res.status(500).json({ error: "Uploaded file not found on disk." });
    }

    try {
      const buffer = fs.readFileSync(filepath);
      const workbook = read(buffer);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = utils.sheet_to_json(sheet, { header: 1 });

      if (!Array.isArray(raw) || raw.length === 0) {
        console.error("❌ Excel file appears empty or invalid format.");
        return res.status(400).json({ error: "Excel sheet is empty or invalid." });
      }

      const [firstRow] = raw;
      if (!Array.isArray(firstRow)) {
        console.error("❌ First row is not an array. Got:", firstRow);
        return res.status(400).json({ error: "Invalid format. First row must contain header labels." });
      }

      return res.status(200).json({ data: raw });
    } catch (e) {
      console.error("❌ Exception reading Excel file:", e);
      return res.status(500).json({ error: "Failed to process Excel file." });
    }
  });
}
