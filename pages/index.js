import { useState } from 'react';

const billboardProfiles = {
  '14x48': {
    name: '14x48 Digital Billboard',
    dimensions: '858 x 242 pixels',
    resolution: '72 dpi',
    format: 'JPEG (Preferred), BMP, PNG',
    aspectRatio: 'Square Pixels',
  },
  '17x29': {
    name: '17x29 Digital Billboard',
    dimensions: '576 x 336 pixels',
    resolution: '72 dpi',
    format: 'JPEG (Preferred), BMP, PNG',
    aspectRatio: 'Square Pixels',
  },
  '20x10': {
    name: '20x10 Digital Billboard',
    dimensions: '288 x 576 pixels',
    resolution: '72 dpi',
    format: 'JPEG (Preferred), BMP, PNG',
    animated: 'MP4, MOV, AVI (Preferred)',
    aspectRatio: 'Square Pixels',
    fps: '30 FPS',
  },
  '12x27': {
    name: '12x27 Digital Billboard',
    dimensions: '832 x 368 pixels',
    resolution: '72 dpi',
    format: 'JPEG, BMP, PNG',
  },
  '17x8': {
    name: '17x8 Digital Billboard',
    dimensions: '160 x 320 pixels',
    resolution: '72 dpi',
    format: 'JPEG, BMP, PNG',
    aspectRatio: 'Square Pixels',
    notes: 'Avoid special characters in file names.',
  },
};

export default function Home() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewURL, setPreviewURL] = useState(null);
  const [billboardType, setBillboardType] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewURL(URL.createObjectURL(file));
    } else {
      setSelectedFile(null);
      setPreviewURL(null);
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setPreviewURL(null);
    setBillboardType('');
    setMessage('');
    document.getElementById('fileInput').value = '';
  };

  const handleSubmit = async () => {
    if (!selectedFile || !billboardType) return;

    setSubmitting(true);
    setMessage('');

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result.split(',')[1];

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardType: billboardProfiles[billboardType].name,
          fileData: base64Data,
          fileName: selectedFile.name,
        }),
      });

      const result = await response.json();
      if (response.ok) {
        setMessage('✅ Submission sent successfully!');
        handleClear();
      } else {
        console.error(result.error);
        setMessage('❌ Failed to send submission.');
      }

      setSubmitting(false);
    };

    reader.readAsDataURL(selectedFile);
  };

  const selectedProfile = billboardProfiles[billboardType];

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <img
        src="/AdVisionAI.svg"
        alt="AdVisionAI Logo"
        className="w-48 h-auto mx-auto mb-4"
      />
      <h1 className="text-4xl font-bold mb-2">AdVisionAI</h1>
      <h2 className="text-xl font-semibold mb-6 text-center">
        Upload Your Billboard Artwork
      </h2>

      <select
        value={billboardType}
        onChange={(e) => setBillboardType(e.target.value)}
        className="mb-4 p-2 border rounded w-full max-w-md"
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

      {selectedProfile && (
        <div className="mb-4 text-sm text-gray-700 bg-gray-100 p-3 rounded w-full max-w-md">
          <p><strong>Size:</strong> {selectedProfile.dimensions}</p>
          <p><strong>Resolution:</strong> {selectedProfile.resolution}</p>
          <p><strong>Format:</strong> {selectedProfile.format}</p>
          {selectedProfile.animated && <p><strong>Animated:</strong> {selectedProfile.animated}</p>}
          {selectedProfile.fps && <p><strong>FPS:</strong> {selectedProfile.fps}</p>}
          {selectedProfile.aspectRatio && <p><strong>Aspect Ratio:</strong> {selectedProfile.aspectRatio}</p>}
          {selectedProfile.notes && <p><strong>Notes:</strong> {selectedProfile.notes}</p>}
        </div>
      )}

      <input
        id="fileInput"
        type="file"
        onChange={handleFileChange}
        className="mb-4"
        accept=".jpg,.jpeg,.png,.bmp"
      />

      {previewURL && (
        <div className="mb-4">
          <img
            src={previewURL}
            alt="Preview"
            className="max-w-full h-auto border p-1"
          />
        </div>
      )}

      <div className="flex gap-4">
        <button
          onClick={handleSubmit}
          disabled={!selectedFile || !billboardType || submitting}
          className={`px-4 py-2 rounded text-white ${
            !selectedFile || !billboardType || submitting
              ? 'bg-blue-300 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {submitting ? 'Submitting...' : 'Approve & Submit'}
        </button>
        <button
          onClick={handleClear}
          className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400"
        >
          Clear
        </button>
      </div>

      {message && <p className="mt-4 text-center text-sm">{message}</p>}
    </div>
  );
}
