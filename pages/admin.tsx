import { useEffect, useState } from "react";
import supabase from "@/lib/supabaseclient";
import { useAuthGate } from "@/utils/useauthgate";
import AppLayout from "@/components/applayout";

type Submission = {
  id: string;
  board_type: string;
  original_file_name: string;
  file_url: string;
  status: string;
  uploaded_at: string;
  organizations?: {
    name: string;
  } | null;
  users?: {
    email: string;
  } | null;
};

export default function AdminDashboard() {
  const ready = useAuthGate();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;

    const fetchSubmissions = async () => {
      const { data, error } = await supabase
        .from("submissions")
        .select(
          `
          *,
          organizations ( name ),
          users ( email )
        `
        )
        .order("uploaded_at", { ascending: false });

      if (!error && data) {
        setSubmissions(data);
      }
      setLoading(false);
    };

    fetchSubmissions();
  }, [ready]);

  if (!ready) return null;

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-100 p-6">
        <h1 className="text-3xl font-bold mb-6">Admin Dashboard</h1>

        {loading ? (
          <p className="text-center">Loading submissions...</p>
        ) : (
          <div className="overflow-x-auto bg-white shadow-md rounded-lg">
            <table className="min-w-full text-sm text-left">
              <thead className="bg-gray-200">
                <tr>
                  <th className="px-4 py-2">Submitted By</th>
                  <th className="px-4 py-2">Organization</th>
                  <th className="px-4 py-2">Board Type</th>
                  <th className="px-4 py-2">Original File Name</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Uploaded At</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((submission) => (
                  <tr key={submission.id} className="border-b">
                    <td className="px-4 py-2">
                      {submission.users?.email || "Unknown"}
                    </td>
                    <td className="px-4 py-2">
                      {submission.organizations?.name || "Unknown"}
                    </td>
                    <td className="px-4 py-2">{submission.board_type}</td>
                    <td className="px-4 py-2">
                      {submission.original_file_name}
                    </td>
                    <td className="px-4 py-2">{submission.status}</td>
                    <td className="px-4 py-2">
                      {new Date(submission.uploaded_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <a
                        href={submission.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
