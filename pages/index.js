export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
      <img src="/logo.png" alt="AdVisionAI Logo" className="h-16 mb-6" />
      <h1 className="text-4xl font-bold mb-4">AdVisionAI</h1>
      <h2 className="text-xl font-semibold mb-6">Upload Your Billboard Artwork</h2>
      <input type="file" className="mb-4" />
      <button disabled className="bg-blue-500 text-white px-4 py-2 rounded opacity-50 cursor-not-allowed">
        Approve & Submit
      </button>
    </div>
  );
}
