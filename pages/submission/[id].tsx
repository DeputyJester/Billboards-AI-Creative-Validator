// pages/submission/[id].tsx
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAuthGate } from "@/utils/useauthgate";
import supabase from "@/lib/supabaseclient";

export default function SubmissionDetail() {
  const ready = useAuthGate();
  if (!ready) return null;

  const router = useRouter();
  const { id } = router.query;

  const [submission, setSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const submissionId = Array.isArray(id) ? id[0] : id;
    if (!submissionId) return;

    const fetchSubmission = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("submissions")
        .select("*")
        .eq("id", submissionId)
        .single();

      if (error) {
        console.error("Fetch error:", error);
        setSubmission(null);
        setLoading(false);
        return;
      }

      setSubmission(data || null);

      // Try storage path first, then fall back to direct URL
      if (data?.file_name) {
        const { data: urlData } = supabase.storage
          .from("creatives")
          .getPublicUrl(data.file_name);
        if (urlData?.publicUrl) setPreviewUrl(urlData.publicUrl);
      } else if (data?.file_url) {
        setPreviewUrl(data.file_url);
      } else {
        setPreviewUrl(null);
      }

      setLoading(false);
    };

    fetchSubmission();
  }, [id]);

  if (loading) return <p className="p-6">Loading...</p>;
  if (!submission) return <p className="p-6">Submission not found.</p>;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-bold mb-4">Submission Details</h1>

      <p><strong>Board Type:</strong> {submission.board_type}</p>
      <p><strong>File Name:</strong> {submission.original_file_name}</p>
      <p><strong>Status:</strong> {submission.status}</p>
      <p><strong>Uploaded At:</strong> {new Date(submission.uploaded_at).toLocaleString()}</p>

      {previewUrl && (
        <div className="mt-4">
          <img src={previewUrl} alt="Preview" className="max-w-full max-h-96 border rounded" />
          <a
            href={previewUrl}
            download={submission.original_file_name || "download"}
            className="mt-2 inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Download File
          </a>
        </div>
      )}
    </div>
  );
}
