import { useState } from 'react';
import Image from 'next/image';

export default function Home() {
  const [selectedBoard, setSelectedBoard] = useState('');
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const billboardProfiles = {
    board1448: {
      name: '14x48 Digital Billboard',
      width: 858,
      height: 242,
      formats: ['image/jpeg', 'image/png', 'image/bmp'],
      spec: '858 x 242 px, RGB, 72 dpi, JPEG/BMP/PNG'
    },
    board1729: {
      name: '17x29 Digital Billboard',
      width: 576,
      height: 336,
      formats: ['image/jpeg', 'image/png', 'image/bmp'],
      spec: '576 x 336 px, RGB, 72 dpi, JPEG/BMP/PNG'
    },
    board2010: {
      name: '20x10 Digital Billboard',
      width: 288,
      height: 576,
      formats: ['image/jpeg', 'image/png', 'image/bmp', 'video/mp4', 'video/quicktime'],
      spec: '288 x 576 px, RGB, 72 dpi, JPEG/BMP/PNG or MP4/MOV'
    },
    board1227: {
      name: '12x27 Digital Billboard',
      width: 832,
      height: 368,
      formats: ['image/jpeg', 'image/png', 'image/bmp'],
      spec: '832 x 368 px, RGB, 72 dpi, JPEG/BMP/PNG'
    },
    board178: {
      name: '17x8 Digital Billboard',
      width: 160,
      height: 320,
      formats: ['image/jpeg', 'image/png', 'image/bmp'],
      spec: '160 x 320 px, RGB, 72 dpi, JPEG/BMP/PNG'
    }
  };

  const handleBoardChange = (e) => {
    setSelectedBoard(e.target.value);
    setValidationResult(null);
    setFile(null);
    setFilePreview(null);
    setErrorMessage('');
    setSuccessMessage('');
  };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    setErrorMessage('');
    setSuccessMessage('');

    if (!selectedBoard) {
      setErrorMessage('Please select a billboard type first.');
      return;
    }

    if (selected) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const profile = billboardProfiles[selectedBoard];
          const isValidDimensions = img.width === profile.width && img.height === profile.height;
          const isValidFormat = profile.formats.includes(selected.type);

          if (isValidDimensions && isValidFormat) {
            setValidationResult(true);
            setSuccessMessage('✅ Image meets all specifications. You may now submit.');
          } else {
            setValidationResult(false);
            setErrorMessage(`❌ Image must be ${profile.width} x ${profile.height}px and one of the formats: ${profile.formats.join(', ')}`);
          }
        };
        img.src = event.target.result;
        setFilePreview(event.target.result);
      };
      reader.readAsDataURL(selected);
      setFile(selected);
    }
  };

  const handleClear = () => {
    setSelectedBoard('');
    setFile(null);
    setFilePreview(null);
    setValidationResult(null);
    setErrorMessage('');
    setSuccessMessage('');
    setIsSubmitting(false);
  };

  const handleSubmit = async () => {
    if (!file || !selectedBoard || !validationResult) return;

    setIsSubmitting(true);

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            boardType: billboardProfiles[selectedBoard].name,
            fileName: file.name,
            fileData: reader.result.split(',')[1]
          })
        });

        if (res.ok) {
          setSuccessMessage('🎉 Artwork successfully submitted!');
        } else {
          const err = await res.json();
          setErrorMessage(err.error || 'Something went wrong.');
        }
      } catch (err) {
        setErrorMessage('Submission failed.');
      } finally {
        setIsSubmitting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <img src="/AdVisionAI.svg" alt="AdVisionAI Logo" className="w-48 h-auto mx-auto mb-6" />
      <h1 className="text-4xl font-bold mb-2">AdVisionAI</h1>
      <h2 className="text-xl font-semibold mb-4">Upload Your Billboard Artwork</h2>

      <select
        className="mb-4 border border-gray-300 rounded p-2"
        value={selectedBoard}
        onChange={handleBoardChange}
      >
        <option value="" disabled>Select a Billboard Type</option>
        {Object.entries(billboardProfiles).map(([key, profile]) => (
          <option key={key} value={key}>{profile.name}</option>
        ))}
      </select>

      {selectedBoard && billboardProfiles[selectedBoard]?.spec && (
        <div className="bg-gray-100 p-4 rounded-md shadow mb-4 max-w-md text-sm text-gray-700">
          <p><strong>Specifications:</strong></p>
          <p>{billboardProfiles[selectedBoard].spec}</p>
        </div>
      )}

      <input type="file" onChange={handleFileChange} className="mb-4" />

      {filePreview && (
        <div className="mb-4">
          <img src={filePreview} alt="Preview" className="max-w-[600px] max-h-[400px] border" />
        </div>
      )}

      {errorMessage && <div className="text-red-600 mb-2 text-sm">{errorMessage}</div>}
      {successMessage && <div className="text-green-600 mb-2 text-sm">{successMessage}</div>}

      <div className="flex gap-4">
        <button
          onClick={handleSubmit}
          disabled={!validationResult || isSubmitting}
          className={`px-4 py-2 rounded text-white ${validationResult ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-300 cursor-not-allowed'}`}
        >
          {isSubmitting ? 'Submitting...' : 'Approve & Submit'}
        </button>
        <button
          onClick={handleClear}
          className="px-4 py-2 rounded bg-gray-300 hover:bg-gray-400 text-black"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
