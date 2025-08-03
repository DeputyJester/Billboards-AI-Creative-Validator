import { useState } from "react";

export default function Home() {
  const [selectedBoard, setSelectedBoard] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isValid, setIsValid] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  const billboardProfiles = {
    "14x48": {
      name: "14x48 Digital Billboard",
      width: 858,
      height: 242,
      formats: ["image/jpeg", "image/png", "image/bmp"],
    },
    "17x29": {
      name: "17x29 Digital Billboard",
      width: 576,
      height: 336,
      formats: ["image/jpeg", "image/png", "image/bmp"],
    },
    "20x10": {
      name: "20x10 Digital Billboard",
      width: 288,
      height: 576,
      formats: ["image/jpeg", "image/png", "image/bmp", "video/avi", "video/mp4", "video/quicktime"],
    },
    "12x27": {
      name: "12x27 Digital Billboard",
      width: 832,
      height: 368,
      formats: ["image/jpeg", "image/png", "image/bmp"],
    },
    "17x8": {
      name: "17x8 Digital Billboard",
      width: 160,
      height: 320,
      formats: ["image/jpeg", "image/png", "image/bmp"],
    },
  };

  const validateImage = (img, fileType) => {
    if (!selectedBoard) return;

    const { width, height, formats } = billboardProfiles[selectedBoard];

    if (img.width === width && img.height === height && formats.includes(fileType)) {
      setIsValid(true);
      setValidationMessage("✅ Image meets the specifications.");
    } else {
      setIsValid(false);
      setValidationMessage(
        `❌ Image must be ${width}x${height}px and of type ${formats.join(", ")}`
      );
    }
  };

  const handleImageUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (uploadedFile) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);

        const img = new Image();
        img.onload = () => {
          setFile(uploadedFile);
          validateImage(img, uploadedFile.type);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(uploadedFile);
    }
  };

  const clearSelection = () => {
    setSelectedBoard("");
    setFile(null);
    setPreview(null);
    setIsValid(false);
    setValidationMessage("");
    document.getElementById("fileInput").value = null;
  };

  const handleSubmit = async () => {
    if (!isValid || !file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(",")[1];

      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          boardType: billboardProfiles[selectedBoard].name,
          fileName: file.name,
          fileData: base64,
        }),
      });

      const result = await response.json();
      if (response.ok) {
        alert("Submission sent successfully!");
        clearSelection();
      } else {
        alert("Submission failed. Please try again.");
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <img src="/AdVisionAI.svg" alt="AdVisionAI Logo" className="w-48 h-auto mb-4" />

      <h1 className="text-4xl font-bold mb-2">AdVisionAI</h1>
      <h2 className="text-xl font-semibold mb-6">Upload Your Billboard Artwork</h2>

      <select
        className="mb-4 p-2 border border-gray-300 rounded"
        value={selectedBoard}
        onChange={(e) => {
          setSelectedBoard(e.target.value);
          setValidationMessage("");
          setIsValid(false);
          setFile(null);
          setPreview(null);
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

      {selectedBoard && (
        <div className="text-sm text-gray-600 mb-4 text-center max-w-md">
          Required: {billboardProfiles[selectedBoard].width}x
          {billboardProfiles[selectedBoard].height}px, formats:{" "}
          {billboardProfiles[selectedBoard].formats.join(", ")}
        </div>
      )}

      <input id="fileInput" type="file" accept="image/*,video/*" className="mb-2" onChange={handleImageUpload} />

      {preview && (
        <div className="mb-4">
          <p className="text-center mb-2">Preview:</p>
          <img src={preview} alt="Preview" className="max-w-md max-h-60 border" />
        </div>
      )}

      {validationMessage && (
        <div className={`mb-4 text-center ${isValid ? "text-green-600" : "text-red-600"}`}>
          {validationMessage}
        </div>
      )}

      <div className="flex space-x-4">
        <button
          onClick={handleSubmit}
          disabled={!isValid}
          className={`px-4 py-2 rounded text-white ${isValid ? "bg-blue-500 hover:bg-blue-600" : "bg-gray-400 cursor-not-allowed"}`}
        >
          Approve & Submit
        </button>
        <button
          onClick={clearSelection}
          className="px-4 py-2 rounded bg-red-500 hover:bg-red-600 text-white"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
