import { useState, useRef } from 'react';

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
    formats: ["image/jpeg", "image/png", "image/bmp"],
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

export default function Home() {
  const [selectedBoard, setSelectedBoard] = useState('');
  const [file, setFile] = useState(null);
  const [fileURL, setFileURL] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const validateImage = async (file, boardKey) => {
    if (!file || !boardKey) return false;
    const profile = billboardProfiles[boardKey];
    const imageBitmap = await createImageBitmap(file);
    const validDimensions =
      imageBitmap.width === profile.width &&
      imageBitmap.height === profile.height;
    const validFormat = profile.formats.includes(file.type);
    return validDimensions && validFormat;
  };

  const handleFileChange = async (e) => {
    const uploadedFile = e.target.files[0];
    setFile(uploadedFile);
    setFileURL(URL.createObjectURL(uploadedFile));

    if (selectedBoard) {
      const valid = await validateImage(uploadedFile, selectedBoard);
      setIsValid(valid);
    } else {
      setIsValid(false);
    }
  };

  const handleBoardChange = async (e) => {
    const board = e.target.value;
    setSelectedBoard(board);
    if (file) {
      const valid = await validateImage(file, board);
      setIsValid(valid);
    } else {
      setIsValid(false);
    }
  };

  const handleClear = () => {
    setSelectedBoard('');
    setFile(null);
    setFileURL('');
    setIsValid(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!file || !selectedBoard) return;
    setSubmitting(true);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64File = reader.result.split(',')[1];
      try {
        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            boardType: billboardProfiles[selectedBoard].name,
            fileName: file.name,
            fileData: base64File,
          }),
        });

        if (!res.ok) throw new Error('Network error');
        alert('Submission successful!');
        handleClear();
      } catch (error) {
        console.error(error);
        alert('Failed to send email.');
      } finally {
        setSubmitting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <img src="/AdVisionAI.svg" alt="AdVisionAI Logo" className="w-48 h-auto mx-auto mb-4" />
      <h1 className="text-4xl font-bold mb-2">AdVisionAI</h1>
      <h2 className="text-xl font-semibold mb-4">Upload Your Billboard Artwork</h2>

      <select
        className="mb-2 p-2 border rounded"
        value={selectedBoard}
        onChange={handleBoardChange}
      >
        <option value="" disabled>Select a Billboard Type</option>
        {Object.entries(billboardProfiles).map(([key, profile]) => (
          <option key={key} value={key}>{profile.name}</option>
        ))}
      </select>

      {selectedBoard && (
        <div className="text-sm text-gray-700 mb-2 text-center max-w-xs">
          Required Specs: {billboardProfiles[selectedBoard].width} x {billboardProfiles[selectedBoard].height}px •
          Accepted formats: {billboardProfiles[selectedBoard].formats.join(', ')}
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="mb-4"
      />

      {fileURL && (
        <img src={fileURL} alt="Preview" className="mb-4 max-w-xs border" />
      )}

      <div className="flex gap-4">
        <button
          onClick={handleSubmit}
          disabled={!isValid || submitting}
          className={`px-4 py-2 rounded text-white ${isValid ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}`}
        >
          {submitting ? 'Submitting…' : 'Approve & Submit'}
        </button>
        <button
          onClick={handleClear}
          className="px-4 py-2 rounded bg-red-500 hover:bg-red-600 text-white"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
