import { useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleApprove = () => {
    alert('Artwork approved (placeholder).');
  };

  return (
    <>
      <Head>
        <title>AdVisionAI – Upload & Validate Billboard Artwork</title>
      </Head>
      <main className="min-h-screen bg-white px-6 py-10 font-sans">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center space-x-4 mb-8">
            <Image src="/logo.png" alt="AdVisionAI Logo" width={48} height={48} />
            <h1 className="text-3xl font-bold text-blue-900">AdVisionAI</h1>
          </div>
          <h2 className="text-xl mb-4 font-semibold text-gray-700">Upload Your Billboard Artwork</h2>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            className="mb-6 border p-2 rounded"
          />
          {previewUrl && (
            <div className="mb-6">
              <h3 className="text-md font-medium text-gray-600 mb-2">Preview:</h3>
              <img src={previewUrl} alt="Artwork preview" className="border rounded shadow" />
            </div>
          )}
          <button
            onClick={handleApprove}
            disabled={!selectedFile}
            className="bg-blue-700 text-white px-6 py-2 rounded disabled:opacity-50"
          >
            Approve & Submit
          </button>
        </div>
      </main>
    </>
  );
}
