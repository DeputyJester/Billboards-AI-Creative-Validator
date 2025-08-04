import { useState, useRef } from 'react';
import Image from 'next/image';

const billboardProfiles = {
  board_14x48: {
    name: '14x48 Digital Billboard',
    width: 858,
    height: 242,
    formats: ['image/jpeg', 'image/png', 'image/bmp'],
  },
  board_17x29: {
    name: '17x29 Digital Billboard',
    width: 576,
    height: 336,
    formats: ['image/jpeg', 'image/png', 'image/bmp'],
  },
  board_20x10: {
    name: '20x10 Digital Billboard',
    width: 288,
    height: 576,
    formats: ['image/jpeg', 'image/png', 'image/bmp', 'video/mp4', 'video/quicktime'],
  },
  board_12x27: {
    name: '12x27 Digital Billboard',
    width: 832,
    height: 368,
    formats: ['image/jpeg', 'image/png', 'image/bmp'],
  },
  board_17x8: {
    name: '17x8 Digital Billboard',
    width: 160,
    height: 320,
    formats: ['image/jpeg', 'image/png', 'image/bmp'],
  },
};

export default function Home() {
  const [selectedBoard, setSelectedBoard] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef();

  const validateImage = (file, board) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        if (
          img.width === board.width &&
          img.height === board.height &&
          board.formats.includes(file.type)
        ) {
          resolve(true);
        } else {
          let message = 'Uploaded file does not meet specifications:';
          if (img.width !== board.width || img.height !== board.height) {
            message += `\nExpected dimensions: ${board.width}x${board.height}px. Got: ${img.width}x${img.height}px.`;
          }
          if (!board.formats.includes(file.type)) {
            message += `\nInvalid file format. Allowed formats: ${board.formats.join(', ')}.`;
          }
          reject(message);
        }
      };
      img.onerror = () => reject('Failed to load image.');
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    setSelectedFile(null);
    setFilePreview(null);
    setError('');
    setSuccessMessage('');

    if (!file || !selectedBoard) return;

    try {
      await validateImage(file, billboardProfiles[selectedBoard]);
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
      setSuccessMessage('✅ Image meets all specifications. You may now submit.');
    } catch (validationError) {
      setError(validationError);
    }
  };

  const handleBoardChange = (e) => {
    setSelectedBoard(e.target.value);
    setSelectedFile(null);
    setFilePreview(null);
    setError('');
    setSuccessMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearSelection = () => {
    setSelectedBoard('');
    setSelectedFile(null);
    setFilePreview(null);
    setError('');
    setSuccessMessage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    if (!selectedFile || !selectedBoard) return;
    setIsSubmitting(true);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const fileData = reader.result.split(',')[1];
      const payload = {
        boardType: billboardProfiles[selectedBoard].name,
        fileName: selectedFile.name,
        fileData,
      };

      try {
        const response = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          alert('✅ Submission successful!');
          clearSelection();
        } else {
          const resJson = await response.json();
          setError(resJson.error || 'Failed to send email.');
        }
      } catch (err) {
        setError('An unexpected error occurred.');
      } finally {
        setIsSubmitting(false);
      }
    };
    reader.readAsDataURL(selectedFile);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <img src="/AdVisionAI.svg" alt="AdVisionAI Logo" className="max-w-sm h-auto mb-4" />
      <h1 className="text-4xl font-bold mb-4">AdVisionAI</h1>
      <h2 className="text-xl font-semibold mb-6">Upload Your Billboard Artwork</h2>

      <select value={selectedBoard} onChange={handleBoardChange} className="mb-4 p-2 border rounded">
        <option value="" disabled>Select a Billboard Type</option>
        {Object.entries(billboardProfiles).map(([key, profile]) => (
          <option key={key} value={key}>{profile.name}</option>
        ))}
      </select>

      {selectedBoard && (
        <div className="mb-4 text-sm text-gray-600 max-w-md text-center">
          <p><strong>Specs for {billboardProfiles[selectedBoard].name}:</strong></p>
          <p>Dimensions: {billboardProfiles[selectedBoard].width}x{billboardProfiles[selectedBoard].height}px</p>
          <p>Formats: {billboardProfiles[selectedBoard].formats.join(', ')}</p>
        </div>
      )}

      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="mb-4" />

      {filePreview && (
        <img src={filePreview} alt="Preview" className="max-w-md max-h-96 mb-4 border" />
      )}

      {error && <div className="text-red-600 mb-4 whitespace-pre-line text-sm text-center">{error}</div>}
      {successMessage && <div className="text-green-600 mb-4 text-sm text-center">{successMessage}</div>}

      <div className="flex space-x-4">
        <button
          onClick={handleSubmit}
          disabled={!selectedFile || !selectedBoard || !!error || isSubmitting}
          className={`px-4 py-2 rounded text-white ${isSubmitting ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'} ${(!selectedFile || !selectedBoard || !!error) && 'opacity-50 cursor-not-allowed'}`}
        >
          {isSubmitting ? 'Submitting...' : 'Approve & Submit'}
        </button>

        <button onClick={clearSelection} className="px-4 py-2 rounded border border-gray-400 text-gray-700 hover:bg-gray-100">
          Clear
        </button>
      </div>
    </div>
  );
}
