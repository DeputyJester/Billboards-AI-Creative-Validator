import { useState, useEffect } from 'react';
import Image from 'next/image';

const billboardProfiles = {
  "14x48": {
    name: "14x48 Digital Billboard",
    width: 858,
    height: 242,
    formats: ["image/jpeg", "image/png", "image/bmp"],
    dpi: 72,
  },
  "17x29": {
    name: "17x29 Digital Billboard",
    width: 576,
    height: 336,
    formats: ["image/jpeg", "image/png", "image/bmp"],
    dpi: 72,
  },
  "20x10": {
    name: "20x10 Digital Billboard",
    width: 288,
    height: 576,
    formats: ["image/jpeg", "image/png", "image/bmp", "video/mp4", "video/quicktime"],
    dpi: 72,
  },
  "12x27": {
    name: "12x27 Digital Billboard",
    width: 832,
    height: 368,
    formats: ["image/jpeg", "image/png", "image/bmp"],
    dpi: 72,
  },
  "17x8": {
    name: "17x8 Digital Billboard",
    width: 160,
    height: 320,
    formats: ["image/jpeg", "image/png", "image/bmp"],
    dpi: 72,
  },
};

export default function Home() {
  const [selectedBoard, setSelectedBoard] = useState('');
  const [specs, setSpecs] = useState(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isValid, setIsValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file || !selectedBoard) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        const validDimensions =
          img.width === billboardProfiles[selectedBoard].width &&
          img.height === billboardProfiles[selectedBoard].height;

        const validFormat = billboardProfiles[selectedBoard].formats.includes(file.type);

        if (!validDimensions) {
          setError(`Image dimensions must be ${billboardProfiles[selectedBoard].width}x${billboardProfiles[selectedBoard].height}px.`);
          setIsValid(false);
        } else if (!validFormat) {
          setError(`Invalid file format. Supported formats: ${billboardProfiles[selectedBoard].formats.join(', ')}`);
          setIsValid(false);
        } else {
          setError('');
          setIsValid(true);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }, [file, selectedBoard]);

  const handleBoardChange = (e) => {
    setSelectedBoard(e.target.value);
    setSpecs(billboardProfiles[e.target.value]);
    setFile(null);
    setPreview(null);
    setIsValid(false);
    setError('');
  };

  const handleFileChange = (e) => {
    const uploadedFile = e.target.files[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      setPreview(URL.createObjectURL(uploadedFile));
    }
  };

  const clearForm = () => {
    setSelectedBoard('');
    setSpecs(null);
    setFile(null);
    setPreview(null);
    setIsValid(false);
    setError('');
  };

  const handleSubmit = async () => {
    if (!file || !selectedBoard || !isValid) return;

    setSubmitting(true);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64File = reader.result.split(',')[1];
        const response = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            boardType: billboardProfiles[selectedBoard].name,
            fileName: file.name,
            fileData: base64File,
          }),
        });

        const result = await response.json();
        if (response.ok) {
          alert('Submission sent successfully!');
          clearForm();
        } else {
          console.error(result.error);
          alert('Failed to send submission.');
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      alert('An error occurred while submitting.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <img src="/AdVisionAI.svg" alt="AdVisionAI Logo" className="w-48 h-auto mx-auto mb-4" />

      <h1 className="text-4xl font-bold mb-2">AdVisionAI</h1>
      <h2 className="text-xl font-semibold mb-6">Upload Your Billboard Artwork</h2>

      <select value={selectedBoard} onChange={handleBoardChange} className="mb-4 border px-4 py-2 rounded">
        <option value="" disabled>Select a Billboard Type</option>
        {Object.entries(billboardProfiles).map(([key, profile]) => (
          <option key={key} value={key}>{profile.name}</option>
        ))}
      </select>

      {specs && (
        <div className="mb-4 text-sm text-center text-gray-700">
          <p><strong>Dimensions:</strong> {specs.width}x{specs.height}px</p>
          <p><strong>Formats:</strong> {specs.formats.join(', ')}</p>
          <p><strong>Resolution:</strong> {specs.dpi} dpi</p>
        </div>
      )}

      <input type="file" accept="image/*" onChange={handleFileChange} className="mb-4" />

      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

      {preview && (
        <div className="mb-4">
          <img src={preview} alt="Preview" className="max-w-xs border rounded shadow" />
        </div>
      )}

      <div className="flex gap-4">
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className={`px-4 py-2 rounded text-white ${isValid ? 'bg-blue-500 hover:bg-blue-600' : 'bg-gray-400 cursor-not-allowed'}`}
        >
          {submitting ? 'Submitting...' : 'Approve & Submit'}
        </button>

        <button onClick={clearForm} className="px-4 py-2 rounded bg-gray-200 text-gray-800 hover:bg-gray-300">
          Clear
        </button>
      </div>
    </div>
  );
}
