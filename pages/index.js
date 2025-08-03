import { useState } from 'react';

const billboardProfiles = {
  digital_14x48: {
    name: "14x48 Digital Billboard",
    width: 858,
    height: 242,
    maxSizeMB: 25,
    allowedTypes: ["image/jpeg", "image/png", "image/bmp"]
  },
  digital_17x29: {
    name: "17x29 Digital Billboard",
    width: 576,
    height: 336,
    maxSizeMB: 25,
    allowedTypes: ["image/jpeg", "image/png", "image/bmp"]
  },
  digital_20x10: {
    name: "20x10 Digital Billboard",
    width: 288,
    height: 576,
    maxSizeMB: 25,
    allowedTypes: ["image/jpeg", "image/png", "image/bmp"]
  },
  digital_12x27: {
    name: "12x27 Digital Billboard",
    width: 832,
    height: 368,
    maxSizeMB: 25,
    allowedTypes: ["image/jpeg", "image/png", "image/bmp"]
  },
  digital_17x8: {
    name: "17x8 Digital Billboard",
    width: 160,
    height: 320,
    maxSizeMB: 25,
    allowedTypes: ["image/jpeg", "image/png", "image/bmp"],
    filenameRules: {
      disallowedCharacters: /[^a-zA-Z0-9\s.]/g,
      note: "Avoid special characters (!@#$%^&* etc). Use only letters, numbers, spaces, and .jpg"
    }
  }
};

export default function Home() {
  const [selectedBoard, setSelectedBoard] = useState("");
  const [file, setFile] = useState(null);
  const [isValid, setIsValid] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  const validateFile = async (file, specs) => {
    if (!file || !specs) return;

    if (!specs.allowedTypes.includes(file.type)) {
      setIsValid(false);
      setValidationMessage("Invalid file type.");
      return;
    }

    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > specs.maxSizeMB) {
      setIsValid(false);
      setValidationMessage("File size exceeds limit.");
      return;
    }

    if (
      selectedBoard === "digital_17x8" &&
      file.name.match(billboardProfiles[selectedBoard].filenameRules.disallowedCharacters)
    ) {
      setIsValid(false);
      setValidationMessage("Filename contains invalid characters.");
      return;
    }

    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      if (img.width !== specs.width || img.height !== specs.height) {
        setIsValid(false);
        setValidationMessage(
          `Image must be ${specs.width}x${specs.height}px. Uploaded image is ${img.width}x${img.height}px.`
        );
      } else {
        setIsValid(true);
        setValidationMessage("File is valid and ready to submit.");
      }
    };
  };

  const handleFileChange = (e) => {
    const uploadedFile = e.target.files[0];
    setFile(uploadedFile);
    const specs = billboardProfiles[selectedBoard];
    validateFile(uploadedFile, specs);
  };

  const clearSelection = () => {
    setSelectedBoard("");
    setFile(null);
    setIsValid(false);
    setValidationMessage("");
    document.getElementById("fileInput").value = null;
  };

  const specs = selectedBoard ? billboardProfiles[selectedBoard] : null;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <img src="/AdVisionAI.svg" alt="AdVisionAI Logo" className="w-48 h-auto mb-4" />
      <h1 className="text-4xl font-bold mb-2">AdVisionAI</h1>
      <h2 className="text-xl font-semibold mb-4">Upload Your Billboard Artwork</h2>

      <select
        className="mb-4 border rounded px-4 py-2"
        value={selectedBoard}
        onChange={(e) => {
          setSelectedBoard(e.target.value);
          setFile(null);
          setIsValid(false);
          setValidationMessage("");
          document.getElementById("fileInput").value = null;
        }}
      >
        <option value="" disabled>
          Select a Billboard Type
        </option>
        {Object.entries(billboardProfiles).map(([key, profile]) => (
          <option key={key} value={key}>
            {profile.name}
          </option>
        ))}
      </select>

      {specs && (
        <div className="mb-4 text-sm text-gray-600 text-center">
          <p>
            <strong>Required Dimensions:</strong> {specs.width}x{specs.height}px
          </p>
          <p>
            <strong>Max File Size:</strong> {specs.maxSizeMB}MB
          </p>
          <p>
            <strong>Allowed File Types:</strong>{" "}
            {specs.allowedTypes.join(", ").replace(/image\//g, "").toUpperCase()}
          </p>
          {selectedBoard === "digital_17x8" && (
            <p>
              <strong>Filename Note:</strong> {specs.filenameRules.note}
            </p>
          )}
        </div>
      )}

      <input id="fileInput" type="file" className="mb-4" onChange={handleFileChange} />

      {file && (
        <div className="mb-4">
          <p className="text-sm text-gray-700 text-center mb-2">Preview:</p>
          <img
            src={URL.createObjectURL(file)}
            alt="Preview"
            className="max-w-full max-h-64 mx-auto border rounded"
          />
        </div>
      )}

      {validationMessage && (
        <p className={`mb-2 ${isValid ? "text-green-600" : "text-red-600"}`}>
          {validationMessage}
        </p>
      )}

      <div className="flex gap-4">
        <button
          disabled={!isValid}
          className={`px-4 py-2 rounded text-white ${
            isValid ? "bg-blue-600" : "bg-gray-400 cursor-not-allowed"
          }`}
        >
          Approve & Submit
        </button>
        <button
          onClick={clearSelection}
          className="px-4 py-2 rounded text-white bg-red-500"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
