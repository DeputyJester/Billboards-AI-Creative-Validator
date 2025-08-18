import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabaseClient";
import { useAuthGate } from "@/utils/useAuthGate";
import AppLayout from "@/components/applayout";

interface Submission {
  id: string;
  board_type: string;
  original_file_name: string;
  file_url: string;
  uploaded_at: string;
  status: string;
}

export default function Dashboard() {
  const ready = useAuthGate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;

    const fetchData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("submissions")
        .select("*")
        .eq("user_id", user.id)
        .order("uploaded_at", { ascending: false });

      if (!error && data) {
        setSubmissions(data);
      }
      setLoading(false);
    };

    fetchData();
  }, [ready]);

  if (!ready) return null;

  return (
    <AppLayout>
      <div className="min-h-screen bg-white p-6">
        <h1 className="text-3xl font-bold text-center mb-6">
          📋 Submission Dashboard
        </h1>
        {loading ? (
          <p className="text-center">Loading submissions...</p>
        ) : submissions.length === 0 ? (
          <p className="text-center text-gray-500">No submissions yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {submissions.map((submission) => (
              <div
                key={submission.id}
                className="border rounded-lg shadow p-4 flex flex-col items-center"
              >
                <img
                  src={submission.file_url}
                  alt={submission.original_file_name}
                  className="w-full h-48 object-contain mb-3"
                />
                <h3 className="text-lg font-semibold text-center">
                  {submission.original_file_name}
                </h3>
                <p className="text-sm text-gray-600">{submission.board_type}</p>
                <p className="text-sm text-gray-600">
                  Uploaded:{" "}
                  {new Date(submission.uploaded_at).toLocaleString()}
                </p>
                <span
                  className={`mt-2 text-xs font-semibold px-2 py-1 rounded-full ${
                    submission.status === "Approved"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {submission.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
