import { useState } from 'react';

export default function Home() {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setPreview(URL.createObjectURL(selectedFile));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!file) return;
    alert('File ready to be submitted!');
    // Placeholder: Here’s where we’ll hook in an API call later
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <img src="/AdVisionAI.svg" alt="AdVisionAI Logo" className="w-64 h-auto mb-6" />
      <h1 className="text-4xl font-bold mb-2">AdVisionAI</h1>
      <h2 className="text-xl font-semibold mb-6">Upload Your Billboard Artwork</h2>

      <form onSubmit={handleSubmit} className="flex flex-col items-center w-full max-w-md">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="mb-4"
        />

        {preview && (
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-1">Preview:</p>
            <img src={preview} alt="Preview" className="max-w-xs max-h-64 border" />
          </div>
        )}

        <button
          type="submit"
          disabled={!file}
          className={`px-4 py-2 rounded text-white transition 
            ${file ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-400 cursor-not-allowed'}
          `}
        >
          Approve & Submit
        </button>
      </form>
    </div>
  );
}
