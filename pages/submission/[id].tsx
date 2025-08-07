import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { supabase } from "../../utils/supabaseClient";

export default function SubmissionDetail() {
  const router = useRouter();
  const { id } = router.query;

  const [submission, setSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchSubmission = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("submissions")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      setSubmission(data);

      if (data?.file_name) {
        const { data: urlData } = supabase
          .storage
          .from("creatives")
          .getPublicUrl(data.file_name);

        if (urlData?.publicUrl) {
          setPreviewUrl(urlData.publicUrl);
        }
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
      <p><strong>Uploaded At:</strong> {submission.uploaded_at}</p>

      {previewUrl && (
        <div className="mt-4">
          <img
            src={previewUrl}
            alt="Preview"
            className="max-w-full max-h-96 border rounded"
          />
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
