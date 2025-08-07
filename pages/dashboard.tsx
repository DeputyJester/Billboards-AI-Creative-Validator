import { useState, useEffect } from "react";
import { supabase } from "../utils/supabaseClient";

export default function Dashboard() {
  const [creatives, setCreatives] = useState<any[]>([]);
  const [selectedCreative, setSelectedCreative] = useState<any>(null);
  const [closingModal, setClosingModal] = useState(false);

  // Fetch creatives
  const fetchCreatives = async () => {
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("Error fetching creatives:", error);
      return;
    }
    setCreatives(data || []);
  };

  useEffect(() => {
    fetchCreatives();

    // Realtime updates
    const channel = supabase
      .channel("public:submissions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "submissions" },
        () => {
          fetchCreatives();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleCloseModal = () => {
    setClosingModal(true);
    setTimeout(() => {
      setSelectedCreative(null);
      setClosingModal(false);
    }, 300); // match animation duration
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Your Dashboard</h1>
      <div className="bg-white p-4 rounded shadow">
        <h2 className="text-lg font-semibold mb-3">Uploaded Creatives</h2>
        {creatives.length === 0 ? (
          <p>No uploads yet.</p>
        ) : (
          <table className="min-w-full border border-gray-200">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 border">Board Type</th>
                <th className="px-4 py-2 border">File Name</th>
                <th className="px-4 py-2 border">Status</th>
                <th className="px-4 py-2 border">Uploaded At</th>
              </tr>
            </thead>
            <tbody>
              {creatives.map((creative) => (
                <tr
                  key={creative.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedCreative(creative)}
                >
                  <td className="px-4 py-2 border">{creative.board_type}</td>
                  <td className="px-4 py-2 border">
                    {creative.original_file_name}
                  </td>
                  <td className="px-4 py-2 border text-green-600">
                    {creative.status}
                  </td>
                  <td className="px-4 py-2 border">
                    {new Date(creative.uploaded_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {selectedCreative && (
        <div
          className={`fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity duration-300 ${
            closingModal ? "opacity-0" : "opacity-100"
          }`}
          onClick={handleCloseModal}
        >
          <div
            className={`bg-white rounded-lg shadow-lg max-w-2xl w-full p-6 transform transition-all duration-300 ${
              closingModal ? "scale-95 opacity-0" : "scale-100 opacity-100"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold mb-4">Creative Details</h2>
            <p>
              <strong>File Name:</strong> {selectedCreative.original_file_name}
            </p>
            <p>
              <strong>Board Type:</strong> {selectedCreative.board_type}
            </p>
            <p>
              <strong>Status:</strong> {selectedCreative.status}
            </p>
            <p>
              <strong>Uploaded At:</strong>{" "}
              {new Date(selectedCreative.uploaded_at).toLocaleString()}
            </p>

            <div className="mt-4 max-h-[70vh] overflow-auto">
              <p className="font-semibold mb-2">Creative Preview:</p>
              <img
                src={selectedCreative.file_url}
                alt="Creative Preview"
                className="border rounded max-w-full"
              />
            </div>

            <div className="mt-6 text-right">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
